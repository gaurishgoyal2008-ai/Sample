import logging
from typing import Dict, List, Optional, Any, Union
from datetime import datetime

from app.database.db import (
    save_memory_event,
    update_memory_event,
    get_memory_event,
    query_memory_events,
    delete_memory_event,
    clear_memory_events,
    get_memory_stats,
    prune_memory_events
)
from app.models.schemas import MemoryEventSchema

logger = logging.getLogger("ceova.memory")

class PersistentMemoryManager:
    """
    Central Persistent Memory Manager for Ceova AI Vision.
    
    Responsibilities:
    - Manages SQLite-backed long-term event memory surviving application restarts and shutdowns.
    - Provides standardized CRUD and querying interfaces for historical analytics.
    - Enforces retention policies (retention_days, max_event_count) while protecting critical/high-importance events.
    """

    def __init__(self, retention_days: int = 30, max_event_count: int = 10000, preserve_high_importance: bool = True):
        self.retention_days = max(1, int(retention_days))
        self.max_event_count = max(100, int(max_event_count))
        self.preserve_high_importance = preserve_high_importance

    def set_retention_policy(self, retention_days: Optional[int] = None, max_event_count: Optional[int] = None, preserve_high_importance: Optional[bool] = None):
        """Updates retention configuration."""
        if retention_days is not None:
            self.retention_days = max(1, int(retention_days))
        if max_event_count is not None:
            self.max_event_count = max(100, int(max_event_count))
        if preserve_high_importance is not None:
            self.preserve_high_importance = bool(preserve_high_importance)

    def add_event(self, event: Union[Dict[str, Any], MemoryEventSchema]) -> str:
        """
        Persists a finalized, debounced event into long-term memory.
        """
        if isinstance(event, MemoryEventSchema):
            event_data = event.model_dump()
        else:
            event_data = dict(event)

        # Ensure required timestamps and defaults
        if "first_detected" not in event_data:
            event_data["first_detected"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if "last_detected" not in event_data:
            event_data["last_detected"] = event_data["first_detected"]

        event_id = save_memory_event(event_data)
        logger.debug(f"[Memory Manager] Persisted event {event_id} ({event_data.get('object_class')}, {event_data.get('importance')})")
        return event_id

    def update_event(self, event_id: str, updates: Dict[str, Any]) -> bool:
        """Updates fields on an existing persistent event."""
        return update_memory_event(event_id, updates)

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single persistent memory event."""
        return get_memory_event(event_id)

    def get_recent_events(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Retrieves the most recent historical events."""
        return query_memory_events(limit=limit, offset=offset)

    def get_events_by_class(self, object_class: str, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Filters historical events by object class (e.g. 'person', 'car')."""
        return query_memory_events(class_name=object_class, limit=limit, offset=offset)

    def get_events_by_time_range(self, start_time: str, end_time: str, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Filters historical events by ISO/date range."""
        return query_memory_events(start_time=start_time, end_time=end_time, limit=limit, offset=offset)

    def get_events_by_importance(self, importance: str, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Filters historical events by importance level ('low', 'medium', 'high')."""
        return query_memory_events(importance=importance, limit=limit, offset=offset)

    def query_events(
        self,
        class_name: Optional[str] = None,
        importance: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        session_id: Optional[str] = None,
        event_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Performs a multi-criteria query across persistent memory."""
        return query_memory_events(
            class_name=class_name,
            importance=importance,
            start_time=start_time,
            end_time=end_time,
            session_id=session_id,
            event_type=event_type,
            limit=limit,
            offset=offset
        )

    def delete_event(self, event_id: str) -> bool:
        """Deletes an event from persistent memory."""
        return delete_memory_event(event_id)

    def clear_memory(self, session_id: Optional[str] = None) -> int:
        """
        Clears memory events. If session_id is provided, only removes events
        from that session; otherwise clears all.
        """
        return clear_memory_events(session_id=session_id)

    def cleanup_old_memory(
        self,
        retention_days: Optional[int] = None,
        max_event_count: Optional[int] = None,
        preserve_high_importance: Optional[bool] = None
    ) -> Dict[str, int]:
        """
        Executes retention pruning:
        - Removes events older than retention_days.
        - Trims total count to max_event_count by dropping oldest low/medium importance events.
        - Never deletes high-importance events when preserve_high_importance is True.
        """
        days = retention_days if retention_days is not None else self.retention_days
        max_cnt = max_event_count if max_event_count is not None else self.max_event_count
        preserve = preserve_high_importance if preserve_high_importance is not None else self.preserve_high_importance

        res = prune_memory_events(retention_days=days, max_count=max_cnt, preserve_high_importance=preserve)
        logger.info(f"[Memory Prune] Pruned {res['total_deleted']} events (Age: {res['deleted_by_age']}, Capacity: {res['deleted_by_capacity']})")
        return res

    def get_memory_stats(self) -> Dict[str, Any]:
        """Returns analytics summary of stored events."""
        stats = get_memory_stats()
        stats["retention_days"] = self.retention_days
        stats["max_event_count"] = self.max_event_count
        return stats
