import { useEffect, useState, useRef, useCallback } from 'react';
import type { AgentTelemetry } from '../types';

export interface AgentSecurityAlert {
  alert_type: string;
  device_id: string;
  device_name?: string;
  reason?: string;
  timestamp: string;
}

export function useAgentLiveStatus(onSecurityAlert?: (alert: AgentSecurityAlert) => void) {
  const [telemetryByDevice, setTelemetryByDevice] = useState<Record<string, AgentTelemetry>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const alertCallbackRef = useRef(onSecurityAlert);
  alertCallbackRef.current = onSecurityAlert;

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/dashboard`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'AGENT_TELEMETRY_SNAPSHOT' && Array.isArray(msg.telemetry)) {
            const nextMap: Record<string, AgentTelemetry> = {};
            const simSet = new Set<string>(msg.simulated_device_ids || []);
            for (const item of msg.telemetry as AgentTelemetry[]) {
              nextMap[item.device_id] = {
                ...item,
                is_simulated: item.is_simulated ?? simSet.has(item.device_id),
              };
            }
            setTelemetryByDevice(nextMap);
          } else if (msg.type === 'AGENT_TELEMETRY_UPDATE' && msg.telemetry) {
            const t = msg.telemetry as AgentTelemetry;
            setTelemetryByDevice((prev) => ({
              ...prev,
              [t.device_id]: {
                ...t,
                is_simulated: msg.is_simulated ?? t.is_simulated,
              },
            }));
          } else if (msg.type === 'AGENT_SECURITY_ALERT') {
            alertCallbackRef.current?.(msg as AgentSecurityAlert);
          }
        } catch {
          // ignore malformed ws message
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    } catch {
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, 4000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    telemetryByDevice,
    wsConnected,
  };
}
