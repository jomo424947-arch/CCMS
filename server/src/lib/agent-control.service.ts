import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import { getDb, saveDatabase } from './database';
import {
  createSignedCommandEnvelope,
  detectHardwareClone,
  getOrCreateControllerKeyPair,
} from './agent-crypto';
import type {
  AgentStatus,
  AgentTelemetry,
  CommandEnvelope,
  DeviceCommandType,
} from './types';

interface ConnectedAgentClient {
  ws: WebSocket;
  deviceId: string;
  tenantId: string;
  ipAddress: string;
  connectedAt: number;
  lastDbPersistAt: number;
}

interface SimulatedAgentInstance {
  deviceId: string;
  tenantId: string;
  timer: NodeJS.Timeout;
  locked: boolean;
  maintenanceMode: boolean;
  activeSessionId: string | null;
  startedAt: number;
  lastMessage: string | null;
}

/**
 * Helper to execute a SELECT query against sql.js and return an array of row objects.
 */
export function sqlQueryAll<T = Record<string, any>>(sql: string, params: any[] = []): T[] {
  try {
    const db = getDb();
    const res = db.exec(sql, params);
    if (!res || !res[0] || !res[0].values || res[0].values.length === 0) {
      return [];
    }
    const cols = res[0].columns;
    return res[0].values.map((row: any[]) => {
      const obj: Record<string, any> = {};
      cols.forEach((col: string, idx: number) => {
        obj[col] = row[idx];
      });
      return obj as T;
    });
  } catch {
    return [];
  }
}

/**
 * Helper to execute a SELECT query against sql.js and return the first row or null.
 */
