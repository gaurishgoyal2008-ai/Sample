from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime

class TrackedObjectSchema(BaseModel):
    tracking_id: str
    object_class: str
    confidence: float
    first_seen: str
    last_seen: str
    visible_duration_seconds: float
    status: str  # "VISIBLE", "TEMPORARILY_LOST", "LEFT"
    bbox: Optional[List[int]] = None  # [x1, y1, x2, y2]
    recent_positions: List[List[int]] = []  # [[x, y], ...]
    disappearance_time: Optional[str] = None
    reappearance_count: int = 0
    movement_state: str = "STATIONARY"  # "STATIONARY", "MOVING", "ENTERED", "LEFT", "REAPPEARED"
    seconds_lost: float = 0.0

class EventSchema(BaseModel):
    event_id: str
    timestamp: str
    event_type: str  # "OBJECT_ENTERED", "OBJECT_LOST", "OBJECT_REAPPEARED", "OBJECT_LEFT", etc.
    tracking_id: Optional[str] = None
    object_class: Optional[str] = None
    description: str

class LiveStatsSchema(BaseModel):
    objects_visible: int = 0
    people_count: int = 0
    vehicles_count: int = 0
    unique_objects_session: int = 0
    session_duration_seconds: float = 0.0
    fps: float = 0.0  # Display FPS
    display_fps: float = 0.0
    camera_fps: float = 0.0
    ai_fps: float = 0.0
    inference_latency_ms: float = 0.0
    pipeline_metrics: Dict[str, Any] = {}
    camera_status: str = "DISCONNECTED"  # "CONNECTED", "DISCONNECTED", "WAITING", "RECONNECTING"
    ai_status: str = "IDLE"  # "RUNNING", "IDLE", "ERROR"
    session_id: Optional[str] = None
    monitoring_active: bool = False

class MonitoringSessionSchema(BaseModel):
    session_id: str
    camera_source: str
    started_at: str
    ended_at: Optional[str] = None
    duration_seconds: float = 0.0
    total_unique_objects: int = 0
    category_counts: Dict[str, int] = {}
    objects: List[TrackedObjectSchema] = []
    events: List[EventSchema] = []
    summary: str = ""

class SettingsSchema(BaseModel):
    model_name: str = "YOLO26"
    confidence_threshold: float = Field(0.28, ge=0.05, le=0.95)
    memory_seconds: float = Field(20.0, ge=1.0, le=120.0)
    enable_trails: bool = True
    enable_boxes: bool = True
    enable_confidence: bool = True
    enable_track_ids: bool = True
    allowed_classes: List[str] = []
    processing_resolution: str = "720p"  # "Auto", "480p", "720p", "1080p"
    # Memory & Cache Settings
    cache_ttl_seconds: float = Field(20.0, ge=1.0, le=300.0)
    debounce_hits: int = Field(3, ge=1, le=20)
    debounce_seconds: float = Field(0.3, ge=0.0, le=10.0)
    retention_days: int = Field(30, ge=1, le=365)
    max_memory_events: int = Field(10000, ge=100, le=100000)

class IPWebcamConnectRequest(BaseModel):
    url_or_ip: str
    port: int = Field(8080, ge=1, le=65535)
    username: Optional[str] = None
    password: Optional[str] = None

class IPWebcamAutoDiscoverRequest(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    preferred_port: Optional[int] = Field(None, ge=1, le=65535)

class IPWebcamAutoDiscoverResponse(BaseModel):
    success: bool
    ip: Optional[str] = None
    port: Optional[int] = None
    stream_url: Optional[str] = None
    auth_required: bool = False
    authenticated: bool = False
    status_message: str
    device_info: Optional[str] = None
    network_info: Optional[Dict[str, Any]] = None
    diagnostics: Optional[Dict[str, Any]] = None

class IPWebcamDirectTestRequest(BaseModel):
    url_or_ip: str
    port: int = Field(8080, ge=1, le=65535)
    username: Optional[str] = None
    password: Optional[str] = None

class IPWebcamDirectTestResponse(BaseModel):
    host: str
    port: int
    host_reachable: bool
    port_reachable: bool
    http_server_responds: bool
    auth_required: bool
    auth_successful: bool
    video_endpoint_available: bool
    stream_url: Optional[str] = None
    device_info: Optional[str] = None
    diagnostics_summary: str
    stage_details: List[str]

class QRConnectSessionResponse(BaseModel):
    session_token: str
    lan_ip: str
    camera_url: str
    qr_image_base64: str
    localhost_url: Optional[str] = None

# -------------------------------------------------------------
# Memory + Cache System Schemas
# -------------------------------------------------------------

class MemoryEventSchema(BaseModel):
    event_id: str
    session_id: Optional[str] = None
    camera_id: str = "default"
    object_class: str
    tracking_id: Optional[str] = None
    first_detected: str
    last_detected: str
    duration_seconds: float = 0.0
    max_confidence: float = 0.0
    avg_confidence: float = 0.0
    detection_count: int = 1
    event_type: str = "OBJECT_PRESENCE"
    importance: str = "low"  # "low", "medium", "high"
    confirmed: bool = True
    metadata: Dict[str, Any] = {}
    created_at: Optional[str] = None

class CacheStatsSchema(BaseModel):
    total_cached: int = 0
    active_objects: int = 0
    candidate_objects: int = 0
    lost_objects: int = 0
    ttl_seconds: float = 20.0
    debounce_hits: int = 3
    max_cache_size: int = 200
    total_finalized_events: int = 0
    total_discarded_noise: int = 0

class MemoryStatsSchema(BaseModel):
    total_events: int = 0
    importance_counts: Dict[str, int] = {}
    class_counts: Dict[str, int] = {}
    oldest_event: Optional[str] = None
    newest_event: Optional[str] = None



