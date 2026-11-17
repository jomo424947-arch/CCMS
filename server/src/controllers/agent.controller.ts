import { Request, Response } from 'express';
import crypto from 'crypto';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import {
  generatePairingCode,
  generateAgentToken,
  getOrCreateControllerKeyPair,
  detectHardwareClone,
} from '../lib/agent-crypto';
import {
  agentControlService,
  sqlQueryAll,
  sqlQueryOne,
  sqlRun,
} from '../lib/agent-control.service';
import { getControllerDiscoveryMetadata } from '../lib/udp-discovery';
import { getActiveTenantConfig } from '../lib/database';
import { cloudSupabase } from '../lib/cloud-supabase';
import { runSync } from '../lib/sync-engine';

/**
 * GET /api/agent/discover
 * Public LAN discovery endpoint for Windows Agents.
 */
export async function discoverController(_req: Request, res: Response) {
  const port = Number(process.env.CCMS_PORT || (process.env.PORT && process.env.PORT !== '8080' && process.env.PORT !== '3000' ? process.env.PORT : 5000));
  const metadata = getControllerDiscoveryMetadata(port);
  res.json({ data: metadata });
}

/**
 * POST /api/agent/pairing-code
 * Generates a 6-digit OTP pairing code valid for 15 minutes (admin only),
 * plus a ready-to-run `install-cafe.bat` script for mass deployment.
 */
