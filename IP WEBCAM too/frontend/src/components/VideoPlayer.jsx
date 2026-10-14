import React, { useState } from 'react';
import { Play, Square, Video, VideoOff, FileText, AlertCircle, Radio } from 'lucide-react';
import { getVideoFeedUrl } from '../services/companionConfig';

export function VideoPlayer({
  stats,
  onStartMonitoring,
  onStopMonitoring,
  onOpenConnectCamera,
  onDisconnectCamera,
  onGenerateReport,
  isOperating
}) {
  const isStreaming = stats.camera_status === 'STREAMING';
  const isMonitoring = stats.monitoring_active;

  return (
    <div style={{
      background: '#0F172A',
      border: '1px solid #1E293B',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Feed Container */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        background: '#06090F',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        {/* Live MJPEG Feed Image */}
        <img
          src={getVideoFeedUrl()}
          alt="Live Camera Video Stream"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block'
          }}
          onError={(e) => {
            // Keep trying if disconnected
            setTimeout(() => {
              const base = getVideoFeedUrl();
              const sep = base.includes('?') ? '&' : '?';
              e.target.src = base + sep + '_t=' + Date.now();
            }, 2000);
          }}
        />

        {/* Top HUD Overlay */}
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          right: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none'
        }}>
          {/* Stream & Rec Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isMonitoring && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.85)',
                backdropFilter: 'blur(6px)',
                color: '#FFFFFF',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                letterSpacing: '0.5px'
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  animation: 'pulseGlow 1s infinite'
                }} />
                MONITORING ACTIVE
              </div>
            )}

            <div style={{
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38BDF8',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              {stats.camera_description || 'No Camera Source'}
            </div>
          </div>

          {/* Model Status Pill */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(6px)',
            border: '1px solid #1E293B',
            color: '#94A3B8',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isMonitoring ? '#10B981' : '#64748B'
            }} />
            AI: YOLO26 {isMonitoring ? '(Online)' : '(Idle)'}
          </div>
        </div>

        {/* Empty State Overlay if camera disconnected */}
        {!isStreaming && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(9, 13, 22, 0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '20px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(30, 41, 59, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B'
            }}>
              <VideoOff size={32} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#F8FAFC', marginBottom: '6px' }}>
                No Video Stream Connected
              </h3>
              <p style={{ fontSize: '0.88rem', color: '#94A3B8', maxWidth: '380px' }}>
                Connect a smartphone camera using QR Code, attach an authorized IP Webcam, or start the synthetic test feed.
              </p>
            </div>
            <button
              onClick={onOpenConnectCamera}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                borderRadius: '10px',
                background: '#0284C7',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '0.92rem',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
              }}
            >
              <Video size={18} />
              Connect Camera Now
            </button>
          </div>
        )}
      </div>

      {/* Control Actions Bar */}
      <div style={{
        padding: '14px 20px',
        background: '#0B1120',
        borderTop: '1px solid #1E293B',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Primary Monitoring Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {!isMonitoring ? (
            <button
              onClick={onStartMonitoring}
              disabled={isOperating || !isStreaming}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                borderRadius: '10px',
                background: isStreaming ? '#10B981' : '#334155',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '0.92rem',
                cursor: isStreaming ? 'pointer' : 'not-allowed',
                boxShadow: isStreaming ? '0 4px 14px rgba(16, 185, 129, 0.35)' : 'none'
              }}
            >
              <Play size={18} fill="#FFFFFF" />
              Start Monitoring
            </button>
          ) : (
            <button
              onClick={onStopMonitoring}
              disabled={isOperating}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                borderRadius: '10px',
                background: '#EF4444',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '0.92rem',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)'
              }}
            >
              <Square size={18} fill="#FFFFFF" />
              Stop Monitoring
            </button>
          )}

          <button
            onClick={onGenerateReport}
            disabled={isOperating}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '10px',
              background: '#1E293B',
              color: '#F8FAFC',
              fontWeight: 600,
              fontSize: '0.88rem',
              border: '1px solid #334155'
            }}
          >
            <FileText size={16} />
            Generate Report
          </button>
        </div>

        {/* Camera Connection Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isStreaming ? (
            <button
              onClick={onDisconnectCamera}
              disabled={isOperating}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'transparent',
                color: '#EF4444',
                fontSize: '0.84rem',
                fontWeight: 600,
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}
            >
              <VideoOff size={15} />
              Disconnect Feed
            </button>
          ) : (
            <button
              onClick={onOpenConnectCamera}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                background: '#1E293B',
                color: '#38BDF8',
                fontSize: '0.84rem',
                fontWeight: 600,
                border: '1px solid #334155'
              }}
            >
              <Video size={15} />
              Connect Camera
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
