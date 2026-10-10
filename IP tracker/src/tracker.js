/**
 * Object Tracker Engine
 * Implements Centroid + IoU tracking to assign persistent Tracking IDs (e.g., H-001, V-001),
 * log first/last detection timestamps, durations, and analyze movement patterns.
 */

// Category prefix mappings to match user's required naming convention
const CATEGORY_MAP = {
  // Humans
  person: { name: 'Human', prefix: 'H', category: 'Human' },

  // Vehicles
  car: { name: 'Car', prefix: 'V', category: 'Vehicle' },
  truck: { name: 'Truck', prefix: 'V', category: 'Vehicle' },
  bus: { name: 'Bus', prefix: 'V', category: 'Vehicle' },
  motorcycle: { name: 'Motorcycle', prefix: 'V', category: 'Vehicle' },
  bicycle: { name: 'Bicycle', prefix: 'V', category: 'Vehicle' },
  airplane: { name: 'Airplane', prefix: 'V', category: 'Vehicle' },
  boat: { name: 'Boat', prefix: 'V', category: 'Vehicle' },
  train: { name: 'Train', prefix: 'V', category: 'Vehicle' },

  // Animals
  dog: { name: 'Dog', prefix: 'A', category: 'Animal' },
  cat: { name: 'Cat', prefix: 'A', category: 'Animal' },
  bird: { name: 'Bird', prefix: 'A', category: 'Animal' },
  horse: { name: 'Horse', prefix: 'A', category: 'Animal' },
  sheep: { name: 'Sheep', prefix: 'A', category: 'Animal' },
  cow: { name: 'Cow', prefix: 'A', category: 'Animal' },
  elephant: { name: 'Elephant', prefix: 'A', category: 'Animal' },
  bear: { name: 'Bear', prefix: 'A', category: 'Animal' },
  zebra: { name: 'Zebra', prefix: 'A', category: 'Animal' },
  giraffe: { name: 'Giraffe', prefix: 'A', category: 'Animal' },

  // Electronics & Devices
  'cell phone': { name: 'Phone', prefix: 'E', category: 'Electronics' },
  laptop: { name: 'Laptop', prefix: 'E', category: 'Electronics' },
  tv: { name: 'TV / Display', prefix: 'E', category: 'Electronics' },
  mouse: { name: 'Mouse', prefix: 'E', category: 'Electronics' },
  remote: { name: 'Remote', prefix: 'E', category: 'Electronics' },
  keyboard: { name: 'Keyboard', prefix: 'E', category: 'Electronics' },
  microwave: { name: 'Microwave', prefix: 'E', category: 'Electronics' },
  refrigerator: { name: 'Refrigerator', prefix: 'E', category: 'Electronics' },

  // Furniture / Interior
  chair: { name: 'Chair', prefix: 'F', category: 'Furniture' },
  couch: { name: 'Sofa', prefix: 'F', category: 'Furniture' },
  'potted plant': { name: 'Plant', prefix: 'F', category: 'Plant' },
  bed: { name: 'Bed', prefix: 'F', category: 'Furniture' },
  'dining table': { name: 'Table', prefix: 'F', category: 'Furniture' },
  toilet: { name: 'Toilet', prefix: 'F', category: 'Furniture' },

  // Objects & Everyday Items
  bottle: { name: 'Bottle', prefix: 'O', category: 'Object' },
  cup: { name: 'Cup', prefix: 'O', category: 'Object' },
  'wine glass': { name: 'Glass', prefix: 'O', category: 'Object' },
  fork: { name: 'Fork', prefix: 'O', category: 'Object' },
  knife: { name: 'Knife', prefix: 'O', category: 'Object' },
  spoon: { name: 'Spoon', prefix: 'O', category: 'Object' },
  bowl: { name: 'Bowl', prefix: 'O', category: 'Object' },
  backpack: { name: 'Backpack', prefix: 'O', category: 'Object' },
  umbrella: { name: 'Umbrella', prefix: 'O', category: 'Object' },
  handbag: { name: 'Handbag', prefix: 'O', category: 'Object' },
  suitcase: { name: 'Suitcase', prefix: 'O', category: 'Object' },
  book: { name: 'Book', prefix: 'O', category: 'Object' },
  clock: { name: 'Clock', prefix: 'O', category: 'Object' },
  vase: { name: 'Vase', prefix: 'O', category: 'Object' },
  scissors: { name: 'Scissors', prefix: 'O', category: 'Object' }
};

