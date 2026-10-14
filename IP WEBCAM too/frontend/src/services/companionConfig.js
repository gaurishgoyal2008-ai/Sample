/**
 * Local Camera Companion Service Configuration Resolver
 * 
 * Supports:
 * 1. User runtime override (Settings Modal -> saved to localStorage)
 * 2. Build-time environment variable VITE_COMPANION_URL or VITE_API_URL
 * 3. Automatic environment detection:
 *    - Local Vite dev server (port 5173): uses relative '/api' proxy
 *    - FastAPI static host (port 8000): uses relative '/api'
 *    - Cloud-hosted (e.g., Vercel *.vercel.app): defaults to 'http://localhost:8000'
 */

const STORAGE_KEY = 'ceova_companion_url';

export function getDefaultCompanionUrl() {
  const envUrl = import.meta.env.VITE_COMPANION_URL || import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  const isLocalHost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (isLocalHost && (window.location.port === '5173' || window.location.port === '8000')) {
    return ''; // Relative /api handled by local proxy
  }

  // Deployed on Vercel or cloud domain -> default to companion on user's laptop
  return 'http://localhost:8000';
}

export function getCompanionBaseUrl() {
  if (typeof window === 'undefined') return '';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null && saved.trim()) {
    return saved.trim().replace(/\/+$/, '');
  }
  return getDefaultCompanionUrl();
}

export function setCompanionBaseUrl(url) {
  if (typeof window === 'undefined') return;
  if (!url || !url.trim()) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, url.trim().replace(/\/+$/, ''));
  }
}

export function getApiBaseUrl() {
  const base = getCompanionBaseUrl();
  return base ? `${base}/api` : '/api';
}

export function getVideoFeedUrl() {
  const base = getCompanionBaseUrl();
  return base ? `${base}/api/video-feed` : '/api/video-feed';
}

export function getWebSocketUrl() {
  const base = getCompanionBaseUrl();
  if (base) {
    // If companion base is http(s)://..., translate to ws(s)://...
    const wsBase = base.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
    return `${wsBase}/ws/telemetry`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/telemetry`;
}
