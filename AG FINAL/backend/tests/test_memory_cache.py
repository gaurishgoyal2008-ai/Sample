import os
import sys
import time
from datetime import datetime, timedelta

# Add backend root to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.db import init_db, get_connection
from app.memory.cache_manager import DetectionCache, CachedEntity
from app.memory.memory_manager import PersistentMemoryManager
from app.tracking.memory_manager import ObjectMemoryManager
from app.detection.base import DetectionResult

def run_memory_cache_tests():
    print("=" * 75)
    print("RUNNING CEOVA MEMORY + CACHE SYSTEM COMPREHENSIVE TEST SUITE")
    print("=" * 75)
    init_db()

    # -------------------------------------------------------------
    # TEST 1: Short-term cache stores recent AI information
    # -------------------------------------------------------------
    print("\n--- TEST 1: Short-Term Cache Storage ---")
    cache = DetectionCache(ttl_seconds=3.0, debounce_hits=2)
    ent = cache.update_or_create(
        track_id="H-001",
        object_class="person",
        confidence=0.92,
        bbox=[100, 150, 200, 350],
        raw_track_id=1,
        camera_id="Test-Camera",
        session_id="SESS-001"
    )
    assert ent.track_id == "H-001"
    assert ent.object_class == "person"
    assert ent.peak_confidence == 0.92
    assert ent.current_bbox == [100, 150, 200, 350]
    assert ent.consecutive_detections == 1
    assert ent.status == "CANDIDATE"  # First detection is candidate until debounced
    assert not ent.confirmed
    print("PASS: Entity cached with rich metadata (bbox, confidence, timestamps, candidate status).")

    # -------------------------------------------------------------
    # TEST 2: Do NOT store every frame (Combines repeated detections)
    # -------------------------------------------------------------
    print("\n--- TEST 2: Frame Aggregation (Zero Disk I/O per Frame) ---")
    finalized_collector = []
    mem_mgr = PersistentMemoryManager()
    mem_mgr.clear_memory()

    cache2 = DetectionCache(
        ttl_seconds=2.0,
        debounce_hits=3,
        on_event_finalized=finalized_collector.append
    )

    # Simulate 30 consecutive frames for the same person
    for i in range(30):
        conf = 0.90 + (i % 5) * 0.01
        ent2 = cache2.update_or_create(
            track_id="H-002",
            object_class="person",
            confidence=conf,
            bbox=[100 + i, 100, 200 + i, 300],
            raw_track_id=2
        )

    # Verify short-term cache combined all 30 frames into 1 cached entity
    assert len(cache2.cache) == 1, f"Expected 1 cached entity, found {len(cache2.cache)}"
    assert ent2.total_detections == 30
    assert ent2.consecutive_detections == 30
    assert ent2.confirmed is True
    assert ent2.status == "ACTIVE"
    # No persistent events created while person is actively in frame!
    assert len(finalized_collector) == 0, "Frames should NOT be written to disk while actively visible"
    print(f"PASS: 30 consecutive frames aggregated into 1 short-term entity without writing to disk.")

    # -------------------------------------------------------------
    # TEST 3: Cache Expiration & TTL Cleanup
    # -------------------------------------------------------------
    print("\n--- TEST 3: Cache TTL Expiration & Finalization ---")
    cache3 = DetectionCache(
        ttl_seconds=1.5,
        debounce_hits=2,
        on_event_finalized=finalized_collector.append
    )
    # Register confirmed entity
    cache3.update_or_create("H-003", "person", 0.95, [50, 50, 150, 250])
    cache3.update_or_create("H-003", "person", 0.96, [52, 50, 152, 250])

    assert "H-003" in cache3.cache
    assert cache3.cache["H-003"].confirmed is True

    # Mark unseen and wait for TTL expiration (1.5s)
    cache3.mark_unseen(set())
    time.sleep(1.6)

    # Evict expired
    finalized = cache3.evict_expired()
    assert len(finalized) == 1, "Expected 1 finalized event upon TTL expiration"
    assert "H-003" not in cache3.cache, "Expired entity should be evicted from active cache"
    assert finalized[0]["tracking_id"] == "H-003"
    print("PASS: Entity safely finalized and evicted from active cache after TTL expiration.")

    # -------------------------------------------------------------
    # TEST 4: Detection Debouncing (Filtering False Positives)
    # -------------------------------------------------------------
    print("\n--- TEST 4: Detection Debouncing ---")
    discarded_events = []
    saved_events = []
    cache4 = DetectionCache(
        ttl_seconds=1.0,
        debounce_hits=3,
        debounce_seconds=0.2,
        on_event_finalized=saved_events.append
    )

    # Scenario A: Spurious 1-frame detection (glitch/noise)
    cache4.update_or_create("O-099", "bottle", 0.40, [10, 10, 30, 50])
    assert cache4.cache["O-099"].confirmed is False
    assert cache4.cache["O-099"].status == "CANDIDATE"

    # Glitch disappears immediately
    cache4.mark_unseen(set())
    time.sleep(1.1)
    evicted = cache4.evict_expired()

    # The 1-frame candidate must be DISCARDED without generating an event!
    assert len(saved_events) == 0, "Single-frame glitch should NOT create persistent memory"
    assert cache4.total_discarded_noise >= 1
    print("PASS: Single-frame spurious detection debounced and discarded without polluting memory.")

    # Scenario B: Legitimate 3-frame consistent detection
    for _ in range(3):
        cache4.update_or_create("H-004", "person", 0.91, [200, 200, 300, 400])
    assert cache4.cache["H-004"].confirmed is True
    assert cache4.cache["H-004"].status == "ACTIVE"

    cache4.mark_unseen(set())
    time.sleep(1.1)
    cache4.evict_expired()
    assert len(saved_events) == 1
    assert saved_events[0]["tracking_id"] == "H-004"
    print("PASS: Consistent detection verified by debouncer and safely persisted.")

    # -------------------------------------------------------------
    # TEST 5: Persistent Memory Layer & SQLite Restart Survival
    # -------------------------------------------------------------
    print("\n--- TEST 5: Persistent Memory Layer (Survives Restarts) ---")
    mem_mgr2 = PersistentMemoryManager()
    mem_mgr2.clear_memory()

    test_event = {
        "event_id": "MEM-EV-TEST-001",
        "session_id": "SESS-2026",
        "camera_id": "Main Gate Camera",
        "object_class": "car",
        "tracking_id": "V-001",
        "first_detected": "2026-10-15 14:00:00",
        "last_detected": "2026-10-15 14:00:45",
        "duration_seconds": 45.0,
        "max_confidence": 0.97,
        "avg_confidence": 0.94,
        "detection_count": 120,
        "event_type": "EXTENDED_STAY",
        "importance": "high",
        "confirmed": True,
        "metadata": {"vehicle_type": "sedan", "zone": "parking"}
    }

    mem_mgr2.add_event(test_event)

    # Simulate restart by instantiating a fresh PersistentMemoryManager
    fresh_mem_mgr = PersistentMemoryManager()
    retrieved = fresh_mem_mgr.get_event("MEM-EV-TEST-001")
    assert retrieved is not None, "Event must survive application restart"
    assert retrieved["object_class"] == "car"
    assert retrieved["tracking_id"] == "V-001"
    assert retrieved["importance"] == "high"
    assert retrieved["duration_seconds"] == 45.0
    assert retrieved["metadata"]["zone"] == "parking"
    print("PASS: Persistent memory survived process reload with complete metadata.")

    # -------------------------------------------------------------
    # TEST 6: Memory Manager Operations & Filtering
    # -------------------------------------------------------------
    print("\n--- TEST 6: Memory Manager Queries & Filtering ---")
    # Add a medium and low importance event
    fresh_mem_mgr.add_event({
        "event_id": "MEM-EV-TEST-002",
        "object_class": "person",
        "tracking_id": "H-005",
        "first_detected": "2026-10-15 14:05:00",
        "last_detected": "2026-10-15 14:05:20",
        "duration_seconds": 20.0,
        "max_confidence": 0.89,
        "avg_confidence": 0.85,
        "importance": "medium",
        "event_type": "OBJECT_PRESENCE"
    })
    fresh_mem_mgr.add_event({
        "event_id": "MEM-EV-TEST-003",
        "object_class": "backpack",
        "tracking_id": "B-001",
        "first_detected": "2026-10-15 14:10:00",
        "last_detected": "2026-10-15 14:10:05",
        "duration_seconds": 5.0,
        "max_confidence": 0.75,
        "avg_confidence": 0.72,
        "importance": "low",
        "event_type": "OBJECT_PRESENCE"
    })

    # Query recent
    recent = fresh_mem_mgr.get_recent_events(limit=10)
    assert len(recent) >= 3

    # Query by class
    cars = fresh_mem_mgr.get_events_by_class("car")
    assert len(cars) == 1 and cars[0]["tracking_id"] == "V-001"

    # Query by importance
    highs = fresh_mem_mgr.get_events_by_importance("high")
    assert any(e["event_id"] == "MEM-EV-TEST-001" for e in highs)

    # Get memory stats
    stats = fresh_mem_mgr.get_memory_stats()
    assert stats["total_events"] >= 3
    assert "car" in stats["class_counts"]
    print(f"PASS: Memory Manager queried by class, importance, and stats: {stats['importance_counts']}")

    # -------------------------------------------------------------
    # TEST 7: Memory Retention & High-Importance Protection
    # -------------------------------------------------------------
    print("\n--- TEST 7: Memory Retention & Importance Protection ---")
    # Prune memory with max_count = 1 (should evict low/medium events, preserving high importance!)
    cleanup_res = fresh_mem_mgr.cleanup_old_memory(max_event_count=1, preserve_high_importance=True)
    assert cleanup_res["total_deleted"] >= 1

    # High importance event must STILL exist
    high_event = fresh_mem_mgr.get_event("MEM-EV-TEST-001")
    assert high_event is not None, "High-importance events must NOT be deleted during capacity pruning!"
    print("PASS: Retention policy pruned low-priority events while preserving high-importance memory.")

    # -------------------------------------------------------------
    # TEST 8: Full End-to-End Tracking + Cache + Persistent Memory
    # -------------------------------------------------------------
    print("\n--- TEST 8: End-to-End Tracking Integration ---")
    obj_memory = ObjectMemoryManager(memory_seconds=1.5)
    obj_memory.reset()

    # Frame 1 to 5: Person enters and remains visible
    for f in range(5):
        det = DetectionResult(
            x1=100 + f, y1=100, x2=200 + f, y2=300,
            confidence=0.93, class_id=0, class_name="person", raw_track_id=99
        )
        objs, _ = obj_memory.update([det], camera_id="Front Gate", session_id="#CEOVA-TEST-SESSION")

    assert len(objs) == 1
    p_id = objs[0].tracking_id
    assert p_id.startswith("H-")

    # Person leaves scene -> triggers TEMPORARILY_LOST
    obj_memory.update([], camera_id="Front Gate", session_id="#CEOVA-TEST-SESSION")

    # Wait past memory threshold (1.5s) -> transitions to LEFT and finalizes into persistent memory
    time.sleep(1.6)
    objs_after, events_after = obj_memory.update([], camera_id="Front Gate", session_id="#CEOVA-TEST-SESSION")

    # Verify event persisted to SQLite
    stored_events = obj_memory.persistent_memory.get_events_by_class("person")
    matching = [e for e in stored_events if e.get("tracking_id") == p_id]
    assert len(matching) == 1, f"Expected 1 persisted event for {p_id}, found {len(matching)}"
    assert matching[0]["duration_seconds"] >= 0.0
    print(f"PASS: Full end-to-end event lifecycle verified for {p_id}. Saved in SQLite memory.")

    print("\n" + "=" * 75)
    print("ALL 8 MEMORY + CACHE SYSTEM TESTS PASSED SUCCESSFULLY!")
    print("=" * 75)

if __name__ == "__main__":
    run_memory_cache_tests()
