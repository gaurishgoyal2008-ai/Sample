import sqlite3
import json
import os
from typing import List, Optional, Dict, Any
from app.config import DB_FILE
from app.models.schemas import MonitoringSessionSchema, TrackedObjectSchema, EventSchema

def get_connection():
    os.makedirs(os.path.dirname(os.path.abspath(DB_FILE)), exist_ok=True)
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    # Enable WAL mode for high performance concurrent reads and writes
    try:
        cursor.execute("PRAGMA journal_mode=WAL;")
    except Exception:
        pass
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        camera_source TEXT,
        started_at TEXT,
        ended_at TEXT,
        duration_seconds REAL,
        total_unique_objects INTEGER,
        category_counts TEXT,
        summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tracked_objects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        tracking_id TEXT,
        object_class TEXT,
        confidence REAL,
        first_seen TEXT,
        last_seen TEXT,
        visible_duration_seconds REAL,
        status TEXT,
        movement_state TEXT,
        positions_json TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions (session_id)
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        event_id TEXT,
        timestamp TEXT,
        event_type TEXT,
        tracking_id TEXT,
        object_class TEXT,
        description TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions (session_id)
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS memory_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT UNIQUE NOT NULL,
        session_id TEXT,
        camera_id TEXT DEFAULT 'default',
        object_class TEXT NOT NULL,
        tracking_id TEXT,
        first_detected TEXT NOT NULL,
        last_detected TEXT NOT NULL,
        duration_seconds REAL NOT NULL,
        max_confidence REAL NOT NULL,
        avg_confidence REAL NOT NULL,
        detection_count INTEGER NOT NULL DEFAULT 1,
        event_type TEXT NOT NULL DEFAULT 'OBJECT_PRESENCE',
        importance TEXT NOT NULL DEFAULT 'low',
        confirmed INTEGER NOT NULL DEFAULT 1,
        metadata_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_mem_class ON memory_events(object_class);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_mem_time ON memory_events(created_at);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_mem_importance ON memory_events(importance);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_mem_session ON memory_events(session_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_mem_track ON memory_events(tracking_id);")
    conn.commit()
    conn.close()

def save_session(session: MonitoringSessionSchema):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT OR REPLACE INTO sessions 
        (session_id, camera_source, started_at, ended_at, duration_seconds, total_unique_objects, category_counts, summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session.session_id,
            session.camera_source,
            session.started_at,
            session.ended_at,
            session.duration_seconds,
            session.total_unique_objects,
            json.dumps(session.category_counts),
            session.summary
        ))
        
        # Remove old objects and events for this session if re-saving
        cursor.execute("DELETE FROM tracked_objects WHERE session_id = ?", (session.session_id,))
        cursor.execute("DELETE FROM events WHERE session_id = ?", (session.session_id,))
        
        for obj in session.objects:
            cursor.execute("""
            INSERT INTO tracked_objects 
            (session_id, tracking_id, object_class, confidence, first_seen, last_seen, visible_duration_seconds, status, movement_state, positions_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session.session_id,
                obj.tracking_id,
                obj.object_class,
                obj.confidence,
                obj.first_seen,
                obj.last_seen,
                obj.visible_duration_seconds,
                obj.status,
                obj.movement_state,
                json.dumps(obj.recent_positions)
            ))
            
        for ev in session.events:
            cursor.execute("""
            INSERT INTO events 
            (session_id, event_id, timestamp, event_type, tracking_id, object_class, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                session.session_id,
                ev.event_id,
                ev.timestamp,
                ev.event_type,
                ev.tracking_id,
                ev.object_class,
                ev.description
            ))
        conn.commit()
    finally:
        conn.close()

