import React, { useState } from 'react';
import { ShieldAlert, CheckCircle, AlertTriangle, LogOut, Navigation } from 'lucide-react';

export function TrackedObjectsPanel({ objects = [] }) {
  const [filter, setFilter] = useState('ALL'); // 'ALL', 'VISIBLE', 'LOST', 'LEFT'

  const filteredObjects = objects.filter(obj => {
    if (filter === 'VISIBLE') return obj.status === 'VISIBLE';
    if (filter === 'LOST') return obj.status === 'TEMPORARILY_LOST';
    if (filter === 'LEFT') return obj.status === 'LEFT';
    return true;
  });

  const visibleCount = objects.filter(o => o.status === 'VISIBLE').length;
  const lostCount = objects.filter(o => o.status === 'TEMPORARILY_LOST').length;
  const leftCount = objects.filter(o => o.status === 'LEFT').length;

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
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#F8FAFC' }}>
            Tracked Objects
          </h2>
          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
            20-Second Memory & Continuity
          </div>
        </div>

        {/* Filter Badges */}
        <div style={{ display: 'flex', gap: '4px', background: '#0B1120', padding: '3px', borderRadius: '8px', border: '1px solid #1E293B' }}>
          <button
            onClick={() => setFilter('ALL')}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              background: filter === 'ALL' ? '#1E293B' : 'transparent',
              color: filter === 'ALL' ? '#38BDF8' : '#94A3B8'
            }}
          >
            All ({objects.length})
          </button>
          <button
            onClick={() => setFilter('VISIBLE')}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              background: filter === 'VISIBLE' ? '#1E293B' : 'transparent',
              color: filter === 'VISIBLE' ? '#34D399' : '#94A3B8'
            }}
          >
            Active ({visibleCount})
          </button>
          <button
            onClick={() => setFilter('LOST')}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              background: filter === 'LOST' ? '#1E293B' : 'transparent',
              color: filter === 'LOST' ? '#FBBF24' : '#94A3B8'
            }}
          >
            Lost ({lostCount})
          </button>
        </div>
      </div>

      {/* Object Cards List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        paddingRight: '4px'
      }}>
        {filteredObjects.length === 0 ? (
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
            <Navigation size={28} style={{ marginBottom: '8px', opacity: 0.5 }} />
            <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>No Objects in View</div>
            <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>
              Detected physical entities will appear here with continuous tracking memory.
            </div>
          </div>
        ) : (
          filteredObjects.map(obj => {
            const isVisible = obj.status === 'VISIBLE';
            const isLost = obj.status === 'TEMPORARILY_LOST';
            const isLeft = obj.status === 'LEFT';

            return (
              <div
                key={obj.tracking_id}
                style={{
                  background: isVisible ? 'rgba(15, 23, 42, 0.9)' : isLost ? 'rgba(30, 25, 15, 0.7)' : 'rgba(18, 22, 30, 0.5)',
                  border: `1px solid ${isVisible ? '#10B981' : isLost ? '#F59E0B' : '#334155'}`,
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                {/* Top Row: ID, Class, Status */}
                <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="font-mono" style={{
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      color: isVisible ? '#38BDF8' : '#94A3B8',
                      background: '#0B1120',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid #1E293B'
                    }}>
                      {obj.tracking_id}
                    </span>
                    <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#F8FAFC' }}>
                      {obj.object_class.charAt(0).toUpperCase() + obj.object_class.slice(1)}
                    </span>
                  </div>

                  {/* Status Pill */}
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    background: isVisible ? 'rgba(16, 185, 129, 0.15)' : isLost ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                    color: isVisible ? '#34D399' : isLost ? '#FBBF24' : '#94A3B8',
                    border: `1px solid ${isVisible ? '#10B981' : isLost ? '#F59E0B' : '#475569'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {isVisible && <CheckCircle size={11} />}
                    {isLost && <AlertTriangle size={11} />}
                    {isLeft && <LogOut size={11} />}
                    {isVisible ? 'VISIBLE' : isLost ? 'TEMPORARILY LOST' : 'LEFT'}
                  </span>
                </div>

                {/* Middle Row: Duration & Loss Notice */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94A3B8' }}>
                  <div>
                    {isVisible && (
                      <span>Visible for: <strong style={{ color: '#F8FAFC' }}>{Math.round(obj.visible_duration_seconds)}s</strong></span>
                    )}
                    {isLost && (
                      <span style={{ color: '#FBBF24' }}>
                        Lost <strong className="font-mono">{Math.round(obj.seconds_lost)}s</strong> ago (memory window)
                      </span>
                    )}
                    {isLeft && (
                      <span>Left scene at <span className="font-mono">{obj.last_seen}</span></span>
                    )}
                  </div>
                  <div>
                    Confidence: <strong className="font-mono" style={{ color: '#38BDF8' }}>{Math.round(obj.confidence * 100)}%</strong>
                  </div>
                </div>

                {/* Bottom Row: Movement & Reappearance Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748B', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <div>
                    First seen: <span className="font-mono">{obj.first_seen}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {obj.reappearance_count > 0 && (
                      <span style={{ color: '#A855F7', background: 'rgba(168, 85, 247, 0.1)', padding: '1px 5px', borderRadius: '4px' }}>
                        {obj.reappearance_count}x recovered
                      </span>
                    )}
                    <span style={{ color: obj.movement_state === 'MOVING' ? '#38BDF8' : '#94A3B8' }}>
                      {obj.movement_state}
                    </span>
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