export function getCategoryInfo(rawClass) {
  const normalized = (rawClass || '').toLowerCase().trim();
  if (CATEGORY_MAP[normalized]) {
    return CATEGORY_MAP[normalized];
  }
  // Default fallback for any unrecognized COCO class
  const capitalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return {
    name: capitalized || 'Object',
    prefix: 'O',
    category: 'Object'
  };
}

// Calculate Intersection over Union (IoU) of two bounding boxes [x, y, w, h]
export function calculateIoU(boxA, boxB) {
  const [ax, ay, aw, ah] = boxA;
  const [bx, by, bw, bh] = boxB;

  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);

  const intersectionW = Math.max(0, x2 - x1);
  const intersectionH = Math.max(0, y2 - y1);
  const intersectionArea = intersectionW * intersectionH;

  const areaA = aw * ah;
  const areaB = bw * bh;
  const unionArea = areaA + areaB - intersectionArea;

  if (unionArea <= 0) return 0;
  return intersectionArea / unionArea;
}

// Calculate Euclidean distance between box centroids normalized
export function centroidDistance(boxA, boxB) {
  const cxA = boxA[0] + boxA[2] / 2;
  const cyA = boxA[1] + boxA[3] / 2;
  const cxB = boxB[0] + boxB[2] / 2;
  const cyB = boxB[1] + boxB[3] / 2;
  return Math.hypot(cxA - cxB, cyA - cyB);
}

// Format Date object to HH:MM:SS
export function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

// Format duration in seconds to human readable string (e.g., "13 sec", "1 min 12 sec")
export function formatDuration(durationSeconds) {
  const s = Math.max(1, Math.round(durationSeconds));
  if (s < 60) {
    return `${s} sec`;
  }
  const mins = Math.floor(s / 60);
  const remSec = s % 60;
  return remSec > 0 ? `${mins} min ${remSec} sec` : `${mins} min`;
}

export class ObjectTracker {
  constructor(options = {}) {
    this.iouThreshold = options.iouThreshold || 0.22;
    this.maxDistance = options.maxDistance || 140; // Max centroid pixel distance
    this.maxMissedFrames = options.maxMissedFrames || 25; // ~1.2s at 20fps before marking departed
    this.idCounters = { H: 0, V: 0, A: 0, E: 0, F: 0, O: 0 };
    this.trackedObjects = new Map(); // id -> TrackedObject
    this.onNewObject = options.onNewObject || null;
    this.onObjectDeparted = options.onObjectDeparted || null;
    this.sessionStartTime = new Date();
  }

  reset() {
    this.idCounters = { H: 0, V: 0, A: 0, E: 0, F: 0, O: 0 };
    this.trackedObjects.clear();
    this.sessionStartTime = new Date();
  }

  generateTrackingId(prefix) {
    if (!this.idCounters[prefix]) {
      this.idCounters[prefix] = 0;
    }
    this.idCounters[prefix] += 1;
    const numStr = String(this.idCounters[prefix]).padStart(3, '0');
    return `${prefix}-${numStr}`;
  }

