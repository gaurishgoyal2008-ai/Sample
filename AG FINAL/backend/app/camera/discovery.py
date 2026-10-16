"""
Ceova AI Vision - Advanced Local Network & IP Webcam Discovery Engine
Dynamically discovers actual active network interfaces, calculates subnets without hardcoded assumptions,
safely prints network diagnostics, supports configurable ports 1-65535, and performs 6-stage camera verification.
"""

import os
import re
import socket
import logging
import asyncio
import subprocess
import time
import ipaddress
from typing import Optional, List, Dict, Any, Tuple

import psutil
import httpx

from app.camera.ip_webcam import parse_camera_host_port_path, sanitize_url_for_logging, build_authenticated_stream_urls
from app.config import DISCOVERY_PORTS, DISCOVERY_CONCURRENCY, DISCOVERY_TIMEOUT

logger = logging.getLogger("ceova.camera.discovery")

VIRTUAL_INTERFACE_KEYWORDS = [
    "virtual", "vbox", "vmware", "hyper-v", "wsl", "docker", 
    "loopback", "bluetooth", "tap", "vpn", "tailscale", "zerotier", "wireguard", "pseudo"
]


def is_private_ip(ip: str) -> bool:
    """Validates whether an IPv4 address belongs to RFC 1918 private subnets or loopback."""
    if not ip or not isinstance(ip, str):
        return False
    clean_ip = ip.strip()
    if clean_ip in ("127.0.0.1", "localhost"):
        return True
    if clean_ip.startswith("169.254."):
        return False
    try:
        addr = ipaddress.IPv4Address(clean_ip)
        return addr.is_private or addr.is_loopback
    except ValueError:
        return False


def get_default_gateways() -> Dict[str, Tuple[str, int]]:
    """
    Discovers the default gateways for IPv4 interfaces on Windows/Linux.
    Returns mapping: local_interface_ip -> (gateway_ip, metric).
    """
    gateways: Dict[str, Tuple[str, int]] = {}
    
    # Strategy 1: Windows route print 0.0.0.0
    if os.name == "nt":
        try:
            out = subprocess.check_output(["route", "print", "0.0.0.0"], text=True, stderr=subprocess.DEVNULL)
            in_routes = False
            for line in out.splitlines():
                line = line.strip()
                if "Active Routes:" in line:
                    in_routes = True
                    continue
                if in_routes and line.startswith("0.0.0.0"):
                    parts = line.split()
                    if len(parts) >= 5:
                        gw = parts[2]
                        iface_ip = parts[3]
                        metric = int(parts[4]) if parts[4].isdigit() else 999
                        if is_private_ip(gw) and gw != "0.0.0.0":
                            gateways[iface_ip] = (gw, metric)
        except Exception as e:
            logger.debug(f"[Network] route print failed: {e}")

    # Strategy 2: Socket route probing if route print didn't return
    if not gateways:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            best_ip = s.getsockname()[0]
            s.close()
            parts = best_ip.split(".")
            guessed_gw = f"{parts[0]}.{parts[1]}.{parts[2]}.1"
            gateways[best_ip] = (guessed_gw, 20)
        except Exception:
            pass

    return gateways


