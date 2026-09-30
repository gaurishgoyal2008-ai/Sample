/**
 * VisionAI Main Application Controller
 * Handles wireless phone camera streaming, neural object detection (COCO-SSD),
 * spatial tracking, AR viewfinder HUD, center targeting pointer, and AI reporting.
 */

// If opened in phone transmitter mode, redirect to dedicated mobile transmitter page
if (window.location.search.includes('mode=phone')) {
  window.location.href = '/phone.html' + window.location.search;
}

import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { jsPDF } from 'jspdf';
import { Peer } from 'peerjs';

import { loadDetectionModel, detectObjects, SimulationFeed, isModelLoaded } from './detector.js';
import { ObjectTracker, formatTime, formatDuration } from './tracker.js';
import {
  generateTextReport,
  generateMarkdownReport,
  generateStructuredJson,
  generateCsvReport,
  generateHeuristicAiSummary,
  generateGeminiAiSummary,
  formatReportDate
} from './reporter.js';
import {
  setSpeechEnabled,
  isSpeechEnabled,
  setSfxEnabled,
  playChime,
  speak
} from './audio.js';

// Application State
const state = {
  mode: 'phone', // 'phone' (default wireless sensor) | 'sim' | 'webcam' | 'upload'
  phoneConnected: false,
  roomId: '',
  peer: null,
  activeCall: null,
  dataConn: null,
  lanIp: '',
  phoneUrl: '',
  videoStream: null, // used only if user explicitly activates laptop webcam
  facingMode: 'environment',
  isDetecting: false,
  fps: 0,
  lastFrameTime: performance.now(),
  lastDetectionTime: 0,
  lastTelemetrySendTime: 0,
  targetedObject: null,
  activeFormatTab: 'visual',
  currentSummaryStyle: 'standard',
  customGeminiKey: '',
  sessionStartTime: new Date(),
  speechActive: false
};

// Subsystems
let tracker = null;
let simFeed = null;

// DOM Elements: Canvas & Video
const videoEl = document.getElementById('camera-video');
const canvasEl = document.getElementById('hud-canvas');
const ctx = canvasEl.getContext('2d');

// Header Telemetry
const clockDisplay = document.getElementById('clock-display');
const fpsDisplay = document.getElementById('fps-display');
const liveIndicator = document.getElementById('live-indicator');
const liveStatusText = document.getElementById('live-status-text');
const liveDot = document.getElementById('live-dot');
const phoneLinkHeaderStatus = document.getElementById('phone-link-header-status');

// Target Card Elements
const reticleCrosshair = document.getElementById('reticle-crosshair');
const targetCard = document.getElementById('target-card');
const targetStatusLabel = document.getElementById('target-status-label');
const targetClassName = document.getElementById('target-class-name');
const targetIdBadge = document.getElementById('target-id-badge');
const targetConfidence = document.getElementById('target-confidence');
const targetDwell = document.getElementById('target-dwell');
const targetMotion = document.getElementById('target-motion');

// Badges & Counters
const trackedBadge = document.getElementById('tracked-badge');
const hudTotalTracked = document.getElementById('hud-total-tracked');
const hudActiveCount = document.getElementById('hud-active-count');
const feedSourceName = document.getElementById('feed-source-name');

// Overlays & Pairing Card
const phonePairingCard = document.getElementById('phone-pairing-card');
const pairingQrCanvas = document.getElementById('pairing-qr-canvas');
const pairingCodeVal = document.getElementById('pairing-code-val');
const pairingUrlInput = document.getElementById('pairing-url-input');
const btnCopyPairingUrl = document.getElementById('btn-copy-pairing-url');
const btnOpenVirtualPhone = document.getElementById('btn-open-virtual-phone');
const btnQuickSim = document.getElementById('btn-quick-sim');
const btnUseLaptopCam = document.getElementById('btn-use-laptop-cam');
const phoneConnectedPill = document.getElementById('phone-connected-pill');
const phoneConnectedText = document.getElementById('phone-connected-text');
const btnManagePhone = document.getElementById('btn-manage-phone');

const overlayMessage = document.getElementById('overlay-message');
const overlayMessageText = document.getElementById('overlay-message-text');
const overlayActions = document.getElementById('overlay-actions');
const reportModal = document.getElementById('report-modal');
const mobileModal = document.getElementById('mobile-modal');
const toastContainer = document.getElementById('toast-container');

// Buttons
const btnFlipCamera = document.getElementById('btn-flip-camera');
const btnToggleSpeech = document.getElementById('btn-toggle-speech');
const btnMobileConnect = document.getElementById('btn-mobile-connect');
const btnOpenReport = document.getElementById('btn-open-report');
const btnGenerateReportCta = document.getElementById('btn-generate-report-cta');
const btnCloseReport = document.getElementById('btn-close-report');
const btnCloseMobileModal = document.getElementById('btn-close-mobile-modal');
const btnResetSession = document.getElementById('btn-reset-session');
const btnSnapshot = document.getElementById('btn-snapshot');
const btnCopyReport = document.getElementById('btn-copy-report');
const btnDownloadReport = document.getElementById('btn-download-report');
const btnPrintReport = document.getElementById('btn-print-report');
const btnRequestCam = document.getElementById('btn-request-cam');
const btnFallbackSim = document.getElementById('btn-fallback-sim');
const btnCopyUrl = document.getElementById('btn-copy-url');
const imageUploadInput = document.getElementById('image-upload-input');

