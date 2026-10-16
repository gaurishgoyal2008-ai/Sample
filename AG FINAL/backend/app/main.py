import os
import sys
import io
import time
import base64
import socket
import uuid
import logging
import asyncio
import threading
from datetime import datetime
from typing import Optional, List, Dict, Any

import cv2
import torch
import numpy as np
import qrcode
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app.config import (
    HOST, PORT, FRONTEND_PORT, DEFAULT_CONFIDENCE, DEFAULT_MEMORY_SECONDS,
    DEFAULT_MODEL, DEFAULT_RESOLUTION, ALL_SUPPORTED_CLASSES, ALLOWED_ORIGINS
)
from app.models.schemas import (
    TrackedObjectSchema, EventSchema, LiveStatsSchema, MonitoringSessionSchema,
    SettingsSchema, IPWebcamConnectRequest, IPWebcamAutoDiscoverRequest,
    IPWebcamAutoDiscoverResponse, QRConnectSessionResponse,
    IPWebcamDirectTestRequest, IPWebcamDirectTestResponse,
    MemoryEventSchema, CacheStatsSchema, MemoryStatsSchema
)
from app.database.db import init_db, save_session, get_session, list_sessions, delete_session
from app.detection.yolo_detector import YOLO26Detector
from app.detection.visualizer import draw_visual_overlays
from app.tracking.memory_manager import ObjectMemoryManager
from app.camera.stream_manager import CameraStreamManager
from app.camera.discovery import auto_discover_ip_webcam, test_direct_reachability, detect_active_network_interfaces
from app.camera.ip_webcam import sanitize_url_for_logging
from app.reporting.report_generator import ReportGenerator
from app.websocket.connection_manager import ConnectionManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ceova")

app = FastAPI(title="Ceova AI Vision System", version="1.0.0")

