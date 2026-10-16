import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { StatsBar } from './components/StatsBar';
import { VideoPlayer } from './components/VideoPlayer';
import { TrackedObjectsPanel } from './components/TrackedObjectsPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { ConnectCameraModal } from './components/ConnectCameraModal';
import { SettingsModal } from './components/SettingsModal';
import { ReportModal } from './components/ReportModal';
import { MemoryModal } from './components/MemoryModal';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('monitor'); // 'monitor', 'reports', 'memory', 'settings'
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isOperating, setIsOperating] = useState(false);
  const [latestReportSessionId, setLatestReportSessionId] = useState(null);

  // Real-time telemetry via WebSocket
  const { stats, objects, events, isConnected } = useWebSocket();

  async function handleStartMonitoring() {
    setIsOperating(true);
    try {
      await api.startMonitoring();
    } catch (err) {
      alert('Could not start monitoring: ' + err.message);
    } finally {
      setIsOperating(false);
    }
  }

  async function handleStopMonitoring() {
    setIsOperating(true);
    try {
      const report = await api.stopMonitoring();
      if (report?.session_id) {
        setLatestReportSessionId(report.session_id);
        // Switch to reports tab to view the completed session
        setActiveTab('reports');
      }
    } catch (err) {
      alert('Error stopping monitoring: ' + err.message);
    } finally {
      setIsOperating(false);
    }
  }

  async function handleDisconnectCamera() {
    setIsOperating(true);
    try {
      await api.disconnectCamera();
    } catch (err) {
      alert('Failed to disconnect camera: ' + err.message);
    } finally {
      setIsOperating(false);
    }
  }

  function handleGenerateReport() {
    setActiveTab('reports');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080C14', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
        isCompanionConnected={isConnected}
        onOpenConnectCamera={() => setIsConnectModalOpen(true)}
      />

      {/* Main Body */}
      <main style={{ flex: 1, padding: '24px 28px', maxWidth: '1720px', margin: '0 auto', width: '100%' }}>
        {activeTab === 'monitor' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Live Metrics */}
            <StatsBar stats={stats} />

            {/* Live Monitoring Dashboard Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.45fr 1fr',
              gap: '24px',
              alignItems: 'start'
            }}>
              {/* Primary Video Feed Player */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <VideoPlayer
                  stats={stats}
                  onStartMonitoring={handleStartMonitoring}
                  onStopMonitoring={handleStopMonitoring}
                  onOpenConnectCamera={() => setIsConnectModalOpen(true)}
                  onDisconnectCamera={handleDisconnectCamera}
                  onGenerateReport={handleGenerateReport}
                  isOperating={isOperating}
                />
              </div>

              {/* Side Panels: Objects & Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <TrackedObjectsPanel objects={objects} />
                <TimelinePanel events={events} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <ReportModal
            initialSessionId={latestReportSessionId}
            onClose={() => setActiveTab('monitor')}
          />
        )}

        {activeTab === 'memory' && (
          <MemoryModal
            onClose={() => setActiveTab('monitor')}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsModal
            onClose={() => setActiveTab('monitor')}
          />
        )}
      </main>

      {/* Connect Camera Dialog */}
      <ConnectCameraModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        onConnected={() => {
          setIsConnectModalOpen(false);
        }}
      />
    </div>
  );
}
