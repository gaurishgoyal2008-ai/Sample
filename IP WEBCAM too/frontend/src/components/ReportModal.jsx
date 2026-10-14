import React, { useState, useEffect } from 'react';
import { Download, FileJson, FileSpreadsheet, FileText, Calendar, Clock, Hash, CheckCircle, Trash2, ChevronRight, X } from 'lucide-react';
import { api } from '../services/api';

export function ReportModal({ initialSessionId = null, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [currentReport, setCurrentReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchList() {
      try {
        const list = await api.getReports();
        setSessions(list);
        if (list.length > 0) {
          if (!selectedSessionId || !list.find(s => s.session_id === selectedSessionId)) {
            setSelectedSessionId(list[0].session_id);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchList();
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      loadSessionDetail(selectedSessionId);
    }
  }, [selectedSessionId]);

  async function loadSessionDetail(sessionId) {
    try {
      const data = await api.getReport(sessionId);
      setCurrentReport(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(sessionId) {
    if (!window.confirm(`Delete report ${sessionId}?`)) return;
    try {
      await api.deleteReport(sessionId);
      const updated = sessions.filter(s => s.session_id !== sessionId);
      setSessions(updated);
      if (updated.length > 0) {
        setSelectedSessionId(updated[0].session_id);
      } else {
        setSelectedSessionId(null);
        setCurrentReport(null);
      }
    } catch (err) {
      alert('Failed to delete report: ' + err.message);
    }
  }

  function handleExport(format) {
    if (!selectedSessionId) return;
    const url = api.getExportUrl(selectedSessionId, format);
    window.open(url, '_blank');
  }

  return (
    <div style={{
      maxWidth: '1100px',
      margin: '0 auto',
      background: '#0F172A',
      border: '1px solid #1E293B',
      borderRadius: '16px',
      padding: '24px 32px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '16px',
        borderBottom: '1px solid #1E293B'
      }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#F8FAFC' }}>
            Ceova Monitoring Reports
          </h2>
          <p style={{ fontSize: '0.84rem', color: '#94A3B8', marginTop: '2px' }}>
            Structured computer-vision telemetry & AI observations grounded in observed activity
          </p>
        </div>

        {/* Export Buttons */}
        {currentReport && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => handleExport('json')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                background: '#0B1120',
                border: '1px solid #334155',
                color: '#38BDF8',
                fontSize: '0.82rem',
                fontWeight: 600
              }}
            >
              <FileJson size={15} /> Export JSON
            </button>

            <button
              onClick={() => handleExport('csv')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                background: '#0B1120',
                border: '1px solid #334155',
                color: '#10B981',
                fontSize: '0.82rem',
                fontWeight: 600
              }}
            >
              <FileSpreadsheet size={15} /> Export CSV
            </button>

            <button
              onClick={() => handleExport('txt')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                background: '#0B1120',
                border: '1px solid #334155',
                color: '#F8FAFC',
                fontSize: '0.82rem',
                fontWeight: 600
              }}
            >
              <FileText size={15} /> Export TXT
            </button>
          </div>
        )}
      </div>

      {/* Main Content Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px' }}>
        {/* Sessions Sidebar */}
        <div style={{
          background: '#0B1120',
          border: '1px solid #1E293B',
          borderRadius: '12px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '680px',
          overflowY: 'auto'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', padding: '4px 8px' }}>
            Historical Sessions ({sessions.length})
          </div>

          {sessions.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
              No monitoring sessions recorded yet. Start monitoring on the live feed to generate reports.
            </div>
          ) : (
            sessions.map(s => {
              const isSelected = s.session_id === selectedSessionId;
              return (
                <div
                  key={s.session_id}
                  onClick={() => setSelectedSessionId(s.session_id)}
                  style={{
                    background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                    border: `1px solid ${isSelected ? '#38BDF8' : 'transparent'}`,
                    borderRadius: '8px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: isSelected ? '#38BDF8' : '#F8FAFC' }}>
                      {s.session_id}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(s.session_id);
                      }}
                      style={{ background: 'transparent', color: '#64748B', padding: '2px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                    {s.started_at} • {Math.round(s.duration_seconds)}s • {s.total_unique_objects} objects
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Detailed Session Report */}
        {currentReport ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Meta Highlights Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              <div style={{ background: '#0B1120', border: '1px solid #1E293B', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>Session ID</div>
                <div className="font-mono" style={{ fontSize: '0.92rem', fontWeight: 700, color: '#38BDF8', marginTop: '2px' }}>
                  {currentReport.session_id}
                </div>
              </div>

              <div style={{ background: '#0B1120', border: '1px solid #1E293B', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>Duration</div>
                <div className="font-mono" style={{ fontSize: '0.92rem', fontWeight: 700, color: '#F8FAFC', marginTop: '2px' }}>
                  {Math.round(currentReport.duration_seconds)} Seconds
                </div>
              </div>

              <div style={{ background: '#0B1120', border: '1px solid #1E293B', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>Unique Objects</div>
                <div className="font-mono" style={{ fontSize: '0.92rem', fontWeight: 700, color: '#10B981', marginTop: '2px' }}>
                  {currentReport.total_unique_objects} Observed
                </div>
              </div>

              <div style={{ background: '#0B1120', border: '1px solid #1E293B', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>Time Window</div>
                <div className="font-mono" style={{ fontSize: '0.84rem', fontWeight: 600, color: '#94A3B8', marginTop: '4px' }}>
                  {currentReport.started_at} → {currentReport.ended_at}
                </div>
              </div>
            </div>

            {/* Executive Natural-Language Summary */}
            <div style={{
              background: '#0B1120',
              border: '1px solid #1E293B',
              borderRadius: '12px',
              padding: '16px 20px',
              borderLeft: '4px solid #38BDF8'
            }}>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#38BDF8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                Executive Monitoring Summary
              </h3>
              <p style={{ fontSize: '0.88rem', color: '#CBD5E1', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {currentReport.summary}
              </p>
            </div>

            {/* Tracked Objects Table */}
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#F8FAFC', marginBottom: '10px' }}>
                Observed Physical Entities ({currentReport.objects.length})
              </h3>
              <div style={{
                background: '#0B1120',
                border: '1px solid #1E293B',
                borderRadius: '10px',
                overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: '#111827', borderBottom: '1px solid #1E293B', color: '#94A3B8' }}>
                      <th style={{ padding: '10px 14px' }}>Tracking ID</th>
                      <th style={{ padding: '10px 14px' }}>Class</th>
                      <th style={{ padding: '10px 14px' }}>Status</th>
                      <th style={{ padding: '10px 14px' }}>First Seen</th>
                      <th style={{ padding: '10px 14px' }}>Last Seen</th>
                      <th style={{ padding: '10px 14px' }}>Duration</th>
                      <th style={{ padding: '10px 14px' }}>Peak Conf</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReport.objects.map(obj => (
                      <tr key={obj.tracking_id} style={{ borderBottom: '1px solid #1E293B' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <span className="font-mono" style={{ fontWeight: 700, color: '#38BDF8' }}>
                            {obj.tracking_id}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#F8FAFC', fontWeight: 600 }}>
                          {obj.object_class.charAt(0).toUpperCase() + obj.object_class.slice(1)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            background: obj.status === 'LEFT' ? 'rgba(148, 163, 184, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: obj.status === 'LEFT' ? '#94A3B8' : '#34D399',
                            border: `1px solid ${obj.status === 'LEFT' ? '#475569' : '#10B981'}`
                          }}>
                            {obj.status}
                          </span>
                        </td>
                        <td className="font-mono" style={{ padding: '10px 14px', color: '#94A3B8' }}>{obj.first_seen}</td>
                        <td className="font-mono" style={{ padding: '10px 14px', color: '#94A3B8' }}>{obj.last_seen}</td>
                        <td className="font-mono" style={{ padding: '10px 14px', color: '#F8FAFC' }}>{Math.round(obj.visible_duration_seconds)}s</td>
                        <td className="font-mono" style={{ padding: '10px 14px', color: '#38BDF8' }}>{Math.round(obj.confidence * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Event Timeline Table */}
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#F8FAFC', marginBottom: '10px' }}>
                Complete Session Timeline ({currentReport.events.length} Milestones)
              </h3>
              <div style={{
                background: '#0B1120',
                border: '1px solid #1E293B',
                borderRadius: '10px',
                maxHeight: '260px',
                overflowY: 'auto'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#111827', borderBottom: '1px solid #1E293B', color: '#94A3B8' }}>
                      <th style={{ padding: '8px 12px' }}>Timestamp</th>
                      <th style={{ padding: '8px 12px' }}>Event Type</th>
                      <th style={{ padding: '8px 12px' }}>Target ID</th>
                      <th style={{ padding: '8px 12px' }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReport.events.map((ev, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #1E293B' }}>
                        <td className="font-mono" style={{ padding: '8px 12px', color: '#94A3B8' }}>{ev.timestamp}</td>
                        <td style={{ padding: '8px 12px', color: '#38BDF8', fontWeight: 600 }}>{ev.event_type}</td>
                        <td className="font-mono" style={{ padding: '8px 12px', color: '#E2E8F0' }}>{ev.tracking_id || '-'}</td>
                        <td style={{ padding: '8px 12px', color: '#CBD5E1' }}>{ev.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '350px',
            color: '#64748B',
            fontSize: '0.9rem'
          }}>
            Select a session from the sidebar to inspect complete AI report.
          </div>
        )}
      </div>
    </div>
  );
}
