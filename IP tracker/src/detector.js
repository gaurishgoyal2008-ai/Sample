/**
 * Neural Object Detector Engine
 * Supports Next-Gen YOLO26 via ONNX Runtime Web with hardware acceleration (WebGPU / WebGL / WASM),
 * and automatic fallback to TensorFlow.js COCO-SSD, plus synthetic simulation.
 */

import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime Web with high-speed CDN runtimes (keeps repo clean & under 25MB)
if (ort?.env?.wasm) {
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
  ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
}

// 80 Standard COCO Object Classes recognized by YOLO26
export const YOLO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
  'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
  'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
  'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
];

let activeBackend = 'yolo26'; // 'yolo26' | 'coco-ssd'
let yoloSession = null;
let yoloLoadingPromise = null;
let cocoModel = null;
let cocoLoadingPromise = null;

// Reusable preprocessing canvas for 640x640 tensor generation
let preprocCanvas = null;
let preprocCtx = null;

function getPreprocessingContext() {
  if (!preprocCanvas) {
    preprocCanvas = document.createElement('canvas');
    preprocCanvas.width = 640;
    preprocCanvas.height = 640;
    preprocCtx = preprocCanvas.getContext('2d', { willReadFrequently: true });
  }
  return { canvas: preprocCanvas, ctx: preprocCtx };
}

/**
 * Check if the exported YOLO26 ONNX model file exists on server
 */
async function checkYoloModelAvailable() {
  try {
    const res = await fetch('/models/yolo26n.onnx', { method: 'HEAD' });
    return res.ok;
  } catch (e) {
    return false;
  }
}

/**
 * Load YOLO26 model via ONNX Runtime Web
 */
export async function loadYolo26Model(onProgress = null) {
  if (yoloSession) return yoloSession;
  if (yoloLoadingPromise) return yoloLoadingPromise;

  yoloLoadingPromise = (async () => {
    try {
      if (onProgress) onProgress('Initializing YOLO26 Neural Runtime (WebGPU/WebGL)...');
      
      const sessionOptions = {
        executionProviders: ['webgpu', 'webgl', 'wasm'],
        graphOptimizationLevel: 'all'
      };

      if (onProgress) onProgress('Downloading YOLO26 Nano weights (9.5 MB)...');
      yoloSession = await ort.InferenceSession.create('/models/yolo26n.onnx', sessionOptions);
      activeBackend = 'yolo26';
      if (onProgress) onProgress('YOLO26 Neural Engine Ready');
      console.log('✅ YOLO26 Neural Engine initialized successfully with inputs:', yoloSession.inputNames, 'outputs:', yoloSession.outputNames);
      return yoloSession;
    } catch (err) {
      console.warn('YOLO26 model load failed, falling back to COCO-SSD:', err);
      yoloSession = null;
      throw err;
    } finally {
      yoloLoadingPromise = null;
    }
  })();

  return yoloLoadingPromise;
}

/**
 * Load fallback COCO-SSD model via TensorFlow.js
 */
export async function loadCocoModel(onProgress = null) {
  if (cocoModel) return cocoModel;
  if (cocoLoadingPromise) return cocoLoadingPromise;

  cocoLoadingPromise = (async () => {
    try {
      if (onProgress) onProgress('Initializing TFJS WebGL backend...');
      await tf.ready();
      try {
        await tf.setBackend('webgl');
      } catch (e) {
        await tf.setBackend('cpu');
      }

      if (onProgress) onProgress('Loading COCO-SSD MobileNetV2...');
      const model = await cocoSsd.load({ base: 'mobilenet_v2' });
      cocoModel = model;
      if (onProgress) onProgress('COCO-SSD Model Ready');
      return model;
    } catch (err) {
      console.error('Failed to load COCO-SSD model:', err);
      throw err;
    } finally {
      cocoLoadingPromise = null;
    }
  })();

  return cocoLoadingPromise;
}

/**
 * Master model loader: Attempts YOLO26 first; if unavailable, falls back to COCO-SSD
 */
export async function loadDetectionModel(onProgress = null) {
  const yoloAvailable = await checkYoloModelAvailable();

  if (yoloAvailable) {
    try {
      await loadYolo26Model(onProgress);
      activeBackend = 'yolo26';
      return yoloSession;
    } catch (e) {
      console.warn('YOLO26 load encountered error, falling back to COCO-SSD:', e);
    }
  }

  // Fallback to COCO-SSD
  activeBackend = 'coco-ssd';
  const model = await loadCocoModel(onProgress);
  return model;
}