  /**
   * Process a set of detections from a single frame
   * @param {Array} detections - [{ bbox: [x,y,w,h], class: string, score: number }]
   * @param {number} frameWidth - video width
   * @param {number} frameHeight - video height
   * @param {Date} timestamp - current frame time
   */
  update(detections, frameWidth, frameHeight, timestamp = new Date()) {
    const currentTime = timestamp.getTime();
    const activeObjects = Array.from(this.trackedObjects.values()).filter(o => o.status === 'Active');

    // Create a matrix of matches between active tracked objects and new detections
    const matchedTrackIds = new Set();
    const matchedDetectionIndices = new Set();

    // 1. Try matching by IoU + Centroid Distance
    for (let i = 0; i < detections.length; i++) {
      const det = detections[i];
      const categoryInfo = getCategoryInfo(det.class);

      let bestTrack = null;
      let bestScore = -1;

      for (const track of activeObjects) {
        if (matchedTrackIds.has(track.id)) continue;
        // Same category or compatible
        if (track.rawClass !== det.class && track.category !== categoryInfo.category) continue;

        const iou = calculateIoU(track.bbox, det.bbox);
        const dist = centroidDistance(track.bbox, det.bbox);
        // Adaptive distance tolerance based on object size
        const dynamicMaxDist = Math.max(this.maxDistance, Math.max(track.bbox[2], track.bbox[3]) * 1.5);

        // Combined score prioritizing IoU, with distance tolerance
        let score = 0;
        if (iou > this.iouThreshold) {
          score = 1.0 + iou;
        } else if (dist < dynamicMaxDist) {
          score = 0.5 + (1.0 - (dist / dynamicMaxDist)) * 0.5;
        }

        if (score > 0.40 && score > bestScore) {
          bestScore = score;
          bestTrack = track;
        }
      }

      if (bestTrack) {
        matchedTrackIds.add(bestTrack.id);
        matchedDetectionIndices.add(i);

        // Update existing tracked object
        this._updateTrackedObject(bestTrack, det, frameWidth, frameHeight, timestamp);
      }
    }

    // 2. Add unmatched detections as new tracked objects
    for (let i = 0; i < detections.length; i++) {
      if (matchedDetectionIndices.has(i)) continue;

      const det = detections[i];
      // Only instantiate if confidence meets standard threshold
      if (det.score < 0.40) continue;

      const categoryInfo = getCategoryInfo(det.class);
      const trackingId = this.generateTrackingId(categoryInfo.prefix);

      const cx = det.bbox[0] + det.bbox[2] / 2;
      const cy = det.bbox[1] + det.bbox[3] / 2;
      const initialZone = this._getFrameZone(cx, cy, frameWidth, frameHeight);

      const newTrack = {
        id: trackingId,
        rawClass: det.class,
        name: categoryInfo.name,
        category: categoryInfo.category,
        prefix: categoryInfo.prefix,
        status: 'Active',
        firstDetectedDate: timestamp,
        firstDetected: formatTime(timestamp),
        lastDetectedDate: timestamp,
        lastDetected: formatTime(timestamp),
        durationSeconds: 1,
        duration: '1 sec',
        peakConfidence: Math.round(det.score * 100),
        bbox: [...det.bbox],
        previousBbox: [...det.bbox],
        missedFrames: 0,
        trajectory: [{ x: cx, y: cy, time: currentTime }],
        movementSummary: `Entered ${initialZone}`,
        events: [
          {
            time: formatTime(timestamp),
            type: 'ENTRY',
            description: `First detected in ${initialZone} (${Math.round(det.score * 100)}% confidence)`
          }
        ]
      };

      this.trackedObjects.set(trackingId, newTrack);

      if (this.onNewObject) {
        this.onNewObject(newTrack);
      }
    }

    // 3. Handle unmatched active objects (missed frames / departed)
    for (const track of activeObjects) {
      if (!matchedTrackIds.has(track.id)) {
        track.missedFrames += 1;

        if (track.missedFrames >= this.maxMissedFrames) {
          track.status = 'Departed';
          const exitTime = formatTime(track.lastDetectedDate);
          const lastPoint = track.trajectory[track.trajectory.length - 1];
          const exitZone = lastPoint ? this._getFrameZone(lastPoint.x, lastPoint.y, frameWidth, frameHeight) : 'frame';

          track.events.push({
            time: exitTime,
            type: 'EXIT',
            description: `Departed camera view near ${exitZone}`
          });

          // Finalize movement summary
          track.movementSummary = this._synthesizeMovement(track, frameWidth, frameHeight);

          if (this.onObjectDeparted) {
            this.onObjectDeparted(track);
          }
        }
      }
    }

    return Array.from(this.trackedObjects.values());
  }

