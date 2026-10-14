import React, { useRef, useEffect } from 'react';
import { History, ArrowRight, UserPlus, LogOut, AlertCircle, RefreshCw, Radio, CheckCircle2 } from 'lucide-react';

function getEventBadge(eventType) {
  switch (eventType) {
    case 'OBJECT_ENTERED':
      return { color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)', icon: UserPlus };
    case 'OBJECT_REAPPEARED':
      return { color: '#A855F7', bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)', icon: RefreshCw };
    case 'OBJECT_LOST':
      return { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', icon: AlertCircle };
    case 'OBJECT_LEFT':
      return { color: '#F43F5E', bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.3)', icon: LogOut };
    case 'SESSION_STARTED':
    case 'SESSION_STOPPED':
      return { color: '#10B981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', icon: CheckCircle2 };
    case 'CAMERA_CONNECTED':
    case 'CAMERA_DISCONNECTED':
      return { color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)', icon: Radio };
    default:
      return { color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.3)', icon: ArrowRight };
  }
}

export function TimelinePanel({ events = [] }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div style={{
      background: '#0F172A',
      border: '1px solid #1E293B',
      borderRadius: '16px',
      padding: '18px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '440px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '14px',
        paddingBottom: '12px',
        borderBottom: '1px solid #1E293B'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={18} color="#38BDF8" />
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#F8FAFC' }}>
            Live Event Timeline
          </h2>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
          {events.length} Recorded
        </span>
      </div>

      {/* Events Stream */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          paddingRight: '4px'
        }}
      >
        {events.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            color: '#64748B',
            textAlign: 'center',
            padding: '30px'
          }}>
            <History size={28} style={{ marginBottom: '8px', opacity: 0.5 }} />
            <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>No Events Yet</div>
            <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>
              Real-time activity milestones and state transitions will stream here.
            </div>
          </div>
        ) : (
          events.map((ev, idx) => {
            const badge = getEventBadge(ev.event_type);
            const Icon = badge.icon;

            return (
              <div
                key={ev.event_id || idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid #1E293B',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  position: 'relative'
                }}
              >
                {/* Icon Badge */}
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: badge.bg,
                  border: `1px solid ${badge.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: badge.color,
                  flexShrink: 0,
                  marginTop: '1px'
                }}>
                  <Icon size={14} />
                </div>

                {/* Event Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span className="font-mono" style={{ fontSize: '0.76rem', color: '#94A3B8', fontWeight: 600 }}>
                      {ev.timestamp}
                    </span>
                    {ev.tracking_id && (
                      <span className="font-mono" style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: badge.color,
                        background: badge.bg,
                        padding: '1px 6px',
                        borderRadius: '4px'
                      }}>
                        {ev.tracking_id}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: '#E2E8F0', lineHeight: 1.35 }}>
                    {ev.description}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