def get_session(session_id: str) -> Optional[MonitoringSessionSchema]:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,))
        row = cursor.fetchone()
        if not row:
            return None
        
        cursor.execute("SELECT * FROM tracked_objects WHERE session_id = ?", (session_id,))
        obj_rows = cursor.fetchall()
        objects = []
        for o in obj_rows:
            positions = []
            if o["positions_json"]:
                try:
                    positions = json.loads(o["positions_json"])
                except Exception:
                    pass
            objects.append(TrackedObjectSchema(
                tracking_id=o["tracking_id"],
                object_class=o["object_class"],
                confidence=o["confidence"],
                first_seen=o["first_seen"],
                last_seen=o["last_seen"],
                visible_duration_seconds=o["visible_duration_seconds"],
                status=o["status"],
                movement_state=o["movement_state"],
                recent_positions=positions
            ))
            
        cursor.execute("SELECT * FROM events WHERE session_id = ? ORDER BY id ASC", (session_id,))
        ev_rows = cursor.fetchall()
        events = [
            EventSchema(
                event_id=e["event_id"],
                timestamp=e["timestamp"],
                event_type=e["event_type"],
                tracking_id=e["tracking_id"],
                object_class=e["object_class"],
                description=e["description"]
            )
            for e in ev_rows
        ]
        
        category_counts = {}
        if row["category_counts"]:
            try:
                category_counts = json.loads(row["category_counts"])
            except Exception:
                pass

        return MonitoringSessionSchema(
            session_id=row["session_id"],
            camera_source=row["camera_source"],
            started_at=row["started_at"],
            ended_at=row["ended_at"],
            duration_seconds=row["duration_seconds"],
            total_unique_objects=row["total_unique_objects"],
            category_counts=category_counts,
            objects=objects,
            events=events,
            summary=row["summary"] or ""
        )
    finally:
        conn.close()

def list_sessions() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT session_id, camera_source, started_at, ended_at, duration_seconds, total_unique_objects, category_counts, summary, created_at FROM sessions ORDER BY created_at DESC")
        rows = cursor.fetchall()
        res = []
        for r in rows:
            cats = {}
            if r["category_counts"]:
                try:
                    cats = json.loads(r["category_counts"])
                except Exception:
                    pass
            res.append({
                "session_id": r["session_id"],
                "camera_source": r["camera_source"],
                "started_at": r["started_at"],
                "ended_at": r["ended_at"],
                "duration_seconds": r["duration_seconds"],
                "total_unique_objects": r["total_unique_objects"],
                "category_counts": cats,
                "summary": r["summary"],
                "created_at": r["created_at"]
            })
        return res
    finally:
        conn.close()

def delete_session(session_id: str) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM tracked_objects WHERE session_id = ?", (session_id,))
        cursor.execute("DELETE FROM events WHERE session_id = ?", (session_id,))
        cursor.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
        conn.commit()
        return True
    finally:
        conn.close()

# ------------------------------------------------------------------
# Persistent Memory Event Operations
# ------------------------------------------------------------------

def save_memory_event(event: Dict[str, Any]) -> str:
    """Inserts or replaces an event in the persistent memory table."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        metadata_str = event.get("metadata_json")
        if metadata_str is None and "metadata" in event:
            metadata_str = json.dumps(event.get("metadata", {}))
        elif isinstance(metadata_str, dict):
            metadata_str = json.dumps(metadata_str)

        cursor.execute("""
        INSERT OR REPLACE INTO memory_events 
        (event_id, session_id, camera_id, object_class, tracking_id, 
         first_detected, last_detected, duration_seconds, max_confidence, 
         avg_confidence, detection_count, event_type, importance, confirmed, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            event["event_id"],
            event.get("session_id"),
            event.get("camera_id", "default"),
            event["object_class"],
            event.get("tracking_id"),
            event["first_detected"],
            event["last_detected"],
            float(event.get("duration_seconds", 0.0)),
            float(event.get("max_confidence", 0.0)),
            float(event.get("avg_confidence", 0.0)),
            int(event.get("detection_count", 1)),
            event.get("event_type", "OBJECT_PRESENCE"),
            event.get("importance", "low"),
            1 if event.get("confirmed", True) else 0,
            metadata_str or "{}"
        ))
        conn.commit()
        return event["event_id"]
    finally:
        conn.close()

