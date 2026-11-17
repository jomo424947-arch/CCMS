-- ============================================================================
-- Migration 019: CCMS Device Control & Enforcement Plane (Phase 1)
-- ============================================================================

-- 1. Extend devices table with Agent Control Plane columns (Backward Compatible)
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS is_managed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS device_number INTEGER;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS agent_status TEXT NOT NULL DEFAULT 'unpaired'
  CHECK (agent_status IN ('unpaired', 'online_locked', 'online_in_session', 'offline', 'maintenance', 'revoked'));
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS agent_version TEXT;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS hardware_fingerprint TEXT;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS agent_public_key TEXT;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS agent_token TEXT;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS last_ip TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_tenant_number
  ON public.devices(tenant_id, device_number)
  WHERE archived = false AND device_number IS NOT NULL;

-- 2. Extend tenants table with licensing limits for managed devices
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS max_managed_devices INTEGER NOT NULL DEFAULT 50;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS device_control_enabled BOOLEAN NOT NULL DEFAULT true;

-- 3. Create device_commands table (Signed Command Queue & Lifecycle Audit)
CREATE TABLE IF NOT EXISTS public.device_commands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id       UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  command_type    TEXT NOT NULL CHECK (command_type IN (
    'SESSION_START_UNLOCK',
    'SESSION_UPDATE_TIME',
    'SESSION_PAUSE_LOCK',
    'SESSION_RESUME_UNLOCK',
    'SESSION_END_LOCK',
    'DISPLAY_MESSAGE',
    'SYSTEM_RESTART',
    'SYSTEM_SHUTDOWN',
    'ENTER_MAINTENANCE',
    'EXIT_MAINTENANCE',
    'REVOKE_CREDENTIAL'
  )),
  params_json     JSONB,
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'sent', 'received', 'executing', 'succeeded', 'failed', 'expired'
  )),
  error_message   TEXT,
  issued_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ack_at          TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_device_commands_device_status ON public.device_commands(device_id, status);
CREATE INDEX IF NOT EXISTS idx_device_commands_tenant ON public.device_commands(tenant_id);

-- 4. Create device_audit_log table (Security & Enforcement Forensics)
CREATE TABLE IF NOT EXISTS public.device_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id   UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_audit_log_device ON public.device_audit_log(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_audit_log_tenant ON public.device_audit_log(tenant_id);

-- 5. Enable Row Level Security (RLS) for multi-tenant isolation
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'device_commands' AND policyname = 'tenant_isolation_device_commands'
  ) THEN
    CREATE POLICY tenant_isolation_device_commands ON public.device_commands
      FOR ALL USING (tenant_id = public.current_tenant_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'device_audit_log' AND policyname = 'tenant_isolation_device_audit_log'
  ) THEN
    CREATE POLICY tenant_isolation_device_audit_log ON public.device_audit_log
      FOR ALL USING (tenant_id = public.current_tenant_id());
  END IF;
END $$;
