/**
 * VisionAI Phone Camera Transmitter
 * Captures high-res rear camera video from the smartphone and streams it
 * with ultra-low latency directly to the VisionAI Laptop Command Center via WebRTC.
 */

import { Peer } from 'peerjs';

// State
const state = {
  roomId: '',
  peer: null,
  activeCall: null,
  dataConn: null,
  localStream: null,
  facingMode: 'environment', // 'environment' (back) | 'user' (front)
  quality: '1080p', // '1080p' | '720p'
  torchOn: false,
  isConnected: false,
  reconnectAttempts: 0,
  wakeLock: null
};

// DOM Elements
const videoEl = document.getElementById('phone-video');
const statusPill = document.getElementById('phone-status-pill');
const statusDot = document.getElementById('phone-status-dot');
const statusText = document.getElementById('phone-status-text');
const roomDisplay = document.getElementById('phone-room-display');
const roomPill = document.getElementById('phone-room-pill');
const roomModal = document.getElementById('phone-room-modal');
const manualRoomInput = document.getElementById('manual-room-input');
const btnSubmitRoom = document.getElementById('btn-submit-room');
const btnCancelRoomModal = document.getElementById('btn-cancel-room-modal');

const overlayMsg = document.getElementById('phone-overlay-message');
const overlayTitle = document.getElementById('phone-overlay-title');
const overlayDesc = document.getElementById('phone-overlay-desc');
const btnGrantCam = document.getElementById('phone-btn-grant-cam');

const feedbackBanner = document.getElementById('phone-laptop-feedback');
const feedbackTitle = document.getElementById('feedback-title');
const feedbackDetail = document.getElementById('feedback-detail');
const sensorNameEl = document.getElementById('phone-sensor-name');

const btnFlip = document.getElementById('phone-btn-flip');
const btnTorch = document.getElementById('phone-btn-torch');
const btnQuality = document.getElementById('phone-btn-quality');
const qualityLabel = document.getElementById('quality-label');
const btnReconnect = document.getElementById('phone-btn-reconnect');
const toastContainer = document.getElementById('phone-toast-container');

/**
 * Show a quick toast notification
 */