// Mode Tabs
const tabModePhone = document.getElementById('tab-mode-phone');
const tabModeSim = document.getElementById('tab-mode-sim');
const tabModeWebcam = document.getElementById('tab-mode-webcam');
const tabModeUpload = document.getElementById('tab-mode-upload');

// Format Tabs
const formatTabs = {
  visual: document.getElementById('tab-format-visual'),
  text: document.getElementById('tab-format-text'),
  markdown: document.getElementById('tab-format-markdown'),
  json: document.getElementById('tab-format-json'),
  csv: document.getElementById('tab-format-csv')
};

const formatViews = {
  visual: document.getElementById('view-format-visual'),
  text: document.getElementById('view-format-text'),
  markdown: document.getElementById('view-format-markdown'),
  json: document.getElementById('view-format-json'),
  csv: document.getElementById('view-format-csv')
};

// KPI Displays
const kpiTotal = document.getElementById('kpi-total');
const kpiActive = document.getElementById('kpi-active');
const kpiDeparted = document.getElementById('kpi-departed');
const kpiAvgDuration = document.getElementById('kpi-avg-duration');
const visualTableBody = document.getElementById('visual-table-body');
const visualAiSummaryText = document.getElementById('visual-ai-summary-text');
const textReportOutput = document.getElementById('text-report-output');
const markdownReportOutput = document.getElementById('markdown-report-output');
const jsonReportOutput = document.getElementById('json-report-output');
const csvReportOutput = document.getElementById('csv-report-output');
const summaryStyleSelect = document.getElementById('summary-style-select');
const btnSpeakSummary = document.getElementById('btn-speak-summary');
const btnToggleGeminiInput = document.getElementById('btn-toggle-gemini-input');
const geminiKeyContainer = document.getElementById('gemini-key-container');
const geminiApiKeyInput = document.getElementById('gemini-api-key');
const btnApplyGemini = document.getElementById('btn-apply-gemini');

// Initialize Tracker
tracker = new ObjectTracker({
  onNewObject: (obj) => {
    playChime('detect');
    showToast(`New object detected: ${obj.name} (${obj.id})`);
    if (state.speechActive) {
      speak(`${obj.name} detected`);
    }
    updateCounters();
  },
  onObjectDeparted: (obj) => {
    playChime('depart');
    updateCounters();
  }
});

// Initialize Simulation Feed
simFeed = new SimulationFeed(640, 480);

/**
 * Toast Notification Helper
 */
function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>ℹ️</span> <span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

/**
 * Clock & Telemetry Loop
 */
function updateClock() {
  const now = new Date();
  clockDisplay.textContent = formatTime(now);
  const titleEl = document.getElementById('report-modal-title');
  if (titleEl) {
    titleEl.textContent = `Camera Report — ${formatReportDate(now)}`;
  }
}
setInterval(updateClock, 1000);
updateClock();

/**
 * Room ID Generator / Loader
 */
function getOrInitRoomId() {
  const params = new URLSearchParams(window.location.search);
  let room = params.get('room') || params.get('session');
  if (!room) {
    room = localStorage.getItem('visionai_room_id');
  }
  if (!room || room.length < 3) {
    // Generate clean alphanumeric pairing code e.g. V-7842
    const num = Math.floor(1000 + Math.random() * 9000);
    room = `V-${num}`;
  }
  localStorage.setItem('visionai_room_id', room);
  return room;
}

/**
 * Fetch LAN IPs from Vite server middleware
 */
async function detectLanIp() {
  try {
    const res = await fetch('/api/network-ip');
    if (res.ok) {
      const data = await res.json();
      if (data.ips && data.ips.length > 0) {
        // Prefer Wi-Fi or first non-internal IPv4
        const wifi = data.ips.find(i => /wi-?fi|wlan/i.test(i.name));
        return wifi ? wifi.address : data.ips[0].address;
      }
    }
  } catch (e) {
    console.warn('Network IP query not available:', e);
  }
  return window.location.hostname;
}

/**
 * Initialize Phone Camera Receiver (WebRTC PeerJS)
 */
