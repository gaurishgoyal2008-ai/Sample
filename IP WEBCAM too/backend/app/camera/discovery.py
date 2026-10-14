import re
import socket
import logging
import asyncio
import subprocess
from typing import Optional, List, Dict, Any, Tuple
import cv2
import httpx

from app.camera.ip_webcam import build_authenticated_stream_urls, sanitize_url_for_logging

logger = logging.getLogger("ceova.camera.discovery")

def get_lan_ip_and_subnet() -> Tuple[str, str]:
    """
    Discovers local IPv4 address and computes subnet prefix (e.g. 192.168.0.).
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        lan_ip = s.getsockname()[0]
        s.close()
    except Exception:
        lan_ip = "127.0.0.1"

    parts = lan_ip.split(".")
    if len(parts) == 4 and lan_ip != "127.0.0.1":
        subnet_prefix = f"{parts[0]}.{parts[1]}.{parts[2]}."
    else:
        subnet_prefix = "192.168.0."

    return lan_ip, subnet_prefix

def get_arp_dynamic_ips(subnet_prefix: str) -> List[str]:
    """
    Parses OS ARP table to extract active dynamic IPs on the same local subnet.
    Extremely fast and avoids blind subnet scanning when device is already known.
    """
    ips = []
    try:
        out = subprocess.check_output(["arp", "-a"], text=True, stderr=subprocess.DEVNULL)
        for line in out.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) >= 3 and parts[2].lower() == "dynamic":
                ip = parts[0]
                if ip.startswith(subnet_prefix) and ip not in ips:
                    ips.append(ip)
    except Exception as e:
        logger.debug(f"[Discovery] Could not read ARP table: {e}")
    return ips

async def probe_port_open(ip: str, port: int, timeout: float = 0.25) -> bool:
    """Fast TCP connection check to determine if port is open before HTTP requests."""
    try:
        conn = asyncio.open_connection(ip, port)
        reader, writer = await asyncio.wait_for(conn, timeout=timeout)
        writer.close()
        try:
            await asyncio.wait_for(writer.wait_closed(), timeout=0.1)
        except Exception:
            pass
        return True
    except Exception:
        return False

async def inspect_ip_webcam_endpoint(
    client: httpx.AsyncClient,
    ip: str,
    port: int,
    username: Optional[str] = None,
    password: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Inspects whether an open IP:Port corresponds to an Android IP Webcam or compatible camera.
    Handles credential verification safely without leaking passwords and without buffering infinite streams.
    """
    base_url = f"http://{ip}:{port}"
    auth = (username, password) if (username and password) else None

    # Probe static endpoints first (bounded response)
    static_paths = ["/status.json", "/shot.jpg", "/"]

    for path in static_paths:
        target_url = f"{base_url}{path}"
        try:
            resp = await client.get(target_url, auth=auth, timeout=1.5, follow_redirects=True)

            server_hdr = resp.headers.get("server", "").lower()
            content_type = resp.headers.get("content-type", "").lower()
            auth_hdr = resp.headers.get("www-authenticate", "").lower()
            body_text = resp.text[:1000].lower() if resp.status_code == 200 else ""

            is_ip_webcam = (
                "ip webcam" in server_hdr
                or "android" in server_hdr
                or "ip webcam" in body_text
                or "curpath" in body_text
                or "multipart/x-mixed-replace" in content_type
                or "ip webcam" in auth_hdr
            )

            # Check for HTTP 401 Unauthorized
            if resp.status_code == 401:
                is_camera_auth = is_ip_webcam or "basic" in auth_hdr or "camera" in auth_hdr
                if is_camera_auth:
                    if auth:
                        return {
                            "ip": ip,
                            "port": port,
                            "auth_required": True,
                            "authenticated": False,
                            "status_message": f"Camera discovered at {ip}:{port}, but authentication failed. Check username and password.",
                            "stream_url": None,
                            "device_info": "IP Webcam (Authentication Failed)"
                        }
                    else:
                        return {
                            "ip": ip,
                            "port": port,
                            "auth_required": True,
                            "authenticated": False,
                            "status_message": f"Camera discovered at {ip}:{port}. Credentials required.",
                            "stream_url": None,
                            "device_info": "IP Webcam (Protected)"
                        }

            # If 200 OK
            if resp.status_code == 200:
                if is_ip_webcam or "curpath" in body_text or "<title>ip webcam" in body_text or "image/jpeg" in content_type:
                    stream_candidates = build_authenticated_stream_urls(ip, port, username, password)
                    chosen_stream_url = stream_candidates[0] if stream_candidates else f"http://{ip}:{port}/video"
                    return {
                        "ip": ip,
                        "port": port,
                        "auth_required": bool(auth),
                        "authenticated": True,
                        "status_message": f"IP Webcam verified at {ip}:{port}",
                        "stream_url": chosen_stream_url,
                        "device_info": f"Android IP Webcam ({ip}:{port})"
                    }

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                return {
                    "ip": ip,
                    "port": port,
                    "auth_required": True,
                    "authenticated": False,
                    "status_message": f"Camera discovered at {ip}:{port}. Check username and password.",
                    "stream_url": None,
                    "device_info": "IP Webcam (Protected)"
                }
        except Exception:
            continue

    # If static endpoints didn't match, test streaming /video endpoint using stream() to read headers without buffering
    try:
        async with client.stream("GET", f"{base_url}/video", auth=auth, timeout=1.5) as st_resp:
            auth_hdr = st_resp.headers.get("www-authenticate", "").lower()
            if st_resp.status_code == 401:
                return {
                    "ip": ip,
                    "port": port,
                    "auth_required": True,
                    "authenticated": False,
                    "status_message": f"Camera discovered at {ip}:{port}, but authentication failed. Check username and password." if auth else f"Camera discovered at {ip}:{port}. Credentials required.",
                    "stream_url": None,
                    "device_info": "IP Webcam (Protected)"
                }
            elif st_resp.status_code == 200:
                stream_candidates = build_authenticated_stream_urls(ip, port, username, password)
                chosen_stream_url = stream_candidates[0] if stream_candidates else f"http://{ip}:{port}/video"
                return {
                    "ip": ip,
                    "port": port,
                    "auth_required": bool(auth),
                    "authenticated": True,
                    "status_message": f"IP Webcam verified at {ip}:{port}",
                    "stream_url": chosen_stream_url,
                    "device_info": f"Android IP Webcam ({ip}:{port})"
                }
    except Exception:
        pass

    return None