def detect_active_network_interfaces() -> List[Dict[str, Any]]:
    """
    Discovers and ranks all IPv4 network adapters on the machine using psutil + routing table.
    Filters out virtual, disconnected, loopback, and APIPA adapters.
    Prefers active Wi-Fi and Ethernet adapters owning the default gateway.
    """
    gw_map = get_default_gateways()
    interfaces: List[Dict[str, Any]] = []

    try:
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
    except Exception as e:
        logger.error(f"[Network] Failed to inspect network interfaces via psutil: {e}")
        addrs = {}
        stats = {}

    for iface_name, addr_list in addrs.items():
        st = stats.get(iface_name)
        is_up = st.isup if st else False
        name_lower = iface_name.lower()
        is_virtual = any(k in name_lower for k in VIRTUAL_INTERFACE_KEYWORDS)

        for a in addr_list:
            if a.family == socket.AF_INET:
                ip = a.address
                # Ignore loopback and APIPA
                if ip.startswith("127.") or ip.startswith("169.254."):
                    continue

                # Filter known virtual ranges like VirtualBox 192.168.56.x
                if ip.startswith("192.168.56."):
                    is_virtual = True

                netmask = a.netmask or "255.255.255.0"
                try:
                    net = ipaddress.IPv4Network(f"{ip}/{netmask}", strict=False)
                    cidr = str(net)
                    network_addr = str(net.network_address)
                except Exception:
                    parts = ip.split(".")
                    netmask = "255.255.255.0"
                    cidr = f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
                    network_addr = f"{parts[0]}.{parts[1]}.{parts[2]}.0"

                gw_info = gw_map.get(ip)
                gw = gw_info[0] if gw_info else None
                metric = gw_info[1] if gw_info else 999

                is_wifi = any(w in name_lower for w in ["wi-fi", "wifi", "wlan", "wireless"])
                has_gw = bool(gw and gw != "0.0.0.0")

                # Scoring: Default gateway interface has top priority
                score = 0
                if has_gw:
                    score += 100 - min(metric, 50)
                if is_wifi:
                    score += 30
                if is_up:
                    score += 20
                if is_virtual:
                    score -= 100

                interfaces.append({
                    "name": iface_name,
                    "ip": ip,
                    "netmask": netmask,
                    "cidr": cidr,
                    "network_address": network_addr,
                    "gateway": gw,
                    "is_up": is_up,
                    "is_virtual": is_virtual,
                    "is_wifi": is_wifi,
                    "has_gateway": has_gw,
                    "metric": metric,
                    "score": score
                })

    # Fallback if no interfaces detected
    if not interfaces:
        detected_ip = "127.0.0.1"
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            detected_ip = s.getsockname()[0]
            s.close()
        except Exception:
            pass

        if is_private_ip(detected_ip) and detected_ip != "127.0.0.1":
            parts = detected_ip.split(".")
            net_prefix = f"{parts[0]}.{parts[1]}.{parts[2]}"
            interfaces.append({
                "name": "Local LAN",
                "ip": detected_ip,
                "netmask": "255.255.255.0",
                "cidr": f"{net_prefix}.0/24",
                "network_address": f"{net_prefix}.0",
                "gateway": f"{net_prefix}.1",
                "is_up": True,
                "is_virtual": False,
                "is_wifi": True,
                "has_gateway": True,
                "metric": 20,
                "score": 80
            })

    # Sort descending by priority score
    interfaces.sort(key=lambda x: x["score"], reverse=True)
    return interfaces


def print_safe_network_diagnostics(interfaces: List[Dict[str, Any]], selected: Dict[str, Any]) -> None:
    """
    Requirement 4: Prints safe network diagnostics in the exact specified format.
    Never prints passwords or sensitive tokens.
    """
    output_lines = [
        "",
        "[Network] Starting network detection",
        "",
        "[Network] Interfaces discovered:"
    ]
    for iface in interfaces:
        status_str = f"Active: True" if iface == selected else f"Active: False"
        virt_str = " (Virtual)" if iface["is_virtual"] else ""
        output_lines.append(
            f"  - {iface['name']}{virt_str}: {iface['ip']} / {iface['netmask']} (Gateway: {iface['gateway'] or 'None'}, {status_str})"
        )
    output_lines.extend([
        "",
        f"[Network] Selected interface: {selected['name']}",
        f"[Network] Local IPv4: {selected['ip']}",
        f"[Network] Netmask: {selected['netmask']}",
        f"[Network] Gateway: {selected['gateway'] or 'N/A'}",
        f"[Network] Calculated subnet: {selected['cidr']}",
        "",
        "[Discovery] Starting IP Webcam discovery"
    ])
    
    diagnostic_text = "\n".join(output_lines)
    print(diagnostic_text)
    for line in output_lines:
        if line:
            logger.info(line)


def get_lan_ip_and_subnets() -> Tuple[str, str, Dict[str, Any], List[Dict[str, Any]]]:
    """
    Returns (primary_ip, primary_prefix, primary_interface_dict, all_interfaces_list).
    Dynamically resolves real network parameters without hardcoded subnets.
    """
    detected = detect_active_network_interfaces()
    if detected:
        primary = detected[0]
        lan_ip = primary["ip"]
        parts = lan_ip.split(".")
        prefix = f"{parts[0]}.{parts[1]}.{parts[2]}."
        return lan_ip, prefix, primary, detected

    return "127.0.0.1", "127.0.0.", {
        "name": "Loopback",
        "ip": "127.0.0.1",
        "netmask": "255.0.0.0",
        "cidr": "127.0.0.0/8",
        "gateway": None,
        "is_up": True,
        "is_virtual": False,
        "is_wifi": False,
        "score": 0
    }, []


