import time
import math
from collections import deque
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
import numpy as np

from app.detection.base import DetectionResult
from app.tracking.id_assigner import IDAssigner
from app.models.schemas import TrackedObjectSchema, EventSchema
from app.memory.cache_manager import DetectionCache
from app.memory.memory_manager import PersistentMemoryManager

def calculate_iou(boxA: List[int], boxB: List[int]) -> float:
    # box: [x1, y1, x2, y2]
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

class TrackedEntity:
    def __init__(self, tracking_id: str, object_class: str, confidence: float, bbox: List[int], raw_track_id: Optional[int] = None):
        self.tracking_id = tracking_id
        self.object_class = object_class
        self.confidence = confidence
        self.peak_confidence = confidence
        self.bbox = bbox
        self.raw_track_id = raw_track_id
        
        now = datetime.now()
        self.first_seen = now
        self.last_seen = now
        self.disappearance_time: Optional[datetime] = None
        self.left_time: Optional[datetime] = None
        
        self.status = "VISIBLE"  # "VISIBLE", "TEMPORARILY_LOST", "LEFT"
        self.reappearance_count = 0
        self.movement_state = "ENTERED"  # "ENTERED", "MOVING", "STATIONARY", "REAPPEARED", "LEFT"
        
        # Ring buffer for center coordinates
        center_x = int((bbox[0] + bbox[2]) / 2)
        center_y = int((bbox[1] + bbox[3]) / 2)
        self.recent_positions = deque(maxlen=30)
        self.recent_positions.append([center_x, center_y])
        
        self.total_visible_duration = 0.0
        self.last_visible_timestamp = time.time()

    def update_visible(self, bbox: List[int], confidence: float, raw_track_id: Optional[int] = None):
        now_ts = time.time()
        dt = max(0.0, now_ts - self.last_visible_timestamp)
        # Cap dt to avoid runaway duration if inference paused
        if dt < 2.0:
            self.total_visible_duration += dt
        self.last_visible_timestamp = now_ts

        self.last_seen = datetime.now()
        self.disappearance_time = None
        self.confidence = round(0.7 * self.confidence + 0.3 * confidence, 2)
        if confidence > self.peak_confidence:
            self.peak_confidence = round(confidence, 2)
        self.bbox = bbox
        if raw_track_id is not None:
            self.raw_track_id = raw_track_id

        # Update position history
        cx = int((bbox[0] + bbox[2]) / 2)
        cy = int((bbox[1] + bbox[3]) / 2)
        self.recent_positions.append([cx, cy])

        # Calculate movement state
        if len(self.recent_positions) >= 5:
            start_pos = self.recent_positions[0]
            curr_pos = self.recent_positions[-1]
            dist = euclidean_dist(start_pos, curr_pos)
            self.movement_state = "MOVING" if dist > 18.0 else "STATIONARY"
        else:
            self.movement_state = "ENTERED"

    def mark_lost(self):
        if self.status == "VISIBLE":
            self.status = "TEMPORARILY_LOST"
            self.disappearance_time = datetime.now()
            self.movement_state = "STATIONARY"

    def mark_reappeared(self, bbox: List[int], confidence: float, raw_track_id: Optional[int] = None):
        self.status = "VISIBLE"
        self.reappearance_count += 1
        self.movement_state = "REAPPEARED"
        self.last_visible_timestamp = time.time()
        self.update_visible(bbox, confidence, raw_track_id)

    def mark_left(self):
        self.status = "LEFT"
        self.left_time = datetime.now()
        self.movement_state = "LEFT"

    def to_schema(self, memory_window: float) -> TrackedObjectSchema:
        now = datetime.now()
        seconds_lost = 0.0
        if self.status == "TEMPORARILY_LOST" and self.disappearance_time:
            seconds_lost = max(0.0, (now - self.disappearance_time).total_seconds())

        return TrackedObjectSchema(
            tracking_id=self.tracking_id,
            object_class=self.object_class,
            confidence=self.confidence,
            first_seen=self.first_seen.strftime("%H:%M:%S"),
            last_seen=self.last_seen.strftime("%H:%M:%S"),
            visible_duration_seconds=round(self.total_visible_duration, 1),
            status=self.status,
            bbox=self.bbox if self.status == "VISIBLE" else None,
            recent_positions=list(self.recent_positions),
            disappearance_time=self.disappearance_time.strftime("%H:%M:%S") if self.disappearance_time else None,
            reappearance_count=self.reappearance_count,
            movement_state=self.movement_state,
            seconds_lost=round(seconds_lost, 1)
        )

