import { getApiBaseUrl } from './companionConfig';

const getBase = () => getApiBaseUrl();

export const api = {
  // Camera Connection
  async createQRSession(useLocalhost = false) {
    const res = await fetch(`${getBase()}/camera/qr-session?use_localhost=${useLocalhost}`);
    if (!res.ok) throw new Error('Failed to generate QR session');
    return res.json();
  },

  async autoDiscoverAndConnectIPWebcam(data) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 16000);

    try {
      const res = await fetch(`${getBase()}/camera/discover-and-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server returned error (${res.status})`);
      }
      return res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Discovery timed out after 16 seconds. Please check that IP Webcam server is running on the phone, or use Direct IP Test.');
      }
      throw err;
    }
  },

  async discoverIPWebcam(data) {
    const res = await fetch(`${getBase()}/camera/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async testDirectConnection(data) {
    const res = await fetch(`${getBase()}/camera/test-direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Direct test failed');
    }
    return res.json();
  },

  async getNetworkInfo() {
    const res = await fetch(`${getBase()}/camera/network-info`);
    if (!res.ok) throw new Error('Failed to fetch network information');
    return res.json();
  },

  async connectIPWebcam(data) {
    const res = await fetch(`${getBase()}/camera/connect-ip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to connect to IP camera');
    }
    return res.json();
  },

  async connectLocalWebcam(deviceId = 0) {
    const res = await fetch(`${getBase()}/camera/connect-local?device_id=${deviceId}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to connect local camera');
    }
    return res.json();
  },

  async connectTestFeed() {
    const res = await fetch(`${getBase()}/camera/connect-test`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to start test feed');
    }
    return res.json();
  },

  async disconnectCamera() {
    const res = await fetch(`${getBase()}/camera/disconnect`, {
      method: 'POST',
    });
    return res.json();
  },

  async getCameraStatus() {
    const res = await fetch(`${getBase()}/camera/status`);
    return res.json();
  },

  // Monitoring
  async startMonitoring() {
    const res = await fetch(`${getBase()}/monitoring/start`, {
      method: 'POST',
    });
    return res.json();
  },

  async stopMonitoring() {
    const res = await fetch(`${getBase()}/monitoring/stop`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to stop monitoring');
    }
    return res.json();
  },

  // Reports
  async getReports() {
    const res = await fetch(`${getBase()}/reports`);
    return res.json();
  },

  async getReport(sessionId) {
    const res = await fetch(`${getBase()}/reports/${encodeURIComponent(sessionId)}`);
    if (!res.ok) throw new Error('Report not found');
    return res.json();
  },

  async deleteReport(sessionId) {
    const res = await fetch(`${getBase()}/reports/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  getExportUrl(sessionId, format) {
    return `${getBase()}/reports/${encodeURIComponent(sessionId)}/export/${format}`;
  },

  // Settings
  async getSettings() {
    const res = await fetch(`${getBase()}/settings`);
    return res.json();
  },

  async updateSettings(settings) {
    const res = await fetch(`${getBase()}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return res.json();
  },

  async getModelStatus() {
    const res = await fetch(`${getBase()}/model-status`);
    return res.json();
  },

  // Memory + Cache System Endpoints
  async getMemoryEvents(params = {}) {
    const query = new URLSearchParams();
    if (params.className) query.append('class_name', params.className);
    if (params.importance) query.append('importance', params.importance);
    if (params.sessionId) query.append('session_id', params.sessionId);
    if (params.eventType) query.append('event_type', params.eventType);
    if (params.startTime) query.append('start_time', params.startTime);
    if (params.endTime) query.append('end_time', params.endTime);
    if (params.limit) query.append('limit', params.limit);
    if (params.offset) query.append('offset', params.offset);

    const res = await fetch(`${getBase()}/memory/events?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch memory events');
    return res.json();
  },

  async getMemoryEvent(eventId) {
    const res = await fetch(`${getBase()}/memory/events/${encodeURIComponent(eventId)}`);
    if (!res.ok) throw new Error('Memory event not found');
    return res.json();
  },

  async deleteMemoryEvent(eventId) {
    const res = await fetch(`${getBase()}/memory/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete memory event');
    return res.json();
  },

  async getMemoryStats() {
    const res = await fetch(`${getBase()}/memory/stats`);
    if (!res.ok) throw new Error('Failed to fetch memory statistics');
    return res.json();
  },

  async triggerMemoryCleanup(params = {}) {
    const query = new URLSearchParams();
    if (params.retentionDays) query.append('retention_days', params.retentionDays);
    if (params.maxEventCount) query.append('max_event_count', params.maxEventCount);

    const res = await fetch(`${getBase()}/memory/cleanup?${query.toString()}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to execute memory cleanup');
    return res.json();
  },

  async clearMemory(sessionId = null) {
    const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    const res = await fetch(`${getBase()}/memory/clear${query}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to clear memory');
    return res.json();
  },

  async getActiveCache() {
    const res = await fetch(`${getBase()}/cache/active`);
    if (!res.ok) throw new Error('Failed to fetch active cache entries');
    return res.json();
  },

  async getCacheStats() {
    const res = await fetch(`${getBase()}/cache/stats`);
    if (!res.ok) throw new Error('Failed to fetch cache stats');
    return res.json();
  }
};