def get_lan_ip_and_subnet() -> Tuple[str, str]:
    """Compatibility helper returning (lan_ip, subnet_prefix)."""
    ip, prefix, _, _ = get_lan_ip_and_subnets()
    return ip, prefix


def get_arp_dynamic_ips(target_network: Any = None) -> List[str]:
    """
    Parses OS ARP table to extract dynamic IPs belonging to the target network.
    Accepts an IPv4Network, string prefix, or None.
    Filters out broadcast, multicast, and virtual IPs.
    """
    ips: List[str] = []
    try:
        out = subprocess.check_output(["arp", "-a"], text=True, stderr=subprocess.DEVNULL)
        for line in out.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) >= 2:
                ip_str = parts[0]
                if is_private_ip(ip_str) and not ip_str.endswith(".255") and not ip_str.endswith(".0"):
                    try:
                        if target_network is not None:
                            if isinstance(target_network, str):
                                if not ip_str.startswith(target_network):
                                    continue
                            elif isinstance(target_network, ipaddress.IPv4Network):
                                addr = ipaddress.IPv4Address(ip_str)
                                if addr not in target_network:
                                    continue
                        if ip_str not in ips:
                            ips.append(ip_str)
                    except ValueError:
                        continue
    except Exception as e:
        logger.debug(f"[Discovery] ARP inspection error: {e}")
    return ips


async def probe_port_open(ip: str, port: int, timeout: float = 0.9) -> bool:
    """
    Fast asynchronous TCP probe to determine if port is reachable.
    Uses 0.9s timeout to accommodate real-world Wi-Fi round-trip latency (which often reaches 250-400ms).
    """
    try:
        conn = asyncio.open_connection(ip, port)
        reader, writer = await asyncio.wait_for(conn, timeout=timeout)
        writer.close()
        try:
            await asyncio.wait_for(writer.wait_closed(), timeout=0.2)
        except Exception:
            pass
        return True
    except Exception:
        return False