  _updateTrackedObject(track, det, frameWidth, frameHeight, timestamp) {
    track.missedFrames = 0;
    track.previousBbox = [...track.bbox];
    track.bbox = [...det.bbox];
    track.lastDetectedDate = timestamp;
    track.lastDetected = formatTime(timestamp);

    const confidence = Math.round(det.score * 100);
    if (confidence > track.peakConfidence) {
      track.peakConfidence = confidence;
    }

    const elapsed = (timestamp.getTime() - track.firstDetectedDate.getTime()) / 1000;
    track.durationSeconds = Math.max(1, elapsed);
    track.duration = formatDuration(track.durationSeconds);

    const cx = det.bbox[0] + det.bbox[2] / 2;
    const cy = det.bbox[1] + det.bbox[3] / 2;
    track.trajectory.push({ x: cx, y: cy, time: timestamp.getTime() });

    // Keep trajectory capped to prevent memory leak while preserving full history
    if (track.trajectory.length > 100) {
      track.trajectory.shift();
    }

    // Micro-event analysis
    const prevPoint = track.trajectory[Math.max(0, track.trajectory.length - 6)];
    if (prevPoint && track.trajectory.length % 15 === 0) {
      const dx = cx - prevPoint.x;
      const dy = cy - prevPoint.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 60) {
        let dir = '';
        if (Math.abs(dx) > Math.abs(dy)) {
          dir = dx > 0 ? 'moving East (right)' : 'moving West (left)';
        } else {
          dir = dy > 0 ? 'moving South (down)' : 'moving North (up)';
        }
        track.movementSummary = `Active movement ${dir}`;
      } else if (distance < 10 && track.durationSeconds > 8) {
        track.movementSummary = `Stationary in ${this._getFrameZone(cx, cy, frameWidth, frameHeight)}`;
      }
    }
  }

  _getFrameZone(x, y, w, h) {
    if (!w || !h) return 'view';
    const relX = x / w;
    const relY = y / h;

    let horizontal = 'center';
    if (relX < 0.33) horizontal = 'left';
    else if (relX > 0.66) horizontal = 'right';

    let vertical = 'mid';
    if (relY < 0.33) vertical = 'upper';
    else if (relY > 0.66) vertical = 'lower';

    if (horizontal === 'center' && vertical === 'mid') return 'center of frame';
    return `${vertical}-${horizontal}`;
  }

  _synthesizeMovement(track, w, h) {
    if (!track.trajectory || track.trajectory.length < 2) {
      return 'Briefly visible in view';
    }

    const first = track.trajectory[0];
    const last = track.trajectory[track.trajectory.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const totalDist = Math.hypot(dx, dy);

    if (totalDist < 40) {
      return `Stationary in ${this._getFrameZone(first.x, first.y, w, h)}`;
    }

    const horizDir = dx > 30 ? 'left to right' : (dx < -30 ? 'right to left' : '');
    const vertDir = dy > 30 ? 'top to bottom' : (dy < -30 ? 'bottom to top' : '');

    const parts = [horizDir, vertDir].filter(Boolean);
    const directionStr = parts.join(' and ') || 'across frame';

    return `Traversed ${directionStr} (${Math.round(totalDist)}px displacement)`;
  }

  getAllObjects() {
    return Array.from(this.trackedObjects.values());
  }

  getActiveObjects() {
    return Array.from(this.trackedObjects.values()).filter(o => o.status === 'Active');
  }

  getDepartedObjects() {
    return Array.from(this.trackedObjects.values()).filter(o => o.status === 'Departed');
  }
}
