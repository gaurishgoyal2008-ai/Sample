import React from 'react';
import { Shield, Eye, FileText, Settings, Video, Activity, Radio, Laptop, Database } from 'lucide-react';

export function Navbar({ activeTab, setActiveTab, stats, onOpenConnectCamera, isCompanionConnected = false }) {
  const isStreaming = stats.camera_status === 'STREAMING';
  const isConnecting = stats.camera_status === 'CONNECTING';

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 28px',
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid #1E293B',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #0284C7, #38BDF8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 16px rgba(56, 189, 248, 0.35)'
        }}>
          <Shield size={22} color="#FFFFFF" strokeWidth={2.4} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.8px', color: '#F8FAFC' }}>
              CEOVA
            </span>
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: '9999px',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38BDF8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              letterSpacing: '0.5px'
            }}>
              AI VISION
            </span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
            Real-Time Object Detection & Tracking
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav style={{ display: 'flex', gap: '6px', background: '#0B1120', padding: '4px', borderRadius: '12px', border: '1px solid #1E293B' }}>
        <button
          onClick={() => setActiveTab('monitor')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.88rem',
            fontWeight: 600,
            background: activeTab === 'monitor' ? '#1E293B' : 'transparent',
            color: activeTab === 'monitor' ? '#38BDF8' : '#94A3B8',
          }}
        >
          <Eye size={16} />
          Live Monitor
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.88rem',
            fontWeight: 600,
            background: activeTab === 'reports' ? '#1E293B' : 'transparent',
            color: activeTab === 'reports' ? '#38BDF8' : '#94A3B8',
          }}
        >
          <FileText size={16} />
          Reports
        </button>

        <button
          onClick={() => setActiveTab('memory')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.88rem',
            fontWeight: 600,
            background: activeTab === 'memory' ? '#1E293B' : 'transparent',
            color: activeTab === 'memory' ? '#38BDF8' : '#94A3B8',
          }}
        >
          <Database size={16} />
          Memory & Cache
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.88rem',
            fontWeight: 600,
            background: activeTab === 'settings' ? '#1E293B' : 'transparent',
            color: activeTab === 'settings' ? '#38BDF8' : '#94A3B8',
          }}
        >
          <Settings size={16} />
          Settings
        </button>
      </nav>

      {/* Camera & AI Status Indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Local Companion Service Status Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 12px',
          borderRadius: '9999px',
          background: isCompanionConnected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          border: `1px solid ${isCompanionConnected ? 'rgba(56, 189, 248, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
          fontSize: '0.78rem',
          color: isCompanionConnected ? '#38BDF8' : '#F87171'
        }} title={isCompanionConnected ? "Local Camera Companion Service is connected" : "Local Camera Companion Service is offline. Start companion on laptop."}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: isCompanionConnected ? '#38BDF8' : '#EF4444',
            boxShadow: isCompanionConnected ? '0 0 6px #38BDF8' : 'none'
          }} />
          <span style={{ fontWeight: 600 }}>
            {isCompanionConnected ? 'Companion Online' : 'Companion Offline'}
          </span>
        </div>

        {/* Camera Status Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '9999px',
          background: isStreaming ? 'rgba(16, 185, 129, 0.12)' : isConnecting ? 'rgba(245, 158, 11, 0.12)' : 'rgba(100, 116, 139, 0.12)',
          border: `1px solid ${isStreaming ? '#10B981' : isConnecting ? '#F59E0B' : '#334155'}`,
          fontSize: '0.8rem',
          color: isStreaming ? '#34D399' : isConnecting ? '#FBBF24' : '#94A3B8'
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isStreaming ? '#10B981' : isConnecting ? '#F59E0B' : '#64748B',
            boxShadow: isStreaming ? '0 0 8px #10B981' : 'none'
          }} />
          <span style={{ fontWeight: 600 }}>
            {isStreaming ? 'Camera Connected' : isConnecting ? 'Connecting...' : 'Camera Disconnected'}
          </span>
        </div>

        {/* Connect Camera Quick Button */}
        <button
          onClick={onOpenConnectCamera}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '9999px',
            background: '#0284C7',
            color: '#FFFFFF',
            fontSize: '0.84rem',
            fontWeight: 600,
            boxShadow: '0 2px 10px rgba(2, 132, 199, 0.35)'
          }}
        >
          <Video size={16} />
          Connect Camera
        </button>
      </div>
    </header>
  );
}