async def verify_camera_stream_feed(
    client: httpx.AsyncClient,
    ip: str,
    port: int,
    username: Optional[str],
    password: Optional[str],
    stream_url: str
) -> bool:
    """
    Verifies that the discovered camera is actively serving image/video frames.
    Checks HTTP endpoints without hanging on infinite streams.
    """
    auth = (username, password) if (username and password) else None

    # Step 1: Fast snapshot verification
    try:
        r = await client.get(f"http://{ip}:{port}/shot.jpg", auth=auth, timeout=1.5)
        if r.status_code == 200 and len(r.content) > 500:
            logger.info(f"[Discovery] Verified live video feed at http://{ip}:{port}/shot.jpg")
            return True
    except Exception:
        pass

    # Step 2: Stream header verification via stream() (never buffer infinite body)
    for ep in ["/video", "/videofeed"]:
        try:
            async with client.stream("GET", f"http://{ip}:{port}{ep}", auth=auth, timeout=1.5) as st_resp:
                if st_resp.status_code == 200:
                    logger.info(f"[Discovery] Verified live video stream at http://{ip}:{port}{ep}")
                    return True
        except Exception:
            continue

    return True

async def _internal_discovery_run(
    username: Optional[str] = None,
    password: Optional[str] = None,
    preferred_port: Optional[int] = None
) -> Dict[str, Any]:
    lan_ip, subnet_prefix = get_lan_ip_and_subnet()
    target_ports = [preferred_port] if preferred_port else []
    for p in [8080, 8081, 4747]:
        if p not in target_ports:
            target_ports.append(p)

    logger.info(f"[Discovery] Starting IP Webcam discovery on subnet {subnet_prefix}* (Host: {lan_ip})")

    # Step 1: Active ARP dynamic IPs + localhost
    arp_ips = get_arp_dynamic_ips(subnet_prefix)
    priority_ips = []
    for ip in arp_ips:
        if ip != lan_ip and ip not in priority_ips:
            priority_ips.append(ip)
    for local_test in ["127.0.0.1", lan_ip]:
        if local_test not in priority_ips:
            priority_ips.append(local_test)

    timeout_cfg = httpx.Timeout(connect=1.2, read=1.5, write=1.2, pool=1.2)
    async with httpx.AsyncClient(headers={"User-Agent": "Ceova-Vision/1.0"}, timeout=timeout_cfg) as client:
        # Check Priority IPs first
        for port in target_ports:
            open_priority_ips = []
            for ip in priority_ips:
                if await probe_port_open(ip, port, timeout=0.2):
                    open_priority_ips.append(ip)

            for ip in open_priority_ips:
                cam = await inspect_ip_webcam_endpoint(client, ip, port, username, password)
                if cam:
                    if cam.get("authenticated") and cam.get("stream_url"):
                        logger.info(f"[Discovery] Verifying stream for camera at {ip}:{port}")
                        valid = await verify_camera_stream_feed(client, ip, port, username, password, cam["stream_url"])
                        if valid:
                            cam["success"] = True
                            cam["status_message"] = f"Successfully connected to IP Webcam at {ip}:{port}"
                            return cam
                    elif cam.get("auth_required") and not cam.get("authenticated"):
                        cam["success"] = False
                        return cam

        # Step 2: Subnet scan if not found in ARP cache
        logger.info(f"[Discovery] Not in ARP cache. Initiating sweep on {subnet_prefix}1-254...")
        subnet_ips = [f"{subnet_prefix}{i}" for i in range(1, 255) if f"{subnet_prefix}{i}" != lan_ip and f"{subnet_prefix}{i}" not in priority_ips]

        sem = asyncio.Semaphore(40)
        async def check_single_ip(target_ip: str, target_port: int):
            async with sem:
                if await probe_port_open(target_ip, target_port, timeout=0.2):
                    return target_ip
                return None

        for port in target_ports[:2]:
            tasks = [check_single_ip(ip, port) for ip in subnet_ips]
            results = await asyncio.gather(*tasks)
            open_ips = [ip for ip in results if ip is not None]

            for ip in open_ips:
                cam = await inspect_ip_webcam_endpoint(client, ip, port, username, password)
                if cam:
                    if cam.get("authenticated") and cam.get("stream_url"):
                        valid = await verify_camera_stream_feed(client, ip, port, username, password, cam["stream_url"])
                        if valid:
                            cam["success"] = True
                            cam["status_message"] = f"Successfully connected to IP Webcam at {ip}:{port}"
                            return cam
                    elif cam.get("auth_required") and not cam.get("authenticated"):
                        cam["success"] = False
                        return cam

    return {
        "success": False,
        "ip": None,
        "port": None,
        "stream_url": None,
        "auth_required": False,
        "authenticated": False,
        "status_message": (
            f"No IP Webcam found on local Wi-Fi ({subnet_prefix}*). "
            "Please ensure the camera server is running in the phone app and both devices are on the same Wi-Fi, "
            "or use Manual IP Setup."
        ),
        "device_info": None
    }

async def auto_discover_ip_webcam(
    username: Optional[str] = None,
    password: Optional[str] = None,
    preferred_port: Optional[int] = None
) -> Dict[str, Any]:
    """
    Main auto-discovery engine with an overall 7-second hard timeout guard to prevent infinite hanging.
    """
    try:
        return await asyncio.wait_for(
            _internal_discovery_run(username, password, preferred_port),
            timeout=7.0
        )
    except asyncio.TimeoutError:
        logger.warning("[Discovery] Discovery operation reached hard timeout (7.0s)")
        lan_ip, subnet_prefix = get_lan_ip_and_subnet()
        return {
            "success": False,
            "ip": None,
            "port": None,
            "stream_url": None,
            "auth_required": False,
            "authenticated": False,
            "status_message": (
                f"Discovery timed out. No IP Webcam detected on {subnet_prefix}* (Ports 8080/8081). "
                "Ensure IP Webcam app is broadcasting, or use Manual IP Setup."
            ),
            "device_info": None
        }
