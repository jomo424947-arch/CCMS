import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, forbidden, notFound } from '../lib/errors';
import type { DbDevice } from '../lib/types';
import { agentControlService } from '../lib/agent-control.service';

/** GET /api/devices — list all devices with current status and live Agent telemetry. */
export async function listDevices(req: Request, res: Response) {
  const includeArchived = req.query.include_archived === 'true';

  let query = supabase
    .from('devices')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('name', { ascending: true });

  if (!includeArchived) {
    query = query.eq('archived', false);
  }

  const { data, error } = await query;
  if (error) throw error;

  const devices = data ?? [];
  if (devices.length > 0) {
    const deviceIds = devices.map((d: any) => d.id);
    const { data: sessionData, error: scError } = await supabase
      .from('sessions')
      .select('device_id')
      .in('device_id', deviceIds)
      .eq('tenant_id', req.user!.tenant_id);

    const historyMap = new Set<string>();
    if (!scError && sessionData) {
      sessionData.forEach((s: any) => {
        historyMap.add(s.device_id);
      });
    }

    const result = devices.map((d: any) => {
      const { agent_token, ...safeDevice } = d;
      const telemetry = agentControlService.getDeviceTelemetry(d.id);
      const is_simulated = agentControlService.isSimulatedAgentRunning(d.id);
      return {
        ...safeDevice,
        is_managed: Boolean(d.is_managed),
        agent_status: telemetry?.agent_status || d.agent_status || 'unpaired',
        last_seen_at: telemetry?.last_seen_at || d.last_seen_at || null,
        last_ip: telemetry?.last_ip || d.last_ip || null,
        telemetry,
        is_simulated,
        has_session_history: historyMap.has(d.id),
      };
    });
    res.json({ data: result });
    return;
  }

  res.json({ data: [] });
}

/** POST /api/devices — create a new device (admin only). */
export async function createDevice(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can create devices');
  }
  const { name, type, hourly_rate, hourly_rate_multi, specs, is_managed, device_number } = req.body;
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    throw badRequest('اسم الجهاز مطلوب / Device name is required');
  }

  // Check duplicate device_number among active (non-archived) devices in this tenant
  if (device_number !== undefined && device_number !== null) {
    const { data: existingNum } = await supabase
      .from('devices')
      .select('id, name')
      .eq('tenant_id', req.user!.tenant_id)
      .eq('device_number', Number(device_number))
      .eq('archived', false)
      .maybeSingle();

    if (existingNum) {
      throw badRequest(
        `رقم الجهاز ${device_number} مستخدم بالفعل للجهاز "${existingNum.name}". يرجى اختيار رقم آخر.`
      );
    }
  }

  const managedFlag = is_managed !== undefined ? Boolean(is_managed) : type === 'pc';

  const { data, error } = await supabase
    .from('devices')
    .insert({
      name: trimmedName,
      type,
      hourly_rate: Number(hourly_rate ?? 0),
      hourly_rate_multi: Number(hourly_rate_multi ?? hourly_rate ?? 0),
      specs: specs ?? null,
      status: 'available',
      is_managed: managedFlag,
      device_number: device_number ?? null,
      agent_status: 'unpaired',
      tenant_id: req.user!.tenant_id,
    })
    .select()
    .single();

  if (error) {
    const errMsg = String(error.message || '');
    if (error.code === '23505' || errMsg.includes('UNIQUE constraint failed')) {
      throw badRequest('يوجد جهاز آخر بنفس الاسم أو الرقم بالفعل / A device with that name or number already exists');
    }
    throw error;
  }
  res.status(201).json({ data: { ...(data as any), is_managed: Boolean((data as any)?.is_managed) } as DbDevice });
}

