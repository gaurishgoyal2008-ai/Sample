import React, { useState, useEffect, useCallback } from 'react';
import { 
  Database, Cpu, Clock, ShieldAlert, Sparkles, Filter, Trash2, 
  RefreshCw, CheckCircle2, AlertTriangle, Layers, Search, Eye
} from 'lucide-react';
import { api } from '../services/api';

export function MemoryModal({ onClose }) {
  const [activeSubTab, setActiveSubTab] = useState('persistent'); // 'persistent' | 'cache'
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const [activeCache, setActiveCache] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [classFilter, setClassFilter] = useState('');
  const [importanceFilter, setImportanceFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (activeSubTab === 'persistent') {
        const [evts, st] = await Promise.all([
          api.getMemoryEvents({
            className: classFilter || undefined,
            importance: importanceFilter || undefined,
            limit: 100
          }),
          api.getMemoryStats()
        ]);
        setEvents(evts);
        setStats(st);
      } else {
        const [cacheEntries, cStats] = await Promise.all([
          api.getActiveCache(),
          api.getCacheStats()
        ]);
        setActiveCache(cacheEntries);
        setCacheStats(cStats);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [activeSubTab, classFilter, importanceFilter]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function handleDeleteEvent(eventId) {
    if (!window.confirm(`Delete persistent memory event ${eventId}?`)) return;
    try {
      await api.deleteMemoryEvent(eventId);
      loadData();
    } catch (err) {
      alert('Error deleting event: ' + err.message);
    }
  }

  async function handleClearAll() {
    if (!window.confirm('Are you sure you want to clear persistent memory? This cannot be undone.')) return;
    try {
      await api.clearMemory();
      loadData();
    } catch (err) {
      alert('Error clearing memory: ' + err.message);
    }
  }

  async function handlePrune() {
    try {
      const res = await api.triggerMemoryCleanup();
      alert(`Pruned ${res.result?.total_deleted || 0} old events based on retention policy.`);
      loadData();
    } catch (err) {
      alert('Pruning error: ' + err.message);
    }
  }

  const filteredEvents = events.filter(e => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (e.event_id && e.event_id.toLowerCase().includes(q)) ||
      (e.tracking_id && e.tracking_id.toLowerCase().includes(q)) ||
      (e.object_class && e.object_class.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(3, 7, 18, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '1100px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid #1E293B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.6)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284C7, #38BDF8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(56, 189, 248, 0.35)'
            }}>
              <Database size={22} color="#FFFFFF" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#F8FAFC' }}>
                  Memory & Cache System
                </h2>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38BDF8',
                  border: '1px solid rgba(56, 189, 248, 0.3)'
                }}>
                  TWO-TIER ARCHITECTURE
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                Short-Term Cache (Fast/Debounced) + Persistent Event Memory (SQLite)
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={loadData}
              title="Refresh Data"
              style={{
                background: '#1E293B',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '8px',
                color: '#94A3B8',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                fontSize: '1.4rem',
                cursor: 'pointer',
                padding: '4px 8px'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '12px 28px',
          background: '#0B1120',
          borderBottom: '1px solid #1E293B'
        }}>
          <button
            onClick={() => setActiveSubTab('persistent')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeSubTab === 'persistent' ? '#1E293B' : 'transparent',
              color: activeSubTab === 'persistent' ? '#38BDF8' : '#94A3B8',
              border: 'none'
            }}
          >
            <Database size={16} />
            Persistent Memory (SQLite Events)
          </button>
          <button
            onClick={() => setActiveSubTab('cache')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeSubTab === 'cache' ? '#1E293B' : 'transparent',
              color: activeSubTab === 'cache' ? '#38BDF8' : '#94A3B8',
              border: 'none'
            }}
          >
            <Cpu size={16} />
            Short-Term Cache (Active In-Memory)
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#F87171',
              padding: '12px 16px',
              borderRadius: '10px',
              marginBottom: '18px',
              fontSize: '0.85rem'
            }}>
              {error}
            </div>
          )}

          {activeSubTab === 'persistent' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Analytics Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                <div style={{ background: '#0B1120', border: '1px solid #1E293B', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>TOTAL STORED EVENTS</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#F8FAFC', marginTop: '4px' }}>
                    {stats?.total_events ?? 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>Survives restarts & shutdowns</div>
                </div>

                <div style={{ background: '#0B1120', border: '1px solid #1E293B', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '0.74rem', color: '#F87171', fontWeight: 600 }}>HIGH IMPORTANCE</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#F87171', marginTop: '4px' }}>
                    {stats?.importance_counts?.high ?? 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>Protected against auto-deletion</div>
                </div>

                <div style={{ background: '#0B1120', border: '1px solid #1E293B', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '0.74rem', color: '#FBBF24', fontWeight: 600 }}>MEDIUM (EXTENDED STAY)</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#FBBF24', marginTop: '4px' }}>
                    {stats?.importance_counts?.medium ?? 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>Presence duration &gt; 15s</div>
                </div>

                <div style={{ background: '#0B1120', border: '1px solid #1E293B', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '0.74rem', color: '#38BDF8', fontWeight: 600 }}>RETENTION POLICY</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#38BDF8', marginTop: '4px' }}>
                    {stats?.retention_days ?? 30} Days
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>Max: {stats?.max_event_count ?? 10000} events</div>
                </div>
              </div>

              {/* Filters & Actions Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                background: '#0B1120',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid #1E293B'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                  <div style={{ position: 'relative', flex: 1, maxWidth: '280px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748B' }} />
                    <input
                      type="text"
                      placeholder="Search ID or class..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 10px 7px 32px',
                        background: '#0F172A',
                        border: '1px solid #1E293B',
                        borderRadius: '6px',
                        color: '#F8FAFC',
                        fontSize: '0.82rem'
                      }}
                    />
                  </div>

                  <select
                    value={importanceFilter}
                    onChange={e => setImportanceFilter(e.target.value)}
                    style={{
                      padding: '7px 10px',
                      background: '#0F172A',
                      border: '1px solid #1E293B',
                      borderRadius: '6px',
                      color: '#F8FAFC',
                      fontSize: '0.82rem'
                    }}
                  >
                    <option value="">All Importances</option>
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>

                  <select
                    value={classFilter}
                    onChange={e => setClassFilter(e.target.value)}
                    style={{
                      padding: '7px 10px',
                      background: '#0F172A',
                      border: '1px solid #1E293B',
                      borderRadius: '6px',
                      color: '#F8FAFC',
                      fontSize: '0.82rem'
                    }}
                  >
                    <option value="">All Object Classes</option>
                    <option value="person">Person</option>
                    <option value="car">Car</option>
                    <option value="motorcycle">Motorcycle</option>
                    <option value="bicycle">Bicycle</option>
                    <option value="backpack">Backpack</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handlePrune}
                    style={{
                      padding: '6px 12px',
                      background: '#1E293B',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#94A3B8',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Prune by Retention
                  </button>
                  <button
                    onClick={handleClearAll}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      color: '#F87171',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Clear Memory
                  </button>
                </div>
              </div>

              {/* Events List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredEvents.length === 0 ? (
                  <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#64748B',
                    background: '#0B1120',
                    borderRadius: '12px',
                    border: '1px solid #1E293B'
                  }}>
                    <Database size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>No Historical Memory Events</div>
                    <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                      Finalized tracking events will be permanently stored here.
                    </div>
                  </div>
                ) : (
                  filteredEvents.map(ev => {
                    const isHigh = ev.importance === 'high';
                    const isMed = ev.importance === 'medium';

                    return (
                      <div
                        key={ev.event_id}
                        style={{
                          background: '#0B1120',
                          border: `1px solid ${isHigh ? 'rgba(239, 68, 68, 0.35)' : isMed ? 'rgba(245, 158, 11, 0.35)' : '#1E293B'}`,
                          borderRadius: '12px',
                          padding: '14px 18px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: isHigh ? 'rgba(239, 68, 68, 0.2)' : isMed ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.15)',
                              color: isHigh ? '#F87171' : isMed ? '#FBBF24' : '#38BDF8',
                              fontSize: '0.72rem',
                              fontWeight: 700
                            }}>
                              {ev.importance?.toUpperCase()}
                            </span>

                            <span className="font-mono" style={{ fontSize: '0.88rem', fontWeight: 700, color: '#38BDF8' }}>
                              {ev.tracking_id || ev.event_id}
                            </span>

                            <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#F8FAFC' }}>
                              {ev.object_class?.charAt(0).toUpperCase() + ev.object_class?.slice(1)}
                            </span>

                            <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                              ({ev.event_type})
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span className="font-mono" style={{ fontSize: '0.76rem', color: '#94A3B8' }}>
                              {ev.first_detected} → {ev.last_detected}
                            </span>
                            <button
                              onClick={() => handleDeleteEvent(ev.event_id)}
                              title="Delete Event"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#64748B',
                                cursor: 'pointer',
                                padding: '4px'
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Metrics Bar */}
                        <div style={{
                          display: 'flex',
                          gap: '24px',
                          fontSize: '0.78rem',
                          color: '#94A3B8',
                          paddingTop: '8px',
                          borderTop: '1px solid rgba(255,255,255,0.04)'
                        }}>
                          <div>
                            Duration: <strong style={{ color: '#F8FAFC' }}>{ev.duration_seconds}s</strong>
                          </div>
                          <div>
                            Peak Conf: <strong style={{ color: '#38BDF8' }}>{Math.round(ev.max_confidence * 100)}%</strong>
                          </div>
                          <div>
                            Avg Conf: <strong style={{ color: '#94A3B8' }}>{Math.round(ev.avg_confidence * 100)}%</strong>
                          </div>
                          <div>
                            Frames Aggregated: <strong style={{ color: '#34D399' }}>{ev.detection_count}</strong>
                          </div>
                          <div>
                            Camera: <span style={{ color: '#64748B' }}>{ev.camera_id || 'default'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeSubTab === 'cache' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Cache Operational Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                <div style={{ background: '#0B1120', border: '1px solid #1E293B', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>ACTIVE OBJECTS</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#34D399', marginTop: '4px' }}>
                    {cacheStats?.active_objects ?? 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>Confirmed live tracks</div>
                </div>

                <div style={{ background: '#0B1120', border: '1px solid #1E293B', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '0.74rem', color: '#FBBF24', fontWeight: 600 }}>CANDIDATES (DEBOUNCING)</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#FBBF24', marginTop: '4px' }}>
                    {cacheStats?.candidate_objects ?? 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>Hits &lt; debounce threshold ({cacheStats?.debounce_hits ?? 3})</div>
                </div>

                <div style={{ background: '#0B1120', border: '1px solid #1E293B', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '0.74rem', color: '#38BDF8', fontWeight: 600 }}>CACHE TTL & BOUNDS</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#38BDF8', marginTop: '4px' }}>
                    {cacheStats?.ttl_seconds ?? 20}s
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>Max size: {cacheStats?.max_cache_size ?? 200}</div>
                </div>

                <div style={{ background: '#0B1120', border: '1px solid #1E293B', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '0.74rem', color: '#94A3B8', fontWeight: 600 }}>DISCARDED NOISE</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#94A3B8', marginTop: '4px' }}>
                    {cacheStats?.total_discarded_noise ?? 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>Filtered single-frame glitches</div>
                </div>
              </div>

              {/* Active Cache Entities List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {activeCache.length === 0 ? (
                  <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#64748B',
                    background: '#0B1120',
                    borderRadius: '12px',
                    border: '1px solid #1E293B'
                  }}>
                    <Cpu size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Short-Term Cache is Empty</div>
                    <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                      Start camera monitoring to view in-flight cached detections and debouncing states.
                    </div>
                  </div>
                ) : (
                  activeCache.map(c => {
                    return (
                      <div
                        key={c.track_id}
                        style={{
                          background: '#0B1120',
                          border: '1px solid #1E293B',
                          borderRadius: '12px',
                          padding: '14px 18px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="font-mono" style={{ fontSize: '0.88rem', fontWeight: 700, color: '#38BDF8' }}>
                              {c.track_id}
                            </span>
                            <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#F8FAFC' }}>
                              {c.object_class?.charAt(0).toUpperCase() + c.object_class?.slice(1)}
                            </span>
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              background: c.confirmed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: c.confirmed ? '#34D399' : '#FBBF24',
                              border: `1px solid ${c.confirmed ? '#10B981' : '#F59E0B'}`
                            }}>
                              {c.confirmed ? 'CONFIRMED ACTIVE' : `DEBOUNCING (${c.consecutive_detections}/${cacheStats?.debounce_hits ?? 3})`}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                            First seen: <span className="font-mono">{c.first_seen}</span> | Last: <span className="font-mono">{c.last_seen}</span>
                          </div>
                        </div>

                        <div style={{
                          display: 'flex',
                          gap: '24px',
                          fontSize: '0.78rem',
                          color: '#94A3B8',
                          paddingTop: '8px',
                          borderTop: '1px solid rgba(255,255,255,0.04)'
                        }}>
                          <div>
                            Duration: <strong style={{ color: '#F8FAFC' }}>{c.duration_seconds}s</strong>
                          </div>
                          <div>
                            Consecutive Hits: <strong style={{ color: '#38BDF8' }}>{c.consecutive_detections}</strong>
                          </div>
                          <div>
                            Total Frames: <strong style={{ color: '#34D399' }}>{c.total_detections}</strong>
                          </div>
                          <div>
                            Peak Conf: <strong style={{ color: '#38BDF8' }}>{Math.round(c.peak_confidence * 100)}%</strong>
                          </div>
                          <div>
                            Predicted Importance: <strong style={{ color: c.importance === 'high' ? '#F87171' : c.importance === 'medium' ? '#FBBF24' : '#94A3B8' }}>{c.importance?.toUpperCase()}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