export async function createPairingCode(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can generate Agent pairing codes');
  }

  const { device_id = null, ttl_minutes = 15 } = req.body;
  const tenantId = req.user.tenant_id;

  if (device_id) {
    const dev = sqlQueryOne<any>(
      'SELECT id, name FROM devices WHERE id = ? AND tenant_id = ?',
      [device_id, tenantId]
    );
    if (!dev) throw notFound('Device not found');
  }

  const code = generatePairingCode();
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + Number(ttl_minutes) * 60_000).toISOString();

  sqlRun(
    `INSERT INTO device_pairing_codes (id, tenant_id, device_id, code, expires_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, tenantId, device_id, code, expiresAt, req.user.id, new Date(now).toISOString()]
  );

  const port = Number(process.env.PORT || 5000);
  const discovery = getControllerDiscoveryMetadata(port);

  const installScriptBat = [
    '@echo off',
    'REM =====================================================================',
    'REM CCMS Gaming Lounge — One-Click Windows Agent Silent Deployment Script',
    `REM Generated for Cafe: ${discovery.cafe_name}`,
    `REM Controller Key Fingerprint: ${discovery.server_public_key_fingerprint}`,
    'REM =====================================================================',
    'net session >nul 2>&1',
    'if %errorLevel% neq 0 (',
    '  echo [ERROR] Please right-click and Run as Administrator.',
    '  pause',
    '  exit /b 1',
    ')',
    '',
    `set SERVER_IP=${discovery.controller_ip}`,
    `set SERVER_PORT=${port}`,
    `set PAIRING_CODE=${code}`,
    '',
    'echo Installing CCMS Device Control Agent and pairing with %SERVER_IP%:%SERVER_PORT%...',
    'CCMS-Agent-Setup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART ^',
    '  /SERVER_IP=%SERVER_IP% ^',
    '  /SERVER_PORT=%SERVER_PORT% ^',
    '  /PAIRING_CODE=%PAIRING_CODE%',
    '',
    'echo Done! The PC will now appear as Online-Locked in your CCMS Dashboard.',
    'pause',
  ].join('\r\n');

  res.status(201).json({
    data: {
      id,
      code,
      device_id,
      expires_at: expiresAt,
      controller_ip: discovery.controller_ip,
      ws_url: discovery.ws_url,
      server_public_key: discovery.server_public_key,
      server_public_key_fingerprint: discovery.server_public_key_fingerprint,
      install_script_bat: installScriptBat,
    },
  });
}

/**
 * POST /api/agent/pair
 * Called by the Windows Agent installer or Pairing Dialog with the 6-digit OTP.
 */
export async function pairAgentDevice(req: Request, res: Response) {
  const {
    pairing_code,
    device_number,
    device_id,
    hostname = 'PC-CLIENT',
    hardware_fingerprint,
    agent_public_key,
    agent_version = '1.0.0',
  } = req.body;

  const codeRow = sqlQueryOne<any>(
    'SELECT * FROM device_pairing_codes WHERE code = ? ORDER BY created_at DESC LIMIT 1',
    [pairing_code]
  );

  if (!codeRow) {
    throw badRequest('Invalid pairing code');
  }

  if (new Date(codeRow.expires_at).getTime() < Date.now()) {
    throw badRequest('Pairing code has expired. Please generate a new code from the CCMS dashboard.');
  }

  const tenantId = codeRow.tenant_id;

  // Check tenant license limit on max_managed_devices
  const tenantConfig = getActiveTenantConfig();
  const maxManaged = Number((tenantConfig as any)?.max_managed_devices || 50);
  const currentManagedRows = sqlQueryAll<{ id: string }>(
    'SELECT id FROM devices WHERE tenant_id = ? AND is_managed = 1 AND archived = 0',
    [tenantId]
  );

  // Resolve target device
  let targetDevice: any = null;
  const targetDeviceId = device_id || codeRow.device_id;

  if (targetDeviceId) {
    targetDevice = sqlQueryOne<any>(
      'SELECT * FROM devices WHERE id = ? AND tenant_id = ?',
      [targetDeviceId, tenantId]
    );
  } else if (device_number !== undefined && device_number !== null) {
    targetDevice = sqlQueryOne<any>(
      'SELECT * FROM devices WHERE tenant_id = ? AND device_number = ? AND archived = 0',
      [tenantId, Number(device_number)]
    );
  } else if (hostname) {
    // Try matching numeric suffix from hostname like "PC-05" -> 5 or exact name match
    targetDevice = sqlQueryOne<any>(
      'SELECT * FROM devices WHERE tenant_id = ? AND LOWER(name) = LOWER(?) AND archived = 0',
      [tenantId, hostname]
    );
    if (!targetDevice) {
      const match = hostname.match(/(\d+)$/);
      if (match) {
        const parsedNum = parseInt(match[1], 10);
        targetDevice = sqlQueryOne<any>(
          'SELECT * FROM devices WHERE tenant_id = ? AND device_number = ? AND archived = 0',
          [tenantId, parsedNum]
        );
      }
    }
  }

  if (!targetDevice) {
    if (currentManagedRows.length >= maxManaged) {
      throw forbidden(`License limit reached: Maximum ${maxManaged} managed PCs allowed on your current plan.`);
    }
    // Auto-create managed PC record if pairing from mass installer
    const newId = crypto.randomUUID();
    const assignedNumber = device_number ?? currentManagedRows.length + 1;
    const assignedName = hostname !== 'PC-CLIENT' ? hostname : `PC-${String(assignedNumber).padStart(2, '0')}`;
    const nowIso = new Date().toISOString();

    sqlRun(
      `INSERT INTO devices (
        id, name, type, status, hourly_rate, hourly_rate_multi, archived,
        is_managed, device_number, agent_status, tenant_id, created_at, updated_at
      ) VALUES (?, ?, 'pc', 'available', 30, 50, 0, 1, ?, 'unpaired', ?, ?, ?)`,
      [newId, assignedName, assignedNumber, tenantId, nowIso, nowIso]
    );
    targetDevice = sqlQueryOne<any>('SELECT * FROM devices WHERE id = ?', [newId]);
  }

  // Check hardware clone conflicts across other devices in this tenant
  const otherSameHw = sqlQueryAll<{ id: string; name: string }>(
    'SELECT id, name FROM devices WHERE tenant_id = ? AND hardware_fingerprint = ? AND id != ? AND archived = 0',
    [tenantId, hardware_fingerprint, targetDevice.id]
  );

  const cloneCheck = detectHardwareClone({
    deviceId: targetDevice.id,
    storedFingerprint: null, // Re-pairing explicitly binds the new fingerprint unless another PC already owns it
    incomingFingerprint: hardware_fingerprint,
    otherDevicesWithSameFingerprint: otherSameHw,
  });

  if (cloneCheck.isCloneConflict) {
    throw conflict(
      `Hardware fingerprint conflict (${cloneCheck.reason}): Another managed PC is already registered with this motherboard/CPU UUID.`
    );
  }

  const agentToken = generateAgentToken();
  const keys = getOrCreateControllerKeyPair();
  const nowIso = new Date().toISOString();
  const ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  sqlRun(
    `UPDATE devices
     SET is_managed = 1,
         agent_status = 'online_locked',
         agent_version = ?,
         hardware_fingerprint = ?,
         agent_public_key = ?,
         agent_token = ?,
         last_seen_at = ?,
         last_ip = ?,
         updated_at = ?
     WHERE id = ? AND tenant_id = ?`,
    [
      agent_version,
      hardware_fingerprint,
      agent_public_key,
      agentToken,
      nowIso,
      ipAddress,
      nowIso,
      targetDevice.id,
      tenantId,
    ]
  );

  if (codeRow.device_id) {
    sqlRun('UPDATE device_pairing_codes SET used_at = ? WHERE id = ?', [nowIso, codeRow.id]);
  }

  agentControlService.logAuditEvent({
    tenantId,
    deviceId: targetDevice.id,
    eventType: 'DEVICE_PAIRED',
    actorUserId: codeRow.created_by || null,
    details: {
      hostname,
      agent_version,
      hardware_fingerprint,
      ip: ipAddress,
    },
  });

  agentControlService.updateDeviceStatus(targetDevice.id, tenantId, 'online_locked', ipAddress);

  const port = Number(process.env.PORT || 5000);
  const discovery = getControllerDiscoveryMetadata(port);

  res.json({
    data: {
      device_id: targetDevice.id,
      device_name: targetDevice.name,
      device_number: targetDevice.device_number,
      tenant_id: tenantId,
      agent_token: agentToken,
      ws_url: discovery.ws_url,
      server_public_key: keys.publicKeyPem,
      server_public_key_fingerprint: keys.fingerprint,
    },
  });
}

/**
 * GET /api/agent/telemetry
 * Returns live telemetry for all managed devices in the authenticated user's tenant.
 */
export async function listAgentTelemetry(req: Request, res: Response) {
  const tenantId = req.user!.tenant_id;
  const telemetry = agentControlService.getAllTelemetry(tenantId);
  const keys = getOrCreateControllerKeyPair();

  res.json({
    data: {
      telemetry,
      server_public_key_fingerprint: keys.fingerprint,
    },
  });
}

/**
 * POST /api/agent/devices/:id/command
 * Sends a signed CommandEnvelope to a single managed device.
 */
export async function sendCommandToDevice(req: Request, res: Response) {
  const { id } = req.params;
  const { command_type, payload = {}, session_id = null } = req.body;
  const tenantId = req.user!.tenant_id;

  // Admin-only check for maintenance and credential revocation
  if (
    ['ADMIN_MAINTENANCE_UNLOCK', 'ENTER_MAINTENANCE', 'EXIT_MAINTENANCE', 'AGENT_UNPAIR_UNLOCK', 'REVOKE_CREDENTIAL'].includes(command_type) &&
    req.user?.role !== 'admin'
  ) {
    throw forbidden('Only admins can toggle Maintenance Mode or revoke Agent credentials');
  }

  const device = sqlQueryOne<any>(
    'SELECT * FROM devices WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  if (!device) throw notFound('Device not found');

  if (!device.is_managed) {
    // Automatically mark as managed if sending an explicit agent command
    sqlRun('UPDATE devices SET is_managed = 1 WHERE id = ? AND tenant_id = ?', [id, tenantId]);
  }

  const envelope = agentControlService.sendDeviceCommand({
    tenantId,
    deviceId: id,
    sessionId: session_id,
    commandType: command_type,
    payload,
    issuedByUserId: req.user!.id,
  });

  res.json({
    data: {
      envelope,
      telemetry: agentControlService.getDeviceTelemetry(id),
    },
  });
}

/**
 * POST /api/agent/devices/:id/power
 * Section 6.3: Safe Restart / Shutdown Handler with Active Session Protection.
 */
export async function sendSafePowerCommand(req: Request, res: Response) {
  const { id } = req.params;
  const { action, active_session_handling = 'keep_alive', reason = '' } = req.body;
  const tenantId = req.user!.tenant_id;

  const device = sqlQueryOne<any>(
    'SELECT * FROM devices WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  if (!device) throw notFound('Device not found');

  const activeSession = sqlQueryOne<any>(
    "SELECT * FROM sessions WHERE device_id = ? AND status = 'active' AND tenant_id = ? LIMIT 1",
    [id, tenantId]
  );

  const commandType = action === 'shutdown' ? 'SYSTEM_SHUTDOWN' : 'SYSTEM_RESTART';

  const envelope = agentControlService.sendDeviceCommand({
    tenantId,
    deviceId: id,
    sessionId: activeSession?.id || null,
    commandType,
    payload: {
      action,
      active_session_handling,
      reason: reason || `Cashier initiated ${action}`,
      preserve_session_id: active_session_handling === 'keep_alive' ? activeSession?.id || null : null,
    },
    issuedByUserId: req.user!.id,
  });

  res.json({
    data: {
      envelope,
      active_session_id: activeSession?.id || null,
      active_session_handling,
    },
  });
}

/**
 * POST /api/agent/devices/:id/unpair
 * Revokes Agent credentials and unlocks/unpairs the PC (admin only).
 */
export async function unpairAgentDevice(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can unpair or revoke Agent credentials');
  }

  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const device = sqlQueryOne<any>(
    'SELECT * FROM devices WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  if (!device) throw notFound('Device not found');

  agentControlService.sendDeviceCommand({
    tenantId,
    deviceId: id,
    commandType: 'AGENT_UNPAIR_UNLOCK',
    payload: { reason: 'Admin unpaired device from CCMS Dashboard' },
    issuedByUserId: req.user.id,
  });

  agentControlService.stopSimulatedAgent(id);

  const nowIso = new Date().toISOString();
  sqlRun(
    `UPDATE devices
     SET agent_status = 'unpaired',
         agent_token = NULL,
         hardware_fingerprint = NULL,
         agent_public_key = NULL,
         updated_at = ?
     WHERE id = ? AND tenant_id = ?`,
    [nowIso, id, tenantId]
  );

  agentControlService.logAuditEvent({
    tenantId,
    deviceId: id,
    eventType: 'DEVICE_UNPAIRED',
    actorUserId: req.user.id,
    details: { device_name: device.name },
  });

  res.json({
    data: {
      device_id: id,
      agent_status: 'unpaired',
    },
  });
}

/**
 * POST /api/agent/devices/:id/simulate
 * Starts or stops a Live Simulated Windows Agent on a device so the user can test
 * real-time CPU/RAM telemetry, lock/unlock session sync, and messages right in the browser.
 */
export async function toggleSimulatedAgent(req: Request, res: Response) {
  const { id } = req.params;
  const { enabled = true } = req.body;
  const tenantId = req.user!.tenant_id;

  const device = sqlQueryOne<any>(
    'SELECT * FROM devices WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  if (!device) throw notFound('Device not found');

  if (enabled) {
    const telemetry = agentControlService.startSimulatedAgent(id, tenantId);
    res.json({
      data: {
        device_id: id,
        is_simulated: true,
        telemetry,
      },
    });
  } else {
    agentControlService.stopSimulatedAgent(id);
    agentControlService.updateDeviceStatus(id, tenantId, 'offline', device.last_ip);
    res.json({
      data: {
        device_id: id,
        is_simulated: false,
        telemetry: agentControlService.getDeviceTelemetry(id),
      },
    });
  }
}

/**
 * POST /api/agent/bulk-command
 * Dispatches a signed command to multiple managed devices at once.
 */
export async function sendBulkDeviceCommand(req: Request, res: Response) {
  const { device_ids, command_type, payload = {} } = req.body;
  const tenantId = req.user!.tenant_id;

  let targetDevices: Array<{ id: string; name: string; status: string }> = [];
  if (Array.isArray(device_ids) && device_ids.length > 0) {
    const allManaged = sqlQueryAll<{ id: string; name: string; status: string }>(
      'SELECT id, name, status FROM devices WHERE tenant_id = ? AND is_managed = 1 AND archived = 0',
      [tenantId]
    );
    const idSet = new Set(device_ids);
    targetDevices = allManaged.filter((d) => idSet.has(d.id));
  } else {
    targetDevices = sqlQueryAll<{ id: string; name: string; status: string }>(
      'SELECT id, name, status FROM devices WHERE tenant_id = ? AND is_managed = 1 AND archived = 0',
      [tenantId]
    );
  }

  // If bulk locking idle PCs, skip devices that currently have an active session
  if (command_type === 'SESSION_END_LOCK' && payload.only_idle) {
    const activeRows = sqlQueryAll<{ device_id: string }>(
      "SELECT device_id FROM sessions WHERE tenant_id = ? AND status = 'active'",
      [tenantId]
    );
    const busyIds = new Set(activeRows.map((r) => r.device_id));
    targetDevices = targetDevices.filter((d) => !busyIds.has(d.id));
  }

  const dispatched: string[] = [];
  for (const dev of targetDevices) {
    const env = agentControlService.sendDeviceCommand({
      tenantId,
      deviceId: dev.id,
      commandType: command_type,
      payload,
      issuedByUserId: req.user!.id,
    });
    if (env) dispatched.push(dev.id);
  }

  res.json({
    data: {
      dispatched_count: dispatched.length,
      device_ids: dispatched,
    },
  });
}

/**
 * GET /api/agent/devices/:id/audit-logs
 * Returns recent security audit events and signed command history for a device.
 */
export async function listDeviceAuditLogs(req: Request, res: Response) {
  const { id } = req.params;
  const tenantId = req.user!.tenant_id;

  const device = sqlQueryOne<any>(
    'SELECT id, name, agent_status, hardware_fingerprint, last_ip, last_seen_at, agent_version FROM devices WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  if (!device) throw notFound('Device not found');

  const logs = sqlQueryAll<any>(
    `SELECT l.*, u.full_name as actor_name
     FROM device_audit_log l
     LEFT JOIN users u ON l.actor_id = u.id
     WHERE l.device_id = ? AND l.tenant_id = ?
     ORDER BY l.created_at DESC
     LIMIT 50`,
    [id, tenantId]
  );

  const commands = sqlQueryAll<any>(
    `SELECT * FROM device_commands
     WHERE device_id = ? AND tenant_id = ?
     ORDER BY issued_at DESC
     LIMIT 30`,
    [id, tenantId]
  );

  res.json({
    data: {
      device,
      audit_logs: logs.map((row) => ({
        ...row,
        details: typeof row.details === 'string' ? safeJsonParse(row.details) : row.details,
      })),
      commands: commands.map((cmd) => ({
        ...cmd,
        params_json: typeof cmd.params_json === 'string' ? safeJsonParse(cmd.params_json) : cmd.params_json,
      })),
    },
  });
}

function safeJsonParse(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

/**
 * GET /api/agent/cloud-status
 * Checks live Supabase Cloud Database connectivity, pending sync queue items, and synced table counts.
 */
export async function getCloudSyncStatus(req: Request, res: Response) {
  const tenantId = req.user!.tenant_id;
  const initialPending = sqlQueryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM sync_queue WHERE synced = 0'
  );
  if (cloudSupabase && Number(initialPending?.cnt ?? 0) > 0) {
    try {
      await runSync();
    } catch {
      // Non-fatal
    }
  }
  const pendingRow = sqlQueryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM sync_queue WHERE synced = 0'
  );
  const failedRow = sqlQueryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM sync_queue WHERE synced = 2'
  );
  const pendingQueueCount = Number(pendingRow?.cnt ?? 0);
  const failedQueueCount = Number(failedRow?.cnt ?? 0);

  let cloudConnected = false;
  let cloudUrl = process.env.SUPABASE_URL || '';
  let cloudCounts = {
    devices: 0,
    sessions: 0,
    commands: 0,
    audit_logs: 0,
  };

  if (cloudSupabase) {
    try {
      const [devRes, sessRes, cmdRes, audRes] = await Promise.all([
        cloudSupabase.from('devices').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        cloudSupabase.from('sessions').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        cloudSupabase.from('device_commands').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        cloudSupabase.from('device_audit_log').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      ]);
      if (!devRes.error) {
        cloudConnected = true;
        cloudCounts = {
          devices: devRes.count ?? 0,
          sessions: sessRes.count ?? 0,
          commands: cmdRes.count ?? 0,
          audit_logs: audRes.count ?? 0,
        };
      }
    } catch {
      cloudConnected = false;
    }
  }

  res.json({
    data: {
      server_version: '2.0.0',
      agent_version: '2.0.0-win64',
      cloud_configured: Boolean(cloudSupabase),
      cloud_connected: cloudConnected,
      cloud_url: cloudUrl,
      pending_sync_items: pendingQueueCount,
      failed_sync_items: failedQueueCount,
      cloud_counts: cloudCounts,
      checked_at: new Date().toISOString(),
    },
  });
}

export async function triggerCloudSyncNow(req: Request, res: Response) {
  await runSync();
  return getCloudSyncStatus(req, res);
}