def update_memory_event(event_id: str, updates: Dict[str, Any]) -> bool:
    """Updates fields on an existing memory event."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        allowed = [
            "last_detected", "duration_seconds", "max_confidence",
            "avg_confidence", "detection_count", "event_type", "importance", "confirmed"
        ]
        set_clauses = []
        params = []
        for k in allowed:
            if k in updates:
                set_clauses.append(f"{k} = ?")
                params.append(updates[k])
        if "metadata" in updates:
            set_clauses.append("metadata_json = ?")
            params.append(json.dumps(updates["metadata"]))
        elif "metadata_json" in updates:
            set_clauses.append("metadata_json = ?")
            params.append(updates["metadata_json"] if isinstance(updates["metadata_json"], str) else json.dumps(updates["metadata_json"]))

        if not set_clauses:
            return False

        params.append(event_id)
        sql = f"UPDATE memory_events SET {', '.join(set_clauses)} WHERE event_id = ?"
        cursor.execute(sql, tuple(params))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def get_memory_event(event_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves a single memory event by event_id."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM memory_events WHERE event_id = ?", (event_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        try:
            d["metadata"] = json.loads(d.get("metadata_json") or "{}")
        except Exception:
            d["metadata"] = {}
        return d
    finally:
        conn.close()

def query_memory_events(
    class_name: Optional[str] = None,
    importance: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    session_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """Queries persistent memory events with customizable filtering."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        clauses = []
        params = []
        if class_name:
            clauses.append("LOWER(object_class) = LOWER(?)")
            params.append(class_name.strip())
        if importance:
            clauses.append("LOWER(importance) = LOWER(?)")
            params.append(importance.strip())
        if session_id:
            clauses.append("session_id = ?")
            params.append(session_id.strip())
        if event_type:
            clauses.append("event_type = ?")
            params.append(event_type.strip())
        if start_time:
            clauses.append("created_at >= ?")
            params.append(start_time.strip())
        if end_time:
            clauses.append("created_at <= ?")
            params.append(end_time.strip())

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"""
        SELECT * FROM memory_events 
        {where_sql} 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
        """
        params.extend([max(1, int(limit)), max(0, int(offset))])
        cursor.execute(sql, tuple(params))
        rows = cursor.fetchall()

        results = []
        for r in rows:
            d = dict(r)
            try:
                d["metadata"] = json.loads(d.get("metadata_json") or "{}")
            except Exception:
                d["metadata"] = {}
            results.append(d)
        return results
    finally:
        conn.close()

def delete_memory_event(event_id: str) -> bool:
    """Deletes an event from persistent memory."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM memory_events WHERE event_id = ?", (event_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def clear_memory_events(session_id: Optional[str] = None) -> int:
    """Clears memory events, optionally constrained to a specific session."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        if session_id:
            cursor.execute("DELETE FROM memory_events WHERE session_id = ?", (session_id,))
        else:
            cursor.execute("DELETE FROM memory_events")
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()

def get_memory_stats() -> Dict[str, Any]:
    """Calculates comprehensive analytics on persistent memory."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) AS total FROM memory_events")
        total = cursor.fetchone()["total"]

        cursor.execute("""
        SELECT importance, COUNT(*) AS cnt 
        FROM memory_events 
        GROUP BY importance
        """)
        importance_counts = {r["importance"]: r["cnt"] for r in cursor.fetchall()}

        cursor.execute("""
        SELECT object_class, COUNT(*) AS cnt 
        FROM memory_events 
        GROUP BY object_class 
        ORDER BY cnt DESC 
        LIMIT 10
        """)
        class_counts = {r["object_class"]: r["cnt"] for r in cursor.fetchall()}

        cursor.execute("SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest FROM memory_events")
        time_row = cursor.fetchone()

        return {
            "total_events": total,
            "importance_counts": importance_counts,
            "class_counts": class_counts,
            "oldest_event": time_row["oldest"] if time_row else None,
            "newest_event": time_row["newest"] if time_row else None
        }
    finally:
        conn.close()

def prune_memory_events(retention_days: int = 30, max_count: int = 10000, preserve_high_importance: bool = True) -> Dict[str, int]:
    """
    Cleans up old memory events based on retention rules:
    - Evicts events older than retention_days.
    - If total exceeds max_count, prunes oldest low/medium importance events.
    - Preserves high-importance events when preserve_high_importance is True.
    """
    conn = get_connection()
    cursor = conn.cursor()
    deleted_age = 0
    deleted_count = 0
    try:
        # 1. Prune by retention days
        high_clause = "AND importance != 'high'" if preserve_high_importance else ""
        cursor.execute(f"""
        DELETE FROM memory_events 
        WHERE datetime(created_at) < datetime('now', '-{int(retention_days)} days') 
        {high_clause}
        """)
        deleted_age = cursor.rowcount

        # 2. Prune by maximum count
        cursor.execute("SELECT COUNT(*) AS total FROM memory_events")
        curr_total = cursor.fetchone()["total"]
        if curr_total > max_count:
            excess = curr_total - max_count
            cursor.execute(f"""
            DELETE FROM memory_events 
            WHERE id IN (
                SELECT id FROM memory_events 
                WHERE 1=1 {high_clause}
                ORDER BY created_at ASC 
                LIMIT ?
            )
            """, (excess,))
            deleted_count = cursor.rowcount

        conn.commit()
        return {
            "deleted_by_age": deleted_age,
            "deleted_by_capacity": deleted_count,
            "total_deleted": deleted_age + deleted_count
        }
    finally:
        conn.close()