export function isModelLoaded() {
  return !!(yoloSession || cocoModel);
}

export function getActiveBackendInfo() {
  if (yoloSession && activeBackend === 'yolo26') {
    return { id: 'yolo26', name: 'YOLO26 (Neural ONNX)', tier: 'Next-Gen Edge SOTA' };
  }
  return { id: 'coco-ssd', name: 'COCO-SSD (MobileNetV2)', tier: 'Standard TFJS' };
}

/**
 * Transform media element into YOLO26 input tensor:
 * Size: [1, 3, 640, 640] Float32 RGB normalized to [0, 1] (Planar CHW)
 */
function prepareYoloTensor(mediaElement) {
  const { canvas, ctx } = getPreprocessingContext();
  ctx.drawImage(mediaElement, 0, 0, 640, 640);
  const imgData = ctx.getImageData(0, 0, 640, 640);
  const data = imgData.data;

  const numPixels = 640 * 640;
  const floatArr = new Float32Array(3 * numPixels);

  // Planar RGB layout (CHW)
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    floatArr[i] = data[idx] / 255.0;                   // R
    floatArr[numPixels + i] = data[idx + 1] / 255.0;       // G
    floatArr[2 * numPixels + i] = data[idx + 2] / 255.0;   // B
  }

  return new ort.Tensor('float32', floatArr, [1, 3, 640, 640]);
}

/**
 * Calculate Intersection over Union (IoU) of two bounding boxes [x, y, w, h]
 */
function computeIoU(boxA, boxB) {
  const [x1, y1, w1, h1] = boxA;
  const [x2, y2, w2, h2] = boxB;

  const left = Math.max(x1, x2);
  const top = Math.max(y1, y2);
  const right = Math.min(x1 + w1, x2 + w2);
  const bottom = Math.min(y1 + h1, y2 + h2);

  const interW = Math.max(0, right - left);
  const interH = Math.max(0, bottom - top);
  const interArea = interW * interH;

  const unionArea = (w1 * h1) + (w2 * h2) - interArea;
  if (unionArea <= 0) return 0;
  return interArea / unionArea;
}

/**
 * Decode YOLO26 Output Tensor:
 * Supports standard [1, 84, 8400] output and direct NMS [1, 300, 6] output
 */
function decodeYoloDetections(data, minScore, srcW, srcH) {
  // Case A: Direct NMS-free format [1, 300, 6]
  if (data.length <= 1800) {
    const detections = [];
    const totalDetections = Math.min(300, Math.floor(data.length / 6));
    const scaleX = srcW / 640;
    const scaleY = srcH / 640;

    for (let i = 0; i < totalDetections; i++) {
      const offset = i * 6;
      const score = data[offset + 4];
      if (score < minScore) continue;

      const x1 = Math.max(0, data[offset] * scaleX);
      const y1 = Math.max(0, data[offset + 1] * scaleY);
      const x2 = Math.min(srcW, data[offset + 2] * scaleX);
      const y2 = Math.min(srcH, data[offset + 3] * scaleY);
      const w = Math.max(0, x2 - x1);
      const h = Math.max(0, y2 - y1);
      if (w < 4 || h < 4) continue;

      const classId = Math.round(data[offset + 5]);
      detections.push({
        bbox: [x1, y1, w, h],
        class: YOLO_CLASSES[classId] || 'object',
        score: score
      });
    }
    return detections;
  }

  // Case B: Standard YOLO format [1, 84, 8400] (84 rows x 8400 columns)
  const numCandidates = 8400;
  const numClasses = 80;
  const candidates = [];

  const scaleX = srcW / 640;
  const scaleY = srcH / 640;

  for (let c = 0; c < numCandidates; c++) {
    // Find best class prediction for this anchor
    let maxScore = 0;
    let bestClassId = -1;

    for (let cl = 0; cl < numClasses; cl++) {
      const score = data[(4 + cl) * numCandidates + c];
      if (score > maxScore) {
        maxScore = score;
        bestClassId = cl;
      }
    }

    if (maxScore < minScore) continue;

    // Anchor coordinates: [cx, cy, w, h] in 640 space
    const cx = data[0 * numCandidates + c];
    const cy = data[1 * numCandidates + c];
    const w = data[2 * numCandidates + c];
    const h = data[3 * numCandidates + c];

    const x1 = Math.max(0, (cx - w / 2) * scaleX);
    const y1 = Math.max(0, (cy - h / 2) * scaleY);
    const boxW = Math.min(srcW - x1, w * scaleX);
    const boxH = Math.min(srcH - y1, h * scaleY);

    if (boxW < 6 || boxH < 6) continue;

    candidates.push({
      bbox: [x1, y1, boxW, boxH],
      score: maxScore,
      classId: bestClassId,
      class: YOLO_CLASSES[bestClassId] || 'object'
    });
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.score - a.score);

  // Non-Maximum Suppression (NMS)
  const selected = [];
  const iouThreshold = 0.45;

  for (let i = 0; i < candidates.length && selected.length < 30; i++) {
    const cand = candidates[i];
    let suppress = false;

    for (let j = 0; j < selected.length; j++) {
      const sel = selected[j];
      if (cand.classId === sel.classId && computeIoU(cand.bbox, sel.bbox) > iouThreshold) {
        suppress = true;
        break;
      }
    }

    if (!suppress) {
      selected.push(cand);
    }
  }

  return selected;
}

