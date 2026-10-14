import io
import csv
import json
from datetime import datetime
from typing import List, Dict, Any
from app.models.schemas import MonitoringSessionSchema, TrackedObjectSchema, EventSchema

class ReportGenerator:
    """
    Generates structured AI-style monitoring reports, human-readable natural language
    summaries from actual tracking data, and multi-format exports (JSON, CSV, Plain Text).
    """

    @staticmethod
    def generate_natural_language_summary(
        session_id: str,
        started_at: str,
        ended_at: str,
        duration_seconds: float,
        objects: List[TrackedObjectSchema],
        events: List[EventSchema]
    ) -> str:
        """
        Synthesizes a precise natural language summary grounded strictly in observed telemetry.
        Never hallucinates unobserved events.
        """
        if not objects:
            return (
                f"Monitoring session {session_id} commenced at {started_at} and concluded at {ended_at} "
                f"({int(duration_seconds)}s duration). No tracked physical entities entered the monitored field of view."
            )

        # Categorize unique objects
        category_counts: Dict[str, int] = {}
        for obj in objects:
            cls = obj.object_class.lower()
            category_counts[cls] = category_counts.get(cls, 0) + 1

        total_unique = len(objects)

        # Format category phrase (e.g. "2 people, 1 car, and 1 backpack")
        cat_phrases = []
        for cls, count in category_counts.items():
            if cls == "person":
                word = "person" if count == 1 else "people"
            else:
                word = cls if count == 1 else f"{cls}s"
            cat_phrases.append(f"{count} {word}")

        if len(cat_phrases) == 1:
            category_summary_text = cat_phrases[0]
        elif len(cat_phrases) == 2:
            category_summary_text = f"{cat_phrases[0]} and {cat_phrases[1]}"
        else:
            category_summary_text = ", ".join(cat_phrases[:-1]) + f", and {cat_phrases[-1]}"

        mins = int(duration_seconds // 60)
        secs = int(duration_seconds % 60)
        duration_str = f"{mins}m {secs}s" if mins > 0 else f"{secs} seconds"

        summary_paragraphs = []
        summary_paragraphs.append(
            f"During the monitoring session {session_id} (active for {duration_str} from {started_at} to {ended_at}), "
            f"Ceova identified and independently tracked {total_unique} unique physical entity (entities): {category_summary_text}."
        )

        # Individual object breakdowns
        details = []
        for obj in objects:
            status_text = "left the scene" if obj.status == "LEFT" else "remained active in the scene"
            reapp_text = f" (experienced {obj.reappearance_count} temporary occlusion recovery)" if obj.reappearance_count > 0 else ""
            details.append(
                f"{obj.tracking_id} ({obj.object_class.title()}) was first recorded at {obj.first_seen}, "
                f"remained visible for approximately {int(obj.visible_duration_seconds)} seconds with {int(obj.confidence * 100)}% peak confidence, "
                f"and {status_text} at {obj.last_seen}{reapp_text}."
            )

        summary_paragraphs.append(" ".join(details))

        # Occlusion and memory recovery telemetry
        recovered_events = [e for e in events if e.event_type == "OBJECT_REAPPEARED"]
        if recovered_events:
            summary_paragraphs.append(
                f"Ceova's temporary object memory system successfully maintained identity continuity across "
                f"{len(recovered_events)} temporary loss/occlusion incident(s) without assigning spurious duplicate IDs."
            )

        return "\n\n".join(summary_paragraphs)

    @staticmethod
    def build_session_report(
        session_id: str,
        camera_source: str,
        started_at: str,
        ended_at: str,
        duration_seconds: float,
        objects: List[TrackedObjectSchema],
        events: List[EventSchema]
    ) -> MonitoringSessionSchema:
        category_counts: Dict[str, int] = {}
        for obj in objects:
            cls = obj.object_class.lower()
            category_counts[cls] = category_counts.get(cls, 0) + 1

        summary = ReportGenerator.generate_natural_language_summary(
            session_id, started_at, ended_at, duration_seconds, objects, events
        )

        return MonitoringSessionSchema(
            session_id=session_id,
            camera_source=camera_source,
            started_at=started_at,
            ended_at=ended_at,
            duration_seconds=round(duration_seconds, 1),
            total_unique_objects=len(objects),
            category_counts=category_counts,
            objects=objects,
            events=events,
            summary=summary
        )

    @staticmethod
    def export_csv(report: MonitoringSessionSchema) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Meta info
        writer.writerow(["CEOVA MONITORING REPORT", report.session_id])
        writer.writerow(["Started At", report.started_at, "Ended At", report.ended_at or "Ongoing"])
        writer.writerow(["Duration (seconds)", report.duration_seconds, "Unique Objects", report.total_unique_objects])
        writer.writerow([])
        
        # Tracked objects table
        writer.writerow([
            "Tracking ID", "Object Class", "Status", "First Detected", 
            "Last Detected", "Duration (sec)", "Confidence", "Movement State", "Reappearances"
        ])
        for obj in report.objects:
            writer.writerow([
                obj.tracking_id,
                obj.object_class.title(),
                obj.status,
                obj.first_seen,
                obj.last_seen,
                obj.visible_duration_seconds,
                f"{int(obj.confidence * 100)}%",
                obj.movement_state,
                obj.reappearance_count
            ])
            
        writer.writerow([])
        # Event timeline table
        writer.writerow(["Event ID", "Timestamp", "Event Type", "Tracking ID", "Class", "Description"])
        for ev in report.events:
            writer.writerow([
                ev.event_id,
                ev.timestamp,
                ev.event_type,
                ev.tracking_id or "-",
                ev.object_class or "-",
                ev.description
            ])

        return output.getvalue()

    @staticmethod
    def export_text(report: MonitoringSessionSchema) -> str:
        lines = [
            "==================================================================",
            f" CEOVA AI MONITORING REPORT — {report.session_id}",
            "==================================================================",
            f"Camera Source   : {report.camera_source}",
            f"Session Start   : {report.started_at}",
            f"Session End     : {report.ended_at or 'Ongoing'}",
            f"Duration        : {int(report.duration_seconds)} seconds",
            f"Unique Objects  : {report.total_unique_objects}",
            "------------------------------------------------------------------",
            "EXECUTIVE SUMMARY:",
            report.summary,
            "------------------------------------------------------------------",
            "TRACKED OBJECTS LOG:",
            f"{'ID':<8} {'Class':<12} {'Status':<16} {'First Seen':<12} {'Last Seen':<12} {'Duration':<10} {'Conf':<6}",
            "-" * 80
        ]
        for obj in report.objects:
            lines.append(
                f"{obj.tracking_id:<8} {obj.object_class.title():<12} {obj.status:<16} "
                f"{obj.first_seen:<12} {obj.last_seen:<12} {f'{int(obj.visible_duration_seconds)}s':<10} {f'{int(obj.confidence*100)}%':<6}"
            )

        lines.extend([
            "------------------------------------------------------------------",
            "EVENT TIMELINE:",
            f"{'Timestamp':<10} {'Event Type':<20} {'Target':<10} {'Description'}",
            "-" * 80
        ])
        for ev in report.events:
            lines.append(f"{ev.timestamp:<10} {ev.event_type:<20} {ev.tracking_id or '-':<10} {ev.description}")

        lines.append("==================================================================")
        return "\n".join(lines)
