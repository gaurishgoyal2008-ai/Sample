"""
================================================================================
CEOVA AI VISION - LOCAL CAMERA COMPANION SERVICE LAUNCHER
================================================================================
This script launches the local companion service on the user's laptop.

Responsibilities:
1. Scans and auto-discovers Android IP Webcams on the local Wi-Fi subnet (192.168.x.x / 10.x.x.x).
2. Establishes continuous frame capture and runs YOLO26/ByteTrack AI inference.
3. Decouples 30 FPS video display from inference latency using latest-frame processing.
4. Serves live MJPEG streams and WebSocket telemetry to both local and Vercel cloud dashboards.
================================================================================
"""

import os
import sys
import socket
import logging

# Ensure backend root is on Python sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

def get_lan_ip() -> str:
    """Discovers the active local Wi-Fi IPv4 address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def print_banner(host: str, port: int, lan_ip: str):
    banner = f"""
======================================================================
           CEOVA AI VISION - LOCAL CAMERA COMPANION SERVICE
======================================================================
 [STATUS] Local Companion Service is active and ready!

 [NETWORK ENDPOINTS]
  - Localhost URL:      http://localhost:{port}
  - Local LAN URL:      http://{lan_ip}:{port}
  - Video Stream API:   http://localhost:{port}/api/video-feed
  - Telemetry WS:       ws://localhost:{port}/ws/telemetry

 [CLOUD & LOCAL DASHBOARDS]
  - Vercel Deployment:  Open your Vercel URL in your browser.
                        It connects automatically to http://localhost:{port}
  - Local Dev Server:   http://localhost:5173

 [ANDROID IP WEBCAM DISCOVERY]
  - Phone and laptop must be on the same Wi-Fi network.
  - In IP Webcam on your phone, tap 'Start server'.
  - Click 'Connect Camera' in the dashboard to auto-discover.
======================================================================
"""
    print(banner)

def main():
    import uvicorn
    from app.config import HOST, PORT

    lan_ip = get_lan_ip()
    print_banner(HOST, PORT, lan_ip)

    # Launch uvicorn
    uvicorn.run(
        "app.main:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="info"
    )

if __name__ == "__main__":
    main()
