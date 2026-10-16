import cv2
import time
import math
import threading
import logging
import httpx
import numpy as np
from typing import Optional, Tuple, Dict, Any
from app.camera.ip_webcam import test_ip_webcam_connection, sanitize_url_for_logging, parse_camera_host_port_path

logger = logging.getLogger("ceova.camera.stream_manager")

class CameraStreamManager:
    """
    Unified Stream Manager handling IP Webcam, QR Phone Streams,
    Local Webcams, and Synthetic Test Simulation Feeds.
    Features multi-tier resilient stream acquisition for IP cameras.
    """

    def __init__(self):
        self.source_type: str = "NONE"  # "IP_WEBCAM", "PHONE_STREAM", "LOCAL_WEBCAM", "TEST_FEED", "NONE"
        self.status: str = "DISCONNECTED"  # "DISCONNECTED", "CONNECTING", "STREAMING", "LOST"
        self.active_stream_desc: str = "No camera connected"
        
        self.latest_frame: Optional[np.ndarray] = None
        self.latest_frame_time: float = 0.0
        self.lock = threading.Lock()
        
        # Source Frame Rate Tracking
        self.source_fps: float = 0.0
        self._source_frame_count: int = 0
        self._source_fps_start_time: float = 0.0
        
        # IP / Local Capture Threading
        self.cap: Optional[cv2.VideoCapture] = None
        self.stop_capture_event = threading.Event()
        self.capture_thread: Optional[threading.Thread] = None

        # IP Webcam Target Details
        self.ip_host: Optional[str] = None
        self.ip_port: int = 8080
        self.ip_path: str = "/video"
        self.ip_username: Optional[str] = None
        self.ip_password: Optional[str] = None
        self.ip_stream_url: Optional[str] = None

        # Phone Stream Token
        self.active_phone_token: Optional[str] = None
        
        # Synthetic Test Pattern State
        self.synthetic_tick: int = 0

    def _record_source_frame(self, frame: np.ndarray):
        """Records a freshly captured frame and computes real camera source FPS."""
        now = time.time()
        with self.lock:
            last_t = self.latest_frame_time
            self.latest_frame = frame
            self.latest_frame_time = now
            if self._source_fps_start_time <= 0 or (now - last_t > 1.0):
                self._source_fps_start_time = now
                self._source_frame_count = 0
            self._source_frame_count += 1
            elapsed = now - self._source_fps_start_time
            if elapsed >= 1.0:
                self.source_fps = round(self._source_frame_count / elapsed, 1)
                self._source_frame_count = 0
                self._source_fps_start_time = now

    def get_source_fps(self) -> float:
        with self.lock:
            if time.time() - self.latest_frame_time > 2.0:
                return 0.0
            return self.source_fps

    def connect_ip_webcam(self, url_or_ip: str, port: int = 8080, username: Optional[str] = None, password: Optional[str] = None) -> Tuple[bool, str]:
        self.disconnect()
        self.status = "CONNECTING"
        
        success, stream_url, msg = test_ip_webcam_connection(url_or_ip, port, username, password)
        if not success or not stream_url:
            self.status = "DISCONNECTED"
            return False, msg

        host, target_port, path = parse_camera_host_port_path(url_or_ip, port)
        self.ip_host = host
        self.ip_port = target_port
        self.ip_path = path
        self.ip_username = username
        self.ip_password = password
        self.ip_stream_url = stream_url

        self.source_type = "IP_WEBCAM"
        self.active_stream_desc = f"IP Webcam ({sanitize_url_for_logging(url_or_ip)})"
        
        # Start capture thread
        self.stop_capture_event.clear()
        self.cap = None

        self.capture_thread = threading.Thread(target=self._ip_capture_loop, daemon=True)
        self.capture_thread.start()
        
        self.status = "STREAMING"
        return True, "IP Webcam connected successfully"

    def connect_local_webcam(self, device_id: int = 0) -> Tuple[bool, str]:
        self.disconnect()
        self.status = "CONNECTING"
        try:
            cap = cv2.VideoCapture(device_id)
            if not cap.isOpened():
                self.status = "DISCONNECTED"
                return False, f"Could not open local camera device #{device_id}"
            
            self.cap = cap
            self.source_type = "LOCAL_WEBCAM"
            self.active_stream_desc = f"Local Camera (#{device_id})"
            self.stop_capture_event.clear()
            self.capture_thread = threading.Thread(target=self._local_capture_loop, daemon=True)
            self.capture_thread.start()
            self.status = "STREAMING"
            return True, "Local camera connected"
        except Exception as e:
            self.status = "DISCONNECTED"
            return False, f"Failed to open webcam: {e}"

    def connect_test_stream(self) -> Tuple[bool, str]:
        """Provides a synthetic simulation feed for testing without physical cameras."""
        self.disconnect()
        self.source_type = "TEST_FEED"
        self.active_stream_desc = "Ceova Synthetic Security Feed"
        self.status = "STREAMING"
        self.stop_capture_event.clear()
        self.capture_thread = threading.Thread(target=self._synthetic_loop, daemon=True)
        self.capture_thread.start()
        return True, "Synthetic test feed active"

    def register_phone_session(self, token: str):
        self.disconnect()
        self.source_type = "PHONE_STREAM"
        self.active_phone_token = token
        self.active_stream_desc = "Smartphone Stream (QR Session)"
        self.status = "CONNECTING"

    def receive_phone_frame(self, token: str, jpeg_bytes: bytes) -> bool:
        if self.source_type != "PHONE_STREAM" or self.active_phone_token != token:
            return False

        try:
            nparr = np.frombuffer(jpeg_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is not None and frame.size > 0:
                self._record_source_frame(frame)
                self.status = "STREAMING"
                return True
        except Exception as e:
            logger.error(f"[Phone Stream] Error decoding frame: {e}")
        return False

    def _local_capture_loop(self):
        while not self.stop_capture_event.is_set():
            if self.cap is None or not self.cap.isOpened():
                self.status = "LOST"
                time.sleep(0.5)
                continue

            ret, frame = self.cap.read()
            if ret and frame is not None:
                self._record_source_frame(frame)
                self.status = "STREAMING"
            else:
                self.status = "LOST"
                time.sleep(0.05)

        if self.cap:
            self.cap.release()
            self.cap = None

    def _ip_capture_loop(self):
        """
        Multi-tier resilient stream capture loop:
        1. Checks OpenCV VideoCapture.
        2. If OpenCV VideoCapture fails or hangs, automatically uses direct HTTP MJPEG stream.
        3. Falls back seamlessly to fast HTTP snapshot polling (/shot.jpg).
        """
        logger.info("[Stream Manager] Background capture loop started")

        # Tier 1: Check if OpenCV VideoCapture can read frames
        opencv_working = False
        if self.ip_stream_url:
            try:
                cap = cv2.VideoCapture(self.ip_stream_url)
                if cap.isOpened():
                    ret, frame = cap.read()
                    if ret and frame is not None and frame.size > 0:
                        opencv_working = True
                        self.cap = cap
                        self._record_source_frame(frame)
                        self.status = "STREAMING"
                    else:
                        cap.release()
                else:
                    cap.release()
            except Exception as cv_init_err:
                logger.debug(f"[Stream Manager] Initial OpenCV open note: {cv_init_err}")

        if opencv_working:
            logger.info("[Stream Manager] OpenCV VideoCapture active for stream")
            while not self.stop_capture_event.is_set():
                if self.cap is None or not self.cap.isOpened():
                    break
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    self._record_source_frame(frame)
                    self.status = "STREAMING"
                else:
                    self.status = "LOST"
                    time.sleep(0.05)
            if self.cap:
                self.cap.release()
                self.cap = None

        # Tier 2 & 3: Direct HTTP MJPEG stream and Snapshot fallback
        if not self.stop_capture_event.is_set():
            safe_host = f"{self.ip_host}:{self.ip_port}"
            logger.info(f"[Stream Manager] Activating direct HTTP stream/snapshot capture for {safe_host}")
            auth = (self.ip_username, self.ip_password) if (self.ip_username and self.ip_password) else None
            headers = {"User-Agent": "Ceova-Vision/1.0"}

            while not self.stop_capture_event.is_set():
                try:
                    with httpx.Client(headers=headers, timeout=4.0) as client:
                        # Attempt continuous MJPEG streaming
                        stream_path = self.ip_path if self.ip_path and self.ip_path != "/" else "/video"
                        mjpeg_url = f"http://{self.ip_host}:{self.ip_port}{stream_path}"
                        mjpeg_stream_active = False

                        try:
                            with client.stream("GET", mjpeg_url, auth=auth) as resp:
                                if resp.status_code == 200:
                                    mjpeg_stream_active = True
                                    buffer = b""
                                    for chunk in resp.iter_bytes():
                                        if self.stop_capture_event.is_set():
                                            break
                                        buffer += chunk
                                        a = buffer.find(b"\xff\xd8")
                                        b = buffer.find(b"\xff\xd9")
                                        if a != -1 and b != -1:
                                            jpg = buffer[a:b+2]
                                            buffer = buffer[b+2:]
                                            f = cv2.imdecode(np.frombuffer(jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                                            if f is not None and f.size > 0:
                                                self._record_source_frame(f)
                                                self.status = "STREAMING"
                        except Exception as mjpeg_err:
                            logger.debug(f"[Stream Manager] MJPEG stream ended ({mjpeg_err}), switching to snapshot polling")

                        # If MJPEG stream completed or failed, poll /shot.jpg at ~25-30 FPS
                        shot_url = f"http://{self.ip_host}:{self.ip_port}/shot.jpg"
                        while not self.stop_capture_event.is_set():
                            start_t = time.perf_counter()
                            try:
                                shot_resp = client.get(shot_url, auth=auth)
                                if shot_resp.status_code == 200 and len(shot_resp.content) > 1000:
                                    f = cv2.imdecode(np.frombuffer(shot_resp.content, dtype=np.uint8), cv2.IMREAD_COLOR)
                                    if f is not None and f.size > 0:
                                        self._record_source_frame(f)
                                        self.status = "STREAMING"
                            except Exception as shot_err:
                                self.status = "LOST"
                                logger.debug(f"[Stream Manager] Snapshot poll note: {shot_err}")
                                time.sleep(0.2)
                                break  # Reconnect client

                            elapsed = time.perf_counter() - start_t
                            sleep_t = max(0.005, 0.033 - elapsed)
                            time.sleep(sleep_t)

                except Exception as loop_err:
                    self.status = "LOST"
                    logger.debug(f"[Stream Manager] HTTP loop reconnecting: {loop_err}")
                    time.sleep(0.5)

        logger.info("[Stream Manager] Background capture loop ended")

    def _synthetic_loop(self):
        """Generates clean real-time animated frames for test simulation."""
        while not self.stop_capture_event.is_set():
            self.synthetic_tick += 1
            t = self.synthetic_tick * 0.05
            
            # Create a 720p dark canvas
            h, w = 720, 1280
            frame = np.zeros((h, w, 3), dtype=np.uint8)
            frame[:] = (20, 24, 30)

            # Draw grid lines for surveillance look
            for x in range(0, w, 80):
                cv2.line(frame, (x, 0), (x, h), (30, 36, 45), 1)
            for y in range(0, h, 80):
                cv2.line(frame, (0, y), (w, y), (30, 36, 45), 1)

            # Simulate Person walking back and forth
            p1_x = int(w * 0.5 + math.sin(t * 0.8) * 350)
            p1_y = int(h * 0.45 + math.cos(t * 0.4) * 50)
            cv2.rectangle(frame, (p1_x - 40, p1_y - 120), (p1_x + 40, p1_y + 120), (140, 150, 160), -1)
            cv2.circle(frame, (p1_x, p1_y - 150), 30, (140, 150, 160), -1)

            # Simulate Vehicle moving occasionally
            if int(t) % 30 < 22:
                v_x = int((self.synthetic_tick * 5) % (w + 400) - 200)
                v_y = int(h * 0.75)
                cv2.rectangle(frame, (v_x, v_y - 70), (v_x + 220, v_y + 40), (100, 120, 140), -1)
                cv2.circle(frame, (v_x + 50, v_y + 40), 25, (60, 60, 60), -1)
                cv2.circle(frame, (v_x + 170, v_y + 40), 25, (60, 60, 60), -1)

            ts_str = time.strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(frame, f"CEOVA SURVEILLANCE FEED [TEST SIM] - {ts_str}", (40, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 220, 180), 2)

            self._record_source_frame(frame)
            time.sleep(0.035)  # ~28 FPS

    def get_latest_frame(self) -> Tuple[bool, Optional[np.ndarray], float]:
        with self.lock:
            if self.latest_frame is None:
                return False, None, 0.0
            
            # Check for stream timeout if not updated for > 4 seconds
            if self.source_type == "PHONE_STREAM" and (time.time() - self.latest_frame_time > 4.0):
                self.status = "LOST"
                return False, None, self.latest_frame_time

            return True, self.latest_frame.copy(), self.latest_frame_time

    def disconnect(self) -> bool:
        self.stop_capture_event.set()
        if self.capture_thread and self.capture_thread.is_alive():
            self.capture_thread.join(timeout=1.0)
        if self.cap:
            self.cap.release()
            self.cap = None

        with self.lock:
            self.latest_frame = None
            self.latest_frame_time = 0.0
            self.source_fps = 0.0
            self._source_frame_count = 0
            self._source_fps_start_time = 0.0

        self.source_type = "NONE"
        self.status = "DISCONNECTED"
        self.active_phone_token = None
        self.active_stream_desc = "No camera connected"
        return True

    def get_status(self) -> Dict[str, Any]:
        return {
            "source_type": self.source_type,
            "status": self.status,
            "description": self.active_stream_desc,
            "has_frame": self.latest_frame is not None,
            "last_frame_age_sec": round(time.time() - self.latest_frame_time, 2) if self.latest_frame_time > 0 else None
        }
