import time
import math
import uuid
import logging
from collections import deque
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any, Callable

logger = logging.getLogger("ceova.cache")

def calculate_iou(boxA: List[int], boxB: List[int]) -> float:
    """Computes Intersection over Union between two bounding boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interWidth = max(0, xB - xA)
    interHeight = max(0, yB - yA)
    interArea = interWidth * interHeight

    boxAArea = max(0, boxA[2] - boxA[0]) * max(0, boxA[3] - boxA[1])
    boxBArea = max(0, boxB[2] - boxB[0]) * max(0, boxB[3] - boxB[1])

    unionArea = float(boxAArea + boxBArea - interArea)
    if unionArea <= 0:
        return 0.0
    return interArea / unionArea

def euclidean_dist(p1: Tuple[int, int], p2: Tuple[int, int]) -> float:
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

class CachedEntity:
    """
    Represents an active physical entity tracked in the short-term cache.
    Combines repeated detections across video frames without disk overhead.
    """

    def __init__(
        self,
        track_id: str,
        object_class: str,
        confidence: float,
        bbox: List[int],
        raw_track_id: Optional[int] = None,
        camera_id: str = "default",
        session_id: Optional[str] = None
    ):
        self.track_id = track_id
        self.object_class = object_class.lower()
        self.raw_track_id = raw_track_id
        self.camera_id = camera_id
        self.session_id = session_id

        now = datetime.now()
        now_ts = time.time()
        self.first_seen = now
        self.last_seen = now
        self.first_seen_timestamp = now_ts
        self.last_seen_timestamp = now_ts

        # Detection debouncing & metrics
        self.consecutive_detections = 1
        self.total_detections = 1
        self.peak_confidence = round(confidence, 3)
        self.confidence_sum = float(confidence)
        self.current_bbox = list(bbox)

        # Status: "CANDIDATE" (debouncing), "ACTIVE", "TEMPORARILY_LOST", "FINALIZED"
        self.status = "CANDIDATE"
        self.confirmed = False
        self.importance = "low"  # "low", "medium", "high"
        self.movement_state = "ENTERED"

        # Trajectory buffer
        cx = int((bbox[0] + bbox[2]) / 2)
        cy = int((bbox[1] + bbox[3]) / 2)
        self.recent_positions = deque(maxlen=30)
        self.recent_positions.append([cx, cy])

        self.disappearance_time: Optional[datetime] = None
        self.reappearance_count = 0
        self.metadata: Dict[str, Any] = {}

    @property
    def duration_seconds(self) -> float:
        return max(0.0, (self.last_seen - self.first_seen).total_seconds())

    @property
    def avg_confidence(self) -> float:
        if self.total_detections <= 0:
            return self.peak_confidence
        return round(self.confidence_sum / self.total_detections, 3)

    @property
    def center(self) -> Tuple[int, int]:
        return int((self.current_bbox[0] + self.current_bbox[2]) / 2), int((self.current_bbox[1] + self.current_bbox[3]) / 2)

    def update_detection(self, bbox: List[int], confidence: float, raw_track_id: Optional[int] = None):
        """Updates the cached entity with fresh detection data from a new frame."""
        now = datetime.now()
        now_ts = time.time()

        self.last_seen = now
        self.last_seen_timestamp = now_ts
        self.disappearance_time = None

        self.total_detections += 1
        self.consecutive_detections += 1
        self.confidence_sum += float(confidence)
        if confidence > self.peak_confidence:
            self.peak_confidence = round(confidence, 3)

        self.current_bbox = list(bbox)
        if raw_track_id is not None:
            self.raw_track_id = raw_track_id

        # Update position history
        cx = int((bbox[0] + bbox[2]) / 2)
        cy = int((bbox[1] + bbox[3]) / 2)
        self.recent_positions.append([cx, cy])

        # Evaluate movement
        if len(self.recent_positions) >= 5:
            dist = euclidean_dist(self.recent_positions[0], self.recent_positions[-1])
            self.movement_state = "MOVING" if dist > 18.0 else "STATIONARY"

    def mark_lost(self):
        """Marks the entity as temporarily lost (occlusion or out-of-frame)."""
        if self.status in ("ACTIVE", "CANDIDATE"):
            self.status = "TEMPORARILY_LOST"
            self.disappearance_time = datetime.now()
            self.consecutive_detections = 0

    def mark_reappeared(self, bbox: List[int], confidence: float, raw_track_id: Optional[int] = None):
        """Marks the entity as recovered after temporary loss."""
        self.status = "ACTIVE"
        self.reappearance_count += 1
        self.movement_state = "REAPPEARED"
        self.update_detection(bbox, confidence, raw_track_id)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "track_id": self.track_id,
            "raw_track_id": self.raw_track_id,
            "object_class": self.object_class,
            "camera_id": self.camera_id,
            "session_id": self.session_id,
            "status": self.status,
            "confirmed": self.confirmed,
            "importance": self.importance,
            "first_seen": self.first_seen.strftime("%H:%M:%S"),
            "last_seen": self.last_seen.strftime("%H:%M:%S"),
            "duration_seconds": round(self.duration_seconds, 1),
            "peak_confidence": self.peak_confidence,
            "avg_confidence": self.avg_confidence,
            "consecutive_detections": self.consecutive_detections,
            "total_detections": self.total_detections,
            "current_bbox": self.current_bbox,
            "recent_positions": list(self.recent_positions),
            "reappearance_count": self.reappearance_count,
            "movement_state": self.movement_state
        }

    def to_persistent_event(self, event_type: str = "OBJECT_PRESENCE") -> Dict[str, Any]:
        """Converts the cached entity into a finalized persistent memory event payload."""
        date_str = datetime.now().strftime("%Y%m%d")
        event_id = f"MEM-EV-{date_str}-{uuid.uuid4().hex[:8].upper()}"
        
        meta = {
            "peak_bbox": self.current_bbox,
            "reappearance_count": self.reappearance_count,
            "movement_state": self.movement_state,
            "positions_count": len(self.recent_positions)
        }
        meta.update(self.metadata)

        return {
            "event_id": event_id,
            "session_id": self.session_id,
            "camera_id": self.camera_id,
            "object_class": self.object_class,
            "tracking_id": self.track_id,
            "first_detected": self.first_seen.strftime("%Y-%m-%d %H:%M:%S"),
            "last_detected": self.last_seen.strftime("%Y-%m-%d %H:%M:%S"),
            "duration_seconds": round(self.duration_seconds, 2),
            "max_confidence": self.peak_confidence,
            "avg_confidence": self.avg_confidence,
            "detection_count": self.total_detections,
            "event_type": event_type,
            "importance": self.importance,
            "confirmed": self.confirmed,
            "metadata": meta
        }

class DetectionCache:
    """
    Central short-term detection cache manager.
    
    Key Features:
    - In-Memory High-Speed Access: Operates at camera frame rates without disk bottlenecks.
    - Debouncing: Single-frame glitches are classified as CANDIDATE and discarded if not verified.
    - Repeated Detection Aggregation: Updates existing cached entities instead of creating multiple events.
    - Dynamic Importance Scoring: Evaluates duration and class priority.
    - TTL & Max Capacity Bounds: Automatically evicts stale information and enforces size limits.
    - Event Finalization: Emits finalized events to Persistent Memory when objects depart or expire.
    """

    def __init__(
        self,
        ttl_seconds: float = 20.0,
        debounce_hits: int = 3,
        debounce_seconds: float = 0.3,
        max_cache_size: int = 200,
        on_event_finalized: Optional[Callable[[Dict[str, Any]], None]] = None
    ):
        self.ttl_seconds = max(1.0, float(ttl_seconds))
        self.debounce_hits = max(1, int(debounce_hits))
        self.debounce_seconds = max(0.0, float(debounce_seconds))
        self.max_cache_size = max(10, int(max_cache_size))
        self.on_event_finalized = on_event_finalized

        # In-memory storage: track_id -> CachedEntity
        self.cache: Dict[str, CachedEntity] = {}

        # Dwell time thresholds for importance escalation
        self.dwell_time_medium = 15.0  # seconds
        self.dwell_time_high = 45.0    # seconds
        self.high_priority_classes = {"person", "car", "truck", "motorcycle", "bus"}

        # Telemetry & Diagnostics
        self.total_finalized_events = 0
        self.total_discarded_noise = 0

    def set_config(
        self,
        ttl_seconds: Optional[float] = None,
        debounce_hits: Optional[int] = None,
        debounce_seconds: Optional[float] = None,
        max_cache_size: Optional[int] = None
    ):
        if ttl_seconds is not None:
            self.ttl_seconds = max(1.0, float(ttl_seconds))
        if debounce_hits is not None:
            self.debounce_hits = max(1, int(debounce_hits))
        if debounce_seconds is not None:
            self.debounce_seconds = max(0.0, float(debounce_seconds))
        if max_cache_size is not None:
            self.max_cache_size = max(10, int(max_cache_size))

    def evaluate_importance(self, entity: CachedEntity) -> str:
        """
        Determines event importance without inventing arbitrary conclusions:
        - 'high': Extended stay (>= 45s) OR high-priority object (person/vehicle) with high confidence & sustained presence
        - 'medium': Moderate presence (>= 15s)
        - 'low': Normal standard presence
        """
        dur = entity.duration_seconds
        if dur >= self.dwell_time_high:
            return "high"
        if entity.object_class in self.high_priority_classes and entity.peak_confidence >= 0.88 and dur >= 5.0:
            return "high"
        if dur >= self.dwell_time_medium:
            return "medium"
        return "low"

    def update_or_create(
        self,
        track_id: str,
        object_class: str,
        confidence: float,
        bbox: List[int],
        raw_track_id: Optional[int] = None,
        camera_id: str = "default",
        session_id: Optional[str] = None
    ) -> CachedEntity:
        """
        Updates an existing cached entity or registers a new candidate entity.
        Combines detections seamlessly across frames.
        """
        if track_id in self.cache:
            entity = self.cache[track_id]
            if entity.status == "TEMPORARILY_LOST":
                entity.mark_reappeared(bbox, confidence, raw_track_id)
            else:
                entity.update_detection(bbox, confidence, raw_track_id)
        else:
            entity = CachedEntity(
                track_id=track_id,
                object_class=object_class,
                confidence=confidence,
                bbox=bbox,
                raw_track_id=raw_track_id,
                camera_id=camera_id,
                session_id=session_id
            )
            self.cache[track_id] = entity

        # Evaluate Debouncing Threshold
        if not entity.confirmed:
            if entity.consecutive_detections >= self.debounce_hits or entity.duration_seconds >= self.debounce_seconds:
                entity.confirmed = True
                entity.status = "ACTIVE"
                logger.debug(f"[Cache Debounce] Confirmed entity {track_id} ({object_class}) after {entity.consecutive_detections} hits")

        # Dynamically recalculate importance
        entity.importance = self.evaluate_importance(entity)

        # Enforce cache capacity bounds
        self.enforce_max_size()

        return entity

    def mark_unseen(self, seen_track_ids: set):
        """Updates status for entities not detected in the latest frame."""
        now_ts = time.time()
        for track_id, entity in list(self.cache.items()):
            if track_id not in seen_track_ids:
                time_since_seen = now_ts - entity.last_seen_timestamp

                if time_since_seen > 1.0 and entity.status in ("ACTIVE", "CANDIDATE"):
                    entity.mark_lost()

                # If beyond TTL, mark for finalization
                if time_since_seen >= self.ttl_seconds:
                    entity.status = "FINALIZED"

    def evict_expired(self) -> List[Dict[str, Any]]:
        """
        Removes stale information and finalizes completed events.
        Safe Handling:
        - Confirmed events are exported and passed to on_event_finalized.
        - Unconfirmed noise is discarded without disk persistence.
        """
        now_ts = time.time()
        finalized_events = []
        to_evict = []

        for track_id, entity in list(self.cache.items()):
            time_since_seen = now_ts - entity.last_seen_timestamp
            is_expired = time_since_seen >= self.ttl_seconds or entity.status == "FINALIZED"

            if is_expired:
                to_evict.append(track_id)
                if entity.confirmed:
                    # Finalize confirmed event
                    event_type = "EXTENDED_STAY" if entity.importance == "high" else "OBJECT_PRESENCE"
                    event_data = entity.to_persistent_event(event_type=event_type)
                    finalized_events.append(event_data)
                    self.total_finalized_events += 1

                    if self.on_event_finalized:
                        try:
                            self.on_event_finalized(event_data)
                        except Exception as e:
                            logger.error(f"[Cache Finalizer] Error in callback for {track_id}: {e}")
                else:
                    # Discard unconfirmed candidate noise
                    self.total_discarded_noise += 1
                    logger.debug(f"[Cache Debounce] Discarded unconfirmed candidate {track_id} ({entity.object_class})")

        # Evict from in-memory cache
        for tid in to_evict:
            self.cache.pop(tid, None)

        return finalized_events

    def enforce_max_size(self):
        """Enforces upper bound on cache size to avoid unbounded memory consumption."""
        if len(self.cache) <= self.max_cache_size:
            return

        excess = len(self.cache) - self.max_cache_size

        # Evict oldest unconfirmed candidates first
        candidates = sorted(
            [e for e in self.cache.values() if not e.confirmed],
            key=lambda x: x.last_seen_timestamp
        )
        evicted = 0
        for cand in candidates:
            if evicted >= excess:
                break
            self.cache.pop(cand.track_id, None)
            self.total_discarded_noise += 1
            evicted += 1

        # If still over limit, evict oldest lost entities
        if evicted < excess:
            lost = sorted(
                [e for e in self.cache.values() if e.status == "TEMPORARILY_LOST"],
                key=lambda x: x.last_seen_timestamp
            )
            for l in lost:
                if evicted >= excess:
                    break
                # Finalize if confirmed
                if l.confirmed and self.on_event_finalized:
                    try:
                        self.on_event_finalized(l.to_persistent_event("OBJECT_PRESENCE"))
                        self.total_finalized_events += 1
                    except Exception:
                        pass
                self.cache.pop(l.track_id, None)
                evicted += 1

    def flush(self) -> List[Dict[str, Any]]:
        """
        Finalizes all remaining confirmed entities (used on session stop or shutdown).
        """
        finalized = []
        for track_id, entity in list(self.cache.items()):
            if entity.confirmed:
                event_data = entity.to_persistent_event(event_type="SESSION_CONCLUDED")
                finalized.append(event_data)
                self.total_finalized_events += 1
                if self.on_event_finalized:
                    try:
                        self.on_event_finalized(event_data)
                    except Exception as e:
                        logger.error(f"[Cache Flush] Callback error for {track_id}: {e}")
        self.cache.clear()
        return finalized

    def get_active_entities(self) -> List[Dict[str, Any]]:
        """Returns all currently active or lost cached entities."""
        return [entity.to_dict() for entity in self.cache.values()]

    def get_entity(self, track_id: str) -> Optional[CachedEntity]:
        return self.cache.get(track_id)

    def get_stats(self) -> Dict[str, Any]:
        """Provides operational health metrics for the short-term cache."""
        active = sum(1 for e in self.cache.values() if e.status == "ACTIVE")
        candidates = sum(1 for e in self.cache.values() if e.status == "CANDIDATE")
        lost = sum(1 for e in self.cache.values() if e.status == "TEMPORARILY_LOST")

        return {
            "total_cached": len(self.cache),
            "active_objects": active,
            "candidate_objects": candidates,
            "lost_objects": lost,
            "ttl_seconds": self.ttl_seconds,
            "debounce_hits": self.debounce_hits,
            "debounce_seconds": self.debounce_seconds,
            "max_cache_size": self.max_cache_size,
            "total_finalized_events": self.total_finalized_events,
            "total_discarded_noise": self.total_discarded_noise
        }

    def clear(self):
        """Resets the cache completely."""
        self.cache.clear()