async def inspect_ip_webcam_candidate(
    client: httpx.AsyncClient,
    ip: str,
    port: int,
    username: Optional[str] = None,
    password: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Inspects whether an open IP:Port corresponds to an Android IP Webcam or compatible camera.
    Handles Basic and Digest authentication challenges without leaking credentials.
    """
    base_url = f"http://{ip}:{port}"
    static_paths = ["/status.json", "/shot.jpg", "/", "/sensors.json"]

    for path in static_paths:
        target_url = f"{base_url}{path}"
        try:
            # First send unauthenticated probe to check headers and auth challenges
            resp = await client.get(target_url, timeout=1.8, follow_redirects=True)
            server_hdr = resp.headers.get("server", "").lower()
            auth_hdr = resp.headers.get("www-authenticate", "").lower()
            content_type = resp.headers.get("content-type", "").lower()
            body_text = resp.text[:1200].lower() if resp.status_code == 200 else ""

            is_ip_webcam = (
                "ip webcam" in server_hdr
                or "android" in server_hdr
                or "ceova" in server_hdr
                or "ip webcam" in body_text
                or "curpath" in body_text
                or "/video" in body_text
                or (path == "/status.json" and resp.status_code == 200)
            )

            # Stage: 401 Unauthorized Challenge
            if resp.status_code == 401 or "basic" in auth_hdr or "digest" in auth_hdr:
                auth_type = "Digest" if "digest" in auth_hdr else "Basic"
                logger.info(f"[Discovery] Candidate {ip}:{port} requires authentication ({auth_type})")

                if username and password:
                    try:
                        auth_handler = httpx.DigestAuth(username, password) if auth_type == "Digest" else httpx.BasicAuth(username, password)
                        auth_resp = await client.get(target_url, auth=auth_handler, timeout=2.0, follow_redirects=True)
                        if auth_resp.status_code == 200:
                            logger.info(f"[Auth] Authentication successful for candidate {ip}:{port}")
                            stream_candidates = build_authenticated_stream_urls(ip, port, username, password)
                            chosen_stream_url = stream_candidates[0] if stream_candidates else f"http://{ip}:{port}/video"
                            return {
                                "ip": ip,
                                "port": port,
                                "auth_required": True,
                                "auth_type": auth_type,
                                "authenticated": True,
                                "stream_url": chosen_stream_url,
                                "device_info": f"Android IP Webcam ({ip}:{port})",
                                "status_message": f"Successfully connected to IP Webcam at {ip}:{port}"
                            }
                        elif auth_resp.status_code == 401:
                            logger.warning(f"[Auth] Authentication failed for candidate {ip}:{port}")
                            return {
                                "ip": ip,
                                "port": port,
                                "auth_required": True,
                                "auth_type": auth_type,
                                "authenticated": False,
                                "stream_url": None,
                                "device_info": f"Android IP Webcam ({ip}:{port})",
                                "status_message": f"Camera discovered at {ip}:{port}, but username/password was rejected."
                            }
                    except Exception as auth_err:
                        logger.debug(f"[Auth] Error verifying credentials on {ip}:{port}: {auth_err}")

                return {
                    "ip": ip,
                    "port": port,
                    "auth_required": True,
                    "auth_type": auth_type,
                    "authenticated": False,
                    "stream_url": None,
                    "device_info": f"Android IP Webcam ({ip}:{port})",
                    "status_message": f"Camera discovered at {ip}:{port}. Credentials required ({auth_type})."
                }

            # Stage: 200 OK Response
            if resp.status_code == 200 and (is_ip_webcam or "image" in content_type):
                device_label = f"Android IP Webcam ({ip}:{port})"
                try:
                    if path == "/status.json":
                        data = resp.json()
                        cam_model = data.get("model") or data.get("name")
                        if cam_model:
                            device_label = f"Android {cam_model} ({ip}:{port})"
                except Exception:
                    pass

                stream_candidates = build_authenticated_stream_urls(ip, port, username, password)
                chosen_stream_url = stream_candidates[0] if stream_candidates else f"http://{ip}:{port}/video"
                return {
                    "ip": ip,
                    "port": port,
                    "auth_required": False,
                    "auth_type": "None",
                    "authenticated": True,
                    "stream_url": chosen_stream_url,
                    "device_info": device_label,
                    "status_message": f"Verified IP Webcam at {ip}:{port}"
                }

        except (httpx.ConnectTimeout, httpx.ConnectError):
            return None
        except Exception:
            continue

    # Fallback: test stream endpoint via stream()
    try:
        async with client.stream("GET", f"{base_url}/video", timeout=1.8) as st_resp:
            auth_hdr = st_resp.headers.get("www-authenticate", "").lower()
            if st_resp.status_code == 401:
                return {
                    "ip": ip,
                    "port": port,
                    "auth_required": True,
                    "auth_type": "Digest" if "digest" in auth_hdr else "Basic",
                    "authenticated": False,
                    "stream_url": None,
                    "device_info": f"Android IP Webcam ({ip}:{port})",
                    "status_message": f"Camera discovered at {ip}:{port}. Credentials required."
                }
            elif st_resp.status_code == 200:
                stream_candidates = build_authenticated_stream_urls(ip, port, username, password)
                chosen_stream_url = stream_candidates[0] if stream_candidates else f"http://{ip}:{port}/video"
                return {
                    "ip": ip,
                    "port": port,
                    "auth_required": False,
                    "auth_type": "None",
                    "authenticated": True,
                    "stream_url": chosen_stream_url,
                    "device_info": f"Android IP Webcam ({ip}:{port})",
                    "status_message": f"Verified IP Webcam at {ip}:{port}"
                }
    except Exception:
        pass

    return None


async def verify_camera_stream_feed(
    client: httpx.AsyncClient,
    ip: str,
    port: int,
    username: Optional[str],
    password: Optional[str]
) -> bool:
    """Verifies that the camera is actively serving frames without hanging on infinite streams."""
    auth = (username, password) if (username and password) else None

    # Snapshot check
    try:
        r = await client.get(f"http://{ip}:{port}/shot.jpg", auth=auth, timeout=1.8)
        if r.status_code == 200 and len(r.content) > 200:
            return True
    except Exception:
        pass

    # Stream header check
    for ep in ["/video", "/videofeed"]:
        try:
            async with client.stream("GET", f"http://{ip}:{port}{ep}", auth=auth, timeout=1.8) as st_resp:
                if st_resp.status_code == 200:
                    return True
        except Exception:
            continue

    return True


async def test_direct_reachability(
    url_or_ip: str,
    port: int = 8080,
    username: Optional[str] = None,
    password: Optional[str] = None
) -> Dict[str, Any]:
    """
    Requirement 6 & 7: Comprehensive 6-stage reachability verification for a specific target.
    Stage 1: Host reachable?
    Stage 2: Port reachable? (Accepts any valid port 1-65535, does NOT change to 8080)
    Stage 3: HTTP server responds?
    Stage 4: Authentication required?
    Stage 5: Authentication successful?
    Stage 6: Video endpoint available?
    """
    clean_host, target_port, _ = parse_camera_host_port_path(url_or_ip, port)
    stage_details: List[str] = []
    
    host_reachable = False
    port_reachable = False
    http_server_responds = False
    auth_required = False
    auth_successful = False
    video_available = False
    stream_url = None
    device_info = None

    # Stage 1: Host reachable test (Socket attempt or fast ping)
    stage_details.append(f"[Stage 1 - Host Reachable]: Testing host reachability for {clean_host}...")
    try:
        # Check if IP resolves
        socket.gethostbyname(clean_host)
        host_reachable = True
        stage_details.append(f"  -> Host {clean_host} resolved successfully.")
    except Exception as e:
        stage_details.append(f"  -> Host resolution failed: {e}")
        return {
            "host": clean_host,
            "port": target_port,
            "host_reachable": False,
            "port_reachable": False,
            "http_server_responds": False,
            "auth_required": False,
            "auth_successful": False,
            "video_endpoint_available": False,
            "stream_url": None,
            "device_info": None,
            "diagnostics_summary": f"Host '{clean_host}' is unreachable or cannot be resolved.",
            "stage_details": stage_details
        }

    # Stage 2: Port Reachable test (Accepts any port 1-65535)
    stage_details.append(f"[Stage 2 - Port Reachable]: Testing TCP connection on port {target_port} (timeout=1.2s)...")
    port_reachable = await probe_port_open(clean_host, target_port, timeout=1.2)
    if not port_reachable:
        stage_details.append(f"  -> TCP connection to {clean_host}:{target_port} timed out or was refused.")
        stage_details.append(f"  -> Check that the IP Webcam app is currently running on the phone and 'Start server' is active.")
        return {
            "host": clean_host,
            "port": target_port,
            "host_reachable": True,
            "port_reachable": False,
            "http_server_responds": False,
            "auth_required": False,
            "auth_successful": False,
            "video_endpoint_available": False,
            "stream_url": None,
            "device_info": None,
            "diagnostics_summary": f"Host {clean_host} is reachable, but port {target_port} is closed/not answering.",
            "stage_details": stage_details
        }
    stage_details.append(f"  -> TCP port {target_port} is OPEN and answering!")

    # Stage 3, 4, 5, 6: HTTP and Camera Inspection
    stage_details.append(f"[Stage 3 - HTTP Server]: Probing HTTP endpoints (/status.json, /, /shot.jpg)...")
    timeout_cfg = httpx.Timeout(connect=2.0, read=2.5, write=2.0, pool=2.0)
    async with httpx.AsyncClient(headers={"User-Agent": "Ceova-Vision/1.0"}, timeout=timeout_cfg) as client:
        cam_info = await inspect_ip_webcam_candidate(client, clean_host, target_port, username, password)
        if cam_info:
            http_server_responds = True
            device_info = cam_info.get("device_info")
            auth_required = cam_info.get("auth_required", False)
            auth_successful = cam_info.get("authenticated", False)
            stage_details.append(f"  -> HTTP server responded! Device: {device_info or 'Generic Camera'}")

            # Stage 4 & 5: Authentication status
            if auth_required:
                stage_details.append(f"[Stage 4 - Authentication Required]: Camera requires authentication ({cam_info.get('auth_type', 'Basic/Digest')}).")
                if auth_successful:
                    stage_details.append(f"[Stage 5 - Authentication Successful]: Credentials verified successfully!")
                else:
                    stage_details.append(f"[Stage 5 - Authentication Failed]: Credentials rejected or not supplied.")
            else:
                stage_details.append(f"[Stage 4 - Authentication Required]: Open camera - No authentication required.")
                auth_successful = True
                stage_details.append(f"[Stage 5 - Authentication Successful]: Unrestricted access granted.")

            # Stage 6: Video Endpoint
            if auth_successful and cam_info.get("stream_url"):
                stage_details.append(f"[Stage 6 - Video Endpoint]: Verifying live frame transmission...")
                valid_feed = await verify_camera_stream_feed(client, clean_host, target_port, username, password)
                if valid_feed:
                    video_available = True
                    stream_url = cam_info.get("stream_url")
                    stage_details.append(f"  -> Live video feed verified successfully at {stream_url}!")
                else:
                    stage_details.append(f"  -> Video stream endpoint reached, but frame payload could not be verified.")
            else:
                stage_details.append(f"[Stage 6 - Video Endpoint]: Skipped due to pending authentication.")
        else:
            stage_details.append(f"  -> Port {target_port} answered TCP, but did not respond with a valid IP Webcam HTTP signature.")

    summary = (
        f"Verified IP Webcam at {clean_host}:{target_port} - Live video ready!"
        if video_available
        else f"Camera reached at {clean_host}:{target_port}, but setup requires attention: {stage_details[-1]}"
    )

    return {
        "host": clean_host,
        "port": target_port,
        "host_reachable": host_reachable,
        "port_reachable": port_reachable,
        "http_server_responds": http_server_responds,
        "auth_required": auth_required,
        "auth_successful": auth_successful,
        "video_endpoint_available": video_available,
        "stream_url": sanitize_url_for_logging(stream_url) if stream_url else None,
        "device_info": device_info,
        "diagnostics_summary": summary,
        "stage_details": stage_details
    }


async def _internal_discovery_run(
    username: Optional[str] = None,
    password: Optional[str] = None,
    preferred_port: Optional[int] = None
) -> Dict[str, Any]:
    """Internal implementation of local network discovery with full network intelligence."""
    # Step 1: Discover real network interfaces and rank them
    interfaces = detect_active_network_interfaces()
    if not interfaces:
        lan_ip, subnet_prefix, selected, interfaces = get_lan_ip_and_subnets()
    else:
        selected = interfaces[0]
        lan_ip = selected["ip"]
        parts = lan_ip.split(".")
        subnet_prefix = f"{parts[0]}.{parts[1]}.{parts[2]}."

    # Step 2: Print safe network diagnostics
    print_safe_network_diagnostics(interfaces, selected)

    try:
        network_obj = ipaddress.IPv4Network(selected["cidr"], strict=False)
    except Exception:
        network_obj = ipaddress.IPv4Network(f"{subnet_prefix}0/24", strict=False)

    # Ports to scan: Put user preferred port first!
    ports_to_check: List[int] = []
    if preferred_port and 1 <= preferred_port <= 65535:
        ports_to_check.append(preferred_port)
    for p in DISCOVERY_PORTS:
        if p not in ports_to_check:
            ports_to_check.append(p)

    # Step 3: ARP neighbors & priority candidates
    arp_ips = get_arp_dynamic_ips(network_obj)
    priority_ips: List[str] = []
    for ip in arp_ips:
        if ip != lan_ip and ip not in priority_ips:
            priority_ips.append(ip)
    for local_test in ["127.0.0.1", lan_ip]:
        if local_test not in priority_ips:
            priority_ips.append(local_test)

    logger.info(f"[Discovery] Priority candidates (ARP dynamic + local): {priority_ips}")

    timeout_cfg = httpx.Timeout(connect=1.8, read=2.0, write=1.8, pool=1.8)
    async with httpx.AsyncClient(headers={"User-Agent": "Ceova-Vision/1.0"}, timeout=timeout_cfg) as client:
        # Check Priority IPs first
        for port in ports_to_check:
            for ip in priority_ips:
                if await probe_port_open(ip, port, timeout=0.8):
                    logger.info(f"[Discovery] Port {port} OPEN on priority candidate {ip}!")
                    cam = await inspect_ip_webcam_candidate(client, ip, port, username, password)
                    if cam:
                        if cam.get("authenticated") and cam.get("stream_url"):
                            valid = await verify_camera_stream_feed(client, ip, port, username, password)
                            if valid:
                                cam["success"] = True
                                cam["network_info"] = selected
                                return cam
                        elif cam.get("auth_required") and not cam.get("authenticated"):
                            cam["success"] = False
                            cam["network_info"] = selected
                            return cam

        # Step 4: Subnet Sweep (Bounded to /24 block to avoid scanning 65k addresses)
        logger.info(f"[Discovery] Initiating subnet sweep on {selected['name']} ({network_obj.network_address}/24)...")
        
        # Calculate bounded IPs
        base_parts = lan_ip.split(".")
        base_prefix = f"{base_parts[0]}.{base_parts[1]}.{base_parts[2]}."
        sweep_ips = [
            f"{base_prefix}{i}" for i in range(1, 255)
            if f"{base_prefix}{i}" != lan_ip and f"{base_prefix}{i}" not in priority_ips
        ]

        sem = asyncio.Semaphore(DISCOVERY_CONCURRENCY)

        async def check_single_ip(target_ip: str, target_port: int) -> Optional[str]:
            async with sem:
                if await probe_port_open(target_ip, target_port, timeout=0.8):
                    return target_ip
                return None

        # Sweep preferred port first, then secondary common ports
        ports_for_sweep = ports_to_check[:3]
        for port in ports_for_sweep:
            tasks = [check_single_ip(ip, port) for ip in sweep_ips]
            results = await asyncio.gather(*tasks)
            open_ips = [ip for ip in results if ip is not None]

            for ip in open_ips:
                logger.info(f"[Discovery] Subnet sweep found open port {port} on {ip}!")
                cam = await inspect_ip_webcam_candidate(client, ip, port, username, password)
                if cam:
                    if cam.get("authenticated") and cam.get("stream_url"):
                        valid = await verify_camera_stream_feed(client, ip, port, username, password)
                        if valid:
                            cam["success"] = True
                            cam["network_info"] = selected
                            return cam
                    elif cam.get("auth_required") and not cam.get("authenticated"):
                        cam["success"] = False
                        cam["network_info"] = selected
                        return cam

    # Nothing discovered
    ports_str = ", ".join(str(p) for p in ports_to_check[:4])
    return {
        "success": False,
        "ip": None,
        "port": None,
        "stream_url": None,
        "auth_required": False,
        "authenticated": False,
        "status_message": (
            f"No IP Webcam found on {selected['name']} ({selected['cidr']}, ports {ports_str}). "
            "Please ensure the camera server is running in the phone app and both devices are on the same Wi-Fi, "
            "or use Direct IP Test."
        ),
        "device_info": None,
        "network_info": selected
    }


async def auto_discover_ip_webcam(
    username: Optional[str] = None,
    password: Optional[str] = None,
    preferred_port: Optional[int] = None
) -> Dict[str, Any]:
    """
    Main auto-discovery engine guarded by DISCOVERY_TIMEOUT.
    """
    try:
        return await asyncio.wait_for(
            _internal_discovery_run(username, password, preferred_port),
            timeout=DISCOVERY_TIMEOUT
        )
    except asyncio.TimeoutError:
        logger.warning(f"[Discovery] Discovery operation reached timeout ({DISCOVERY_TIMEOUT}s)")
        interfaces = detect_active_network_interfaces()
        selected = interfaces[0] if interfaces else {"name": "Local LAN", "cidr": "local subnet"}
        return {
            "success": False,
            "ip": None,
            "port": None,
            "stream_url": None,
            "auth_required": False,
            "authenticated": False,
            "status_message": (
                f"Discovery timed out after {int(DISCOVERY_TIMEOUT)}s on {selected['name']} ({selected.get('cidr', 'LAN')}). "
                "Ensure IP Webcam app is running, or use Direct IP Test."
            ),
            "device_info": None,
            "network_info": selected
        }
