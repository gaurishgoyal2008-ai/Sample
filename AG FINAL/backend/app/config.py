import os
from pydantic import BaseModel
from typing import List, Dict

# Server & Companion Configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", "5173"))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]

# Database
DB_FILE = os.getenv(
    "DB_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ceova.db")
)

# Default Vision Settings
DEFAULT_CONFIDENCE = float(os.getenv("DEFAULT_CONFIDENCE", "0.28"))
DEFAULT_MEMORY_SECONDS = float(os.getenv("DEFAULT_MEMORY_SECONDS", "20.0"))
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "YOLO26-Accurate")
DEFAULT_RESOLUTION = os.getenv("DEFAULT_RESOLUTION", "720p")

# Camera Discovery Configuration
DISCOVERY_PORTS = [8080, 8081, 4747, 8000, 8082, 8085, 8888, 5000, 80]
DISCOVERY_CONCURRENCY = 60
DISCOVERY_TIMEOUT = float(os.getenv("DISCOVERY_TIMEOUT", "12.0"))

# Target COCO Classes (Expanded for Comprehensive Surveillance & Object Recognition)
ALL_SUPPORTED_CLASSES = [
    # Humans & Vehicles
    "person", "car", "motorcycle", "bicycle", "bus", "truck",
    # Personal Items & Luggage
    "backpack", "handbag", "suitcase", "umbrella",
    # Electronics & Devices
    "laptop", "cell phone", "tv", "remote", "keyboard", "mouse",
    # Everyday Items & Furniture
    "bottle", "cup", "chair", "couch", "potted plant", "dining table", "clock", "book",
    # Animals
    "dog", "cat", "bird", "horse",
    # Outdoor & Traffic
    "traffic light", "fire hydrant", "stop sign"
]

# Prefix Mapping for Persistent Tracking IDs
CLASS_PREFIX_MAP: Dict[str, str] = {
    "person": "H",       # Human
    "car": "V",          # Vehicle
    "motorcycle": "V",
    "bicycle": "V",
    "bus": "V",
    "truck": "V",
    "backpack": "B",     # Bag / Luggage
    "handbag": "B",
    "suitcase": "B",
    "umbrella": "B",
    "laptop": "E",       # Electronic
    "cell phone": "E",
    "tv": "E",
    "remote": "E",
    "keyboard": "E",
    "mouse": "E",
    "dog": "A",          # Animal
    "cat": "A",
    "bird": "A",
    "horse": "A",
    "traffic light": "S", # Safety / Infrastructure
    "fire hydrant": "S",
    "stop sign": "S",
    "bottle": "O",       # Other Objects / Furniture
    "cup": "O",
    "chair": "O",
    "couch": "O",
    "potted plant": "O",
    "dining table": "O",
    "clock": "O",
    "book": "O"
}

def get_class_prefix(class_name: str) -> str:
    """Returns the single-letter prefix for a given object class."""
    return CLASS_PREFIX_MAP.get(class_name.lower(), "O")
