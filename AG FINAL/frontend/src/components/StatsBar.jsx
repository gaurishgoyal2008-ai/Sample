import React from 'react';
import { Users, Car, Hash, Clock, Cpu, Activity } from 'lucide-react';

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '00:00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function StatsBar({ stats }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: '14px',
      marginBottom: '20px'
    }}>
      {/* Objects Visible */}
      <div style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px'
      }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: 'rgba(56, 189, 248, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#38BDF8'
        }}>
          <Activity size={22} />
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Objects Visible
          </div>
          <div className="font-mono" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#F8FAFC' }}>
            {stats.objects_visible}
          </div>
        </div>
      </div>

      {/* People Count */}
      <div style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px'
      }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: 'rgba(16, 185, 129, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#10B981'
        }}>
          <Users size={22} />
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            People
          </div>
          <div className="font-mono" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34D399' }}>
            {stats.people_count}
          </div>
        </div>
      </div>

      {/* Vehicles Count */}
      <div style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px'
      }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: 'rgba(245, 158, 11, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#F59E0B'
        }}>
          <Car size={22} />
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Vehicles
          </div>
          <div className="font-mono" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FBBF24' }}>
            {stats.vehicles_count}
          </div>
        </div>
      </div>

      {/* Unique This Session */}
      <div style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px'
      }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: 'rgba(168, 85, 247, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#A855F7'
        }}>
          <Hash size={22} />
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Unique Objects
          </div>
          <div className="font-mono" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#C084FC' }}>
            {stats.unique_objects_session}
          </div>
        </div>
      </div>

      {/* Session Duration */}
      <div style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px'
      }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: 'rgba(239, 68, 68, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#EF4444'
        }}>
          <Clock size={22} />
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Session Time
          </div>
          <div className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 700, color: stats.monitoring_active ? '#F8FAFC' : '#64748B' }}>
            {formatDuration(stats.session_duration_seconds)}
          </div>
        </div>
      </div>

      {/* FPS & Latency */}
      <div style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px'
      }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: 'rgba(56, 189, 248, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#38BDF8'
        }}>
          <Cpu size={22} />
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Display / AI Speed
          </div>
          <div className="font-mono" style={{ fontSize: '1.15rem', fontWeight: 600, color: '#38BDF8' }}>
            {stats.display_fps || stats.fps} FPS <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>(AI: {stats.ai_fps || 0} FPS / {stats.inference_latency_ms}ms)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
