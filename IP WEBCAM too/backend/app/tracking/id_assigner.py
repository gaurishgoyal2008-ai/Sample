from typing import Dict, Optional
from app.config import get_class_prefix

class IDAssigner:
    """
    Assigns and maintains persistent, categorized tracking IDs (e.g. H-001, V-001, B-001)
    mapped from underlying multi-object tracker IDs.
    """

    def __init__(self):
        self.counters: Dict[str, int] = {}
        self.raw_to_ceova_id: Dict[int, str] = {}
        self.ceova_id_to_class: Dict[str, str] = {}

    def get_or_create_id(self, raw_tracker_id: Optional[int], class_name: str) -> str:
        """
        Retrieves existing persistent tracking ID or allocates a new one
        with the appropriate class prefix (H-001 for human, V-001 for vehicle, etc.).
        """
        if raw_tracker_id is not None and raw_tracker_id in self.raw_to_ceova_id:
            return self.raw_to_ceova_id[raw_tracker_id]

        prefix = get_class_prefix(class_name)
        current_num = self.counters.get(prefix, 0) + 1
        self.counters[prefix] = current_num

        ceova_id = f"{prefix}-{current_num:03d}"
        
        if raw_tracker_id is not None:
            self.raw_to_ceova_id[raw_tracker_id] = ceova_id
            
        self.ceova_id_to_class[ceova_id] = class_name
        return ceova_id

    def associate_raw_id(self, raw_tracker_id: int, ceova_id: str):
        """Map an incoming raw tracker ID to an existing persistent Ceova ID."""
        self.raw_to_ceova_id[raw_tracker_id] = ceova_id

    def reset(self):
        """Reset counters and mappings for a new session."""
        self.counters.clear()
        self.raw_to_ceova_id.clear()
        self.ceova_id_to_class.clear()