export function sqlQueryOne<T = Record<string, any>>(sql: string, params: any[] = []): T | null {
  const rows = sqlQueryAll<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Helper to execute an INSERT/UPDATE/DELETE against sql.js and mark database dirty.
 */
export function sqlRun(sql: string, params: any[] = []): void {
  try {
    const db = getDb();
    db.run(sql, params);
    saveDatabase();
  } catch (err: any) {
    console.warn('[agent-control:sqlRun] SQL execution warning:', err?.message || err);
  }
}

class AgentControlService {
  private agentWss: WebSocketServer | null = null;
  private dashboardWss: WebSocketServer | null = null;

  private connectedAgents = new Map<string, ConnectedAgentClient>();
  private dashboardClients = new Set<WebSocket>();
  private telemetryMap = new Map<string, AgentTelemetry>();
  private sequenceCounters = new Map<string, number>();
  private simulatedAgents = new Map<string, SimulatedAgentInstance>();

  private enforcementTimer: NodeJS.Timeout | null = null;
  private warned5MinSessions = new Set<string>();
  private warned1MinSessions = new Set<string>();
  private expiredLockedSessions = new Set<string>();

  /**
   * Attaches `/ws/agent` and `/ws/dashboard` WebSocket servers to the HTTP server.
   */
  public init(server: HttpServer): void {
    if (this.agentWss) return;

    this.agentWss = new WebSocketServer({ noServer: true });
    this.dashboardWss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      try {
        const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
        if (url.pathname === '/ws/agent') {
          this.agentWss!.handleUpgrade(request, socket, head, (ws) => {
            this.handleAgentConnection(ws, request, url);
          });
        } else if (url.pathname === '/ws/dashboard') {
          this.dashboardWss!.handleUpgrade(request, socket, head, (ws) => {
            this.handleDashboardConnection(ws);
          });
        }
      } catch {
        socket.destroy();
      }
    });

    this.startEnforcementLoop();
    console.log('🛡️  CCMS Device Control Plane initialized (/ws/agent & /ws/dashboard)');
  }

  private getNextSequenceNumber(deviceId: string): number {
    const current = this.sequenceCounters.get(deviceId) ?? 0;
    const next = current + 1;
    this.sequenceCounters.set(deviceId, next);
    return next;
  }

  /**
   * Returns live telemetry for a single device or null if not available.
   */
  public getDeviceTelemetry(deviceId: string): AgentTelemetry | null {
    return this.telemetryMap.get(deviceId) || null;
  }

  /**
   * Returns all live telemetry snapshots as an array.
   */
  public getAllTelemetry(tenantId?: string): AgentTelemetry[] {
    const all = Array.from(this.telemetryMap.values());
    if (!tenantId) return all;
    const rows = sqlQueryAll<{ id: string }>('SELECT id FROM devices WHERE tenant_id = ?', [tenantId]);
    const validIds = new Set(rows.map((r) => r.id));
    return all.filter((t) => validIds.has(t.device_id));
  }

  /**
   * Checks if a simulated agent is running for the given device.
   */
  public isSimulatedAgentRunning(deviceId: string): boolean {
    return this.simulatedAgents.has(deviceId);
  }

  /**
   * Handles incoming `/ws/dashboard` connections from the CCMS React frontend.
   */
  private handleDashboardConnection(ws: WebSocket): void {
    this.dashboardClients.add(ws);

    try {
      ws.send(
        JSON.stringify({
          type: 'AGENT_TELEMETRY_SNAPSHOT',
          telemetry: Array.from(this.telemetryMap.values()),
          simulated_device_ids: Array.from(this.simulatedAgents.keys()),
          timestamp: new Date().toISOString(),
        })
      );
    } catch {
      // ignore
    }

    ws.on('close', () => {
      this.dashboardClients.delete(ws);
    });

    ws.on('error', () => {
      this.dashboardClients.delete(ws);
    });
  }

  /**
   * Broadcasts an event to all connected dashboard WebSocket clients.
   */
  public broadcastToDashboard(event: Record<string, unknown>): void {
    const payload = JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
    });
    for (const client of this.dashboardClients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Handles incoming `/ws/agent` connections from Windows Agents.
   */
  private handleAgentConnection(ws: WebSocket, req: IncomingMessage, url: URL): void {
    const authHeader = req.headers['authorization'] || '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : url.searchParams.get('token') || '';
    const deviceId = (req.headers['x-device-id'] as string) || url.searchParams.get('device_id') || '';

    if (!deviceId || !bearerToken) {
      ws.close(4001, 'Missing device_id or agent token');
      return;
    }

    const device = sqlQueryOne<any>('SELECT * FROM devices WHERE id = ?', [deviceId]);

    if (!device || !device.agent_token || device.agent_token !== bearerToken) {
      ws.close(4003, 'Invalid agent credentials');
      return;
    }

    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';

    const clientInfo: ConnectedAgentClient = {
      ws,
      deviceId: device.id,
      tenantId: device.tenant_id,
      ipAddress,
      connectedAt: Date.now(),
      lastDbPersistAt: Date.now(),
    };

    this.connectedAgents.set(device.id, clientInfo);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString('utf-8'));
        this.handleAgentMessage(clientInfo, msg);
      } catch {
        // Ignore malformed JSON
      }
    });

    ws.on('close', () => {
      const existing = this.connectedAgents.get(device.id);
      if (existing === clientInfo) {
        this.connectedAgents.delete(device.id);
        this.updateDeviceStatus(device.id, device.tenant_id, 'offline', ipAddress);
      }
    });

    ws.on('error', () => {
      // handled in close
    });

    this.flushPendingCommands(device.id);
  }

  private handleAgentMessage(client: ConnectedAgentClient, msg: Record<string, unknown>): void {
    const msgType = String(msg.type || '');

    if (msgType === 'AGENT_HELLO_RECONCILE') {
      this.handleAgentReconcile(client, msg);
    } else if (msgType === 'HEARTBEAT') {
      this.handleAgentHeartbeat(client, msg);
    } else if (msgType === 'COMMAND_ACK') {
      this.handleCommandAck(client, msg);
    } else if (msgType === 'TAMPER_ALERT') {
      this.handleTamperAlert(client, msg);
    }
  }

  /**
   * Section 5.4: Reconnect & State Reconciliation Protocol + Section 6.5 Clone Detection
   */
  public handleAgentReconcile(client: ConnectedAgentClient, msg: Record<string, unknown>): void {
    const device = sqlQueryOne<any>('SELECT * FROM devices WHERE id = ?', [client.deviceId]);
    if (!device) return;

    const incomingHw = String(msg.hardware_fingerprint || device.hardware_fingerprint || '');
    const agentVersion = String(msg.agent_version || device.agent_version || '1.0.0');
    const currentLockState = String(msg.current_lock_state || 'locked');
    const activeLocalSessionId = msg.active_local_session_id ? String(msg.active_local_session_id) : null;

    const sameHwDevices = incomingHw
      ? sqlQueryAll<{ id: string; name: string }>(
          'SELECT id, name FROM devices WHERE tenant_id = ? AND hardware_fingerprint = ? AND id != ? AND archived = 0',
          [client.tenantId, incomingHw, client.deviceId]
        )
      : [];

    const cloneCheck = detectHardwareClone({
      deviceId: client.deviceId,
      storedFingerprint: device.hardware_fingerprint,
      incomingFingerprint: incomingHw,
      otherDevicesWithSameFingerprint: sameHwDevices,
    });

    if (cloneCheck.isCloneConflict) {
      this.logAuditEvent({
        tenantId: client.tenantId,
        deviceId: client.deviceId,
        eventType: 'CLONE_DETECTED',
        details: {
          reason: cloneCheck.reason,
          incoming_fingerprint: incomingHw,
          stored_fingerprint: device.hardware_fingerprint,
          conflicting_device_ids: cloneCheck.conflictingDeviceIds,
        },
      });
      this.broadcastToDashboard({
        type: 'AGENT_SECURITY_ALERT',
        alert_type: 'CLONE_DETECTED',
        device_id: client.deviceId,
        device_name: device.name,
        reason: cloneCheck.reason,
      });
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(
          JSON.stringify({
            type: 'CLONE_DETECTED_REPAIR_REQUIRED',
            reason: cloneCheck.reason,
          })
        );
      }
      return;
    }

    const activeSession = sqlQueryOne<any>(
      "SELECT * FROM sessions WHERE device_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
      [client.deviceId]
    );

    let targetStatus: AgentStatus = 'online_locked';

    if (device.agent_status === 'maintenance') {
      targetStatus = 'maintenance';
    } else if (activeSession && !activeSession.is_paused) {
      targetStatus = 'online_in_session';
      if (currentLockState !== 'unlocked' || activeLocalSessionId !== activeSession.id) {
        const remainingSec = this.calculateRemainingSeconds(activeSession);
        this.sendDeviceCommand({
          tenantId: client.tenantId,
          deviceId: client.deviceId,
          sessionId: activeSession.id,
          commandType: 'SESSION_START_UNLOCK',
          payload: {
            session_id: activeSession.id,
            session_type: activeSession.session_type,
            duration_seconds: remainingSec,
            reconciled: true,
          },
        });
      }
    } else {
      targetStatus = 'online_locked';
      if (currentLockState === 'unlocked' || activeLocalSessionId) {
        this.sendDeviceCommand({
          tenantId: client.tenantId,
          deviceId: client.deviceId,
          sessionId: activeSession?.id || null,
          commandType: activeSession?.is_paused ? 'SESSION_PAUSE_LOCK' : 'SESSION_END_LOCK',
          payload: {
            reason: activeSession?.is_paused ? 'session_paused' : 'reconcile_no_active_session',
          },
        });
      }
    }

    const nowIso = new Date().toISOString();
    sqlRun(
      `UPDATE devices
       SET agent_status = ?, agent_version = ?, last_seen_at = ?, last_ip = ?, updated_at = ?
       WHERE id = ?`,
      [targetStatus, agentVersion, nowIso, client.ipAddress, nowIso, client.deviceId]
    );

    this.logAuditEvent({
      tenantId: client.tenantId,
      deviceId: client.deviceId,
      eventType: 'AGENT_RECONCILED',
      details: {
        agent_version: agentVersion,
        target_status: targetStatus,
        active_session_id: activeSession?.id || null,
      },
    });

    this.updateTelemetrySnapshot({
      device_id: client.deviceId,
      agent_status: targetStatus,
      cpu_percent: Number(msg.cpu_percent || 8),
      ram_percent: Number(msg.ram_percent || 34),
      uptime_seconds: Number(msg.uptime_seconds || 3600),
      active_window_title: String(
        msg.active_window_title ||
          (targetStatus === 'online_locked' ? 'CCMS Lock Screen' : 'Desktop')
      ),
      active_session_id: activeSession?.id || null,
      last_seen_at: nowIso,
      last_ip: client.ipAddress,
      agent_version: agentVersion,
    });
  }

  private handleAgentHeartbeat(client: ConnectedAgentClient, msg: Record<string, unknown>): void {
    const nowIso = new Date().toISOString();
    const existing = this.telemetryMap.get(client.deviceId);
    const lockState = String(msg.lock_state || '');

    let status: AgentStatus = existing?.agent_status || 'online_locked';
    if (lockState === 'maintenance') {
      status = 'maintenance';
    } else if (lockState === 'unlocked') {
      status = 'online_in_session';
    } else if (lockState === 'locked') {
      status = 'online_locked';
    }

    const snapshot: AgentTelemetry = {
      device_id: client.deviceId,
      agent_status: status,
      cpu_percent: Math.min(100, Math.max(0, Math.round(Number(msg.cpu_percent ?? existing?.cpu_percent ?? 10)))),
      ram_percent: Math.min(100, Math.max(0, Math.round(Number(msg.ram_percent ?? existing?.ram_percent ?? 35)))),
      uptime_seconds: Math.round(Number(msg.uptime_seconds ?? existing?.uptime_seconds ?? 0)),
      active_window_title: msg.active_window_title
        ? String(msg.active_window_title)
        : existing?.active_window_title ?? null,
      active_session_id: msg.active_session_id
        ? String(msg.active_session_id)
        : existing?.active_session_id ?? null,
      last_seen_at: nowIso,
      last_ip: client.ipAddress,
      agent_version: msg.agent_version ? String(msg.agent_version) : existing?.agent_version ?? '1.0.0',
    };

    this.updateTelemetrySnapshot(snapshot);

    if (!existing || existing.agent_status !== status || Date.now() - client.lastDbPersistAt > 60_000) {
      client.lastDbPersistAt = Date.now();
      sqlRun(
        'UPDATE devices SET agent_status = ?, last_seen_at = ?, last_ip = ?, updated_at = ? WHERE id = ?',
        [status, nowIso, client.ipAddress, nowIso, client.deviceId]
      );
    }
  }

  private handleCommandAck(client: ConnectedAgentClient, msg: Record<string, unknown>): void {
    const commandId = String(msg.command_id || '');
    const ackStatus = msg.status === 'failed' ? 'failed' : 'succeeded';
    const errorMessage = msg.error_message ? String(msg.error_message) : null;
    if (!commandId) return;

    const nowIso = new Date().toISOString();
    sqlRun(
      'UPDATE device_commands SET status = ?, ack_at = ?, completed_at = ?, error_message = ? WHERE id = ? AND device_id = ?',
      [ackStatus, nowIso, nowIso, errorMessage, commandId, client.deviceId]
    );

    this.broadcastToDashboard({
      type: 'DEVICE_COMMAND_ACK',
      device_id: client.deviceId,
      command_id: commandId,
      status: ackStatus,
      error_message: errorMessage,
    });
  }

  private handleTamperAlert(client: ConnectedAgentClient, msg: Record<string, unknown>): void {
    const reason = String(msg.reason || 'TAMPER_DETECTED');
    this.logAuditEvent({
      tenantId: client.tenantId,
      deviceId: client.deviceId,
      eventType: 'TAMPER_ALERT',
      details: msg,
    });
    this.broadcastToDashboard({
      type: 'AGENT_SECURITY_ALERT',
      alert_type: 'TAMPER_ALERT',
      device_id: client.deviceId,
      reason,
    });
  }

  /**
   * Updates in-memory telemetry and broadcasts to all dashboard clients.
   */
  public updateTelemetrySnapshot(snapshot: AgentTelemetry): void {
    const enriched: AgentTelemetry = {
      ...snapshot,
      is_simulated: this.simulatedAgents.has(snapshot.device_id),
    };
    this.telemetryMap.set(snapshot.device_id, enriched);
    this.broadcastToDashboard({
      type: 'AGENT_TELEMETRY_UPDATE',
      telemetry: enriched,
      is_simulated: enriched.is_simulated,
    });
  }

  public updateDeviceStatus(
    deviceId: string,
    tenantId: string,
    status: AgentStatus,
    ipAddress?: string
  ): void {
    const nowIso = new Date().toISOString();
    sqlRun(
      'UPDATE devices SET agent_status = ?, last_seen_at = COALESCE(?, last_seen_at), last_ip = COALESCE(?, last_ip), updated_at = ?, synced = 0 WHERE id = ? AND tenant_id = ?',
      [status, nowIso, ipAddress || null, nowIso, deviceId, tenantId]
    );
    sqlRun(
      `INSERT INTO sync_queue (table_name, record_id, operation, created_at, synced)
       SELECT 'devices', ?, 'UPDATE', ?, 0
       WHERE NOT EXISTS (SELECT 1 FROM sync_queue WHERE table_name = 'devices' AND record_id = ? AND synced = 0)`,
      [deviceId, nowIso, deviceId]
    );

    const existing = this.telemetryMap.get(deviceId);
    const updated: AgentTelemetry = {
      device_id: deviceId,
      agent_status: status,
      cpu_percent: status === 'offline' || status === 'unpaired' ? 0 : existing?.cpu_percent ?? 8,
      ram_percent: status === 'offline' || status === 'unpaired' ? 0 : existing?.ram_percent ?? 32,
      uptime_seconds: existing?.uptime_seconds ?? 0,
      active_window_title:
        status === 'online_locked'
          ? 'CCMS Lock Screen Overlay'
          : status === 'online_in_session'
          ? 'Active Gaming Session'
          : status === 'maintenance'
          ? 'Admin Maintenance Mode'
          : null,
      active_session_id: existing?.active_session_id ?? null,
      last_seen_at: nowIso,
      last_ip: ipAddress || existing?.last_ip || '192.168.1.101',
      agent_version: existing?.agent_version || '1.2.0-win64',
    };
    this.updateTelemetrySnapshot(updated);
  }

  /**
   * Signs, stores, and dispatches a CommandEnvelope to a managed device.
   */
  public sendDeviceCommand(params: {
    tenantId: string;
    deviceId: string;
    sessionId?: string | null;
    commandType: DeviceCommandType;
    payload?: Record<string, unknown>;
    issuedByUserId?: string | null;
  }): CommandEnvelope | null {
    const device = sqlQueryOne<any>(
      'SELECT * FROM devices WHERE id = ? AND tenant_id = ?',
      [params.deviceId, params.tenantId]
    );

    if (!device || !device.is_managed) {
      return null;
    }

    const commandId = crypto.randomUUID();
    const sequenceNumber = this.getNextSequenceNumber(params.deviceId);
    const envelope = createSignedCommandEnvelope({
      commandId,
      sequenceNumber,
      deviceId: params.deviceId,
      tenantId: params.tenantId,
      commandType: params.commandType,
      payload: params.payload || {},
      ttlSeconds: 30,
    });

    const connectedClient = this.connectedAgents.get(params.deviceId);
    const simulated = this.simulatedAgents.get(params.deviceId);
    let initialStatus: 'queued' | 'sent' | 'succeeded' = 'queued';

    if (connectedClient && connectedClient.ws.readyState === WebSocket.OPEN) {
      try {
        connectedClient.ws.send(
          JSON.stringify({
            type: 'COMMAND_ENVELOPE',
            envelope,
          })
        );
        initialStatus = 'sent';
      } catch {
        initialStatus = 'queued';
      }
    } else if (simulated) {
      initialStatus = 'succeeded';
    }

    const nowIso = new Date().toISOString();
    const dbCommandType =
      envelope.command_type === 'ADMIN_MAINTENANCE_UNLOCK'
        ? envelope.payload?.enabled !== false
          ? 'ENTER_MAINTENANCE'
          : 'EXIT_MAINTENANCE'
        : envelope.command_type === 'AGENT_UNPAIR_UNLOCK'
        ? 'REVOKE_CREDENTIAL'
        : envelope.command_type;

    sqlRun(
      `INSERT INTO device_commands (
        id, tenant_id, device_id, session_id, command_type, params_json,
        status, issued_by, issued_at, ack_at, completed_at, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        envelope.command_id,
        envelope.tenant_id,
        envelope.device_id,
        params.sessionId || null,
        dbCommandType,
        JSON.stringify({
          sequence_number: envelope.sequence_number,
          signature: envelope.signature,
          expires_at: envelope.expires_at,
          payload: envelope.payload,
        }),
        initialStatus,
        params.issuedByUserId || null,
        envelope.issued_at,
        initialStatus === 'succeeded' ? nowIso : null,
        initialStatus === 'succeeded' ? nowIso : null,
      ]
    );
    sqlRun(
      `INSERT INTO sync_queue (table_name, record_id, operation, created_at, synced)
       VALUES ('device_commands', ?, 'INSERT', ?, 0)`,
      [envelope.command_id, nowIso]
    );

    this.logAuditEvent({
      tenantId: params.tenantId,
      deviceId: params.deviceId,
      eventType: `CMD_${params.commandType}`,
      actorUserId: params.issuedByUserId || null,
      details: {
        command_id: envelope.command_id,
        sequence_number: envelope.sequence_number,
        session_id: params.sessionId || null,
        payload: envelope.payload,
        delivery: simulated ? 'simulated_agent' : initialStatus,
      },
    });

    this.applyCommandStateTransition(device, envelope, params.sessionId || null);

    return envelope;
  }

  private applyCommandStateTransition(
    device: any,
    envelope: CommandEnvelope,
    sessionId: string | null
  ): void {
    const sim = this.simulatedAgents.get(device.id);
    let nextStatus: AgentStatus | null = null;

    switch (envelope.command_type) {
      case 'SESSION_START_UNLOCK':
      case 'SESSION_RESUME_UNLOCK':
        if (sim) {
          sim.locked = false;
          sim.maintenanceMode = false;
          sim.activeSessionId = sessionId || String(envelope.payload.session_id || '');
        }
        if (device.agent_status !== 'unpaired' && device.agent_status !== 'offline') {
          nextStatus = 'online_in_session';
        }
        break;
      case 'SESSION_PAUSE_LOCK':
      case 'SESSION_END_LOCK':
        if (sim) {
          sim.locked = true;
          if (envelope.command_type === 'SESSION_END_LOCK') {
            sim.activeSessionId = null;
          }
        }
        if (device.agent_status !== 'unpaired' && device.agent_status !== 'offline') {
          nextStatus = 'online_locked';
        }
        break;
      case 'ADMIN_MAINTENANCE_UNLOCK':
      case 'ENTER_MAINTENANCE':
        if (sim) {
          const enabled = envelope.payload.enabled !== false;
          sim.maintenanceMode = enabled;
          sim.locked = !enabled;
          nextStatus = enabled ? 'maintenance' : 'online_locked';
        } else if (device.agent_status !== 'unpaired') {
          const enabled = envelope.payload.enabled !== false;
          nextStatus = enabled ? 'maintenance' : 'online_locked';
        }
        break;
      case 'EXIT_MAINTENANCE':
        if (sim) {
          sim.maintenanceMode = false;
          sim.locked = true;
        }
        nextStatus = 'online_locked';
        break;
      case 'AGENT_UNPAIR_UNLOCK':
      case 'REVOKE_CREDENTIAL':
        if (sim) {
          this.stopSimulatedAgent(device.id);
        }
        nextStatus = 'unpaired';
        break;
      case 'DISPLAY_MESSAGE':
        if (sim) {
          sim.lastMessage = String(envelope.payload.message || '');
        }
        break;
      default:
        break;
    }

    if (nextStatus) {
      this.updateDeviceStatus(device.id, device.tenant_id, nextStatus, device.last_ip);
    } else {
      this.broadcastToDashboard({
        type: 'DEVICE_COMMAND_SENT',
        device_id: device.id,
        command_type: envelope.command_type,
        command_id: envelope.command_id,
      });
    }
  }

  private flushPendingCommands(deviceId: string): void {
    const client = this.connectedAgents.get(deviceId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    const pending = sqlQueryAll<any>(
      "SELECT * FROM device_commands WHERE device_id = ? AND status = 'queued' ORDER BY issued_at ASC LIMIT 10",
      [deviceId]
    );

    for (const row of pending) {
      let parsedParams: any = {};
      try {
        parsedParams = JSON.parse(row.params_json || '{}');
      } catch {
        parsedParams = {};
      }
      const envelope = createSignedCommandEnvelope({
        commandId: row.id,
        sequenceNumber: parsedParams.sequence_number || this.getNextSequenceNumber(deviceId),
        deviceId: row.device_id,
        tenantId: row.tenant_id,
        commandType: row.command_type,
        payload: parsedParams.payload || parsedParams,
        ttlSeconds: 30,
      });

      client.ws.send(
        JSON.stringify({
          type: 'COMMAND_ENVELOPE',
          envelope,
        })
      );

      sqlRun("UPDATE device_commands SET status = 'sent' WHERE id = ?", [row.id]);
    }
  }

  /**
   * Writes an entry into `device_audit_log`.
   */
  public logAuditEvent(params: {
    tenantId: string;
    deviceId: string;
    eventType: string;
    actorUserId?: string | null;
    details?: Record<string, unknown>;
  }): void {
    const auditId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    sqlRun(
      `INSERT INTO device_audit_log (id, tenant_id, device_id, actor_id, event_type, details, created_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        auditId,
        params.tenantId,
        params.deviceId,
        params.actorUserId || null,
        params.eventType,
        JSON.stringify(params.details || {}),
        nowIso,
      ]
    );
    sqlRun(
      `INSERT INTO sync_queue (table_name, record_id, operation, created_at, synced)
       VALUES ('device_audit_log', ?, 'INSERT', ?, 0)`,
      [auditId, nowIso]
    );
  }

  public calculateRemainingSeconds(session: any): number | null {
    if (session.session_type !== 'fixed' || !session.scheduled_end) {
      return null;
    }
    const endMs = new Date(session.scheduled_end).getTime();
    const graceMs = Number(session.grace_period_minutes || 0) * 60_000;
    return Math.max(0, Math.round((endMs + graceMs - Date.now()) / 1000));
  }

  /**
   * Section 6.2: Fixed-Session Time Warning & Auto-Lock Enforcement Loop
   */
  private startEnforcementLoop(): void {
    if (this.enforcementTimer || process.env.NODE_ENV === 'test') return;

    this.enforcementTimer = setInterval(() => {
      try {
        const activeFixedSessions = sqlQueryAll<any>(
          `SELECT s.*, d.is_managed
           FROM sessions s
           JOIN devices d ON s.device_id = d.id
           WHERE s.status = 'active' AND s.session_type = 'fixed' AND d.is_managed = 1`
        );

        for (const sess of activeFixedSessions) {
          if (sess.is_paused) continue;
          const remaining = this.calculateRemainingSeconds(sess);
          if (remaining === null) continue;

          if (remaining <= 0 && !this.expiredLockedSessions.has(sess.id)) {
            this.expiredLockedSessions.add(sess.id);
            this.sendDeviceCommand({
              tenantId: sess.tenant_id,
              deviceId: sess.device_id,
              sessionId: sess.id,
              commandType: 'SESSION_END_LOCK',
              payload: {
                reason: 'fixed_time_expired',
                message: 'Time is up! Please visit the cashier to extend or settle your session.',
              },
            });
          } else if (remaining > 0 && remaining <= 60 && !this.warned1MinSessions.has(sess.id)) {
            this.warned1MinSessions.add(sess.id);
            this.sendDeviceCommand({
              tenantId: sess.tenant_id,
              deviceId: sess.device_id,
              sessionId: sess.id,
              commandType: 'DISPLAY_MESSAGE',
              payload: {
                title: '1 Minute Remaining',
                message: 'Less than 1 minute left in your session. Contact the counter to extend time.',
                severity: 'critical',
                remaining_seconds: remaining,
              },
            });
          } else if (remaining > 60 && remaining <= 300 && !this.warned5MinSessions.has(sess.id)) {
            this.warned5MinSessions.add(sess.id);
            this.sendDeviceCommand({
              tenantId: sess.tenant_id,
              deviceId: sess.device_id,
              sessionId: sess.id,
              commandType: 'DISPLAY_MESSAGE',
              payload: {
                title: '5 Minutes Remaining',
                message: '5 minutes remaining in your gaming session.',
                severity: 'warning',
                remaining_seconds: remaining,
              },
            });
          }
        }
      } catch {
        // ignore background tick errors
      }
    }, 10_000);
  }

  /**
   * Starts a built-in Simulated Windows Agent for a device so the user can test
   * live enforcement, telemetry, lock/unlock, and messages directly from the dashboard.
   */
  public startSimulatedAgent(deviceId: string, tenantId: string): AgentTelemetry {
    this.stopSimulatedAgent(deviceId);

    const device = sqlQueryOne<any>(
      'SELECT * FROM devices WHERE id = ? AND tenant_id = ?',
      [deviceId, tenantId]
    );

    if (!device) {
      throw new Error('Device not found');
    }

    const activeSession = sqlQueryOne<any>(
      "SELECT * FROM sessions WHERE device_id = ? AND status = 'active' LIMIT 1",
      [deviceId]
    );

    const isUnlocked = Boolean(activeSession && !activeSession.is_paused);
    const initialStatus: AgentStatus = isUnlocked ? 'online_in_session' : 'online_locked';
    const hwFingerprint =
      device.hardware_fingerprint ||
      `SIM-HW-${crypto.createHash('sha256').update(deviceId).digest('hex').slice(0, 16).toUpperCase()}`;
    const agentToken = device.agent_token || `ccms_sim_${crypto.randomBytes(16).toString('hex')}`;
    const keys = getOrCreateControllerKeyPair();
    const nowIso = new Date().toISOString();
    const simulatedIp = device.last_ip || `192.168.1.${100 + ((device.device_number || 1) % 150)}`;

    sqlRun(
      `UPDATE devices
       SET is_managed = 1,
           agent_status = ?,
           agent_version = '1.2.0-win64',
           hardware_fingerprint = ?,
           agent_public_key = ?,
           agent_token = ?,
           last_seen_at = ?,
           last_ip = ?,
           updated_at = ?,
           synced = 0
       WHERE id = ? AND tenant_id = ?`,
      [
        initialStatus,
        hwFingerprint,
        keys.publicKeyBase64,
        agentToken,
        nowIso,
        simulatedIp,
        nowIso,
        deviceId,
        tenantId,
      ]
    );
    sqlRun(
      `INSERT INTO sync_queue (table_name, record_id, operation, created_at, synced)
       SELECT 'devices', ?, 'UPDATE', ?, 0
       WHERE NOT EXISTS (SELECT 1 FROM sync_queue WHERE table_name = 'devices' AND record_id = ? AND synced = 0)`,
      [deviceId, nowIso, deviceId]
    );

    const instance: SimulatedAgentInstance = {
      deviceId,
      tenantId,
      locked: !isUnlocked,
      maintenanceMode: false,
      activeSessionId: activeSession?.id || null,
      startedAt: Date.now(),
      lastMessage: null,
      timer: setInterval(() => {
        this.tickSimulatedAgent(deviceId);
      }, 4000),
    };

    this.simulatedAgents.set(deviceId, instance);

    this.logAuditEvent({
      tenantId,
      deviceId,
      eventType: 'SIMULATED_AGENT_CONNECTED',
      details: {
        hardware_fingerprint: hwFingerprint,
        ip: simulatedIp,
        initial_status: initialStatus,
      },
    });

    return this.tickSimulatedAgent(deviceId);
  }

  private tickSimulatedAgent(deviceId: string): AgentTelemetry {
    const sim = this.simulatedAgents.get(deviceId);
    const device = sqlQueryOne<any>('SELECT * FROM devices WHERE id = ?', [deviceId]);
    const activeSession = sqlQueryOne<any>(
      "SELECT * FROM sessions WHERE device_id = ? AND status = 'active' LIMIT 1",
      [deviceId]
    );

    let status: AgentStatus = 'online_locked';
    if (sim?.maintenanceMode || device?.agent_status === 'maintenance') {
      status = 'maintenance';
    } else if (activeSession && !activeSession.is_paused) {
      status = 'online_in_session';
    } else {
      status = 'online_locked';
    }

    const baseCpu = status === 'online_in_session' ? 44 : 6;
    const cpuJitter = Math.floor(Math.random() * 14) - 5;
    const cpuPercent = Math.min(98, Math.max(2, baseCpu + cpuJitter));

    const baseRam = status === 'online_in_session' ? 62 : 28;
    const ramJitter = Math.floor(Math.random() * 6) - 2;
    const ramPercent = Math.min(95, Math.max(18, baseRam + ramJitter));

    const uptimeSeconds = Math.floor((Date.now() - (sim?.startedAt || Date.now())) / 1000) + 14_400;
    const windowTitle =
      status === 'online_in_session'
        ? 'Counter-Strike 2 / Steam Client'
        : status === 'maintenance'
        ? 'Windows Explorer (Admin Maintenance)'
        : 'CCMS Lock Screen (Session 1 Overlay)';

    const snapshot: AgentTelemetry = {
      device_id: deviceId,
      agent_status: status,
      cpu_percent: cpuPercent,
      ram_percent: ramPercent,
      uptime_seconds: uptimeSeconds,
      active_window_title: windowTitle,
      active_session_id: activeSession?.id || null,
      last_seen_at: new Date().toISOString(),
      last_ip: device?.last_ip || '192.168.1.101',
      agent_version: device?.agent_version || '1.2.0-win64',
      is_simulated: true,
      last_message: sim?.lastMessage || null,
    };

    this.updateTelemetrySnapshot(snapshot);
    return snapshot;
  }

  public stopSimulatedAgent(deviceId: string): void {
    const sim = this.simulatedAgents.get(deviceId);
    if (sim) {
      clearInterval(sim.timer);
      this.simulatedAgents.delete(deviceId);
    }
  }
}

export const agentControlService = new AgentControlService();
