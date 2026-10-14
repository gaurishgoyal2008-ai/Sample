import React, { useState, useEffect } from 'react';
import {
  QrCode, Wifi, Monitor, Copy, Check, AlertCircle, Video, Lock,
  ExternalLink, X, Search, RefreshCw, ChevronDown, ChevronUp, CheckCircle, Smartphone
} from 'lucide-react';
import { api } from '../services/api';

export function ConnectCameraModal({ isOpen, onClose, onConnected }) {
  const [tab, setTab] = useState('QR'); // 'QR', 'IP', 'LOCAL'
  
  // QR State
  const [qrData, setQrData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [useLocalhost, setUseLocalhost] = useState(false);
  
  // IP Webcam Auto-Discovery State
  const [ipUser, setIpUser] = useState('');
  const [ipPass, setIpPass] = useState('');
  const [ipLoading, setIpLoading] = useState(false);
  const [ipStatusStep, setIpStatusStep] = useState('');
  const [ipError, setIpError] = useState(null);
  const [ipSuccessMsg, setIpSuccessMsg] = useState(null);

  // Manual IP Setup State (Fallback)
  const [showManualIP, setShowManualIP] = useState(false);
  const [ipAddress, setIpAddress] = useState('');
  const [ipPort, setIpPort] = useState(8080);

  // Local/Test State
  const [localLoading, setLocalLoading] = useState(false);

  useEffect(() => {
    if (isOpen && tab === 'QR' && !qrData) {
      loadQrSession(useLocalhost);
    }
  }, [isOpen, tab]);

  async function loadQrSession(forLocalhost = useLocalhost) {
    setQrLoading(true);
    try {
      const data = await api.createQRSession(forLocalhost);
      setQrData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setQrLoading(false);
    }
  }

  function handleToggleHostMode(val) {
    setUseLocalhost(val);
    loadQrSession(val);
  }

  function handleCopyUrl() {
    if (qrData?.camera_url) {
      navigator.clipboard.writeText(qrData.camera_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleAutoDiscoverIP(e) {
    if (e) e.preventDefault();
    setIpError(null);
    setIpSuccessMsg(null);
    setIpLoading(true);
    setIpStatusStep('Scanning local Wi-Fi for IP Webcam...');

    const timers = [];
    timers.push(setTimeout(() => {
      setIpStatusStep('Probing active local devices (ports 8080/8081)...');
    }, 700));
    timers.push(setTimeout(() => {
      setIpStatusStep('Checking network subnet for camera broadcast...');
    }, 2000));
    timers.push(setTimeout(() => {
      setIpStatusStep('Finalizing discovery sweep...');
    }, 4500));

    try {
      const result = await api.autoDiscoverAndConnectIPWebcam({
        username: ipUser || null,
        password: ipPass || null,
        preferred_port: parseInt(ipPort, 10) || 8080
      });

      timers.forEach(clearTimeout);

      setIpStatusStep('Camera found! Connecting stream...');
      setIpSuccessMsg(`Connected to ${result.device_info || 'IP Webcam'} at ${result.ip}:${result.port}`);

      setTimeout(() => {
        onConnected();
        onClose();
      }, 700);
    } catch (err) {
      timers.forEach(clearTimeout);
      setIpStatusStep('');
      setIpError(err.message || 'Auto-discovery could not connect to camera.');
    } finally {
      timers.forEach(clearTimeout);
      setIpLoading(false);
    }
  }

  async function handleConnectManualIP(e) {
    if (e) e.preventDefault();
    setIpError(null);
    setIpSuccessMsg(null);
    setIpLoading(true);
    setIpStatusStep('Connecting to manual IP address...');
    try {
      await api.connectIPWebcam({
        url_or_ip: ipAddress,
        port: parseInt(ipPort, 10) || 8080,
        username: ipUser || null,
        password: ipPass || null,
      });
      setIpStatusStep('Connected!');
      onConnected();
      onClose();
    } catch (err) {
      setIpStatusStep('');
      setIpError(err.message || 'Failed to connect to IP camera');
    } finally {
      setIpLoading(false);
    }
  }

  async function handleConnectLocal() {
    setLocalLoading(true);
    try {
      await api.connectLocalWebcam(0);
      onConnected();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setLocalLoading(false);
    }
  }

  async function handleConnectTest() {
    setLocalLoading(true);
    try {
      await api.connectTestFeed();
      onConnected();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setLocalLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid #1E293B'
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#F8FAFC' }}>
              Connect Camera Feed
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#94A3B8', marginTop: '2px' }}>
              Choose a connection method to feed video into the Ceova AI pipeline
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              color: '#94A3B8',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Method Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '16px 24px 0',
          borderBottom: '1px solid #1E293B'
        }}>
          <button
            onClick={() => setTab('QR')}
            style={{
              padding: '10px 16px',
              borderBottom: tab === 'QR' ? '2px solid #38BDF8' : '2px solid transparent',
              background: 'transparent',
              color: tab === 'QR' ? '#38BDF8' : '#94A3B8',
              fontWeight: 600,
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <QrCode size={16} />
            Phone QR Code
          </button>

          <button
            onClick={() => setTab('IP')}
            style={{
              padding: '10px 16px',
              borderBottom: tab === 'IP' ? '2px solid #38BDF8' : '2px solid transparent',
              background: 'transparent',
              color: tab === 'IP' ? '#38BDF8' : '#94A3B8',
              fontWeight: 600,
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Wifi size={16} />
            IP Webcam
          </button>

          <button
            onClick={() => setTab('LOCAL')}
            style={{
              padding: '10px 16px',
              borderBottom: tab === 'LOCAL' ? '2px solid #38BDF8' : '2px solid transparent',
              background: 'transparent',
              color: tab === 'LOCAL' ? '#38BDF8' : '#94A3B8',
              fontWeight: 600,
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Monitor size={16} />
            Laptop / Test
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px' }}>
          {/* TAB 1: QR CODE */}
          {tab === 'QR' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ textAlign: 'center', maxWidth: '420px' }}>
                <p style={{ fontSize: '0.9rem', color: '#E2E8F0', marginBottom: '4px' }}>
                  Scan this QR code with your phone camera or browser
                </p>
                <p style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                  {useLocalhost
                    ? 'Configured for localhost browser streaming on this machine.'
                    : 'Ensure your phone and laptop are connected to the same local WiFi network.'}
                </p>
              </div>

              {/* Host Selector Toggle */}
              <div style={{
                display: 'flex',
                background: '#0B1120',
                border: '1px solid #1E293B',
                borderRadius: '8px',
                padding: '4px',
                gap: '4px'
              }}>
                <button
                  type="button"
                  onClick={() => handleToggleHostMode(false)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: !useLocalhost ? '#0284C7' : 'transparent',
                    color: !useLocalhost ? '#FFFFFF' : '#94A3B8',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Local WiFi IP (Phone)
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleHostMode(true)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: useLocalhost ? '#0284C7' : 'transparent',
                    color: useLocalhost ? '#FFFFFF' : '#94A3B8',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Localhost (This PC)
                </button>
              </div>

              {/* QR Image Box */}
              <div style={{
                background: '#FFFFFF',
                padding: '14px',
                borderRadius: '16px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '220px',
                minHeight: '220px'
              }}>
                {qrLoading ? (
                  <div style={{ color: '#0F172A', fontSize: '0.88rem' }}>Generating QR...</div>
                ) : qrData?.qr_image_base64 ? (
                  <img
                    src={qrData.qr_image_base64}
                    alt="Ceova Connection QR Code"
                    style={{ width: '200px', height: '200px', display: 'block' }}
                  />
                ) : (
                  <button onClick={() => loadQrSession(useLocalhost)} style={{ color: '#0284C7' }}>Generate Session</button>
                )}
              </div>

              {/* Direct Link & Copy */}
              {qrData?.camera_url && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#0B1120',
                  border: '1px solid #1E293B',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  width: '100%',
                  maxWidth: '460px'
                }}>
                  <input
                    type="text"
                    readOnly
                    value={qrData.camera_url}
                    className="font-mono"
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      color: '#38BDF8',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={handleCopyUrl}
                    style={{
                      background: copied ? '#10B981' : '#1E293B',
                      color: '#FFFFFF',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <a
                    href={qrData.camera_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: '#1E293B',
                      color: '#38BDF8',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <ExternalLink size={14} />
                    Open
                  </a>
                </div>
              )}

              <div style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '10px',
                padding: '12px 16px',
                fontSize: '0.8rem',
                color: '#94A3B8',
                width: '100%',
                lineHeight: 1.45
              }}>
                <strong style={{ color: '#38BDF8' }}>Mobile Camera Setup:</strong>
                <ul style={{ paddingLeft: '18px', marginTop: '4px' }}>
                  <li>Open the URL on your smartphone browser.</li>
                  <li>Tap <strong>Allow</strong> when prompted for camera permissions.</li>
                  <li>Tap <strong>Start Camera</strong> to begin streaming frames to your dashboard.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: IP WEBCAM */}
          {tab === 'IP' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Header & Context */}
              <div style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}>
                <Smartphone size={22} color="#38BDF8" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
                    Automatic Local Wi-Fi Discovery
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '3px', lineHeight: 1.4 }}>
                    Start the server in your phone’s <strong>IP Webcam app</strong> on the same Wi-Fi. Ceova will automatically discover the phone's IP address, port, and video stream endpoint.
                  </p>
                </div>
              </div>

              {/* Status Message / Stepper */}
              {ipStatusStep && (
                <div style={{
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid #38BDF8',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#38BDF8',
                  fontSize: '0.86rem',
                  fontWeight: 600
                }}>
                  <RefreshCw size={18} className="spin-animation" style={{ animation: 'spin 1.5s linear infinite' }} />
                  <div>{ipStatusStep}</div>
                </div>
              )}

              {/* Success Message */}
              {ipSuccessMsg && (
                <div style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid #10B981',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#34D399',
                  fontSize: '0.86rem',
                  fontWeight: 600
                }}>
                  <CheckCircle size={18} />
                  <div>{ipSuccessMsg}</div>
                </div>
              )}

              {/* Error Message */}
              {ipError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid #EF4444',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#F87171',
                  fontSize: '0.84rem'
                }}>
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <div>
                    {ipError}
                    {!showManualIP && (
                      <div style={{ marginTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => setShowManualIP(true)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#38BDF8',
                            fontSize: '0.78rem',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            padding: 0
                          }}
                        >
                          Try Manual IP Address / Advanced Setup
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Auto-Discovery Form */}
              <form onSubmit={handleAutoDiscoverIP} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.82rem', color: '#CBD5E1', fontWeight: 600 }}>
                      Username (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Leave blank if none"
                      value={ipUser}
                      onChange={(e) => setIpUser(e.target.value)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: '#0B1120',
                        border: '1px solid #334155',
                        color: '#F8FAFC',
                        fontSize: '0.88rem',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.82rem', color: '#CBD5E1', fontWeight: 600 }}>
                      Password (Optional)
                    </label>
                    <input
                      type="password"
                      placeholder="Leave blank if none"
                      value={ipPass}
                      onChange={(e) => setIpPass(e.target.value)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: '#0B1120',
                        border: '1px solid #334155',
                        color: '#F8FAFC',
                        fontSize: '0.88rem',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={12} />
                  Credentials are verified locally in-memory and never exposed or logged.
                </div>

                {/* Big Auto-Discover Button */}
                <button
                  type="submit"
                  disabled={ipLoading}
                  style={{
                    padding: '13px',
                    borderRadius: '10px',
                    background: ipLoading ? '#0369A1' : '#0284C7',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: ipLoading ? 'wait' : 'pointer'
                  }}
                >
                  <Search size={18} />
                  {ipLoading ? (ipStatusStep || 'Searching for Camera...') : 'Auto-Discover & Connect Camera'}
                </button>
              </form>

              {/* Fallback Accordion: Manual IP Address / Advanced Setup */}
              <div style={{
                marginTop: '4px',
                borderTop: '1px solid #1E293B',
                paddingTop: '12px'
              }}>
                <button
                  type="button"
                  onClick={() => setShowManualIP(!showManualIP)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '6px 0',
                    cursor: 'pointer'
                  }}
                >
                  <span>Manual IP Address / Advanced Setup (Fallback)</span>
                  {showManualIP ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showManualIP && (
                  <form onSubmit={handleConnectManualIP} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600 }}>
                          Camera Local IP / URL
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 192.168.0.114 or http://192.168.0.114:8080/video"
                          value={ipAddress}
                          onChange={(e) => setIpAddress(e.target.value)}
                          required={showManualIP}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: '#0B1120',
                            border: '1px solid #334155',
                            color: '#F8FAFC',
                            fontSize: '0.86rem',
                            outline: 'none'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600 }}>
                          Port
                        </label>
                        <input
                          type="number"
                          placeholder="8080"
                          value={ipPort}
                          onChange={(e) => setIpPort(e.target.value)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: '#0B1120',
                            border: '1px solid #334155',
                            color: '#F8FAFC',
                            fontSize: '0.86rem',
                            outline: 'none'
                          }}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={ipLoading}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        background: '#1E293B',
                        border: '1px solid #334155',
                        color: '#38BDF8',
                        fontWeight: 600,
                        fontSize: '0.84rem',
                        cursor: 'pointer'
                      }}
                    >
                      Connect Manually
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: LOCAL / TEST */}
          {tab === 'LOCAL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '0.88rem', color: '#94A3B8' }}>
                Quick options to test Ceova without configuring a remote camera:
              </p>

              {/* Local Webcam Option */}
              <div style={{
                background: '#0B1120',
                border: '1px solid #1E293B',
                borderRadius: '12px',
                padding: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#F8FAFC' }}>
                    Laptop Built-in Webcam
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '2px' }}>
                    Connects directly to your laptop's integrated camera (#0).
                  </p>
                </div>
                <button
                  onClick={handleConnectLocal}
                  disabled={localLoading}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    background: '#1E293B',
                    color: '#38BDF8',
                    fontWeight: 600,
                    fontSize: '0.86rem',
                    border: '1px solid #334155'
                  }}
                >
                  Connect Webcam
                </button>
              </div>

              {/* Synthetic Simulation Feed */}
              <div style={{
                background: '#0B1120',
                border: '1px solid #1E293B',
                borderRadius: '12px',
                padding: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#F8FAFC' }}>
                    Synthetic Security Test Feed
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '2px' }}>
                    Simulates high-tech surveillance feed with simulated moving people and cars.
                  </p>
                </div>
                <button
                  onClick={handleConnectTest}
                  disabled={localLoading}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    background: '#10B981',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    fontSize: '0.86rem',
                    boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)'
                  }}
                >
                  Start Simulation
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