function showToast(msg, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'phone-toast';
  toast.innerHTML = `<span>⚡</span> <span>${msg}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Prevent phone screen from turning off while streaming
 */
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => {
        state.wakeLock = null;
      });
    } catch (err) {
      console.warn('Wake lock error:', err);
    }
  }
}

/**
 * Parse Room ID from URL
 */
function getRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room') || params.get('session') || params.get('id');
  return room ? room.trim().toUpperCase() : '';
}

/**
 * Update UI connection status
 */
function updateStatus(status, text) {
  statusPill.className = `phone-status-pill status-${status}`;
  statusText.textContent = text;
}

/**
 * Start Phone Camera Stream
 */
async function startPhoneCamera() {
  overlayMsg.style.display = 'flex';
  overlayTitle.textContent = 'Accessing Camera...';
  overlayDesc.textContent = 'Starting camera sensor. Tap Allow if prompted.';
  btnGrantCam.style.display = 'none';

  if (state.localStream) {
    state.localStream.getTracks().forEach(t => t.stop());
  }

  const targetWidth = state.quality === '1080p' ? 1920 : 1280;
  const targetHeight = state.quality === '1080p' ? 1080 : 720;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: targetWidth },
        height: { ideal: targetHeight },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false
    });

    state.localStream = stream;
    videoEl.srcObject = stream;
    await videoEl.play();

    overlayMsg.style.display = 'none';
    sensorNameEl.textContent = state.facingMode === 'environment' ? 'REAR SENSOR' : 'FRONT SENSOR';

    // If an active WebRTC call exists, replace track
    if (state.activeCall && state.activeCall.peerConnection) {
      const senders = state.activeCall.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      const newVideoTrack = stream.getVideoTracks()[0];
      if (videoSender && newVideoTrack) {
        await videoSender.replaceTrack(newVideoTrack);
      }
    }

    requestWakeLock();
    return stream;
  } catch (err) {
    console.error('Camera access error:', err);
    overlayMsg.style.display = 'flex';
    overlayTitle.textContent = 'Camera Access Blocked';
    overlayDesc.textContent = `${err.message || 'Permission denied'}. Please allow camera access in your browser settings.`;
    btnGrantCam.style.display = 'inline-block';
    throw err;
  }
}

/**
 * Establish WebRTC Connection to Laptop
 */
function connectToLaptop(roomId) {
  if (!roomId) {
    roomModal.style.display = 'flex';
    updateStatus('waiting', 'ENTER ROOM CODE');
    return;
  }

  state.roomId = roomId;
  roomDisplay.textContent = roomId;
  updateStatus('connecting', 'CONNECTING TO LAPTOP...');

  if (state.peer) {
    try {
      state.peer.destroy();
    } catch (e) {
      // ignore
    }
  }

  // Use reliable STUN configuration
  const peer = new Peer({
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
    console.log('Phone Peer open with ID:', id);
    initiateCallAndData(roomId);
  });

  peer.on('error', (err) => {
    console.error('Peer error:', err);
    updateStatus('error', 'CONNECTION ERROR');
    showToast(`Peer error: ${err.type || 'disconnected'}`);
    
    // Auto retry after 3 seconds
    setTimeout(() => {
      if (!state.isConnected) {
        connectToLaptop(state.roomId);
      }
    }, 3000);
  });

  peer.on('disconnected', () => {
    console.warn('Peer disconnected from broker. Reconnecting...');
    try {
      peer.reconnect();
    } catch (e) {
      // ignore
    }
  });
}

/**
 * Call the Laptop and open DataChannel
 */
async function initiateCallAndData(roomId) {
  if (!state.localStream) {
    try {
      await startPhoneCamera();
    } catch (e) {
      return;
    }
  }

  // 1. Establish Media Stream Call (Phone Camera -> Laptop)
  console.log(`Calling Laptop Command Center at room: ${roomId}...`);
  const call = state.peer.call(roomId, state.localStream);
  state.activeCall = call;

  call.on('close', () => {
    console.log('Call closed by remote peer');
    state.isConnected = false;
    updateStatus('disconnected', 'DISCONNECTED');
  });

  call.on('error', (err) => {
    console.error('Call error:', err);
  });

  // 2. Open Bi-directional Data Channel (Telemetry & Control)
  const conn = state.peer.connect(roomId, { reliable: true });
  state.dataConn = conn;

  conn.on('open', () => {
    console.log('Data connection open with laptop!');
    state.isConnected = true;
    updateStatus('connected', 'STREAMING TO LAPTOP');
    showToast('Connected to Laptop! Video streaming live.');

    // Send Phone Specs to Laptop
    conn.send({
      type: 'PHONE_INFO',
      sensor: state.facingMode,
      quality: state.quality,
      timestamp: Date.now()
    });
  });

  conn.on('data', (data) => {
    handleLaptopTelemetry(data);
  });

  conn.on('close', () => {
    console.warn('Data connection closed');
    state.isConnected = false;
    updateStatus('disconnected', 'LAPTOP DISCONNECTED');
  });
}

/**
 * Handle incoming telemetry sent from Laptop's TensorFlow engine
 */
function handleLaptopTelemetry(data) {
  if (!data) return;

  if (data.type === 'AI_TELEMETRY') {
    const { activeCount, targetClass, targetScore, targetDwell } = data;
    
    feedbackBanner.classList.add('active');
    if (targetClass) {
      feedbackTitle.textContent = `🎯 TARGET: ${targetClass.toUpperCase()} (${Math.round(targetScore * 100)}%)`;
      feedbackDetail.textContent = `Dwell: ${targetDwell || '1s'} · Total Active: ${activeCount}`;
    } else {
      feedbackTitle.textContent = `🤖 LAPTOP TRACKING: ${activeCount} OBJECT${activeCount === 1 ? '' : 'S'}`;
      feedbackDetail.textContent = 'Aim camera at any person, car, phone, cup...';
    }
  } else if (data.type === 'PING') {
    // Reply with PONG for latency measurement
    if (state.dataConn && state.dataConn.open) {
      state.dataConn.send({ type: 'PONG', time: data.time });
    }
  }
}

/**
 * Toggle Flashlight / Torch
 */
async function toggleTorch() {
  if (!state.localStream) return;
  const track = state.localStream.getVideoTracks()[0];
  if (!track) return;

  const capabilities = track.getCapabilities ? track.getCapabilities() : {};
  if (!capabilities.torch) {
    showToast('Torch not supported on this browser/sensor');
    return;
  }

  try {
    state.torchOn = !state.torchOn;
    await track.applyConstraints({
      advanced: [{ torch: state.torchOn }]
    });
    btnTorch.classList.toggle('active', state.torchOn);
    showToast(state.torchOn ? 'Torch ON' : 'Torch OFF');
  } catch (err) {
    console.warn('Torch toggle error:', err);
    showToast('Could not toggle torch');
  }
}

/**
 * Toggle Camera (Rear / Front)
 */
async function flipCamera() {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  showToast(`Switching to ${state.facingMode === 'environment' ? 'rear' : 'front'} camera...`);
  await startPhoneCamera();
}

/**
 * Toggle Video Resolution (1080p / 720p)
 */
async function toggleQuality() {
  state.quality = state.quality === '1080p' ? '720p' : '1080p';
  qualityLabel.textContent = state.quality;
  showToast(`Resolution set to ${state.quality}`);
  await startPhoneCamera();
}

/**
 * Initialize Events
 */
function initEvents() {
  btnFlip.addEventListener('click', flipCamera);
  btnTorch.addEventListener('click', toggleTorch);
  btnQuality.addEventListener('click', toggleQuality);
  
  btnReconnect.addEventListener('click', () => {
    showToast('Reconnecting to laptop...');
    connectToLaptop(state.roomId);
  });

  roomPill.addEventListener('click', () => {
    manualRoomInput.value = state.roomId;
    roomModal.style.display = 'flex';
  });

  btnSubmitRoom.addEventListener('click', () => {
    const code = manualRoomInput.value.trim().toUpperCase();
    if (code) {
      roomModal.style.display = 'none';
      // Update URL query string
      const url = new URL(window.location.href);
      url.searchParams.set('room', code);
      window.history.replaceState({}, '', url.toString());
      connectToLaptop(code);
    }
  });

  btnCancelRoomModal.addEventListener('click', () => {
    roomModal.style.display = 'none';
  });

  btnGrantCam.addEventListener('click', () => {
    startPhoneCamera().then(() => {
      if (state.roomId) connectToLaptop(state.roomId);
    });
  });

  // Re-request wake lock if tab is focused
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      requestWakeLock();
    }
  });
}

/**
 * Application Bootstrap
 */
async function init() {
  initEvents();

  // 1. Check Room from URL
  const room = getRoomFromUrl();
  state.roomId = room;

  // 2. Start Camera
  try {
    await startPhoneCamera();
  } catch (e) {
    console.warn('Initial camera start failed:', e);
  }

  // 3. Connect to Laptop
  if (room) {
    connectToLaptop(room);
  } else {
    roomModal.style.display = 'flex';
    updateStatus('waiting', 'PAIRING CODE REQUIRED');
  }
}

// Launch
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
