import cv2
import numpy as np
from typing import List, Dict, Tuple
from app.models.schemas import TrackedObjectSchema

CLASS_COLOR_MAP_BGR: Dict[str, Tuple[int, int, int]] = {
    "person": (240, 190, 40),       # Cyan / Sky
    "car": (50, 220, 100),          # Emerald Green
    "motorcycle": (50, 220, 100),
    "bicycle": (50, 220, 100),
    "bus": (50, 200, 140),
    "truck": (50, 200, 140),
    "backpack": (40, 180, 255),     # Amber / Orange
    "handbag": (40, 180, 255),
    "suitcase": (40, 180, 255),
    "laptop": (220, 80, 180),       # Purple / Magenta
    "cell phone": (220, 80, 180),
    "bottle": (180, 150, 100),      # Slate Blue
    "chair": (180, 150, 100)
}

DEFAULT_COLOR = (200, 200, 200)

def draw_visual_overlays(
    frame: np.ndarray,
    tracked_objects: List[TrackedObjectSchema],
    enable_boxes: bool = True,
    enable_trails: bool = True,
    enable_confidence: bool = True,
    enable_track_ids: bool = True
) -> np.ndarray:
    """
    Draws modern, high-tech security HUD overlays onto the frame:
    rounded corner-bracketed bounding boxes, persistent ID tags,
    confidence metrics, and movement trails.
    """
    if frame is None or frame.size == 0:
        return frame

    out = frame.copy()
    h, w = out.shape[:2]

    for obj in tracked_objects:
        cls_lower = obj.object_class.lower()
        color = CLASS_COLOR_MAP_BGR.get(cls_lower, DEFAULT_COLOR)

        # 1. Movement Trails
        if enable_trails and obj.recent_positions and len(obj.recent_positions) > 1:
            pts = obj.recent_positions
            num_pts = len(pts)
            for i in range(1, num_pts):
                pt1 = tuple(pts[i - 1])
                pt2 = tuple(pts[i])
                # Fade intensity based on age
                alpha = float(i) / float(num_pts)
                thickness = max(1, int(3 * alpha))
                cv2.line(out, pt1, pt2, color, thickness, cv2.LINE_AA)
            # Dot on latest center
            last_pt = tuple(pts[-1])
            cv2.circle(out, last_pt, 4, color, -1, cv2.LINE_AA)

        # 2. Bounding Box & Label (only for VISIBLE objects)
        if obj.status == "VISIBLE" and obj.bbox:
            x1, y1, x2, y2 = obj.bbox
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w - 1, x2), min(h - 1, y2)

            if enable_boxes:
                # Main bounding box
                cv2.rectangle(out, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)

                # Corner accent brackets
                corner_len = min(20, max(6, int((x2 - x1) * 0.2)), max(6, int((y2 - y1) * 0.2)))
                c_thick = 3
                # Top-Left
                cv2.line(out, (x1, y1), (x1 + corner_len, y1), color, c_thick, cv2.LINE_AA)
                cv2.line(out, (x1, y1), (x1, y1 + corner_len), color, c_thick, cv2.LINE_AA)
                # Top-Right
                cv2.line(out, (x2, y1), (x2 - corner_len, y1), color, c_thick, cv2.LINE_AA)
                cv2.line(out, (x2, y1), (x2, y1 + corner_len), color, c_thick, cv2.LINE_AA)
                # Bottom-Left
                cv2.line(out, (x1, y2), (x1 + corner_len, y2), color, c_thick, cv2.LINE_AA)
                cv2.line(out, (x1, y2), (x1, y2 - corner_len), color, c_thick, cv2.LINE_AA)
                # Bottom-Right
                cv2.line(out, (x2, y2), (x2 - corner_len, y2), color, c_thick, cv2.LINE_AA)
                cv2.line(out, (x2, y2), (x2, y2 - corner_len), color, c_thick, cv2.LINE_AA)

            # Build Label text e.g. "Person | H-001 | 94%"
            label_parts = [obj.object_class.title()]
            if enable_track_ids:
                label_parts.append(obj.tracking_id)
            if enable_confidence:
                label_parts.append(f"{int(obj.confidence * 100)}%")

            label_str = " | ".join(label_parts)

            # Draw sleek label background pill
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.52
            font_thick = 1
            (lbl_w, lbl_h), baseline = cv2.getTextSize(label_str, font, font_scale, font_thick)
            
            lbl_y1 = max(0, y1 - lbl_h - 10)
            lbl_y2 = y1
            lbl_x2 = min(w, x1 + lbl_w + 12)

            # Dark translucent pill
            sub_img = out[lbl_y1:lbl_y2, x1:lbl_x2]
            if sub_img.shape[0] > 0 and sub_img.shape[1] > 0:
                black_rect = np.zeros(sub_img.shape, dtype=np.uint8)
                black_rect[:] = (15, 20, 25)
                res = cv2.addWeighted(sub_img, 0.25, black_rect, 0.75, 1.0)
                out[lbl_y1:lbl_y2, x1:lbl_x2] = res

            # Colored left indicator bar on pill
            cv2.rectangle(out, (x1, lbl_y1), (x1 + 3, lbl_y2), color, -1)
            # Text inside pill
            cv2.putText(out, label_str, (x1 + 8, y1 - 5), font, font_scale, (255, 255, 255), font_thick, cv2.LINE_AA)

    return out