/**
 * Run detection using YOLO26
 */
async function detectWithYolo26(mediaElement, minScore, srcW, srcH) {
  const inputTensor = prepareYoloTensor(mediaElement);
  const inputName = yoloSession.inputNames[0] || 'images';
  const feeds = {};
  feeds[inputName] = inputTensor;

  const results = await yoloSession.run(feeds);
  const outputName = yoloSession.outputNames[0];
  const outputTensor = results[outputName];
  const data = outputTensor.data;

  return decodeYoloDetections(data, minScore, srcW, srcH);
}

/**
 * Master detection function:
 * Automatically uses YOLO26 if active, or COCO-SSD fallback.
 */
export async function detectObjects(mediaElement, minScore = 0.45) {
  if (!isModelLoaded()) {
    await loadDetectionModel();
  }

  // Get source dimensions
  let srcW = mediaElement.videoWidth || mediaElement.naturalWidth || mediaElement.width || 640;
  let srcH = mediaElement.videoHeight || mediaElement.naturalHeight || mediaElement.height || 480;

  // 1. If YOLO26 is active, run YOLO26
  if (activeBackend === 'yolo26' && yoloSession) {
    try {
      return await detectWithYolo26(mediaElement, minScore, srcW, srcH);
    } catch (err) {
      console.warn('YOLO26 inference error, falling back:', err);
    }
  }

  // 2. Fallback to COCO-SSD
  if (!cocoModel) {
    await loadCocoModel();
  }

  try {
    const rawPredictions = await cocoModel.detect(mediaElement, 25, minScore);
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
      { name: 'Human', rawClass: 'person', x: 50, y: 180, w: 90, h: 210, vx: 1.4, vy: 0.1, color: '#38bdf8', icon: '🚶' },
      { name: 'Human', rawClass: 'person', x: 440, y: 190, w: 80, h: 200, vx: -1.0, vy: 0, color: '#a78bfa', icon: '🚶‍♀️' },
      { name: 'Car', rawClass: 'car', x: -120, y: 300, w: 160, h: 90, vx: 2.8, vy: 0, color: '#f59e0b', icon: '🚗' },
      { name: 'Bottle', rawClass: 'bottle', x: 290, y: 250, w: 45, h: 110, vx: 0, vy: 0, color: '#34d399', icon: '🍾' }
    ];
  }

  getCanvas() {
    return this.canvas;
  }

  renderFrame() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.6, '#1e293b');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

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

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 390);
    ctx.lineTo(w, 390);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(260, 340, 110, 50);

    const detections = [];

    for (const actor of this.simulatedActors) {
      actor.x += actor.vx;
      actor.y += actor.vy;

      if (actor.vx > 0 && actor.x > w + 40) {
        actor.x = -actor.w - 40;
      } else if (actor.vx < 0 && actor.x < -actor.w - 40) {
        actor.x = w + 40;
      }

      if (actor.x + actor.w > 0 && actor.x < w) {
        ctx.fillStyle = actor.color + '22';
        ctx.strokeStyle = actor.color;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.roundRect(actor.x, actor.y, actor.w, actor.h, 8);
        ctx.fill();
        ctx.stroke();

        ctx.font = '36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(actor.icon, actor.x + actor.w / 2, actor.y + actor.h / 2);

        ctx.fillStyle = '#ffffff';
        ctx.font = '12px "Outfit", sans-serif';
        ctx.fillText(actor.name, actor.x + actor.w / 2, actor.y - 10);

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
