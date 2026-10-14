import React, { useState, useEffect } from 'react';
import { Sliders, Check, Save, Cpu, Layers, Laptop } from 'lucide-react';
import { api } from '../services/api';
import { getCompanionBaseUrl, setCompanionBaseUrl, getDefaultCompanionUrl } from '../services/companionConfig';

const ALL_AVAILABLE_CLASSES = [
  "person", "car", "motorcycle", "bicycle", "bus", "truck",
  "backpack", "handbag", "suitcase", "umbrella",
  "laptop", "cell phone", "tv", "remote", "keyboard", "mouse",
  "bottle", "cup", "chair", "couch", "potted plant", "dining table", "clock", "book",
  "dog", "cat", "bird", "horse",
  "traffic light", "fire hydrant", "stop sign"
];

export function SettingsModal({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modelStatus, setModelStatus] = useState(null);
  const [companionUrl, setCompanionUrl] = useState(getCompanionBaseUrl() || getDefaultCompanionUrl() || 'http://localhost:8000');
  
  const [settings, setSettings] = useState({
    model_name: 'YOLO26-Accurate',
    confidence_threshold: 0.28,
    memory_seconds: 20.0,
    enable_trails: true,
    enable_boxes: true,
    enable_confidence: true,
    enable_track_ids: true,
    allowed_classes: ALL_AVAILABLE_CLASSES,
    processing_resolution: '720p',
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const [cfg, status] = await Promise.all([
          api.getSettings(),
          api.getModelStatus()
        ]);
        setSettings(cfg);
        setModelStatus(status);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      setCompanionBaseUrl(companionUrl);
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleClass(cls) {
    const exists = settings.allowed_classes.includes(cls);
    if (exists) {
      setSettings({
        ...settings,
        allowed_classes: settings.allowed_classes.filter(c => c !== cls)
      });
    } else {
      setSettings({
        ...settings,
        allowed_classes: [...settings.allowed_classes, cls]
      });
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
        Loading Ceova Configuration...
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      background: '#0F172A',
      border: '1px solid #1E293B',
      borderRadius: '16px',
      padding: '24px 32px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '18px',
        borderBottom: '1px solid #1E293B',
        marginBottom: '24px'
      }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#F8FAFC' }}>
            System & Vision Settings
          </h2>
          <p style={{ fontSize: '0.84rem', color: '#94A3B8', marginTop: '2px' }}>
            Fine-tune YOLO26 neural inference, object memory window, and HUD displays
          </p>
        </div>

        {savedSuccess && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid #10B981',
            color: '#34D399',
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Check size={16} /> Saved Successfully
          </div>
        )}
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Model Architecture Note */}
        {modelStatus && (
          <div style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}>
            <Cpu size={20} color="#38BDF8" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ fontSize: '0.84rem' }}>
              <div style={{ fontWeight: 600, color: '#F8FAFC', marginBottom: '2px' }}>
                AI Vision Engine: {modelStatus.requested_model} ({modelStatus.device})
              </div>
              <div style={{ color: '#94A3B8' }}>
                {modelStatus.status_note}
              </div>
            </div>
          </div>
        )}

        {/* 1. AI Model & Resolution */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#CBD5E1' }}>
              Vision Model Architecture
            </label>
            <select
              value={settings.model_name}
              onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: '#0B1120',
                border: '1px solid #334155',
                color: '#F8FAFC',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            >
              <option value="YOLO26-Accurate">YOLO26-Accurate (YOLO11s, 47.0 mAP - High Accuracy)</option>
              <option value="YOLO26-Fast">YOLO26-Fast (YOLO11n, 39.5 mAP - High Speed)</option>
              <option value="yolo11s.pt">YOLO11s (Direct Neural Weights)</option>
              <option value="yolo11n.pt">YOLO11n (Direct Neural Weights)</option>
              <option value="yolo26.pt">Custom YOLO26 (yolo26.pt)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#CBD5E1' }}>
              Video Processing Resolution
            </label>
            <select
              value={settings.processing_resolution}
              onChange={(e) => setSettings({ ...settings, processing_resolution: e.target.value })}
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: '#0B1120',
                border: '1px solid #334155',
                color: '#F8FAFC',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            >
              <option value="Auto">Auto (Native Camera Resolution)</option>
              <option value="480p">480p (Fastest / Low Resource)</option>
              <option value="720p">720p (Recommended / Balanced)</option>
              <option value="1080p">1080p (High Fidelity)</option>
            </select>
          </div>
        </div>

        {/* 2. Confidence Threshold */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#CBD5E1' }}>
              Detection Confidence Threshold
            </label>
            <span className="font-mono" style={{ fontSize: '0.92rem', color: '#38BDF8', fontWeight: 700 }}>
              {Math.round(settings.confidence_threshold * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.10"
            max="0.95"
            step="0.05"
            value={settings.confidence_threshold}
            onChange={(e) => setSettings({ ...settings, confidence_threshold: parseFloat(e.target.value) })}
            style={{ accentColor: '#38BDF8' }}
          />
          <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
            Higher values reduce false positives; lower values detect subtle or distant objects.
          </span>
        </div>

        {/* 3. Temporary Object Memory Window (20-Second Default) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#CBD5E1' }}>
              Temporary Object Memory Retention
            </label>
            <span className="font-mono" style={{ fontSize: '0.92rem', color: '#10B981', fontWeight: 700 }}>
              {settings.memory_seconds} Seconds
            </span>
          </div>
          <input
            type="range"
            min="5"
            max="60"
            step="1"
            value={settings.memory_seconds}
            onChange={(e) => setSettings({ ...settings, memory_seconds: parseFloat(e.target.value) })}
            style={{ accentColor: '#10B981' }}
          />
          <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
            Duration an occluded or disappeared entity is remembered in <strong>TEMPORARILY LOST</strong> status before transitioning to <strong>LEFT</strong>.
          </span>
        </div>

        {/* 4. Display & HUD Overlays */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#CBD5E1' }}>
            Visual HUD Overlays
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: '#0B1120',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid #1E293B',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={settings.enable_boxes}
                onChange={(e) => setSettings({ ...settings, enable_boxes: e.target.checked })}
                style={{ accentColor: '#38BDF8', width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '0.84rem', color: '#E2E8F0' }}>Bounding Boxes</span>
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: '#0B1120',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid #1E293B',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={settings.enable_track_ids}
                onChange={(e) => setSettings({ ...settings, enable_track_ids: e.target.checked })}
                style={{ accentColor: '#38BDF8', width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '0.84rem', color: '#E2E8F0' }}>Tracking IDs (H-001)</span>
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: '#0B1120',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid #1E293B',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={settings.enable_confidence}
                onChange={(e) => setSettings({ ...settings, enable_confidence: e.target.checked })}
                style={{ accentColor: '#38BDF8', width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '0.84rem', color: '#E2E8F0' }}>Confidence Scores</span>
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: '#0B1120',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid #1E293B',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={settings.enable_trails}
                onChange={(e) => setSettings({ ...settings, enable_trails: e.target.checked })}
                style={{ accentColor: '#38BDF8', width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '0.84rem', color: '#E2E8F0' }}>Movement Trails</span>
            </label>
          </div>
        </div>

        {/* 5. Target Detection Classes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#CBD5E1' }}>
              Target Detection Classes ({settings.allowed_classes.length} active)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, allowed_classes: ALL_AVAILABLE_CLASSES })}
                style={{ fontSize: '0.74rem', color: '#38BDF8', background: 'transparent' }}
              >
                Select All
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {ALL_AVAILABLE_CLASSES.map(cls => {
              const active = settings.allowed_classes.includes(cls);
              return (
                <button
                  key={cls}
                  type="button"
                  onClick={() => toggleClass(cls)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: active ? 'rgba(56, 189, 248, 0.15)' : '#0B1120',
                    border: `1px solid ${active ? '#38BDF8' : '#1E293B'}`,
                    color: active ? '#38BDF8' : '#64748B',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {cls.charAt(0).toUpperCase() + cls.slice(1)}
                </button>
              );
            })}
          </div>
        </div>

        {/* 6. Local Camera Companion Service Architecture */}
        <div style={{
          background: 'rgba(2, 132, 199, 0.06)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Laptop size={18} color="#38BDF8" />
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#F8FAFC' }}>
                Local Camera Companion Service
              </span>
            </div>
            <span style={{
              fontSize: '0.7rem',
              color: '#38BDF8',
              background: 'rgba(56, 189, 248, 0.15)',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontWeight: 600
            }}>
              Vercel + Local Wi-Fi Architecture
            </span>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
            When Ceova is deployed on Vercel, the web application connects directly to the companion service running on your laptop. This enables local-network Android IP Webcam discovery (192.168.x.x) and real-time AI inference without routing heavy video through the cloud.
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={companionUrl}
              onChange={(e) => setCompanionUrl(e.target.value)}
              placeholder="http://localhost:8000"
              style={{
                flex: 1,
                background: '#0B1120',
                border: '1px solid #1E293B',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#F8FAFC',
                fontSize: '0.85rem',
                fontFamily: 'monospace'
              }}
            />
            <button
              type="button"
              onClick={() => setCompanionUrl('http://localhost:8000')}
              style={{
                padding: '10px 14px',
                background: '#1E293B',
                color: '#94A3B8',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 600,
                whiteSpace: 'nowrap'
              }}
            >
              Reset to Default
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '14px',
            borderRadius: '10px',
            background: '#0284C7',
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
            marginTop: '8px'
          }}
        >
          <Save size={18} />
          {saving ? 'Applying Settings...' : 'Save & Apply Settings'}
        </button>
      </form>
    </div>
  );
}
