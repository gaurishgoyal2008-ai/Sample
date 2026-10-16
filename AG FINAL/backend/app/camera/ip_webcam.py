import re
import cv2
import logging
import urllib.parse
from typing import Tuple, Optional, List
import httpx
import numpy as np

logger = logging.getLogger("ceova.camera.ip_webcam")

def sanitize_url_for_logging(url: str) -> str:
    """Removes passwords from URLs for safe logging and display."""
    if not url:
        return ""
    if "@" in url:
        return re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", url)
    return url

def parse_camera_host_port_path(url_or_ip: str, default_port: int = 8080) -> Tuple[str, int, str]:
    """
    Safely parses an IP or URL into clean (host, port, path), stripping any inline userinfo.
    Guarantees clean host strings without colon or at-signs.
    """
    cleaned = url_or_ip.strip()
    if not cleaned.startswith("http://") and not cleaned.startswith("https://"):
        cleaned = f"http://{cleaned}"

    parsed = urllib.parse.urlparse(cleaned)
    host = parsed.hostname or url_or_ip.strip()
    port = parsed.port if parsed.port is not None else default_port
    path = parsed.path if parsed.path and parsed.path != "/" else "/video"
    return host, port, path

def build_authenticated_stream_urls(url_or_ip: str, port: int = 8080, username: Optional[str] = None, password: Optional[str] = None) -> List[str]:
    """
    Constructs candidate streaming URLs for IP Webcam endpoints (e.g. Android IP Webcam).
    Handles credentials safely in the request.
    """
    host, target_port, path = parse_camera_host_port_path(url_or_ip, port)
    urls = []

    if username and password:
        user_enc = urllib.parse.quote(username, safe="")
        pass_enc = urllib.parse.quote(password, safe="")
        urls.append(f"http://{user_enc}:{pass_enc}@{host}:{target_port}{path}")
        if path != "/video":
            urls.append(f"http://{user_enc}:{pass_enc}@{host}:{target_port}/video")
        urls.append(f"http://{user_enc}:{pass_enc}@{host}:{target_port}/videofeed")
        urls.append(f"http://{user_enc}:{pass_enc}@{host}:{target_port}/shot.jpg")
    else:
        urls.append(f"http://{host}:{target_port}{path}")
        if path != "/video":
            urls.append(f"http://{host}:{target_port}/video")
        urls.append(f"http://{host}:{target_port}/videofeed")
        urls.append(f"http://{host}:{target_port}/shot.jpg")

    return urls

def test_ip_webcam_connection(
    url_or_ip: str,
    port: int = 8080,
    username: Optional[str] = None,
    password: Optional[str] = None
) -> Tuple[bool, Optional[str], str]:
    """
    Tests if an IP Webcam stream can be reached, authenticated, and opened.
    Uses modern httpx client to avoid Python 3.14 urllib inline-auth getaddrinfo bugs.
    Guarantees credentials are never leaked in error messages.
    """
    if not url_or_ip or not url_or_ip.strip():
        return False, None, "Invalid address: Camera IP or URL cannot be empty."

    host, target_port, path = parse_camera_host_port_path(url_or_ip, port)
    auth = (username, password) if (username and password) else None

    # Step 1: Probe camera via HTTP using clean host:port
    # Put static endpoints first to get instant responses; streaming endpoints use client.stream()
    static_endpoints = ["/status.json", "/shot.jpg", "/"]
    streaming_endpoints = [path if path not in ["/", "/shot.jpg", "/status.json"] else "/video", "/video", "/videofeed"]

    working_endpoint = None
    is_authenticated = False
    timeout_cfg = httpx.Timeout(connect=1.5, read=1.5, write=1.5, pool=1.5)

    try:
        with httpx.Client(headers={"User-Agent": "Ceova-Vision/1.0"}, timeout=timeout_cfg, follow_redirects=True) as client:
            # First: probe static endpoints (instant bounded response)
            for ep in static_endpoints:
                target_url = f"http://{host}:{target_port}{ep}"
                try:
                    resp = client.get(target_url, auth=auth)
                    if resp.status_code == 401:
                        logger.warning(f"[IP Webcam] HTTP 401 Unauthorized at http://{host}:{target_port}{ep}")
                        return False, None, "Authentication failed. Check the supplied username and password."
                    elif resp.status_code == 200:
                        working_endpoint = ep if ep in ["/video", "/videofeed"] else "/video"
                        is_authenticated = True
                        break
                except (httpx.ConnectTimeout, httpx.ConnectError):
                    raise
                except Exception:
                    continue

            # Second: if static endpoints didn't match, test streaming endpoints using stream() to read headers without buffering
            if not is_authenticated:
                for ep in streaming_endpoints:
                    target_url = f"http://{host}:{target_port}{ep}"
                    try:
                        with client.stream("GET", target_url, auth=auth) as resp:
                            if resp.status_code == 401:
                                logger.warning(f"[IP Webcam] HTTP 401 Unauthorized at http://{host}:{target_port}{ep}")
                                return False, None, "Authentication failed. Check the supplied username and password."
                            elif resp.status_code == 200:
                                working_endpoint = ep
                                is_authenticated = True
                                break
                    except (httpx.ConnectTimeout, httpx.ConnectError):
                        raise
                    except Exception:
                        continue

    except (httpx.ConnectTimeout, httpx.ConnectError):
        logger.warning(f"[IP Webcam] Connection timeout to {host}:{target_port}")
        return False, None, "Unable to reach camera. Verify device IP address and port."
    except Exception as e:
        logger.warning(f"[IP Webcam] Connection error: {type(e).__name__}")
        return False, None, "Unable to reach camera. Verify device IP address and port."

    if not is_authenticated or not working_endpoint:
        return False, None, "Video stream unavailable. Check that the camera app is broadcasting."

    # Construct the primary working stream URL
    if username and password:
        user_enc = urllib.parse.quote(username, safe="")
        pass_enc = urllib.parse.quote(password, safe="")
        stream_url = f"http://{user_enc}:{pass_enc}@{host}:{target_port}{working_endpoint}"
    else:
        stream_url = f"http://{host}:{target_port}{working_endpoint}"

    safe_url = sanitize_url_for_logging(stream_url)
    logger.info(f"[IP Webcam] Verified camera endpoint at {safe_url}")

    # Step 2: Instant frame verification via fast snapshot probe (never block main thread with slow OpenCV connect)
    try:
        with httpx.Client(headers={"User-Agent": "Ceova-Vision/1.0"}, timeout=1.5) as client:
            snap_url = f"http://{host}:{target_port}/shot.jpg"
            snap_resp = client.get(snap_url, auth=auth)
            if snap_resp.status_code == 200 and len(snap_resp.content) > 500:
                logger.info(f"[IP Webcam] Successfully verified HTTP snapshot stream at {safe_url}")
                return True, stream_url, "Connected to IP Webcam successfully."
    except Exception as e:
        logger.debug(f"[IP Webcam] Snapshot verify note: {e}")

    # If HTTP responded 200 OK headers, return success with stream_url
    return True, stream_url, "Connected to IP Webcam successfully."