# CORS setup - supports local development and Vercel cloud deployments
cors_kwargs = {
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if "*" in ALLOWED_ORIGINS:
    cors_kwargs["allow_origins"] = ["*"]
    cors_kwargs["allow_origin_regex"] = r"^https?://.*"
else:
    cors_kwargs["allow_origins"] = ALLOWED_ORIGINS

app.add_middleware(CORSMiddleware, **cors_kwargs)

# Core singletons
stream_manager = CameraStreamManager()
detector = YOLO26Detector(DEFAULT_MODEL)
memory_manager = ObjectMemoryManager(DEFAULT_MEMORY_SECONDS)
ws_manager = ConnectionManager()

# Application State
current_settings = SettingsSchema(
    model_name=DEFAULT_MODEL,
    confidence_threshold=DEFAULT_CONFIDENCE,
    memory_seconds=DEFAULT_MEMORY_SECONDS,
    enable_trails=True,
    enable_boxes=True,
    enable_confidence=True,
    enable_track_ids=True,
    allowed_classes=ALL_SUPPORTED_CLASSES,
    processing_resolution=DEFAULT_RESOLUTION
)

monitoring_active = False
current_session_id: Optional[str] = None
session_start_time: Optional[datetime] = None
session_sequence_counter = 1

# Latest processed output frame (JPEG) for live video stream
latest_jpeg_frame: Optional[bytes] = None
# Decoupled Asynchronous Vision Pipeline State
shared_state_lock = threading.Lock()
latest_active_objects: List[TrackedObjectSchema] = []
latest_new_events: List[EventSchema] = []
last_ai_processed_frame_time: float = 0.0

display_fps = 0.0
display_fps_counter = 0
display_fps_start_time = 0.0

ai_fps = 0.0
ai_fps_counter = 0
ai_fps_start_time = 0.0
ai_latency_ms = 0.0

latest_timing_metrics = {
    "pre_ms": 0.0,
    "inf_ms": 0.0,
    "post_ms": 0.0,
    "render_ms": 0.0,
    "encode_ms": 0.0,
    "total_ai_ms": 0.0,
    "device": detector.device.upper()
}

ai_worker_thread: Optional[threading.Thread] = None
stop_ai_worker_event = threading.Event()

def get_lan_ip() -> str:
    """Discovers local network IPv4 address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def generate_session_id() -> str:
    global session_sequence_counter
    date_str = datetime.now().strftime("%Y%m%d")
    s_id = f"#CEOVA-{date_str}-{session_sequence_counter:03d}"
    session_sequence_counter += 1
    return s_id

def apply_resolution_scale(frame: np.ndarray, res_setting: str) -> Tuple[np.ndarray, float, float]:
    """
    Scales frame for inference while strictly preserving native aspect ratio.
    Returns (scaled_frame, scale_factor_x, scale_factor_y) to allow exact coordinate reconstruction.
    """
    if frame is None or res_setting == "Auto":
        return frame, 1.0, 1.0
    h, w = frame.shape[:2]
    target_max = None
    if res_setting == "480p" and (w > 854 or h > 480):
        target_max = (854, 480)
    elif res_setting == "720p" and (w > 1280 or h > 720):
        target_max = (1280, 720)
    elif res_setting == "1080p" and (w > 1920 or h > 1080):
        target_max = (1920, 1080)

    if target_max:
        scale = min(target_max[0] / float(w), target_max[1] / float(h))
        new_w, new_h = max(32, int(w * scale)), max(32, int(h * scale))
        proc = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
        return proc, w / float(new_w), h / float(new_h)
    return frame, 1.0, 1.0

def ai_inference_worker():
    """
    Dedicated asynchronous AI worker running in an independent background thread.
    Implements Latest-Frame Processing:
    - Never builds an unbounded frame queue.
    - If busy, drops intermediate camera frames from the AI pipeline.
    - Grabs strictly the freshest frame from stream_manager.
    - Video display and camera ingestion run at full 30 FPS completely unaffected.
    """
    global ai_fps, ai_fps_counter, ai_fps_start_time, ai_latency_ms
    global latest_active_objects, latest_new_events, latest_timing_metrics, last_ai_processed_frame_time
    logger.info("[AI Worker] Dedicated asynchronous inference worker started")

    # Set optimal thread count for CPU inference
    if detector.device == "cpu":
        try:
            torch.set_num_threads(torch.get_num_threads())
        except Exception:
            pass

    last_profile_log_time = time.time()

    while not stop_ai_worker_event.is_set():
        try:
            if not monitoring_active:
                time.sleep(0.04)
                continue

            has_frame, frame, frame_time = stream_manager.get_latest_frame()
            if not has_frame or frame is None or frame_time == last_ai_processed_frame_time:
                time.sleep(0.008)
                continue

            # Latest-frame processing: grab newest frame, skipping intermediate frames
            last_ai_processed_frame_time = frame_time

            # 1. Preprocessing timing
            t_pre_start = time.perf_counter()
            proc_frame, scale_x, scale_y = apply_resolution_scale(frame, current_settings.processing_resolution)
            t_pre = (time.perf_counter() - t_pre_start) * 1000

            # 2. Model Inference & ByteTrack Tracking
            t_inf_start = time.perf_counter()
            with torch.inference_mode():
                detections = detector.track(
                    proc_frame,
                    conf_threshold=current_settings.confidence_threshold,
                    allowed_classes=current_settings.allowed_classes,
                    tracker_type="bytetrack.yaml"
                )
            t_inf = (time.perf_counter() - t_inf_start) * 1000

            # 3. Post-processing: coordinates rescaling & memory manager update
            t_post_start = time.perf_counter()
            if scale_x != 1.0 or scale_y != 1.0:
                for det in detections:
                    det.x1 = int(det.x1 * scale_x)
                    det.y1 = int(det.y1 * scale_y)
                    det.x2 = int(det.x2 * scale_x)
                    det.y2 = int(det.y2 * scale_y)

            active_objs, new_evts = memory_manager.update(
                detections,
                camera_id=stream_manager.active_stream_desc,
                session_id=current_session_id
            )
            t_post = (time.perf_counter() - t_post_start) * 1000

            total_ai_step = t_pre + t_inf + t_post
            ai_latency_ms = round(total_ai_step, 1)

            # Update shared state under lock
            with shared_state_lock:
                latest_active_objects = active_objs
                latest_new_events = new_evts
                latest_timing_metrics["pre_ms"] = round(t_pre, 1)
                latest_timing_metrics["inf_ms"] = round(t_inf, 1)
                latest_timing_metrics["post_ms"] = round(t_post, 1)
                latest_timing_metrics["total_ai_ms"] = ai_latency_ms

            # Compute AI FPS
            now = time.time()
            if ai_fps_start_time <= 0:
                ai_fps_start_time = now
                ai_fps_counter = 0
            ai_fps_counter += 1
            elapsed_ai = now - ai_fps_start_time
            if elapsed_ai >= 1.0:
                ai_fps = round(ai_fps_counter / elapsed_ai, 1)
                ai_fps_counter = 0
                ai_fps_start_time = now

            # Periodic profiling output (every 5 seconds)
            if now - last_profile_log_time >= 5.0:
                logger.info(
                    f"[Vision Profiler] Camera: {stream_manager.get_source_fps()} FPS | "
                    f"Display: {display_fps} FPS | AI: {ai_fps} FPS | "
                    f"Inference: {round(t_inf, 1)}ms | Preprocessing: {round(t_pre, 1)}ms | "
                    f"Postprocessing: {round(t_post, 1)}ms | Device: {detector.device.upper()}"
                )
                last_profile_log_time = now

            # Yield briefly to CPU
            time.sleep(0.005)

        except Exception as e:
            logger.error(f"[AI Worker] Unexpected error: {e}", exc_info=True)
            time.sleep(0.05)

async def vision_display_loop():
    """
    Continuous real-time loop for camera video display, overlay rendering,
    and live WebSocket telemetry broadcasting.
    Runs at steady 25-30 FPS independently of AI inference latency.
    """
    global display_fps, display_fps_counter, display_fps_start_time, latest_jpeg_frame
    logger.info("[Vision Display] Continuous 30 FPS display loop started")

    while True:
        try:
            loop_start = time.perf_counter()
            has_frame, frame, _ = stream_manager.get_latest_frame()

            if not has_frame or frame is None:
                display_fps = 0.0
                display_fps_start_time = 0.0
                display_fps_counter = 0
                await asyncio.sleep(0.035)
                continue

            # Read latest tracked objects from AI worker under lock (instantaneous copy)
            with shared_state_lock:
                active_objects = list(latest_active_objects)
                new_events = list(latest_new_events)
                metrics_copy = dict(latest_timing_metrics)

            # Draw Overlays on Fresh Display Frame
            t_draw_start = time.perf_counter()
            if monitoring_active:
                annotated_frame = draw_visual_overlays(
                    frame,
                    active_objects,
                    enable_boxes=current_settings.enable_boxes,
                    enable_trails=current_settings.enable_trails,
                    enable_confidence=current_settings.enable_confidence,
                    enable_track_ids=current_settings.enable_track_ids
                )
            else:
                annotated_frame = frame
            t_draw = (time.perf_counter() - t_draw_start) * 1000

            # Compress to JPEG for live dashboard feed
            t_jpg_start = time.perf_counter()
            ret, buf = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            if ret:
                latest_jpeg_frame = buf.tobytes()
            t_jpg = (time.perf_counter() - t_jpg_start) * 1000

            # Record display timing metrics
            with shared_state_lock:
                latest_timing_metrics["render_ms"] = round(t_draw, 1)
                latest_timing_metrics["encode_ms"] = round(t_jpg, 1)

            # Compute Display FPS
            now = time.time()
            if display_fps_start_time <= 0:
                display_fps_start_time = now
                display_fps_counter = 0
            display_fps_counter += 1
            elapsed_fps = now - display_fps_start_time
            if elapsed_fps >= 1.0:
                display_fps = round(display_fps_counter / elapsed_fps, 1)
                display_fps_counter = 0
                display_fps_start_time = now

            # Compile Live Stats & Broadcast Telemetry
            visible_objs = [o for o in active_objects if o.status == "VISIBLE"]
            people = [o for o in visible_objs if o.object_class.lower() == "person"]
            vehicles = [o for o in visible_objs if o.object_class.lower() in ("car", "motorcycle", "bicycle", "bus", "truck")]
            
            session_duration = 0.0
            if monitoring_active and session_start_time:
                session_duration = max(0.0, (datetime.now() - session_start_time).total_seconds())

            telemetry = {
                "type": "TELEMETRY",
                "stats": {
                    "objects_visible": len(visible_objs),
                    "people_count": len(people),
                    "vehicles_count": len(vehicles),
                    "unique_objects_session": len(memory_manager.tracked_objects),
                    "session_duration_seconds": round(session_duration, 1),
                    "fps": display_fps,  # Display / Render FPS (28-30 FPS)
                    "display_fps": display_fps,
                    "camera_fps": stream_manager.get_source_fps(),  # Camera source FPS
                    "ai_fps": ai_fps if monitoring_active else 0.0,  # AI Inference FPS
                    "inference_latency_ms": ai_latency_ms,
                    "pipeline_metrics": {
                        "preprocessing_ms": metrics_copy.get("pre_ms", 0.0),
                        "inference_ms": metrics_copy.get("inf_ms", 0.0),
                        "postprocessing_ms": metrics_copy.get("post_ms", 0.0),
                        "render_overlay_ms": round(t_draw, 1),
                        "jpeg_encode_ms": round(t_jpg, 1),
                        "device": metrics_copy.get("device", "CPU")
                    },
                    "camera_status": stream_manager.status,
                    "camera_description": stream_manager.active_stream_desc,
                    "ai_status": "RUNNING" if monitoring_active else "IDLE",
                    "session_id": current_session_id,
                    "monitoring_active": monitoring_active
                },
                "objects": [o.model_dump() for o in active_objects],
                "new_events": [e.model_dump() for e in new_events],
                "recent_events": [e.model_dump() for e in memory_manager.get_events()[-15:]],
                "cache_stats": memory_manager.cache.get_stats(),
                "memory_stats": memory_manager.persistent_memory.get_memory_stats()
            }

            await ws_manager.broadcast_json(telemetry)

            # Target ~28-30 FPS pacing for smooth video display
            elapsed = time.perf_counter() - loop_start
            sleep_time = max(0.005, 0.033 - elapsed)
            await asyncio.sleep(sleep_time)

        except Exception as e:
            logger.error(f"[Vision Display] Unexpected error: {e}", exc_info=True)
            await asyncio.sleep(0.05)

@app.on_event("startup")
async def startup_event():
    global ai_worker_thread
    init_db()
    # Execute routine retention cleanup on persistent memory
    try:
        memory_manager.persistent_memory.cleanup_old_memory()
    except Exception as e:
        logger.error(f"[Ceova Startup] Initial memory cleanup error: {e}")
    # Launch background vision display loop (30 FPS)
    asyncio.create_task(vision_display_loop())
    # Launch dedicated asynchronous AI inference worker thread
    stop_ai_worker_event.clear()
    ai_worker_thread = threading.Thread(target=ai_inference_worker, daemon=True)
    ai_worker_thread.start()
    logger.info("[Ceova Server] Initialized database, 30 FPS display loop, and decoupled AI worker.")

# -------------------------------------------------------------
# Live Video Stream (MJPEG)
# -------------------------------------------------------------
async def mjpeg_frame_generator():
    while True:
        if latest_jpeg_frame is not None:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + latest_jpeg_frame + b"\r\n"
            )
        else:
            # Yield empty dark standby placeholder
            placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(placeholder, "NO CAMERA STREAM CONNECTED", (100, 240),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (120, 140, 160), 2)
            _, buf = cv2.imencode(".jpg", placeholder)
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
            )
        await asyncio.sleep(0.035)

@app.get("/api/video-feed")
def get_video_feed():
    return StreamingResponse(
        mjpeg_frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

# -------------------------------------------------------------
# WebSocket: Live Dashboard Telemetry
# -------------------------------------------------------------
@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep-alive receive
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

# -------------------------------------------------------------
# Camera Connection Endpoints
# -------------------------------------------------------------
@app.get("/api/camera/qr-session", response_model=QRConnectSessionResponse)
def create_qr_session(use_localhost: bool = Query(False, description="Use localhost instead of LAN IP")):
    """Generates temporary token, dynamically binds LAN IP or localhost, and produces QR Code."""
    session_token = uuid.uuid4().hex[:12]
    lan_ip = get_lan_ip()
    target_host = "localhost" if use_localhost else lan_ip
    stream_manager.register_phone_session(session_token)

    # URL that the phone opens
    mobile_url = f"http://{target_host}:{PORT}/camera/{session_token}"
    localhost_url = f"http://localhost:{PORT}/camera/{session_token}"

    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=2)
    qr.add_data(mobile_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    return QRConnectSessionResponse(
        session_token=session_token,
        lan_ip=lan_ip,
        camera_url=mobile_url,
        qr_image_base64=qr_b64,
        localhost_url=localhost_url
    )


@app.post("/api/camera/discover-and-connect", response_model=IPWebcamAutoDiscoverResponse)
async def discover_and_connect_ip_webcam(req: IPWebcamAutoDiscoverRequest):
    """
    Automatically discovers compatible IP Webcam broadcast on the local Wi-Fi,
    authenticates with user credentials, tests stream readiness, and connects.
    """
    logger.info("[Camera API] Starting automatic IP Webcam discovery and connection...")
    result = await auto_discover_ip_webcam(
        username=req.username,
        password=req.password,
        preferred_port=req.preferred_port
    )

    if result.get("success") and result.get("ip"):
        success, msg = stream_manager.connect_ip_webcam(
            url_or_ip=result["ip"],
            port=result["port"],
            username=req.username,
            password=req.password
        )
        if success:
            memory_manager.add_system_event(
                "CAMERA_CONNECTED",
                f"Auto-discovered and connected to IP Webcam at {result['ip']}:{result['port']}"
            )
            return IPWebcamAutoDiscoverResponse(
                success=True,
                ip=result["ip"],
                port=result["port"],
                stream_url=sanitize_url_for_logging(result["stream_url"]),
                auth_required=result.get("auth_required", False),
                authenticated=result.get("authenticated", True),
                status_message=f"Connected to camera at {result['ip']}:{result['port']}",
                device_info=result.get("device_info"),
                network_info=result.get("network_info")
            )
        else:
            raise HTTPException(status_code=400, detail=msg)

    elif result.get("auth_required") and not result.get("authenticated"):
        raise HTTPException(
            status_code=401,
            detail=result.get("status_message") or "Camera discovered, but authentication failed."
        )
    else:
        raise HTTPException(
            status_code=404,
            detail=result.get("status_message") or "No IP Webcam discovered on local Wi-Fi."
        )

@app.post("/api/camera/discover", response_model=IPWebcamAutoDiscoverResponse)
async def discover_ip_webcam_only(req: IPWebcamAutoDiscoverRequest):
    """
    Probes the local Wi-Fi network for active IP Webcams without altering active camera stream.
    """
    result = await auto_discover_ip_webcam(
        username=req.username,
        password=req.password,
        preferred_port=req.preferred_port
    )
    return IPWebcamAutoDiscoverResponse(
        success=bool(result.get("success")),
        ip=result.get("ip"),
        port=result.get("port"),
        stream_url=sanitize_url_for_logging(result["stream_url"]) if result.get("stream_url") else None,
        auth_required=bool(result.get("auth_required")),
        authenticated=bool(result.get("authenticated")),
        status_message=result.get("status_message", "Discovery complete."),
        device_info=result.get("device_info"),
        network_info=result.get("network_info")
    )

@app.post("/api/camera/test-direct", response_model=IPWebcamDirectTestResponse)
async def test_direct_ip_webcam(req: IPWebcamDirectTestRequest):
    """
    Requirement 6 & 7: 6-stage reachability verification for a user-specified camera target.
    Stage 1: Host reachable?
    Stage 2: Port reachable? (Accepts any port 1-65535, does not force 8080)
    Stage 3: HTTP server responds?
    Stage 4: Authentication required?
    Stage 5: Authentication successful?
    Stage 6: Video endpoint available?
    """
    logger.info(f"[Camera API] Direct reachability probe requested for {req.url_or_ip}:{req.port}")
    res = await test_direct_reachability(
        url_or_ip=req.url_or_ip,
        port=req.port,
        username=req.username,
        password=req.password
    )
    return IPWebcamDirectTestResponse(**res)

@app.get("/api/camera/network-info")
def get_network_info():
    """
    Returns detected network interfaces, active gateway holder, and computed CIDR.
    Allows frontend to display actual network parameters without guessing 192.168.0.*.
    """
    interfaces = detect_active_network_interfaces()
    selected = interfaces[0] if interfaces else None
    return {
        "selected": selected,
        "interfaces": interfaces
    }

@app.post("/api/camera/connect-ip")
def connect_ip_webcam(req: IPWebcamConnectRequest):
    """Securely connects to user-authorized IP Webcam without exposing credentials."""
    success, msg = stream_manager.connect_ip_webcam(
        req.url_or_ip, req.port, req.username, req.password
    )
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    
    memory_manager.add_system_event("CAMERA_CONNECTED", f"Connected to IP Webcam ({req.url_or_ip.strip()}:{req.port})")
    return {"success": True, "message": msg}

@app.post("/api/camera/connect-local")
def connect_local_webcam(device_id: int = 0):
    success, msg = stream_manager.connect_local_webcam(device_id)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    memory_manager.add_system_event("CAMERA_CONNECTED", f"Connected to local camera device #{device_id}")
    return {"success": True, "message": msg}

@app.post("/api/camera/connect-test")
def connect_test_feed():
    success, msg = stream_manager.connect_test_stream()
    memory_manager.add_system_event("CAMERA_CONNECTED", "Connected to Ceova synthetic security test feed")
    return {"success": True, "message": msg}

@app.post("/api/camera/disconnect")
def disconnect_camera():
    stream_manager.disconnect()
    memory_manager.add_system_event("CAMERA_DISCONNECTED", "Camera stream disconnected")
    return {"success": True, "message": "Camera disconnected"}

@app.get("/api/camera/status")
def get_camera_status():
    return stream_manager.get_status()

# -------------------------------------------------------------
# WebSocket: Phone Camera Video Stream Ingestion
# -------------------------------------------------------------
@app.websocket("/ws/phone-stream/{token}")
async def phone_stream_endpoint(websocket: WebSocket, token: str):
    await websocket.accept()
    logger.info(f"[Phone Stream] Connected session token: {token}")
    memory_manager.add_system_event("CAMERA_CONNECTED", "Smartphone camera stream established via QR connection")
    
    try:
        while True:
            # Binary frame bytes from mobile canvas
            data = await websocket.receive_bytes()
            if data:
                stream_manager.receive_phone_frame(token, data)
                # Send frame acknowledgement
                await websocket.send_text("ACK")
    except WebSocketDisconnect:
        logger.info(f"[Phone Stream] Phone disconnected token: {token}")
        stream_manager.disconnect()
        memory_manager.add_system_event("CAMERA_DISCONNECTED", "Smartphone stream ended")
    except Exception as e:
        logger.error(f"[Phone Stream] Stream error: {e}")
        stream_manager.disconnect()

# -------------------------------------------------------------
# Monitoring & Session Management
# -------------------------------------------------------------
@app.post("/api/monitoring/start")
def start_monitoring():
    global monitoring_active, current_session_id, session_start_time, ai_fps, ai_fps_counter, ai_fps_start_time
    if monitoring_active:
        return {"status": "already_running", "session_id": current_session_id}

    current_session_id = generate_session_id()
    session_start_time = datetime.now()
    monitoring_active = True
    ai_fps = 0.0
    ai_fps_counter = 0
    ai_fps_start_time = 0.0
    
    memory_manager.reset()
    with shared_state_lock:
        latest_active_objects.clear()
        latest_new_events.clear()

    memory_manager.add_system_event(
        "SESSION_STARTED",
        f"Monitoring session {current_session_id} started on {stream_manager.active_stream_desc}"
    )

    logger.info(f"[Ceova Session] Started session {current_session_id}")
    return {
        "status": "started",
        "session_id": current_session_id,
        "started_at": session_start_time.strftime("%H:%M:%S")
    }

@app.post("/api/monitoring/stop")
def stop_monitoring():
    global monitoring_active, current_session_id, session_start_time, ai_fps, ai_fps_counter, ai_fps_start_time
    if not monitoring_active or not current_session_id:
        raise HTTPException(status_code=400, detail="No active monitoring session to stop")

    ended_at = datetime.now()
    duration = (ended_at - session_start_time).total_seconds() if session_start_time else 0.0

    # Mark remaining objects and flush short-term cache
    for obj in memory_manager.tracked_objects.values():
        if obj.status == "VISIBLE":
            obj.mark_left()
    memory_manager.cache.flush()

    memory_manager.add_system_event(
        "SESSION_STOPPED",
        f"Monitoring session {current_session_id} concluded. Total duration: {int(duration)}s"
    )

    # Build and finalize session report
    report = ReportGenerator.build_session_report(
        session_id=current_session_id,
        camera_source=stream_manager.active_stream_desc,
        started_at=session_start_time.strftime("%H:%M:%S") if session_start_time else "00:00:00",
        ended_at=ended_at.strftime("%H:%M:%S"),
        duration_seconds=duration,
        objects=memory_manager.get_all_objects(),
        events=memory_manager.get_events()
    )

    save_session(report)

    with shared_state_lock:
        latest_active_objects.clear()
        latest_new_events.clear()

    monitoring_active = False
    ai_fps = 0.0
    ai_fps_counter = 0
    ai_fps_start_time = 0.0
    finished_id = current_session_id
    current_session_id = None
    session_start_time = None

    logger.info(f"[Ceova Session] Finalized and saved session {finished_id}")
    return report

# -------------------------------------------------------------
# Reporting Endpoints
# -------------------------------------------------------------
@app.get("/api/reports")
def get_reports_list():
    return list_sessions()

@app.get("/api/reports/{session_id}")
def get_single_report(session_id: str):
    rep = get_session(session_id)
    if not rep:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return rep

@app.get("/api/reports/{session_id}/export/{export_format}")
def export_report_file(session_id: str, export_format: str):
    rep = get_session(session_id)
    if not rep:
        raise HTTPException(status_code=404, detail="Session not found")

    fmt = export_format.lower()
    if fmt == "json":
        return Response(
            content=rep.model_dump_json(indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={session_id.replace('#', '')}.json"}
        )
    elif fmt == "csv":
        csv_text = ReportGenerator.export_csv(rep)
        return Response(
            content=csv_text,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={session_id.replace('#', '')}.csv"}
        )
    elif fmt in ("txt", "text"):
        txt_content = ReportGenerator.export_text(rep)
        return PlainTextResponse(
            content=txt_content,
            headers={"Content-Disposition": f"attachment; filename={session_id.replace('#', '')}.txt"}
        )
    else:
        raise HTTPException(status_code=400, detail="Supported export formats: json, csv, text")

@app.delete("/api/reports/{session_id}")
def delete_single_report(session_id: str):
    success = delete_session(session_id)
    return {"success": success}

# -------------------------------------------------------------
# Settings Endpoints
# -------------------------------------------------------------
@app.get("/api/settings", response_model=SettingsSchema)
def get_settings():
    return current_settings

@app.post("/api/settings", response_model=SettingsSchema)
def update_settings(new_settings: SettingsSchema):
    global current_settings
    current_settings = new_settings
    
    # Update memory manager window and cache configuration
    memory_manager.set_memory_window(new_settings.memory_seconds)
    memory_manager.cache.set_config(
        ttl_seconds=getattr(new_settings, "cache_ttl_seconds", new_settings.memory_seconds),
        debounce_hits=getattr(new_settings, "debounce_hits", 3),
        debounce_seconds=getattr(new_settings, "debounce_seconds", 0.3),
        max_cache_size=200
    )
    memory_manager.persistent_memory.set_retention_policy(
        retention_days=getattr(new_settings, "retention_days", 30),
        max_event_count=getattr(new_settings, "max_memory_events", 10000),
        preserve_high_importance=True
    )
    
    # Reload model if changed
    if new_settings.model_name != detector.model_identifier:
        detector.load_model(new_settings.model_name)

    return current_settings

@app.get("/api/model-status")
def get_model_status():
    return detector.get_model_status()

# -------------------------------------------------------------
# Memory + Cache System Endpoints
# -------------------------------------------------------------
@app.get("/api/memory/events")
def get_memory_events(
    class_name: Optional[str] = Query(None, description="Filter by object class (e.g. person, car)"),
    importance: Optional[str] = Query(None, description="Filter by importance (low, medium, high)"),
    start_time: Optional[str] = Query(None, description="ISO format start datetime"),
    end_time: Optional[str] = Query(None, description="ISO format end datetime"),
    session_id: Optional[str] = Query(None, description="Filter by session ID"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """Queries persistent memory events with customizable filtering."""
    return memory_manager.persistent_memory.query_events(
        class_name=class_name,
        importance=importance,
        start_time=start_time,
        end_time=end_time,
        session_id=session_id,
        event_type=event_type,
        limit=limit,
        offset=offset
    )

@app.get("/api/memory/events/{event_id}")
def get_single_memory_event(event_id: str):
    """Retrieves a single persistent memory event."""
    ev = memory_manager.persistent_memory.get_event(event_id)
    if not ev:
        raise HTTPException(status_code=404, detail=f"Memory event {event_id} not found")
    return ev

@app.delete("/api/memory/events/{event_id}")
def delete_single_memory_event(event_id: str):
    """Deletes an event from persistent memory."""
    success = memory_manager.persistent_memory.delete_event(event_id)
    if not success:
        raise HTTPException(status_code=404, detail="Event not found or could not be deleted")
    return {"success": True, "message": f"Deleted memory event {event_id}"}

@app.get("/api/memory/stats")
def get_memory_statistics():
    """Provides analytics and metrics on persistent event storage."""
    return memory_manager.persistent_memory.get_memory_stats()

@app.post("/api/memory/cleanup")
def trigger_memory_cleanup(
    retention_days: Optional[int] = Query(None, ge=1, le=365),
    max_event_count: Optional[int] = Query(None, ge=100, le=100000)
):
    """Prunes expired or excessive memory events while preserving high-importance records."""
    res = memory_manager.persistent_memory.cleanup_old_memory(
        retention_days=retention_days,
        max_event_count=max_event_count
    )
    return {"success": True, "result": res}

@app.delete("/api/memory/clear")
def clear_all_memory(session_id: Optional[str] = Query(None)):
    """Clears persistent memory, optionally scoped to a single session."""
    deleted = memory_manager.persistent_memory.clear_memory(session_id=session_id)
    return {"success": True, "deleted_count": deleted}

@app.get("/api/cache/active")
def get_active_cache_entries():
    """Returns real-time short-term cached entities (recent tracking and candidates)."""
    return memory_manager.cache.get_active_entities()

@app.get("/api/cache/stats")
def get_cache_statistics():
    """Returns diagnostic health and performance statistics for the short-term cache."""
    return memory_manager.cache.get_stats()

# -------------------------------------------------------------
# Standalone Mobile Camera Page (Direct Phone Streaming)
# -------------------------------------------------------------
@app.get("/camera/{token}", response_class=HTMLResponse)
def serve_mobile_camera_page(token: str):
    lan_ip = get_lan_ip()
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Ceova Camera Streamer</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
    body {{ background: #0b0f17; color: #f3f4f6; min-height: 100vh; display: flex; flex-direction: column; }}
    header {{ padding: 18px 20px; background: #111827; border-bottom: 1px solid #1f2937; display: flex; align-items: center; justify-content: space-between; }}
    .logo {{ display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 1.15rem; color: #38bdf8; letter-spacing: 0.5px; }}
    .badge {{ background: #1f2937; color: #9ca3af; padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; border: 1px solid #374151; }}
    .badge.connected {{ background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: #10b981; }}
    .badge.streaming {{ background: rgba(56, 189, 248, 0.2); color: #38bdf8; border-color: #0284c7; }}
    main {{ flex: 1; padding: 20px; display: flex; flex-direction: column; gap: 16px; max-width: 500px; margin: 0 auto; width: 100%; }}
    .video-card {{ position: relative; width: 100%; aspect-ratio: 4/3; background: #000; border-radius: 12px; overflow: hidden; border: 1px solid #1f2937; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }}
    video {{ width: 100%; height: 100%; object-fit: cover; }}
    .overlay {{ position: absolute; top: 12px; left: 12px; display: flex; gap: 6px; z-index: 10; }}
    .indicator {{ background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; color: #e5e7eb; }}
    .controls {{ display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }}
    .btn {{ width: 100%; padding: 14px; border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }}
    .btn-primary {{ background: #0284c7; color: #fff; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4); }}
    .btn-primary:active {{ transform: scale(0.98); background: #0369a1; }}
    .btn-danger {{ background: #dc2626; color: #fff; }}
    .btn-secondary {{ background: #1f2937; color: #d1d5db; border: 1px solid #374151; }}
    .select-wrap {{ display: flex; flex-direction: column; gap: 6px; }}
    label {{ font-size: 0.85rem; color: #9ca3af; }}
    select {{ width: 100%; padding: 12px; background: #111827; border: 1px solid #374151; border-radius: 8px; color: #fff; font-size: 0.95rem; }}
    .info-card {{ background: #111827; border: 1px solid #1f2937; border-radius: 10px; padding: 14px; font-size: 0.85rem; color: #9ca3af; line-height: 1.4; }}
    .info-card strong {{ color: #e5e7eb; }}
    canvas {{ display: none; }}
  </style>
</head>
<body>
  <header>
    <div class="logo">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
      CEOVA CAMERA
    </div>
    <div id="statusBadge" class="badge">Standby</div>
  </header>

  <main>
    <div class="video-card">
      <video id="phoneVideo" autoplay playsinline muted></video>
      <div class="overlay">
        <div id="fpsBadge" class="indicator">0 FPS</div>
        <div id="camModeBadge" class="indicator">Back Camera</div>
      </div>
    </div>

    <div class="controls">
      <div class="select-wrap">
        <label>Camera Direction</label>
        <select id="cameraSelect">
          <option value="environment" selected>Back Camera (Recommended)</option>
          <option value="user">Front Camera</option>
        </select>
      </div>

      <button id="toggleStreamBtn" class="btn btn-primary" onclick="toggleStream()">Start Camera</button>
      <button id="switchBtn" class="btn btn-secondary" onclick="switchCamera()">Switch Camera</button>
    </div>

    <div class="info-card">
      <strong>Connected to Laptop:</strong> Stream transmits live video over local WiFi directly into the Ceova AI pipeline.
      <br><br>
      <em>Note: If prompted for permission, tap <strong>Allow</strong>. Keep this browser tab open while monitoring.</em>
    </div>
  </main>

  <canvas id="captureCanvas"></canvas>

  <script>
    const token = "{token}";
    const wsProto = window.location.protocol === "https:" ? "wss://" : "ws://";
    const wsUrl = wsProto + window.location.host + "/ws/phone-stream/" + token;
    
    let isStreaming = false;
    let ws = null;
    let stream = null;
    let currentFacingMode = "environment";
    let frameInterval = null;
    let frameCount = 0;
    let lastFpsUpdate = Date.now();

    const videoEl = document.getElementById("phoneVideo");
    const canvasEl = document.getElementById("captureCanvas");
    const ctx = canvasEl.getContext("2d");
    const toggleBtn = document.getElementById("toggleStreamBtn");
    const statusBadge = document.getElementById("statusBadge");
    const fpsBadge = document.getElementById("fpsBadge");
    const camModeBadge = document.getElementById("camModeBadge");
    const cameraSelect = document.getElementById("cameraSelect");

    cameraSelect.addEventListener("change", (e) => {{
      currentFacingMode = e.target.value;
      camModeBadge.textContent = currentFacingMode === "environment" ? "Back Camera" : "Front Camera";
      if (isStreaming) {{
        startCameraStream();
      }}
    }});

    function switchCamera() {{
      currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
      cameraSelect.value = currentFacingMode;
      camModeBadge.textContent = currentFacingMode === "environment" ? "Back Camera" : "Front Camera";
      if (isStreaming) {{
        startCameraStream();
      }}
    }}

    function connectWebSocket() {{
      return new Promise((resolve, reject) => {{
        ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        
        ws.onopen = () => {{
          statusBadge.textContent = "Connected";
          statusBadge.className = "badge connected";
          resolve();
        }};
        ws.onclose = () => {{
          statusBadge.textContent = "Disconnected";
          statusBadge.className = "badge";
          stopStreaming();
        }};
        ws.onerror = (err) => {{
          console.error("WS error", err);
          statusBadge.textContent = "WS Error";
          reject(err);
        }};
      }});
    }}

    async function startCameraStream() {{
      if (stream) {{
        stream.getTracks().forEach(track => track.stop());
      }}

      try {{
        const constraints = {{
          video: {{
            facingMode: {{ ideal: currentFacingMode }},
            width: {{ ideal: 1280 }},
            height: {{ ideal: 720 }}
          }},
          audio: false
        }};

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoEl.srcObject = stream;
        await videoEl.play();

        canvasEl.width = videoEl.videoWidth || 640;
        canvasEl.height = videoEl.videoHeight || 480;

        // Start frame capture loop
        if (frameInterval) clearInterval(frameInterval);
        
        frameInterval = setInterval(() => {{
          if (!isStreaming || ws.readyState !== WebSocket.OPEN) return;
          
          ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
          canvasEl.toBlob((blob) => {{
            if (blob && ws.readyState === WebSocket.OPEN) {{
              blob.arrayBuffer().then(buf => {{
                ws.send(buf);
                frameCount++;
                const now = Date.now();
                if (now - lastFpsUpdate >= 1000) {{
                  fpsBadge.textContent = Math.round(frameCount * 1000 / (now - lastFpsUpdate)) + " FPS";
                  frameCount = 0;
                  lastFpsUpdate = now;
                }}
              }});
            }}
          }}, "image/jpeg", 0.65);
        }}, 65); // ~15 FPS transmission

        statusBadge.textContent = "Streaming Live";
        statusBadge.className = "badge streaming";
      }} catch (err) {{
        alert("Camera permission denied or camera unavailable: " + err.message);
        stopStreaming();
      }}
    }}

    async function toggleStream() {{
      if (!isStreaming) {{
        toggleBtn.textContent = "Connecting...";
        try {{
          await connectWebSocket();
          isStreaming = true;
          await startCameraStream();
          toggleBtn.textContent = "Stop Streaming";
          toggleBtn.className = "btn btn-danger";
        }} catch (err) {{
          alert("Could not connect to laptop server. Ensure phone is on the same WiFi network.");
          toggleBtn.textContent = "Start Camera";
          toggleBtn.className = "btn btn-primary";
        }}
      }} else {{
        stopStreaming();
      }}
    }}

    function stopStreaming() {{
      isStreaming = false;
      if (frameInterval) clearInterval(frameInterval);
      if (stream) {{
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }}
      if (ws && ws.readyState === WebSocket.OPEN) {{
        ws.close();
      }}
      videoEl.srcObject = null;
      toggleBtn.textContent = "Start Camera";
      toggleBtn.className = "btn btn-primary";
      statusBadge.textContent = "Standby";
      statusBadge.className = "badge";
      fpsBadge.textContent = "0 FPS";
    }}
  </script>
</body>
</html>
"""
    return HTMLResponse(content=html_content)

# Serve static files if frontend is built
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