class ObjectMemoryManager:
    """
    Maintains persistent multi-object tracking across frames with 20-second temporary memory,
    spatial re-identification on occlusion/reappearance, and discrete event timeline emissions.
    Integrated with two-tier Short-Term Cache and Persistent Event Memory.
    """

    def __init__(self, memory_seconds: float = 20.0):
        self.memory_seconds = memory_seconds
        self.id_assigner = IDAssigner()
        self.tracked_objects: Dict[str, TrackedEntity] = {}
        self.events: List[EventSchema] = []
        self.event_counter = 0

        # Initialize Persistent Memory and Short-Term Detection Cache
        self.persistent_memory = PersistentMemoryManager()
        self.cache = DetectionCache(
            ttl_seconds=self.memory_seconds,
            on_event_finalized=self.persistent_memory.add_event
        )

    def set_memory_window(self, seconds: float):
        self.memory_seconds = max(1.0, float(seconds))
        self.cache.set_config(ttl_seconds=self.memory_seconds)

    def _create_event(self, event_type: str, tracking_id: Optional[str], object_class: Optional[str], description: str) -> EventSchema:
        self.event_counter += 1
        ev = EventSchema(
            event_id=f"EV-{self.event_counter:04d}",
            timestamp=datetime.now().strftime("%H:%M:%S"),
            event_type=event_type,
            tracking_id=tracking_id,
            object_class=object_class,
            description=description
        )
        self.events.append(ev)
        return ev

    def update(self, detections: List[DetectionResult], camera_id: str = "default", session_id: Optional[str] = None) -> Tuple[List[TrackedObjectSchema], List[EventSchema]]:
        """
        Processes new detections, associates with tracked objects (including re-associating
        temporarily lost objects within the 20-second window), and generates timeline events.
        """
        now = datetime.now()
        new_events: List[EventSchema] = []

        
        matched_ceova_ids = set()
        unmatched_detections: List[DetectionResult] = []

        # 1. Match by persistent Raw Tracker ID (ByteTrack / BoT-SORT)
        for det in detections:
            matched = False
            if det.raw_track_id is not None and det.raw_track_id in self.id_assigner.raw_to_ceova_id:
                c_id = self.id_assigner.raw_to_ceova_id[det.raw_track_id]
                if c_id in self.tracked_objects:
                    obj = self.tracked_objects[c_id]
                    if obj.status == "TEMPORARILY_LOST":
                        obj.mark_reappeared(det.bbox, det.confidence, det.raw_track_id)
                        ev = self._create_event(
                            "OBJECT_REAPPEARED",
                            obj.tracking_id,
                            obj.object_class,
                            f"{obj.tracking_id} ({obj.object_class.title()}) reappeared after temporary loss"
                        )
                        new_events.append(ev)
                    elif obj.status == "VISIBLE":
                        obj.update_visible(det.bbox, det.confidence, det.raw_track_id)
                    
                    matched_ceova_ids.add(c_id)
                    matched = True

            if not matched:
                unmatched_detections.append(det)

        # 2. Attempt spatial re-association for temporarily lost objects
        #    If detection has no raw ID or new raw ID, check if it matches a TEMPORARILY_LOST object
        #    of the same class within the configured memory window using IoU or Center Proximity
        remaining_detections: List[DetectionResult] = []
        lost_candidates = [
            obj for obj in self.tracked_objects.values()
            if obj.status == "TEMPORARILY_LOST" and obj.tracking_id not in matched_ceova_ids
        ]

        for det in unmatched_detections:
            best_match: Optional[TrackedEntity] = None
            best_score = 0.0

            det_center = det.center

            for lost_obj in lost_candidates:
                if lost_obj.object_class.lower() != det.class_name.lower():
                    continue

                # Check IoU with last known bbox
                iou = calculate_iou(det.bbox, lost_obj.bbox)
                
                # Check spatial distance with last known center
                last_center = lost_obj.recent_positions[-1] if lost_obj.recent_positions else det_center
                dist = euclidean_dist(det_center, tuple(last_center))
                
                # Proximity score (high IoU or close distance < 130px)
                score = iou
                if dist < 120.0:
                    score += max(0.0, (120.0 - dist) / 120.0)

                if score > best_score and (iou > 0.15 or dist < 120.0):
                    best_score = score
                    best_match = lost_obj

            if best_match is not None:
                # Re-associated with temporarily lost object!
                best_match.mark_reappeared(det.bbox, det.confidence, det.raw_track_id)
                matched_ceova_ids.add(best_match.tracking_id)
                lost_candidates.remove(best_match)
                
                if det.raw_track_id is not None:
                    self.id_assigner.associate_raw_id(det.raw_track_id, best_match.tracking_id)

                ev = self._create_event(
                    "OBJECT_REAPPEARED",
                    best_match.tracking_id,
                    best_match.object_class,
                    f"{best_match.tracking_id} ({best_match.object_class.title()}) reappeared after temporary loss"
                )
                new_events.append(ev)
            else:
                remaining_detections.append(det)

        # 3. Register newly detected physical objects
        for det in remaining_detections:
            c_id = self.id_assigner.get_or_create_id(det.raw_track_id, det.class_name)
            new_entity = TrackedEntity(
                tracking_id=c_id,
                object_class=det.class_name,
                confidence=det.confidence,
                bbox=det.bbox,
                raw_track_id=det.raw_track_id
            )
            self.tracked_objects[c_id] = new_entity
            matched_ceova_ids.add(c_id)

            ev = self._create_event(
                "OBJECT_ENTERED",
                c_id,
                det.class_name,
                f"{c_id} ({det.class_name.title()}) entered the scene"
            )
            new_events.append(ev)

        # 4. Handle objects not detected in this frame (Temporary Memory & Departure)
        for obj_id, obj in list(self.tracked_objects.items()):
            if obj_id not in matched_ceova_ids:
                if obj.status == "VISIBLE":
                    obj.mark_lost()
                    ev = self._create_event(
                        "OBJECT_LOST",
                        obj.tracking_id,
                        obj.object_class,
                        f"{obj.tracking_id} ({obj.object_class.title()}) temporarily lost"
                    )
                    new_events.append(ev)

                elif obj.status == "TEMPORARILY_LOST":
                    if obj.disappearance_time is not None:
                        elapsed = (now - obj.disappearance_time).total_seconds()
                        if elapsed >= self.memory_seconds:
                            obj.mark_left()
                            ev = self._create_event(
                                "OBJECT_LEFT",
                                obj.tracking_id,
                                obj.object_class,
                                f"{obj.tracking_id} ({obj.object_class.title()}) left the scene"
                            )
                            new_events.append(ev)

        # Synchronize active tracked entities into short-term cache
        for obj_id in matched_ceova_ids:
            obj = self.tracked_objects.get(obj_id)
            if obj and obj.bbox:
                self.cache.update_or_create(
                    track_id=obj.tracking_id,
                    object_class=obj.object_class,
                    confidence=obj.confidence,
                    bbox=obj.bbox,
                    raw_track_id=obj.raw_track_id,
                    camera_id=camera_id,
                    session_id=session_id
                )

        # Notify cache about unseen objects
        self.cache.mark_unseen(matched_ceova_ids)

        # When object transitions to LEFT, mark finalized in cache
        for obj in self.tracked_objects.values():
            if obj.status == "LEFT":
                cached_ent = self.cache.get_entity(obj.tracking_id)
                if cached_ent:
                    cached_ent.status = "FINALIZED"

        # Evict expired objects from short-term cache and persist confirmed events
        self.cache.evict_expired()

        # Build active object schemas
        output_schemas = [
            obj.to_schema(self.memory_seconds)
            for obj in self.tracked_objects.values()
        ]

        return output_schemas, new_events

    def get_all_objects(self) -> List[TrackedObjectSchema]:
        return [obj.to_schema(self.memory_seconds) for obj in self.tracked_objects.values()]

    def get_events(self) -> List[EventSchema]:
        return self.events

    def add_system_event(self, event_type: str, description: str) -> EventSchema:
        return self._create_event(event_type, None, None, description)

    def reset(self):
        """Flushes confirmed cached events to persistent memory and resets tracking state."""
        self.cache.flush()
        self.tracked_objects.clear()
        self.events.clear()
        self.event_counter = 0
        self.id_assigner.reset()

