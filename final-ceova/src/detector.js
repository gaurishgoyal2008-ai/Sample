/**
 * Object Detector Engine
 * Wraps @tensorflow-models/coco-ssd with WebGL acceleration,
 * supports live video, uploaded photos, and interactive synthetic test simulation.
 */

import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

let modelPromise = null;
let loadedModel = null;

export async function loadDetectionModel(onProgress = null) {
  if (loadedModel) return loadedModel;

  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        if (onProgress) onProgress('Initializing WebGL backend...');
        await tf.ready();
        // Prefer WebGL, fallback to CPU if needed
        try {
          await tf.setBackend('webgl');
        } catch (e) {
          console.warn('WebGL failed, using CPU:', e);
          await tf.setBackend('cpu');
        }

        if (onProgress) onProgress('Downloading COCO-SSD neural network weights...');
        // Load lite/mobilenet_v2 for fast mobile execution
        const model = await cocoSsd.load({
          base: 'mobilenet_v2'
        });

        loadedModel = model;
        if (onProgress) onProgress('Detection Model Ready');
        return model;
      } catch (err) {
        console.error('Failed to load COCO-SSD model:', err);
        throw err;
      }
    })();
  }

  return modelPromise;
}

export function isModelLoaded() {
  return !!loadedModel;
}

/**
 * Run detection on an HTMLVideoElement, HTMLImageElement, or HTMLCanvasElement
 */
export async function detectObjects(mediaElement, minScore = 0.40) {
  if (!loadedModel) {
    await loadDetectionModel();
  }

  try {
    const rawPredictions = await loadedModel.detect(mediaElement, 20, minScore);
    // Normalize format
    return rawPredictions.map(p => ({
      bbox: p.bbox, // [x, y, width, height]
      class: p.class,
      score: p.score
    }));
  } catch (err) {
    console.error('Detection frame error:', err);
    return [];
  }
}

/**
 * Synthetic Simulation Engine:
 * Generates realistic animated video feed with synthetic moving objects
 * (Pedestrians, vehicles, items) so users can test full detection & reporting
 * even without a physical camera or when camera permission is denied.
 */
export class SimulationFeed {
  constructor(width = 640, height = 480) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.active = false;
    this.simulatedActors = [];
    this.initDefaultActors();
  }

  initDefaultActors() {
    this.simulatedActors = [
      {
        name: 'Human',
        rawClass: 'person',
        x: 50,
        y: 180,
        w: 90,
        h: 210,
        vx: 1.4,
        vy: 0.1,
        color: '#38bdf8',
        icon: '🚶'
      },
      {
        name: 'Human',
        rawClass: 'person',
        x: 440,
        y: 190,
        w: 80,
        h: 200,
        vx: -1.0,
        vy: 0,
        color: '#a78bfa',
        icon: '🚶‍♀️'
      },
      {
        name: 'Car',
        rawClass: 'car',
        x: -120,
        y: 300,
        w: 160,
        h: 90,
        vx: 2.8,
        vy: 0,
        color: '#f59e0b',
        icon: '🚗'
      },
      {
        name: 'Bottle',
        rawClass: 'bottle',
        x: 290,
        y: 250,
        w: 45,
        h: 110,
        vx: 0,
        vy: 0,
        color: '#34d399',
        icon: '🍾'
      }
    ];
  }

  getCanvas() {
    return this.canvas;
  }

  renderFrame() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Background scene: Stylized city walkway / interior
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.6, '#1e293b');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Grid lines for high-tech camera feed look
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Street / Floor line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 390);
    ctx.lineTo(w, 390);
    ctx.stroke();

    // Table surface for objects
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(260, 340, 110, 50);

    const detections = [];

    // Render simulated objects & update positions
    for (const actor of this.simulatedActors) {
      actor.x += actor.vx;
      actor.y += actor.vy;

      // Wrap around or bounce
      if (actor.vx > 0 && actor.x > w + 40) {
        actor.x = -actor.w - 40;
      } else if (actor.vx < 0 && actor.x < -actor.w - 40) {
        actor.x = w + 40;
      }

      // Check if actor is within visible bounds
      if (actor.x + actor.w > 0 && actor.x < w) {
        // Draw actor visual representation
        ctx.fillStyle = actor.color + '22';
        ctx.strokeStyle = actor.color;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.roundRect(actor.x, actor.y, actor.w, actor.h, 8);
        ctx.fill();
        ctx.stroke();

        // Icon inside
        ctx.font = '36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(actor.icon, actor.x + actor.w / 2, actor.y + actor.h / 2);

        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px "Outfit", sans-serif';
        ctx.fillText(actor.name, actor.x + actor.w / 2, actor.y - 10);

        // Produce a detection item
        detections.push({
          bbox: [actor.x, actor.y, actor.w, actor.h],
          class: actor.rawClass,
          score: 0.91 + Math.sin(Date.now() / 1000) * 0.05
        });
      }
    }

    return detections;
  }
}
