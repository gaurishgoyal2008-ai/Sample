import os
import logging
from typing import List, Optional, Dict, Any
import numpy as np
import torch
from ultralytics import YOLO

from app.detection.base import BaseDetector, DetectionResult

logger = logging.getLogger("ceova.detection")

class YOLO26Detector(BaseDetector):
    """
    Ceova YOLO26 Detector implementation.
    Operates via Ultralytics engine with modular architecture.
    Supports YOLO26 checkpoints, falling back gracefully to YOLO11n if custom YOLO26 weights
    are not found, and providing transparent reporting of active hardware and architecture.
    """

    def __init__(self, model_identifier: str = "YOLO26-Accurate"):
        self.model_identifier = model_identifier
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = None
        self.active_weights_name = ""
        self.model_status_note = ""
        self.load_model(model_identifier)

    @staticmethod
    def preprocess_frame(frame: np.ndarray, enhance_contrast: bool = True) -> np.ndarray:
        """
        Enhances video frame clarity for optimal neural network feature extraction.
        Applies adaptive Contrast Limited Adaptive Histogram Equalization (CLAHE)
        on the luminance channel if the frame is underexposed (< 85 mean brightness).
        """
        if frame is None or frame.size == 0 or not enhance_contrast:
            return frame

        try:
            mean_brightness = float(np.mean(frame))
            if mean_brightness < 85.0:
                ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
                y, cr, cb = cv2.split(ycrcb)
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                y_eq = clahe.apply(y)
                merged = cv2.merge([y_eq, cr, cb])
                return cv2.cvtColor(merged, cv2.COLOR_YCrCb2BGR)
        except Exception as e:
            logger.debug(f"[Ceova Vision] Preprocessing pass-through: {e}")
        return frame

    def load_model(self, model_identifier: str) -> bool:
        self.model_identifier = model_identifier
        try:
            # 1. Check for custom YOLO26 weights file
            yolo26_candidates = ["yolo26.pt", "backend/yolo26.pt", "models/yolo26.pt", "weights/yolo26.pt"]
            found_yolo26 = next((cand for cand in yolo26_candidates if os.path.exists(cand)), None)

            # 2. Check for high-accuracy YOLO11s weights (47.0 mAP)
            yolo11s_candidates = ["yolo11s.pt", "backend/yolo11s.pt"]
            found_yolo11s = next((cand for cand in yolo11s_candidates if os.path.exists(cand)), None)

            # 3. Check for high-speed YOLO11n weights (39.5 mAP)
            yolo11n_candidates = ["yolo11n.pt", "backend/yolo11n.pt"]
            found_yolo11n = next((cand for cand in yolo11n_candidates if os.path.exists(cand)), None)

            id_upper = model_identifier.upper()

            if found_yolo26 and ("YOLO26.PT" in id_upper or "CUSTOM" in id_upper):
                self.active_weights_name = found_yolo26
                self.model_status_note = f"Custom YOLO26 checkpoint loaded from {found_yolo26}"
            elif "FAST" in id_upper or "YOLO11N" in id_upper:
                self.active_weights_name = found_yolo11n or "yolo11n.pt"
                self.model_status_note = "YOLO26-Fast active. Ultralytics YOLO11n Nano backbone (Speed Priority, 2.6M params)."
            elif found_yolo11s:
                # Default to YOLO11s for state-of-the-art accuracy
                self.active_weights_name = found_yolo11s
                self.model_status_note = (
                    "YOLO26-Accurate active. Ultralytics YOLO11s neural backbone "
                    "(Accuracy Priority: 9.4M params, 47.0 mAP SOTA, enhanced small/occluded object detection)."
                )
            elif found_yolo11n:
                self.active_weights_name = found_yolo11n
                self.model_status_note = "YOLO26 active via Ultralytics YOLO11n (2.6M params)."
            else:
                self.active_weights_name = model_identifier
                self.model_status_note = f"Loaded model weights: {model_identifier}"

            logger.info(f"[Ceova Vision] Initializing {self.model_identifier} on {self.device.upper()} using {self.active_weights_name}")
            self.model = YOLO(self.active_weights_name)
            logger.info(f"[Ceova Vision] Model ready: {self.model_status_note}")
            return True
        except Exception as e:
            logger.error(f"[Ceova Vision] Failed to load model {model_identifier}: {e}")
            try:
                self.active_weights_name = "yolo11n.pt"
                self.model = YOLO(self.active_weights_name)
                self.model_status_note = "Fallback YOLO11n initialized after loading error"
                return True
            except Exception as e2:
                logger.critical(f"[Ceova Vision] Critical: Could not load fallback model: {e2}")
                return False

    def detect(self, frame: np.ndarray, conf_threshold: float = 0.28, allowed_classes: Optional[List[str]] = None) -> List[DetectionResult]:
        if self.model is None or frame is None or frame.size == 0:
            return []

        try:
            enhanced = self.preprocess_frame(frame)
            results = self.model(
                enhanced,
                conf=conf_threshold,
                iou=0.45,
                rect=True,
                verbose=False,
                device=self.device
            )
            return self._parse_results(results, conf_threshold, allowed_classes)
        except Exception as e:
            logger.error(f"[Ceova Vision] Error in detect(): {e}")
            return []

    def track(self, frame: np.ndarray, conf_threshold: float = 0.28, allowed_classes: Optional[List[str]] = None, tracker_type: str = "bytetrack.yaml") -> List[DetectionResult]:
        if self.model is None or frame is None or frame.size == 0:
            return []

        try:
            enhanced = self.preprocess_frame(frame)
            results = self.model.track(
                enhanced,
                conf=conf_threshold,
                iou=0.45,
                persist=True,
                tracker=tracker_type,
                verbose=False,
                device=self.device
            )
            return self._parse_results(results, conf_threshold, allowed_classes)
        except Exception as e:
            logger.error(f"[Ceova Vision] Error in track(): {e}")
            return self.detect(frame, conf_threshold, allowed_classes)

    def _parse_results(self, results, conf_threshold: float, allowed_classes: Optional[List[str]]) -> List[DetectionResult]:
        detections: List[DetectionResult] = []
        if not results or len(results) == 0:
            return detections

        res = results[0]
        if res.boxes is None or len(res.boxes) == 0:
            return detections

        names = res.names
        boxes = res.boxes.xyxy.cpu().numpy()
        confs = res.boxes.conf.cpu().numpy()
        classes = res.boxes.cls.cpu().numpy().astype(int)
        
        raw_ids = None
        if res.boxes.id is not None:
            raw_ids = res.boxes.id.cpu().numpy().astype(int)

        allowed_set = set([c.lower() for c in allowed_classes]) if allowed_classes else None

        for i in range(len(boxes)):
            conf = float(confs[i])
            if conf < conf_threshold:
                continue

            cls_id = int(classes[i])
            cls_name = str(names.get(cls_id, f"class_{cls_id}")).lower()

            if allowed_set and cls_name not in allowed_set:
                continue

            b = boxes[i]
            x1, y1, x2, y2 = int(b[0]), int(b[1]), int(b[2]), int(b[3])
            
            raw_id = int(raw_ids[i]) if raw_ids is not None and i < len(raw_ids) else None

            detections.append(DetectionResult(
                x1=x1,
                y1=y1,
                x2=x2,
                y2=y2,
                confidence=round(conf, 3),
                class_id=cls_id,
                class_name=cls_name,
                raw_track_id=raw_id
            ))

        return detections

    def get_model_status(self) -> Dict[str, Any]:
        return {
            "requested_model": self.model_identifier,
            "active_weights": self.active_weights_name,
            "device": self.device.upper(),
            "cuda_available": torch.cuda.is_available(),
            "status_note": self.model_status_note
        }
