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
