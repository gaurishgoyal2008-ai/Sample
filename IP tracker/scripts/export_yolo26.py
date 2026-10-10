import os
import sys
from pathlib import Path

def export_model():
    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: ultralytics is not installed. Please run: pip install ultralytics")
        sys.exit(1)

    output_dir = Path(__file__).resolve().parent.parent / "public" / "models"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    onnx_target = output_dir / "yolo26n.onnx"
    print(f"Target ONNX output path: {onnx_target}")

    print("Loading YOLO26 Nano model...")
    try:
        # Load YOLO26 Nano pre-trained model
        model = YOLO("yolo26n.pt")
    except Exception as e:
        print(f"Could not load yolo26n.pt directly ({e}), checking yolo11n / fallback...")
        try:
            model = YOLO("yolo11n.pt")
        except Exception as e2:
            print(f"Fallback error: {e2}")
            raise e

    print("Exporting model to ONNX format (imgsz=640, dynamic=False)...")
    exported_path = model.export(
        format="onnx",
        imgsz=640,
        dynamic=False,
        simplify=True
    )
    print(f"Export finished: {exported_path}")

    # Move or copy exported file to public/models/yolo26n.onnx
    exported_file = Path(exported_path)
    if exported_file.exists():
        import shutil
        shutil.copyfile(exported_file, onnx_target)
        print(f"Successfully placed model at: {onnx_target} ({onnx_target.stat().st_size / (1024*1024):.2f} MB)")
    else:
        print(f"Warning: Expected exported file at {exported_file} not found.")

if __name__ == "__main__":
    export_model()