async function initPhoneReceiver() {
  state.roomId = getOrInitRoomId();
  pairingCodeVal.textContent = state.roomId;

  // Detect network address for the phone URL
  const lanIp = await detectLanIp();
  state.lanIp = lanIp;

  let host = window.location.host;
  // If running on localhost/127.0.0.1, use LAN IP so phone can actually reach laptop
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const port = window.location.port ? `:${window.location.port}` : '';
    host = `${lanIp}${port}`;
  }

  state.phoneUrl = `${window.location.protocol}//${host}/phone.html?room=${state.roomId}`;
  pairingUrlInput.value = state.phoneUrl;
  const lanUrlInput = document.getElementById('lan-url-input');
  if (lanUrlInput) lanUrlInput.value = state.phoneUrl;

  // Generate QR Code on pairing card
  if (pairingQrCanvas) {
    QRCode.toCanvas(pairingQrCanvas, state.phoneUrl, {
      width: 170,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  }

  // Also render in mobile modal
  const qrCanvas = document.getElementById('qr-canvas');
  if (qrCanvas) {
    QRCode.toCanvas(qrCanvas, state.phoneUrl, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  }

  // Setup PeerJS instance
  if (state.peer) {
    try { state.peer.destroy(); } catch (e) {}
  }

  const peer = new Peer(state.roomId, {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    }
  });

  state.peer = peer;

  peer.on('open', (id) => {
    console.log(`[Laptop Command Center] Ready. Room ID: ${id}`);
    updatePhoneStatusUI(false);
  });

  // Handle incoming video stream from phone camera
  peer.on('call', (call) => {
    console.log('[Laptop Command Center] Incoming phone camera stream call...');
    state.activeCall = call;
    call.answer(); // Answer without transmitting laptop video

    call.on('stream', (remoteStream) => {
      console.log('[Laptop Command Center] Received live phone video stream!', remoteStream);
      attachPhoneStream(remoteStream);
    });

    call.on('close', () => {
      console.log('[Laptop Command Center] Phone stream closed');
      detachPhoneStream();
    });

    call.on('error', (err) => {
      console.error('Call stream error:', err);
      detachPhoneStream();
    });
  });

  // Handle incoming bi-directional data channel
  peer.on('connection', (conn) => {
    console.log('[Laptop Command Center] Phone data channel linked!');
    state.dataConn = conn;

    conn.on('open', () => {
      conn.send({ type: 'STATUS', text: 'Connected to Laptop Command Center' });
    });

    conn.on('data', (data) => {
      if (data.type === 'PHONE_INFO') {
        showToast(`📱 Phone Sensor Linked: ${data.sensor} (${data.quality})`);
      }
    });

    conn.on('close', () => {
      state.dataConn = null;
    });
  });

  peer.on('error', (err) => {
    console.warn('[Laptop Command Center] PeerJS notice:', err);
    if (err.type === 'unavailable-id') {
      // If room ID was in use from previous tab, append random digit
      state.roomId = `V-${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem('visionai_room_id', state.roomId);
      setTimeout(initPhoneReceiver, 1000);
    }
  });
}

/**
 * Attach Phone Stream to Video Element & Viewfinder
 */
function attachPhoneStream(stream) {
  state.phoneConnected = true;
  videoEl.srcObject = stream;
  videoEl.play().catch(e => console.warn('Video play error:', e));

  // Hide pairing card and show connected badge
  phonePairingCard.style.display = 'none';
  phoneConnectedPill.style.display = 'flex';
  phoneConnectedText.textContent = 'PHONE CAMERA STREAMING (1080p)';

  // Update Telemetry Header
  updatePhoneStatusUI(true);
  feedSourceName.textContent = 'PHONE SENSOR (REMOTE)';

  playChime('detect');
  showToast('📱 Phone camera connected! Live video feed streaming to laptop.');
}

/**
 * Detach Phone Stream
 */
function detachPhoneStream() {
  state.phoneConnected = false;
  videoEl.srcObject = null;
  phoneConnectedPill.style.display = 'none';

  if (state.mode === 'phone') {
    phonePairingCard.style.display = 'flex';
  }

  updatePhoneStatusUI(false);
  showToast('Phone camera disconnected. Waiting for reconnect...');
}

/**
 * Update Header Status Indicators
 */
function updatePhoneStatusUI(connected) {
  if (state.mode !== 'phone') return;

  if (connected) {
    liveStatusText.textContent = 'PHONE: LIVE (1080p)';
    if (liveDot) liveDot.style.background = 'var(--emerald-400)';
    liveIndicator.className = 'telemetry-pill live-pill';
    phoneLinkHeaderStatus.textContent = 'LINKED';
    phoneLinkHeaderStatus.className = 'phone-link-status-badge connected';
  } else {
    liveStatusText.textContent = 'PHONE: WAITING...';
    if (liveDot) liveDot.style.background = 'var(--amber-400)';
    liveIndicator.className = 'telemetry-pill live-pill waiting';
    phoneLinkHeaderStatus.textContent = 'WAITING';
    phoneLinkHeaderStatus.className = 'phone-link-status-badge';
  }
}

/**
 * Laptop Webcam Support (Optional fallback mode)
 */
async function startWebcam() {
  stopWebcam();
  showOverlayMessage('Accessing laptop webcam sensor...', false);

  try {
    const constraints = {
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.videoStream = stream;
    videoEl.srcObject = stream;
    await videoEl.play();

    hideOverlayMessage();
    feedSourceName.textContent = 'LAPTOP WEBCAM';
    liveStatusText.textContent = 'LAPTOP WEBCAM';
    liveIndicator.className = 'telemetry-pill live-pill';
    showToast('Connected to laptop webcam');
  } catch (err) {
    console.warn('Laptop webcam access failed:', err);
    showOverlayMessage(
      `Webcam unavailable: ${err.message || 'Error'}. Use Phone Camera or Simulation mode.`,
      true
    );
  }
}

function stopWebcam() {
  if (state.videoStream) {
    state.videoStream.getTracks().forEach(t => t.stop());
    state.videoStream = null;
  }
  if (state.mode !== 'phone' || !state.phoneConnected) {
    videoEl.srcObject = null;
  }
}

function showOverlayMessage(msg, showActions = false) {
  overlayMessage.style.display = 'flex';
  overlayMessageText.textContent = msg;
  overlayActions.style.display = showActions ? 'flex' : 'none';
}

function hideOverlayMessage() {
  overlayMessage.style.display = 'none';
}

/**
 * Mode Switcher Controller
 */
function setMode(newMode) {
  state.mode = newMode;
  hideOverlayMessage();

  // Reset Tab Highlights
  [tabModePhone, tabModeSim, tabModeWebcam, tabModeUpload].forEach(t => {
    if (t) t.classList.remove('active');
  });

  if (newMode === 'phone') {
    tabModePhone.classList.add('active');
    stopWebcam();
    feedSourceName.textContent = 'PHONE SENSOR (REMOTE)';
    updatePhoneStatusUI(state.phoneConnected);

    if (state.phoneConnected) {
      phonePairingCard.style.display = 'none';
      phoneConnectedPill.style.display = 'flex';
    } else {
      phonePairingCard.style.display = 'flex';
      phoneConnectedPill.style.display = 'none';
    }
  } else if (newMode === 'sim') {
    tabModeSim.classList.add('active');
    stopWebcam();
    phonePairingCard.style.display = 'none';
    phoneConnectedPill.style.display = 'none';
    feedSourceName.textContent = 'SIMULATED FEED';
    liveStatusText.textContent = 'SIMULATION';
    liveIndicator.className = 'telemetry-pill live-pill';
    if (liveDot) liveDot.style.background = 'var(--cyan-400)';
    showToast('Simulation feed activated (Simulated Pedestrians, Vehicles, Objects)');
  } else if (newMode === 'webcam') {
    tabModeWebcam.classList.add('active');
    phonePairingCard.style.display = 'none';
    phoneConnectedPill.style.display = 'none';
    startWebcam();
  } else if (newMode === 'upload') {
    tabModeUpload.classList.add('active');
    phonePairingCard.style.display = 'none';
    phoneConnectedPill.style.display = 'none';
    stopWebcam();
  }
}

/**
 * Draw Futuristic Cyber Grid on Canvas when Waiting for Phone
 */
function renderCyberGrid(w, h, now) {
  // Deep ambient gradient
  const grad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, '#0d1627');
  grad.addColorStop(0.6, '#070a12');
  grad.addColorStop(1, '#030508');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // High-tech scanning grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 1;
  const gridSize = 48;
  const timeOffset = (now * 0.015) % gridSize;

  for (let x = 0; x < w; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = timeOffset; y < h; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Soft radar sweep line
  const sweepY = (now * 0.08) % (h + 100) - 50;
  const sweepGrad = ctx.createLinearGradient(0, sweepY - 40, 0, sweepY + 40);
  sweepGrad.addColorStop(0, 'transparent');
  sweepGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.12)');
  sweepGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = sweepGrad;
  ctx.fillRect(0, sweepY - 40, w, 80);
}

/**
 * Main Detection and Render Loop
 */
async function runLoop(now) {
  // Compute FPS
  const delta = (now - state.lastFrameTime) / 1000;
  state.lastFrameTime = now;
  if (delta > 0) {
    state.fps = Math.round(1 / delta);
    fpsDisplay.textContent = `${state.fps} FPS`;
  }

  // Adjust canvas buffer to match display dimensions
  const rect = canvasEl.getBoundingClientRect();
  const displayW = Math.round(rect.width) || 640;
  const displayH = Math.round(rect.height) || 480;

  if (canvasEl.width !== displayW || canvasEl.height !== displayH) {
    canvasEl.width = displayW;
    canvasEl.height = displayH;
  }

  // Clear canvas
  ctx.clearRect(0, 0, displayW, displayH);

  // Determine media element and source dimensions
  let sourceEl = null;
  let srcW = 640;
  let srcH = 480;

  if (state.mode === 'phone') {
    if (state.phoneConnected && videoEl.readyState >= 2) {
      sourceEl = videoEl;
      srcW = videoEl.videoWidth || 640;
      srcH = videoEl.videoHeight || 480;
    } else {
      // Phone is not streaming yet: render background cyber grid
      renderCyberGrid(displayW, displayH, now);
    }
  } else if (state.mode === 'webcam' && videoEl.readyState >= 2) {
    sourceEl = videoEl;
    srcW = videoEl.videoWidth || 640;
    srcH = videoEl.videoHeight || 480;
  } else if (state.mode === 'sim') {
    sourceEl = simFeed.getCanvas();
    srcW = simFeed.width;
    srcH = simFeed.height;
  }

  if (sourceEl) {
    // Draw background video/simulation frame scaled to fill canvas (cover)
    const scale = Math.max(displayW / srcW, displayH / srcH);
    const renderW = srcW * scale;
    const renderH = srcH * scale;
    const offsetX = (displayW - renderW) / 2;
    const offsetY = (displayH - renderH) / 2;

    ctx.drawImage(sourceEl, offsetX, offsetY, renderW, renderH);

    // Periodically run neural detection (~20 FPS)
    if (isModelLoaded() && (now - state.lastDetectionTime > 45)) {
      state.lastDetectionTime = now;
      let rawDetections = [];

      if (state.mode === 'sim') {
        rawDetections = simFeed.renderFrame();
      } else {
        rawDetections = await detectObjects(sourceEl, 0.40);
      }

      // Map bounding boxes from source resolution to canvas display resolution
      const mappedDetections = rawDetections.map(d => {
        const [x, y, w, h] = d.bbox;
        return {
          ...d,
          bbox: [
            offsetX + x * scale,
            offsetY + y * scale,
            w * scale,
            h * scale
          ]
        };
      });

      // Update spatial tracker
      tracker.update(mappedDetections, displayW, displayH, new Date());
      updateCounters();

      // Relay telemetry back to phone over WebRTC data channel
      if (state.dataConn && state.dataConn.open && (now - state.lastTelemetrySendTime > 350)) {
        state.lastTelemetrySendTime = now;
        const activeObjs = tracker.getActiveObjects();
        const topObj = state.targetedObject || activeObjs[0];
        try {
          state.dataConn.send({
            type: 'AI_TELEMETRY',
            activeCount: activeObjs.length,
            targetClass: topObj ? topObj.name : null,
            targetScore: topObj ? (topObj.peakConfidence / 100) : null,
            targetDwell: topObj ? topObj.duration : null
          });
        } catch (e) {
          // ignore channel errors
        }
      }
    }

    // Render AR HUD Overlays on canvas
    renderHudElements(displayW, displayH);
  }

  requestAnimationFrame(runLoop);
}

/**
 * Render Holographic AR Overlays
 */
function renderHudElements(cw, ch) {
  const objects = tracker.getAllObjects();
  const centerPoint = { x: cw / 2, y: ch / 2 };

  let closestObjectToCenter = null;
  let minDistanceToCenter = Infinity;

  // Draw active objects
  for (const obj of objects) {
    if (obj.status !== 'Active') continue;

    const [bx, by, bw, bh] = obj.bbox;
    const cx = bx + bw / 2;
    const cy = by + bh / 2;

    // Calculate distance to central reticle
    const distToCenter = Math.hypot(cx - centerPoint.x, cy - centerPoint.y);
    const containsCenter = (centerPoint.x >= bx && centerPoint.x <= bx + bw && centerPoint.y >= by && centerPoint.y <= by + bh);

    if (containsCenter || distToCenter < 120) {
      if (distToCenter < minDistanceToCenter) {
        minDistanceToCenter = distToCenter;
        closestObjectToCenter = obj;
      }
    }

    // Accent colors based on category
    let color = '#38bdf8'; // Cyan
    if (obj.category === 'Human') color = '#34d399'; // Emerald
    if (obj.category === 'Vehicle') color = '#f59e0b'; // Amber
    if (obj.category === 'Animal') color = '#a78bfa'; // Violet
    if (obj.category === 'Electronics') color = '#38bdf8'; // Cyan

    const isTargeted = (closestObjectToCenter && closestObjectToCenter.id === obj.id);

    // 1. Draw motion trajectory trail
    if (obj.trajectory && obj.trajectory.length > 1) {
      ctx.beginPath();
      ctx.moveTo(obj.trajectory[0].x, obj.trajectory[0].y);
      for (let i = 1; i < obj.trajectory.length; i++) {
        ctx.lineTo(obj.trajectory[i].x, obj.trajectory[i].y);
      }
      ctx.strokeStyle = color + '55';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. Draw Holographic HUD Box Brackets (Cyberpunk corner brackets)
    const bracketLen = Math.min(22, bw / 3, bh / 3);
    ctx.strokeStyle = color;
    ctx.lineWidth = isTargeted ? 3.5 : 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = isTargeted ? 14 : 6;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(bx, by + bracketLen);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + bracketLen, by);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(bx + bw - bracketLen, by);
    ctx.lineTo(bx + bw, by);
    ctx.lineTo(bx + bw, by + bracketLen);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(bx, by + bh - bracketLen);
    ctx.lineTo(bx, by + bh);
    ctx.lineTo(bx + bracketLen, by + bh);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(bx + bw - bracketLen, by + bh);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw, by + bh - bracketLen);
    ctx.stroke();

    // Soft tinted fill
    ctx.fillStyle = color + (isTargeted ? '25' : '10');
    ctx.fillRect(bx, by, bw, bh);

    ctx.shadowBlur = 0; // reset shadow

    // 3. Floating Tag: [Tracking ID] Object Name · Confidence%
    const tagText = `[${obj.id}] ${obj.name} · ${obj.peakConfidence}%`;
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    const textWidth = ctx.measureText(tagText).width;
    const tagPad = 6;
    const tagH = 22;

    // Tag background pill
    ctx.fillStyle = 'rgba(10, 15, 26, 0.88)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, Math.max(6, by - tagH - 4), textWidth + tagPad * 2, tagH, 4);
    ctx.fill();
    ctx.stroke();

    // Tag text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tagText, bx + tagPad, Math.max(20, by - 10));

    // 4. Live Dwell Time Pill on bottom of box
    const dwellText = `⏱️ ${obj.duration}`;
    ctx.font = '11px "JetBrains Mono", monospace';
    const dwellWidth = ctx.measureText(dwellText).width;

    ctx.fillStyle = 'rgba(10, 15, 26, 0.85)';
    ctx.beginPath();
    ctx.roundRect(bx, by + bh + 4, dwellWidth + 12, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(dwellText, bx + 6, by + bh + 17);
  }

  // Update Center Reticle State
  updateCenterTargeting(closestObjectToCenter);
}

/**
 * Handle Center Reticle Targeting Pointer
 * When user points their phone camera at an object, this updates the targeting UI
 */
function updateCenterTargeting(target) {
  if (target) {
    if (!state.targetedObject || state.targetedObject.id !== target.id) {
      playChime('target');
      if (state.speechActive) {
        speak(`Aimed at ${target.name}`);
      }
    }
    state.targetedObject = target;

    reticleCrosshair.classList.add('locked');
    targetCard.classList.add('locked');
    targetStatusLabel.textContent = `🎯 TARGET ACQUIRED (${target.category.toUpperCase()})`;
    targetClassName.textContent = target.name;
    targetIdBadge.textContent = `ID: ${target.id}`;
    targetConfidence.textContent = `${target.peakConfidence}% Match`;
    targetDwell.textContent = `Dwell: ${target.duration}`;
    targetMotion.textContent = target.movementSummary || 'Tracking';
  } else {
    state.targetedObject = null;
    reticleCrosshair.classList.remove('locked');
    targetCard.classList.remove('locked');
    targetStatusLabel.textContent = 'POINTING AT TARGET';
    targetClassName.textContent = 'Aim phone camera at object';
    targetIdBadge.textContent = 'ID: --';
    targetConfidence.textContent = 'Ready';
    targetDwell.textContent = 'Dwell: 0s';
    targetMotion.textContent = 'Aim center';
  }
}

/**
 * Update HUD Badges & Counts
 */
function updateCounters() {
  const all = tracker.getAllObjects();
  const active = tracker.getActiveObjects();

  trackedBadge.textContent = all.length;
  hudTotalTracked.textContent = all.length;
  hudActiveCount.textContent = active.length;
}

/**
 * Open and Populate the AI Observation Report Modal
 */
function openReportModal() {
  const allObjects = tracker.getAllObjects();
  const activeObjects = tracker.getActiveObjects();
  const departedObjects = tracker.getDepartedObjects();

  // 1. Update KPI Ribbon
  kpiTotal.textContent = allObjects.length;
  kpiActive.textContent = activeObjects.length;
  kpiDeparted.textContent = departedObjects.length;

  let totalDurationSec = 0;
  allObjects.forEach(o => { totalDurationSec += (o.durationSeconds || 1); });
  const avgSec = allObjects.length > 0 ? Math.round(totalDurationSec / allObjects.length) : 0;
  kpiAvgDuration.textContent = formatDuration(avgSec);

  // 2. Populate Visual Table
  visualTableBody.innerHTML = '';
  if (allObjects.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `<td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No objects have been detected in this session yet. Connect your phone camera or switch to Simulation mode!</td>`;
    visualTableBody.appendChild(emptyRow);
  } else {
    allObjects.forEach(obj => {
      const tr = document.createElement('tr');
      const statusClass = obj.status === 'Active' ? 'active' : 'departed';
      const statusIcon = obj.status === 'Active' ? '🟢' : '⚪';

      tr.innerHTML = `
        <td><strong>${obj.name}</strong></td>
        <td class="td-id">${obj.id}</td>
        <td class="td-time">${obj.firstDetected}</td>
        <td class="td-time">${obj.lastDetected}</td>
        <td class="td-duration"><strong>${obj.duration}</strong></td>
        <td>
          <span class="status-badge ${statusClass}">
            ${statusIcon} ${obj.status}
          </span>
        </td>
        <td style="color: var(--text-secondary); font-size: 0.8rem;">
          ${obj.movementSummary || 'In frame'}
        </td>
      `;
      visualTableBody.appendChild(tr);
    });
  }

  // 3. Generate Reports in all formats
  refreshReportFormats();

  // Show modal
  reportModal.style.display = 'flex';

  // Confetti effect if objects were detected
  if (allObjects.length > 0) {
    try {
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.7 }
      });
    } catch (e) {}
  }
}

/**
 * Regenerate Text, Markdown, JSON, CSV, and AI Summary
 */
function refreshReportFormats() {
  const allObjects = tracker.getAllObjects();
  const summary = generateHeuristicAiSummary(allObjects, {}, state.currentSummaryStyle);

  // Visual Tab AI Summary
  visualAiSummaryText.textContent = summary;

  // Text Report (Exact user format)
  textReportOutput.textContent = generateTextReport(allObjects, new Date(), summary, state.currentSummaryStyle);

  // Markdown Report
  markdownReportOutput.textContent = generateMarkdownReport(allObjects, new Date(), summary, state.currentSummaryStyle);

  // JSON Report
  const jsonReport = generateStructuredJson(allObjects, new Date(), summary, {
    startTime: state.sessionStartTime
  });
  jsonReportOutput.textContent = JSON.stringify(jsonReport, null, 2);

  // CSV Report
  csvReportOutput.textContent = generateCsvReport(allObjects, new Date());
}

/**
 * Switch Active Format Tab in Report Modal
 */
function setFormatTab(tabKey) {
  state.activeFormatTab = tabKey;
  Object.keys(formatTabs).forEach(k => {
    formatTabs[k].classList.toggle('active', k === tabKey);
    formatViews[k].classList.toggle('active', k === tabKey);
  });
}

/**
 * Setup Event Listeners
 */
function initEvents() {
  // Mode switcher tabs
  tabModePhone.addEventListener('click', () => setMode('phone'));
  tabModeSim.addEventListener('click', () => setMode('sim'));
  tabModeWebcam.addEventListener('click', () => setMode('webcam'));
  tabModeUpload.addEventListener('click', () => {
    imageUploadInput.click();
  });

  // Pairing Card Actions
  btnCopyPairingUrl.addEventListener('click', () => {
    navigator.clipboard.writeText(pairingUrlInput.value);
    showToast('📱 Phone Camera Link copied to clipboard!');
  });

  btnOpenVirtualPhone.addEventListener('click', () => {
    window.open(state.phoneUrl, 'VirtualPhone', 'width=420,height=820,menubar=no,toolbar=no');
    showToast('Opening virtual phone transmitter window for side-by-side test!');
  });

  btnQuickSim.addEventListener('click', () => {
    setMode('sim');
  });

  btnUseLaptopCam.addEventListener('click', () => {
    setMode('webcam');
  });

  btnManagePhone.addEventListener('click', () => {
    phonePairingCard.style.display = phonePairingCard.style.display === 'none' ? 'flex' : 'none';
  });

  // Upload handler
  imageUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMode('upload');
    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        showToast('Analyzing uploaded photo...');
        const rect = canvasEl.getBoundingClientRect();
        canvasEl.width = rect.width;
        canvasEl.height = rect.height;

        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);

        const detections = await detectObjects(img, 0.35);
        tracker.update(detections, canvasEl.width, canvasEl.height, new Date());
        updateCounters();
        showToast(`Detected ${detections.length} objects from uploaded photo!`);
        openReportModal();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Flip Camera
  btnFlipCamera.addEventListener('click', () => {
    state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
    if (state.mode === 'webcam') {
      startWebcam();
    } else if (state.mode === 'phone' && state.dataConn && state.dataConn.open) {
      showToast('Sending flip request to phone...');
    }
  });

  // Toggle Speech
  btnToggleSpeech.addEventListener('click', () => {
    state.speechActive = !state.speechActive;
    setSpeechEnabled(state.speechActive);
    btnToggleSpeech.classList.toggle('active', state.speechActive);
    showToast(state.speechActive ? 'Voice narration enabled' : 'Voice narration muted');
  });

  // Open & Close Report
  btnOpenReport.addEventListener('click', openReportModal);
  btnGenerateReportCta.addEventListener('click', openReportModal);
  btnCloseReport.addEventListener('click', () => {
    reportModal.style.display = 'none';
  });

  // Reset Session
  btnResetSession.addEventListener('click', () => {
    if (confirm('Start a fresh session? This will clear all tracked objects.')) {
      tracker.reset();
      state.sessionStartTime = new Date();
      updateCounters();
      showToast('Session reset. Ready for new observations.');
    }
  });

  // Snapshot
  btnSnapshot.addEventListener('click', () => {
    playChime('detect');
    const link = document.createElement('a');
    link.download = `VisionAI_Snapshot_${Date.now()}.png`;
    link.href = canvasEl.toDataURL('image/png');
    link.click();
    showToast('AR Viewfinder snapshot saved!');
  });

  // Mobile Connect QR Modal in Header
  btnMobileConnect.addEventListener('click', () => {
    if (state.mode === 'phone') {
      phonePairingCard.style.display = 'flex';
    } else {
      mobileModal.style.display = 'flex';
      const lanInput = document.getElementById('lan-url-input');
      lanInput.value = state.phoneUrl;
    }
  });

  btnCloseMobileModal.addEventListener('click', () => {
    mobileModal.style.display = 'none';
  });

  btnCopyUrl.addEventListener('click', () => {
    const input = document.getElementById('lan-url-input');
    navigator.clipboard.writeText(input.value);
    showToast('LAN Camera URL copied!');
  });

  // Format Tabs
  Object.keys(formatTabs).forEach(k => {
    formatTabs[k].addEventListener('click', () => setFormatTab(k));
  });

  // Summary Style Selection
  summaryStyleSelect.addEventListener('change', (e) => {
    state.currentSummaryStyle = e.target.value;
    refreshReportFormats();
  });

  // Speak AI Summary Button
  btnSpeakSummary.addEventListener('click', () => {
    const summaryText = visualAiSummaryText.textContent;
    speak(summaryText, true);
  });

  // Custom Gemini Key Toggle
  btnToggleGeminiInput.addEventListener('click', () => {
    geminiKeyContainer.style.display = geminiKeyContainer.style.display === 'none' ? 'flex' : 'none';
  });

  btnApplyGemini.addEventListener('click', async () => {
    const key = geminiApiKeyInput.value.trim();
    if (!key) {
      alert('Please enter a Google Gemini API Key');
      return;
    }
    btnApplyGemini.textContent = 'Generating...';
    try {
      const summary = await generateGeminiAiSummary(key, tracker.getAllObjects());
      visualAiSummaryText.textContent = summary;
      showToast('Generated summary with Gemini LLM!');
    } catch (err) {
      alert(`Gemini error: ${err.message}`);
    } finally {
      btnApplyGemini.textContent = 'Analyze with Gemini';
    }
  });

  // Copy Report Action
  btnCopyReport.addEventListener('click', () => {
    let contentToCopy = '';
    if (state.activeFormatTab === 'text') {
      contentToCopy = textReportOutput.textContent;
    } else if (state.activeFormatTab === 'markdown') {
      contentToCopy = markdownReportOutput.textContent;
    } else if (state.activeFormatTab === 'json') {
      contentToCopy = jsonReportOutput.textContent;
    } else if (state.activeFormatTab === 'csv') {
      contentToCopy = csvReportOutput.textContent;
    } else {
      contentToCopy = textReportOutput.textContent;
    }

    navigator.clipboard.writeText(contentToCopy);
    showToast('Report copied to clipboard!');
  });

  // Download Report Action
  btnDownloadReport.addEventListener('click', () => {
    const nowStr = formatReportDate(new Date()).replace(/\s+/g, '_');
    let content = '';
    let mime = 'text/plain';
    let filename = `Camera_Report_${nowStr}.txt`;

    if (state.activeFormatTab === 'text' || state.activeFormatTab === 'visual') {
      content = textReportOutput.textContent;
      filename = `Camera_Report_${nowStr}.txt`;
    } else if (state.activeFormatTab === 'markdown') {
      content = markdownReportOutput.textContent;
      filename = `Camera_Report_${nowStr}.md`;
    } else if (state.activeFormatTab === 'json') {
      content = jsonReportOutput.textContent;
      mime = 'application/json';
      filename = `Camera_Report_${nowStr}.json`;
    } else if (state.activeFormatTab === 'csv') {
      content = csvReportOutput.textContent;
      mime = 'text/csv';
      filename = `Camera_Report_${nowStr}.csv`;
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Saved ${filename}`);
  });

  // Print / PDF Report Action
  btnPrintReport.addEventListener('click', () => {
    window.print();
  });

  // Camera Overlay Fallback Actions
  btnRequestCam.addEventListener('click', () => startWebcam());
  btnFallbackSim.addEventListener('click', () => {
    setMode('sim');
  });
}

/**
 * Bootstrap Application
 */
async function initApp() {
  initEvents();

  showOverlayMessage('Loading Neural Network (COCO-SSD)...', false);
  try {
    await loadDetectionModel((status) => {
      overlayMessageText.textContent = status;
    });
    hideOverlayMessage();
  } catch (err) {
    console.error('Model failed to load:', err);
    showOverlayMessage('Failed to download detection weights. Check your internet connection.', true);
  }

  // Set default mode to Phone Camera (Wireless Sensor)
  setMode('phone');

  // Initialize Phone Receiver (WebRTC PeerJS & QR Code generator)
  initPhoneReceiver();

  // Start animation loop
  requestAnimationFrame(runLoop);
}

// Start application on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
