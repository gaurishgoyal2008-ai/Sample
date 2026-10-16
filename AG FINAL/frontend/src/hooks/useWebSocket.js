import { useState, useEffect, useRef } from 'react';
import { getWebSocketUrl } from '../services/companionConfig';

export function useWebSocket() {
  const [stats, setStats] = useState({
    objects_visible: 0,
    people_count: 0,
    vehicles_count: 0,
    unique_objects_session: 0,
    session_duration_seconds: 0,
    fps: 0,
    inference_latency_ms: 0,
    camera_status: 'DISCONNECTED',
    camera_description: 'No camera connected',
    ai_status: 'IDLE',
    session_id: null,
    monitoring_active: false,
  });

  const [objects, setObjects] = useState([]);
  const [events, setEvents] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      const wsUrl = getWebSocketUrl();

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        if (unmounted) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'TELEMETRY') {
            if (data.stats) setStats(data.stats);
            if (data.objects) setObjects(data.objects);
            if (data.recent_events) {
              setEvents(data.recent_events);
            }
          }
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setIsConnected(false);
        // Attempt reconnection after 2 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return { stats, objects, events, isConnected };
}
