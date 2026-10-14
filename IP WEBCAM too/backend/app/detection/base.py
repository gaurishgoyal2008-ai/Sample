from abc import ABC, abstractmethod
from typing import List, Optional, Tuple, Dict, Any
from dataclasses import dataclass
import numpy as np

@dataclass
class DetectionResult:
    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float
    class_id: int
    class_name: str
    raw_track_id: Optional[int] = None  # Raw tracker ID from underlying engine if tracked

    @property
    def bbox(self) -> List[int]:
        return [self.x1, self.y1, self.x2, self.y2]

    @property
    def center(self) -> Tuple[int, int]:
        return int((self.x1 + self.x2) / 2), int((self.y1 + self.y2) / 2)

    @property
    def area(self) -> int:
        return max(0, self.x2 - self.x1) * max(0, self.y2 - self.y1)

class BaseDetector(ABC):
    """Modular Detector Interface for Ceova Vision Engine."""

    @abstractmethod
    def load_model(self, model_identifier: str) -> bool:
        """Load or switch the underlying model."""
        pass

    @abstractmethod
    def detect(self, frame: np.ndarray, conf_threshold: float = 0.4, allowed_classes: Optional[List[str]] = None) -> List[DetectionResult]:
        """Perform object detection on a single frame."""
        pass

    @abstractmethod
    def track(self, frame: np.ndarray, conf_threshold: float = 0.4, allowed_classes: Optional[List[str]] = None, tracker_type: str = "bytetrack.yaml") -> List[DetectionResult]:
        """Perform object tracking on a single frame."""
        pass

    @abstractmethod
    def get_model_status(self) -> Dict[str, Any]:
        """Return diagnostic and engine status."""
        pass
