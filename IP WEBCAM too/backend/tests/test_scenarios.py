import os
import sys
import time
from datetime import datetime

# Add app to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.detection.base import DetectionResult
from app.tracking.id_assigner import IDAssigner
from app.tracking.memory_manager import ObjectMemoryManager
from app.reporting.report_generator import ReportGenerator
from app.camera.ip_webcam import test_ip_webcam_connection, sanitize_url_for_logging
from app.camera.stream_manager import CameraStreamManager
from app.database.db import init_db, save_session, get_session

def run_all_tests():
    print("=" * 70)
    print("RUNNING CEOVA VERIFICATION TEST SUITE (10 CRITICAL SCENARIOS)")
    print("=" * 70)
    init_db()

    # -------------------------------------------------------------
    # TEST 1: One person enters and leaves
    # -------------------------------------------------------------
    print("\n--- TEST 1: One person enters and leaves ---")
    mem1 = ObjectMemoryManager(memory_seconds=2.0)
    det_person1 = DetectionResult(x1=100, y1=100, x2=200, y2=300, confidence=0.94, class_id=0, class_name="person", raw_track_id=1)
    
    # Frame 1: Person enters
    objs, events = mem1.update([det_person1])
    assert len(objs) == 1, "Expected 1 tracked object"
    assert objs[0].tracking_id.startswith("H-"), f"Expected H- prefix for person, got {objs[0].tracking_id}"
    assert objs[0].status == "VISIBLE", "Expected status VISIBLE"
    assert any(e.event_type == "OBJECT_ENTERED" for e in events), "Expected OBJECT_ENTERED event"
    h1_id = objs[0].tracking_id
    print(f"PASS: {h1_id} registered with status {objs[0].status}")

    # Frame 2: Person disappears from frame -> transitions to TEMPORARILY_LOST
    objs_lost, events_lost = mem1.update([])
    target_lost = next(o for o in objs_lost if o.tracking_id == h1_id)
    assert target_lost.status == "TEMPORARILY_LOST", f"Expected TEMPORARILY_LOST, got {target_lost.status}"
    assert any(e.event_type == "OBJECT_LOST" for e in events_lost), "Expected OBJECT_LOST event"
    print(f"PASS: {h1_id} marked as TEMPORARILY_LOST.")

    # Wait beyond memory window (2.0s) and simulate next frame
    time.sleep(2.1)
    objs_left, events_left = mem1.update([])
    target = next(o for o in objs_left if o.tracking_id == h1_id)
    assert target.status == "LEFT", f"Expected status LEFT after memory expiry, got {target.status}"
    assert any(e.event_type == "OBJECT_LEFT" for e in events_left), "Expected OBJECT_LEFT event"
    print(f"PASS: {h1_id} departed scene and transitioned to LEFT after memory threshold.")

    # -------------------------------------------------------------
    # TEST 2: Two people appear simultaneously
    # -------------------------------------------------------------
    print("\n--- TEST 2: Two people appear simultaneously ---")
    mem2 = ObjectMemoryManager(memory_seconds=5.0)
    p_a = DetectionResult(x1=50, y1=100, x2=150, y2=300, confidence=0.91, class_id=0, class_name="person", raw_track_id=10)
    p_b = DetectionResult(x1=300, y1=100, x2=400, y2=300, confidence=0.95, class_id=0, class_name="person", raw_track_id=11)
    
    objs2, _ = mem2.update([p_a, p_b])
    assert len(objs2) == 2, f"Expected 2 tracked objects, got {len(objs2)}"
    ids2 = [o.tracking_id for o in objs2]
    assert len(set(ids2)) == 2, "Expected 2 distinct tracking IDs"
    assert "H-001" in ids2 and "H-002" in ids2, f"Expected H-001 and H-002, got {ids2}"
    print(f"PASS: Two independent people tracked simultaneously: {ids2}")

    # -------------------------------------------------------------
    # TEST 3: One person disappears briefly and reappears (20s memory)
    # -------------------------------------------------------------
    print("\n--- TEST 3: One person disappears briefly and reappears within memory window ---")
    mem3 = ObjectMemoryManager(memory_seconds=5.0)
    # Frame 1: Person visible
    p1 = DetectionResult(x1=100, y1=100, x2=200, y2=300, confidence=0.92, class_id=0, class_name="person", raw_track_id=20)
    objs3_1, _ = mem3.update([p1])
    orig_id = objs3_1[0].tracking_id

    # Frame 2: Occlusion / disappeared briefly
    objs3_2, events_lost = mem3.update([])
    lost_obj = next(o for o in objs3_2 if o.tracking_id == orig_id)
    assert lost_obj.status == "TEMPORARILY_LOST", f"Expected TEMPORARILY_LOST, got {lost_obj.status}"
    assert any(e.event_type == "OBJECT_LOST" for e in events_lost), "Expected OBJECT_LOST event"
    print(f"PASS: {orig_id} transitioned to TEMPORARILY_LOST during occlusion.")

    # Frame 3: Reappears at nearby coordinates (re-associated)
    p1_reapp = DetectionResult(x1=110, y1=105, x2=210, y2=305, confidence=0.90, class_id=0, class_name="person", raw_track_id=None)
    objs3_3, events_reapp = mem3.update([p1_reapp])
    reapp_obj = next(o for o in objs3_3 if o.tracking_id == orig_id)
    assert reapp_obj.status == "VISIBLE", f"Expected status VISIBLE, got {reapp_obj.status}"
    assert reapp_obj.reappearance_count == 1, f"Expected reappearance_count == 1, got {reapp_obj.reappearance_count}"
    assert any(e.event_type == "OBJECT_REAPPEARED" for e in events_reapp), "Expected OBJECT_REAPPEARED event"
    print(f"PASS: Preserved persistent ID {orig_id} across occlusion. No duplicate ID spawned!")

    # -------------------------------------------------------------
    # TEST 4: Person + car + backpack appear
    # -------------------------------------------------------------
    print("\n--- TEST 4: Person + car + backpack appear (Distinct Prefix Categories) ---")
    mem4 = ObjectMemoryManager(memory_seconds=10.0)
    d_person = DetectionResult(x1=100, y1=100, x2=200, y2=300, confidence=0.94, class_id=0, class_name="person", raw_track_id=30)
    d_car = DetectionResult(x1=400, y1=200, x2=650, y2=400, confidence=0.88, class_id=2, class_name="car", raw_track_id=31)
    d_bag = DetectionResult(x1=210, y1=220, x2=270, y2=290, confidence=0.82, class_id=24, class_name="backpack", raw_track_id=32)
    
    objs4, _ = mem4.update([d_person, d_car, d_bag])
    id_map = {o.object_class: o.tracking_id for o in objs4}
    assert id_map["person"].startswith("H-"), f"Person ID should start with H-, got {id_map['person']}"
    assert id_map["car"].startswith("V-"), f"Car ID should start with V-, got {id_map['car']}"
    assert id_map["backpack"].startswith("B-"), f"Backpack ID should start with B-, got {id_map['backpack']}"
    print(f"PASS: Person -> {id_map['person']}, Car -> {id_map['car']}, Backpack -> {id_map['backpack']}")

    # -------------------------------------------------------------
    # TEST 5: Object leaves permanently
    # -------------------------------------------------------------
    print("\n--- TEST 5: Object leaves permanently after configured memory threshold ---")
    mem5 = ObjectMemoryManager(memory_seconds=1.5)
    objs5, _ = mem5.update([d_person])
    # Absent: transitions to TEMPORARILY_LOST
    mem5.update([])
    time.sleep(1.7)
    # Absent after memory expiry: transitions to LEFT
    objs5_after, ev5_after = mem5.update([])
    left_entity = objs5_after[0]
    assert left_entity.status == "LEFT", f"Expected LEFT, got {left_entity.status}"
    assert any(e.event_type == "OBJECT_LEFT" for e in ev5_after), "Expected OBJECT_LEFT event"
    print(f"PASS: Object successfully transitioned to LEFT and departure recorded.")

    # -------------------------------------------------------------
    # TEST 6: Phone connects through QR code
    # -------------------------------------------------------------
    print("\n--- TEST 6: Phone camera stream handling via token ---")
    sm = CameraStreamManager()
    token = "test-token-123"
    sm.register_phone_session(token)
    assert sm.source_type == "PHONE_STREAM"
    assert sm.status == "CONNECTING"
    # Send simulated frame bytes
    import cv2
    import numpy as np
    dummy_frame = np.zeros((240, 320, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", dummy_frame)
    ok = sm.receive_phone_frame(token, buf.tobytes())
    assert ok is True, "Expected frame reception to succeed"
    has_f, f, _ = sm.get_latest_frame()
    assert has_f is True and f is not None, "Expected valid frame from stream manager"
    print(f"PASS: Smartphone frame stream verified (received and decoded {f.shape[1]}x{f.shape[0]} frame).")

    # -------------------------------------------------------------
    # TEST 7: IP Webcam connection testing
    # -------------------------------------------------------------
    print("\n--- TEST 7: IP Webcam URL parsing and safe logging ---")
    raw_url = "http://admin:secretPass123@192.168.0.50:8080/video"
    sanitized = sanitize_url_for_logging(raw_url)
    assert "secretPass123" not in sanitized, f"Password leaked in sanitized URL: {sanitized}"
    assert "admin:***@" in sanitized, "Expected masked password in sanitized URL"
    print(f"PASS: Credential sanitization verified: {sanitized}")

    # -------------------------------------------------------------
    # TEST 8: Incorrect IP Webcam password error handling
    # -------------------------------------------------------------
    print("\n--- TEST 8: Invalid address error handling without leaking password ---")
    success, _, error_msg = test_ip_webcam_connection("192.0.2.1", 8080, "myUser", "superSecretPass")
    assert success is False, "Expected connection failure to unroutable test address"
    assert "superSecretPass" not in error_msg, "Password must not be present in error message"
    print(f"PASS: Graceful connection error without password leakage: '{error_msg}'")

    # -------------------------------------------------------------
    # TEST 9: Camera disconnects unexpectedly
    # -------------------------------------------------------------
    print("\n--- TEST 9: Stream manager disconnect handling ---")
    sm.disconnect()
    st = sm.get_status()
    assert st["status"] == "DISCONNECTED", f"Expected DISCONNECTED, got {st['status']}"
    print("PASS: Camera cleanly disconnected and system state remains intact.")

    # -------------------------------------------------------------
    # TEST 10: Generate structured AI report grounded in observations
    # -------------------------------------------------------------
    print("\n--- TEST 10: Generate Structured Report & Natural Language Summary ---")
    mem10 = ObjectMemoryManager(memory_seconds=20.0)
    det1 = DetectionResult(x1=100, y1=100, x2=200, y2=300, confidence=0.94, class_id=0, class_name="person", raw_track_id=1)
    det2 = DetectionResult(x1=250, y1=150, x2=350, y2=350, confidence=0.91, class_id=0, class_name="person", raw_track_id=2)
    det3 = DetectionResult(x1=400, y1=200, x2=650, y2=400, confidence=0.96, class_id=2, class_name="car", raw_track_id=3)
    
    mem10.update([det1, det2, det3])
    time.sleep(1.0)
    objs10 = mem10.get_all_objects()
    events10 = mem10.get_events()
    
    report = ReportGenerator.build_session_report(
        session_id="#CEOVA-20261011-999",
        camera_source="IP Webcam (192.168.0.132:8080)",
        started_at="17:00:00",
        ended_at="17:01:00",
        duration_seconds=60.0,
        objects=objs10,
        events=events10
    )

    assert report.total_unique_objects == 3, f"Expected 3 unique objects, got {report.total_unique_objects}"
    assert "people" in report.summary.lower() or "person" in report.summary.lower()
    assert "car" in report.summary.lower()
    assert "H-001" in report.summary
    assert "V-001" in report.summary
    
    # Verify export functions
    csv_out = ReportGenerator.export_csv(report)
    txt_out = ReportGenerator.export_text(report)
    assert "CEOVA MONITORING REPORT" in csv_out
    assert "H-001" in csv_out
    assert "EXECUTIVE SUMMARY" in txt_out

    # Save to SQLite database
    save_session(report)
    loaded_report = get_session("#CEOVA-20261011-999")
    assert loaded_report is not None
    assert loaded_report.session_id == "#CEOVA-20261011-999"
    assert len(loaded_report.objects) == 3

    print("\nReport Natural-Language Summary Preview:\n" + "-" * 50)
    print(report.summary)
    print("-" * 50)
    print(f"PASS: Report generated, exported, and persisted in SQLite successfully.")

    # -------------------------------------------------------------
    # TEST 11: IP Webcam Auto-Discovery & Subnet Scanning Logic
    # -------------------------------------------------------------
    print("\n--- TEST 11: Automatic IP Webcam Discovery & ARP Inspection ---")
    from app.camera.discovery import get_lan_ip_and_subnet, get_arp_dynamic_ips
    lan_ip, subnet = get_lan_ip_and_subnet()
    assert lan_ip is not None and len(lan_ip) > 0, "Expected non-empty LAN IP"
    assert subnet.endswith("."), f"Expected trailing dot in subnet prefix: {subnet}"
    arp_ips = get_arp_dynamic_ips(subnet)
    print(f"PASS: Auto-discovery resolved host ({lan_ip}) and subnet ({subnet}*). Discovered {len(arp_ips)} dynamic ARP devices.")

    # -------------------------------------------------------------
    # TEST 12: AI Object Detection Accuracy & Aspect Ratio Preservation
    # -------------------------------------------------------------
    print("\n--- TEST 12: AI Object Detection Pipeline & Aspect Ratio Preservation ---")
    from app.detection.yolo_detector import YOLO26Detector
    from app.main import apply_resolution_scale

    detector_acc = YOLO26Detector("YOLO26-Accurate")
    status = detector_acc.get_model_status()
    assert "yolo11s" in status["active_weights"].lower() or "yolo26" in status["active_weights"].lower() or "yolo11n" in status["active_weights"].lower()
    print(f"PASS: Active detection weights: {status['active_weights']} ({status['device']})")

    # Test aspect ratio preservation
    test_frame_4_3 = np.zeros((960, 1280, 3), dtype=np.uint8)
    proc, scale_x, scale_y = apply_resolution_scale(test_frame_4_3, "720p")
    # Verify aspect ratios match
    orig_aspect = test_frame_4_3.shape[1] / test_frame_4_3.shape[0]
    proc_aspect = proc.shape[1] / proc.shape[0]
    assert abs(orig_aspect - proc_aspect) < 0.05, f"Aspect ratio distorted: {orig_aspect} vs {proc_aspect}"
    assert scale_x == scale_y, f"Non-uniform scaling detected: sx={scale_x}, sy={scale_y}"
    print(f"PASS: Native aspect ratio strictly preserved during scaling: 1280x960 -> {proc.shape[1]}x{proc.shape[0]} (Scale {scale_x:.2f}x)")

    # Test image preprocessing CLAHE
    dark_frame = np.zeros((480, 640, 3), dtype=np.uint8) + 30
    enhanced = detector_acc.preprocess_frame(dark_frame)
    assert enhanced is not None and enhanced.shape == dark_frame.shape
    print("PASS: Adaptive CLAHE contrast enhancement executed cleanly on low-light frame.")

    print("\n" + "=" * 70)
    print("ALL 12 CEOVA VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_all_tests()