/** PATCH /api/devices/:id — update device info or status. */
export async function updateDevice(req: Request, res: Response) {
  const { id } = req.params;
  const { name, type, status, hourly_rate, hourly_rate_multi, specs, is_managed, device_number } = req.body;

  // Security: only admins can edit configuration details. Staff can only update status.
  if (req.user?.role !== 'admin') {
    if (
      name !== undefined ||
      type !== undefined ||
      hourly_rate !== undefined ||
      hourly_rate_multi !== undefined ||
      specs !== undefined ||
      is_managed !== undefined ||
      device_number !== undefined
    ) {
      throw forbidden('Only admins can update device settings');
    }
  }

  if (status === 'offline' || status === 'maintenance') {
    const { data: activeSess } = await supabase
      .from('sessions')
      .select('id')
      .eq('device_id', id)
      .eq('status', 'active')
      .eq('tenant_id', req.user!.tenant_id)
      .maybeSingle();

    if (activeSess) {
      throw badRequest(`Cannot set device status to '${status}' while an active session is in progress`);
    }
  }

  if (device_number !== undefined && device_number !== null) {
    const { data: existingNum } = await supabase
      .from('devices')
      .select('id, name')
      .eq('tenant_id', req.user!.tenant_id)
      .eq('device_number', Number(device_number))
      .eq('archived', false)
      .neq('id', id)
      .maybeSingle();

    if (existingNum) {
      throw badRequest(
        `رقم الجهاز ${device_number} مستخدم بالفعل للجهاز "${existingNum.name}". يرجى اختيار رقم آخر.`
      );
    }
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (name !== undefined) patch.name = String(name).trim();
  if (type !== undefined) patch.type = type;
  if (status !== undefined) patch.status = status;
  if (hourly_rate !== undefined) patch.hourly_rate = Number(hourly_rate);
  if (hourly_rate_multi !== undefined) patch.hourly_rate_multi = Number(hourly_rate_multi);
  if (specs !== undefined) patch.specs = specs;
  if (is_managed !== undefined) patch.is_managed = is_managed ? 1 : 0;
  if (device_number !== undefined) patch.device_number = device_number;

  const { data, error } = await supabase
    .from('devices')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .maybeSingle();

  if (error) {
    const errMsg = String(error.message || '');
    if (error.code === '23505' || errMsg.includes('UNIQUE constraint failed')) {
      throw badRequest('يوجد جهاز آخر بنفس الرقم بالفعل / Duplicate device number');
    }
    throw error;
  }
  if (!data) throw notFound('Device not found');
  res.json({ data: { ...(data as any), is_managed: Boolean((data as any)?.is_managed) } as DbDevice });
}

/** DELETE /api/devices/:id — remove a device (admin only). */
export async function deleteDevice(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can delete devices');
  }
  const { id } = req.params;

  // 1. Prevent deleting/archiving device while an active session is running
  const { data: activeSession } = await supabase
    .from('sessions')
    .select('id')
    .eq('device_id', id)
    .eq('status', 'active')
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (activeSession) {
    throw badRequest('Cannot delete or archive device while an active session is in progress. Please end the session first.');
  }

  // 2. Unlink any room pointing to this device
  await supabase
    .from('rooms')
    .delete()
    .eq('device_id', id)
    .eq('tenant_id', req.user!.tenant_id);

  // 3. Delete any reservations on this device
  await supabase
    .from('reservations')
    .delete()
    .eq('device_id', id)
    .eq('tenant_id', req.user!.tenant_id);

  // 4. Check if device has any session history
  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('device_id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .limit(1);

  if (sErr) throw sErr;

  if (sessions && sessions.length > 0) {
    // Has history, archive instead of deleting
    const { error: updErr } = await supabase
      .from('devices')
      .update({ archived: true, status: 'offline' })
      .eq('id', id)
      .eq('tenant_id', req.user!.tenant_id);
    if (updErr) throw updErr;
    res.json({ message: 'Device archived', action: 'archived' });
  } else {
    // Zero history, permanent delete
    const { error, count } = await supabase
      .from('devices')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('tenant_id', req.user!.tenant_id);

    if (error) throw error;
    if (!count) throw notFound('Device not found');
    res.json({ message: 'Device removed', action: 'deleted' });
  }
}