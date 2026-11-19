import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { DeviceFormModal } from '../components/DeviceFormModal';
import {
  StartSessionModal,
  EndSessionModal,
  EditSessionModal,
  TransferSessionModal,
} from '../components/SessionModals';
import { AddCafeModal } from '../components/AddCafeModal';
import {
  PairDeviceModal,
  SendMessageModal,
  PowerControlModal,
  DeviceAuditLogModal,
} from '../components/AgentControlModals';
import { useAsync } from '../hooks/useAsync';
import { usePolling } from '../hooks/usePolling';
import { useNow } from '../hooks/useNow';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAgentLiveStatus } from '../hooks/useAgentLiveStatus';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { dataService } from '../services';
import { apiErrorMessage, http } from '../services/http';
import { formatCurrency, formatElapsed } from '../utils/format';
import type { AgentStatus, Device, DeviceType, Session } from '../types';

type FilterTab = 'all' | 'in_session' | 'locked' | 'offline' | 'maintenance';

interface ControllerDiscoveryInfo {
  controller_ip: string;
  port: number;
  ws_url: string;
  cafe_name?: string;
  server_public_key_fingerprint?: string;
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export default function PCControlPage() {
  const isMobile = useIsMobile();
  const now = useNow(1000);
  const { toast } = useToast();
  const { t, language, isRtl } = useLanguage();
  const { isAdmin } = useAuth();
  const isAr = language === 'ar';

  const { data, loading, refetch } = useAsync(async () => {
    const [devices, sessions] = await Promise.all([
      dataService.listDevices(),
      dataService.listSessions('active'),
    ]);
    return { devices, sessions };
  }, []);

  usePolling(refetch, 12000);

  const { telemetryByDevice, wsConnected, refreshTelemetry } = useAgentLiveStatus((alert) => {
    toast(
      isAr
        ? `تنبيه أمني (${alert.alert_type}): ${alert.device_name || alert.device_id}`
        : `Security Alert (${alert.alert_type}): ${alert.device_name || alert.device_id}`,
      'error'
    );
  });

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  // Modals state
  const [creatingPc, setCreatingPc] = useState(false);
  const [editingPc, setEditingPc] = useState<Device | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  // Session modals
  const [startTarget, setStartTarget] = useState<Device | null>(null);
  const [endTarget, setEndTarget] = useState<Session | null>(null);
  const [editSessionTarget, setEditSessionTarget] = useState<Session | null>(null);
  const [transferTarget, setTransferTarget] = useState<Session | null>(null);
  const [cafeTarget, setCafeTarget] = useState<Session | null>(null);

  // Agent modals
  const [pairTarget, setPairTarget] = useState<Device | null | undefined>(undefined);
  const [messageTarget, setMessageTarget] = useState<Device | null | undefined>(undefined);
  const [powerTarget, setPowerTarget] = useState<{ device: Device; session?: Session } | null>(null);
  const [auditTarget, setAuditTarget] = useState<Device | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  // Loading states for quick actions
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [bulkLockLoading, setBulkLockLoading] = useState(false);

  const activeByDevice = useMemo(() => {
    const map = new Map<string, Session>();
    (data?.sessions ?? []).forEach((s) => map.set(s.device_id, s));
    return map;
  }, [data?.sessions]);

  // All PC devices (type === 'pc' OR explicitly managed by CCMS Agent)
  const pcDevices = useMemo(() => {
    return (data?.devices ?? [])
      .filter((d) => d.type === 'pc' || d.is_managed)
      .sort((a, b) => {
        const na = a.device_number ?? Number.MAX_SAFE_INTEGER;
        const nb = b.device_number ?? Number.MAX_SAFE_INTEGER;
        if (na !== nb) return na - nb;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
  }, [data?.devices]);

  const getEffectiveAgentStatus = (d: Device): AgentStatus => {
    return telemetryByDevice[d.id]?.agent_status || d.agent_status || 'unpaired';
  };

  // Fleet KPI stats
  const stats = useMemo(() => {
    let onlineCount = 0;
    let activeSessionCount = 0;
    let lockedReadyCount = 0;
    let maintenanceCount = 0;
    let offlineOrUnpairedCount = 0;

    for (const d of pcDevices) {
      const st = getEffectiveAgentStatus(d);
      const hasSession = activeByDevice.has(d.id);
      if (hasSession) activeSessionCount++;
      if (st === 'online_locked' || st === 'online_in_session' || st === 'maintenance') {
        onlineCount++;
      }
      if (st === 'online_locked' && !hasSession) {
        lockedReadyCount++;
      }
      if (st === 'maintenance') {
        maintenanceCount++;
      }
      if (st === 'offline' || st === 'unpaired' || st === 'revoked') {
        offlineOrUnpairedCount++;
      }
    }

    return {
      total: pcDevices.length,
      onlineCount,
      activeSessionCount,
      lockedReadyCount,
      maintenanceCount,
      offlineOrUnpairedCount,
    };
  }, [pcDevices, telemetryByDevice, activeByDevice]);

  // Filtered PC list
  const filteredPcs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pcDevices.filter((d) => {
      const st = getEffectiveAgentStatus(d);
      const hasSession = activeByDevice.has(d.id);
      const live = telemetryByDevice[d.id];

      if (filterTab === 'in_session' && !hasSession && st !== 'online_in_session') return false;
      if (filterTab === 'locked' && !(st === 'online_locked' && !hasSession)) return false;
      if (filterTab === 'maintenance' && st !== 'maintenance') return false;
      if (filterTab === 'offline' && st !== 'offline' && st !== 'unpaired' && st !== 'revoked') return false;

      if (q) {
        const ip = (live?.last_ip || d.last_ip || '').toLowerCase();
        const win = (live?.active_window_title || '').toLowerCase();
        const num = d.device_number ? String(d.device_number) : '';
        const match =
          d.name.toLowerCase().includes(q) ||
          ip.includes(q) ||
          win.includes(q) ||
          num === q;
        if (!match) return false;
      }

      return true;
    });
  }, [pcDevices, filterTab, searchQuery, telemetryByDevice, activeByDevice]);

  // ─── Action Handlers ──────────────────────────────────────────────────────

  const runDeviceAction = async (deviceId: string, fn: () => Promise<void>) => {
    setBusyDeviceId(deviceId);
    try {
      await fn();
      await Promise.all([refetch(), refreshTelemetry()]);
    } catch (err) {
      toast(apiErrorMessage(err, isAr ? 'فشل تنفيذ الأمر' : 'Action failed'), 'error');
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleLockPc = (device: Device) =>
    runDeviceAction(device.id, async () => {
      await dataService.sendDeviceCommand(device.id, 'SESSION_END_LOCK', {
        reason: 'Manual lock from PC Control Panel',
      });
      toast(isAr ? `تم إرسال أمر قفل الشاشة إلى ${device.name}` : `Sent lock screen command to ${device.name}`, 'success');
    });

  const handleToggleMaintenance = (device: Device) =>
    runDeviceAction(device.id, async () => {
      const st = getEffectiveAgentStatus(device);
      const entering = st !== 'maintenance';
      await dataService.sendDeviceCommand(device.id, 'ADMIN_MAINTENANCE_UNLOCK', {
        enabled: entering,
      });
      toast(
        entering
          ? isAr
            ? `تم فتح ${device.name} في وضع الصيانة`
            : `Unlocked ${device.name} in Maintenance Mode`
          : isAr
          ? `تم إنهاء الصيانة وإعادة قفل ${device.name}`
          : `Exited Maintenance Mode & locked ${device.name}`,
        'success'
      );
    });

  const handleToggleSimulator = (device: Device) =>
    runDeviceAction(device.id, async () => {
      const live = telemetryByDevice[device.id];
      const currentlySim = Boolean(live?.is_simulated ?? device.is_simulated);
      await dataService.toggleSimulatedAgent(device.id, !currentlySim);
      toast(
        !currentlySim
          ? isAr
            ? `تم تفعيل وضع التجربة على ${device.name}`
            : `Demo mode enabled on ${device.name}`
          : isAr
          ? `تم إيقاف وضع التجربة على ${device.name}`
          : `Demo mode stopped on ${device.name}`,
        'info'
      );
    });

  const handleResetStrandedDevice = (device: Device) =>
    runDeviceAction(device.id, async () => {
      await dataService.updateDevice(device.id, { status: 'available' });
      toast(
        isAr ? `تمت إعادة حالة ${device.name} إلى متاح` : `Reset ${device.name} status to available`,
        'success'
      );
    });

  const handleExtendSession = (session: Session) =>
    runDeviceAction(session.device_id, async () => {
      await dataService.extendSession(session.id, 30);
      toast(isAr ? 'تم تمديد الجلسة +30 دقيقة بنجاح' : 'Extended session by +30m', 'success');
    });

  const handlePauseSession = (session: Session) =>
    runDeviceAction(session.device_id, async () => {
      await dataService.pauseSession(session.id);
      toast(isAr ? 'تم تعليق الجلسة وقفل الشاشة مؤقتاً' : 'Session paused & screen locked', 'success');
    });

  const handleResumeSession = (session: Session) =>
    runDeviceAction(session.device_id, async () => {
      await dataService.resumeSession(session.id);
      toast(isAr ? 'تم استئناف الجلسة وفتح الشاشة' : 'Session resumed & screen unlocked', 'success');
    });

  const handleBulkLockIdle = async () => {
    setBulkLockLoading(true);
    try {
      const res = await dataService.sendBulkDeviceCommand('SESSION_END_LOCK', {
        only_idle: true,
        reason: 'Bulk lock all idle PCs from PC Control Console',
      });
      toast(
        isAr
          ? `تم إرسال أمر القفل إلى ${res.dispatched_count} جهاز فارغ`
          : `Locked ${res.dispatched_count} idle PCs`,
        'success'
      );
      refetch();
      refreshTelemetry();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to bulk lock idle PCs'), 'error');
    } finally {
      setBulkLockLoading(false);
    }
  };

  const handleDeletePc = async () => {
    if (!deleteTarget) return;
    setDeletingLoading(true);
    try {
      await dataService.deleteDevice(deleteTarget.id);
      toast(isAr ? `تمت إزالة ${deleteTarget.name} بنجاح` : `Removed ${deleteTarget.name}`, 'success');
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not delete PC'), 'error');
    } finally {
      setDeletingLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <Layout
        title={isAr ? 'إدارة أجهزة الكمبيوتر' : 'PC Control'}
        subtitle={t('loading')}
      >
        <LoadingSpinner label={t('loading')} />
      </Layout>
    );
  }

  return (
    <Layout
      title={isAr ? 'إدارة أجهزة الكمبيوتر' : 'PC Control'}
      subtitle={
        isAr
          ? `${stats.total} جهاز كمبيوتر · ${stats.onlineCount} متصل · ${stats.activeSessionCount} جلسة نشطة`
          : `${stats.total} PCs · ${stats.onlineCount} online · ${stats.activeSessionCount} active sessions`
      }
      actions={
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
          <button
            type="button"
            className="ccms-btn ccms-btn-ghost"
            onClick={() => setShowSetupGuide(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderColor: 'rgba(16, 185, 129, 0.45)',
              color: '#10b981',
              minHeight: '38px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>install_desktop</span>
            <span>{isAr ? 'دليل التثبيت والموبايل' : 'PC & Mobile Setup Guide'}</span>
          </button>

          {isAdmin && (
            <Button
              onClick={() => setCreatingPc(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                minHeight: '38px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_to_queue</span>
              <span>{isAr ? 'إضافة كمبيوتر (PC)' : 'Add PC'}</span>
            </Button>
          )}

          <button
            type="button"
            className="ccms-btn ccms-btn-ghost"
            onClick={() => {
              refetch();
              refreshTelemetry();
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '38px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>sync</span>
            <span>{isAr ? 'تحديث' : 'Refresh'}</span>
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* ─── 1. Summary KPI Strip ─── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
            gap: isMobile ? '10px' : '12px',
          }}
        >
          <KpiTile
            label={isAr ? 'إجمالي الأجهزة' : 'Total PCs'}
            value={String(stats.total)}
            accent="var(--accent-cyan)"
            icon="desktop_windows"
            isMobile={isMobile}
          />
          <KpiTile
            label={isAr ? 'أجهزة متصلة' : 'Online PCs'}
            value={`${stats.onlineCount} / ${stats.total}`}
            accent="#10b981"
            icon="check_circle"
            sub={wsConnected ? (isAr ? 'اتصال مباشر' : 'Live') : (isAr ? 'تحديث تلقائي' : 'Auto Sync')}
            isMobile={isMobile}
          />
          <KpiTile
            label={isAr ? 'جلسات نشطة' : 'Active Sessions'}
            value={String(stats.activeSessionCount)}
            accent="#DFA842"
            icon="sports_esports"
            isMobile={isMobile}
          />
          <KpiTile
            label={isAr ? 'جاهز للعب' : 'Locked & Ready'}
            value={String(stats.lockedReadyCount)}
            accent="#C48A69"
            icon="lock"
            isMobile={isMobile}
          />
        </div>

        {/* ─── 2. Fleet Bulk Command Bar & Search/Filters ─── */}
        <div
          className="ccms-card"
          style={{
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Bulk Actions Row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
                  hub
                </span>
                {isAr ? 'أوامر جماعية' : 'Bulk Actions'}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: wsConnected ? '#10b981' : '#f59e0b',
                  fontWeight: 700,
                }}
              >
                {wsConnected
                  ? isAr ? '● متصل مباشر' : '● Live'
                  : isAr ? '○ تحديث تلقائي' : '○ Syncing'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
              {isAdmin && (
                <button
                  type="button"
                  className="ccms-btn ccms-btn-ghost"
                  onClick={() => setPairTarget(null)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    borderColor: 'rgba(223, 168, 66, 0.4)',
                    color: 'var(--accent-cyan)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>qr_code_2</span>
                  <span>{isAr ? 'ربط جهاز جديد' : 'Connect PC'}</span>
                </button>
              )}

              <button
                type="button"
                className="ccms-btn ccms-btn-ghost"
                onClick={() => setMessageTarget(null)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>campaign</span>
                <span>{isAr ? 'رسالة لكل الشاشات' : 'Broadcast Message'}</span>
              </button>

              <button
                type="button"
                className="ccms-btn ccms-btn-ghost"
                onClick={handleBulkLockIdle}
                disabled={bulkLockLoading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>lock</span>
                <span>{isAr ? 'قفل كل الأجهزة الفارغة' : 'Lock All Idle PCs'}</span>
              </button>
            </div>
          </div>

          {/* Filter Tabs + Search Row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              paddingTop: '10px',
              borderTop: '1px solid var(--border-default)',
            }}
          >
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(
                [
                  { id: 'all', label: isAr ? `الكل (${stats.total})` : `All (${stats.total})` },
                  { id: 'in_session', label: isAr ? `نشط (${stats.activeSessionCount})` : `In Session (${stats.activeSessionCount})` },
                  { id: 'locked', label: isAr ? `مقفل وجاهز (${stats.lockedReadyCount})` : `Locked (${stats.lockedReadyCount})` },
                  { id: 'maintenance', label: isAr ? `صيانة (${stats.maintenanceCount})` : `Maintenance (${stats.maintenanceCount})` },
                  { id: 'offline', label: isAr ? `غير متصل (${stats.offlineOrUnpairedCount})` : `Offline (${stats.offlineOrUnpairedCount})` },
                ] as { id: FilterTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border:
                      filterTab === tab.id
                        ? '1px solid var(--accent-cyan)'
                        : '1px solid var(--border-default)',
                    background:
                      filterTab === tab.id ? 'rgba(223, 168, 66, 0.14)' : 'var(--bg-elevated)',
                    color: filterTab === tab.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', minWidth: isMobile ? '100%' : '240px' }}>
              <input
                type="text"
                className="ccms-input"
                placeholder={isAr ? 'بحث باسم الجهاز أو الرقم أو الـ IP...' : 'Search PC name, #, IP, or game...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', fontSize: '12.5px', padding: '7px 12px' }}
              />
            </div>
          </div>
        </div>

        {/* ─── 3. PC Stations Grid ─── */}
        {pcDevices.length === 0 ? (
          <div className="ccms-card" style={{ padding: '48px 24px' }}>
            <EmptyState
              icon="desktop_windows"
              title={isAr ? 'لا توجد أجهزة كمبيوتر مضافة بعد' : 'No PCs Added Yet'}
              description={
                isAr
                  ? 'أضف أول جهاز كمبيوتر هنا لتفعيل القفل التلقائي والتحكم الكامل بالشاشة عن بُعد.'
                  : 'Add your first PC here to enable automatic screen lock and remote control.'
              }
              action={
                isAdmin ? (
                  <Button onClick={() => setCreatingPc(true)}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
                    <span>{isAr ? 'إضافة أول جهاز PC' : 'Add First PC'}</span>
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : filteredPcs.length === 0 ? (
          <div className="ccms-card" style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {isAr ? 'لا توجد أجهزة مطابقة لخيارات البحث أو الفلتر الحالي.' : 'No PCs match the current filter or search.'}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(360px, 100%), 1fr))',
              gap: '18px',
            }}
          >
            {filteredPcs.map((device) => {
              const live = telemetryByDevice[device.id] || device.telemetry;
              const session = activeByDevice.get(device.id);
              const agentStatus = getEffectiveAgentStatus(device);
              const isOnline =
                agentStatus === 'online_locked' ||
                agentStatus === 'online_in_session' ||
                agentStatus === 'maintenance';
              const isSimulated = Boolean(live?.is_simulated ?? device.is_simulated);
              const isBusy = busyDeviceId === device.id;
              const isStranded = device.status === 'in_use' && !session;

              const statusMeta = (() => {
                if (session?.is_paused) {
                  return { label: isAr ? 'جلسة معلّقة' : 'PAUSED', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)' };
                }
                if (session || agentStatus === 'online_in_session') {
                  return { label: isAr ? 'جلسة نشطة' : 'IN SESSION', color: '#DFA842', bg: 'rgba(223, 168, 66, 0.14)' };
                }
                if (agentStatus === 'online_locked') {
                  return { label: isAr ? 'متصل · مقفل' : 'LOCKED · READY', color: '#10b981', bg: 'rgba(16, 185, 129, 0.14)' };
                }
                if (agentStatus === 'maintenance') {
                  return { label: isAr ? 'وضع الصيانة' : 'MAINTENANCE', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)' };
                }
                if (agentStatus === 'offline') {
                  return { label: isAr ? 'غير متصل' : 'OFFLINE', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.14)' };
                }
                return { label: isAr ? 'بانتظار الربط' : 'UNPAIRED', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.14)' };
              })();

              const cpu = live?.cpu_percent ?? 0;
              const ram = live?.ram_percent ?? 0;
              const ip = live?.last_ip || device.last_ip || '—';
              const activeWindow = live?.active_window_title || (agentStatus === 'online_locked' ? (isAr ? 'شاشة قفل CCMS' : 'CCMS Lock Screen') : '—');
              const specs = (device.specs as Record<string, string> | null) || {};
              const gpuLabel = specs.GPU || specs.gpu || '';
              const cpuSpec = specs.CPU || specs.cpu || '';
              const ramSpec = specs.RAM || specs.ram || '';

              const sessionTimerText = (() => {
                if (!session) return null;
                if (session.is_paused) return isAr ? 'معلّقة' : 'PAUSED';
                if (session.session_type === 'fixed' && session.scheduled_end) {
                  const endMs = new Date(session.scheduled_end).getTime();
                  const remSec = Math.floor((endMs - now) / 1000);
                  if (remSec <= 0) {
                    const over = Math.abs(remSec);
                    const m = Math.floor(over / 60);
                    const s = over % 60;
                    return `+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} OT`;
                  }
                  const h = Math.floor(remSec / 3600);
                  const m = Math.floor((remSec % 3600) / 60);
                  const s = remSec % 60;
                  return h > 0
                    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                }
                return formatElapsed(session.started_at, now, session.total_paused_minutes || 0);
              })();

              return (
                <div
                  key={device.id}
                  className="ccms-card"
                  style={{
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    borderColor: session
                      ? 'rgba(223, 168, 66, 0.45)'
                      : agentStatus === 'maintenance'
                      ? 'rgba(245, 158, 11, 0.45)'
                      : agentStatus === 'online_locked'
                      ? 'rgba(16, 185, 129, 0.3)'
                      : 'var(--border-default)',
                    opacity: isBusy ? 0.78 : 1,
                    transition: 'border-color 0.2s ease, opacity 0.15s ease',
                  }}
                >
                  {/* Card Header: Identity + Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background: statusMeta.bg,
                          border: `1px solid ${statusMeta.color}44`,
                          color: statusMeta.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 800,
                          fontSize: '13px',
                        }}
                      >
                        {device.device_number ? `#${String(device.device_number).padStart(2, '0')}` : 'PC'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '15px',
                              fontWeight: 800,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {device.name}
                          </span>
                          {isSimulated && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(196, 138, 105, 0.18)',
                                color: '#C48A69',
                              }}
                              title={isAr ? 'جهاز في وضع التجربة' : 'Demo Mode Active'}
                            >
                              {isAr ? 'تجريبي' : 'Demo'}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '11.5px',
                            color: 'var(--text-secondary)',
                            fontFamily: 'JetBrains Mono, monospace',
                            marginTop: '2px',
                          }}
                        >
                          {formatCurrency(device.hourly_rate)}/{isAr ? 'س' : 'hr'} · IP: {ip}
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        padding: '4px 9px',
                        borderRadius: '6px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace',
                        background: statusMeta.bg,
                        color: statusMeta.color,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {statusMeta.label}
                    </span>
                  </div>

                  {/* Specs line (unboxed metadata) */}
                  {(cpuSpec || gpuLabel || ramSpec) && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {[gpuLabel, cpuSpec, ramSpec].filter(Boolean).join(' · ')}
                    </div>
                  )}

                  {/* Live Agent Telemetry Box */}
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <TelemetryMeter label="CPU" percent={isOnline ? cpu : 0} active={isOnline} />
                      <TelemetryMeter label="RAM" percent={isOnline ? ram : 0} active={isOnline} />
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        borderTop: '1px solid var(--border-default)',
                        paddingTop: '6px',
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title={activeWindow}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '13px', color: 'var(--accent-cyan)' }}>
                          window
                        </span>
                        {activeWindow}
                      </span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
                        {isAr ? 'التشغيل:' : 'Up:'} {formatUptime(live?.uptime_seconds)}
                      </span>
                    </div>
                  </div>

                  {/* Active Session Info & Primary Action */}
                  {session ? (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: 'rgba(223, 168, 66, 0.08)',
                        border: '1px solid rgba(223, 168, 66, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 700 }}>
                          {session.customer?.name || (isAr ? 'عميل مباشر' : 'Walk-in')}
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 500, marginInlineStart: '6px', fontSize: '11px' }}>
                            ({session.session_type === 'fixed' ? (isAr ? 'وقت محدد' : 'Fixed') : (isAr ? 'مفتوح' : 'Open')})
                          </span>
                        </div>
                        <div
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '15px',
                            fontWeight: 800,
                            fontVariantNumeric: 'tabular-nums',
                            color: session.is_paused ? '#f59e0b' : '#DFA842',
                          }}
                        >
                          {sessionTimerText}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <Button
                          variant="danger"
                          disabled={isBusy || session.is_paused}
                          onClick={() => setEndTarget(session)}
                          style={{ flex: '1 1 auto', minHeight: '34px', fontSize: '12px', padding: '6px 10px' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>stop_circle</span>
                          <span>{isAr ? 'إنهاء ودفع' : 'End & Bill'}</span>
                        </Button>

                        {!session.is_paused ? (
                          <button
                            type="button"
                            className="ccms-btn ccms-btn-ghost"
                            disabled={isBusy}
                            onClick={() => handlePauseSession(session)}
                            style={{ minHeight: '34px', fontSize: '11.5px', padding: '6px 10px', color: '#f59e0b' }}
                          >
                            {isAr ? 'تعليق' : 'Pause'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ccms-btn ccms-btn-ghost"
                            disabled={isBusy}
                            onClick={() => handleResumeSession(session)}
                            style={{ minHeight: '34px', fontSize: '11.5px', padding: '6px 10px', color: '#10b981' }}
                          >
                            {isAr ? 'استئناف' : 'Resume'}
                          </button>
                        )}

                        {session.session_type === 'fixed' && (
                          <button
                            type="button"
                            className="ccms-btn ccms-btn-ghost"
                            disabled={isBusy}
                            onClick={() => handleExtendSession(session)}
                            style={{ minHeight: '34px', fontSize: '11.5px', padding: '6px 9px' }}
                          >
                            +30m
                          </button>
                        )}

                        <button
                          type="button"
                          className="ccms-btn ccms-btn-ghost"
                          onClick={() => setCafeTarget(session)}
                          style={{ minHeight: '34px', fontSize: '11.5px', padding: '6px 9px', color: 'var(--accent-cyan)' }}
                          title={isAr ? 'إضافة طلب كافيه' : 'Add Café Order'}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>local_cafe</span>
                        </button>

                        <button
                          type="button"
                          className="ccms-btn ccms-btn-ghost"
                          onClick={() => setTransferTarget(session)}
                          style={{ minHeight: '34px', fontSize: '11.5px', padding: '6px 9px', color: '#c084fc' }}
                          title={isAr ? 'تحويل لجهاز آخر' : 'Transfer Session'}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>swap_horiz</span>
                        </button>

                        <button
                          type="button"
                          className="ccms-btn ccms-btn-ghost"
                          onClick={() => setEditSessionTarget(session)}
                          style={{ minHeight: '34px', fontSize: '11.5px', padding: '6px 9px' }}
                          title={isAr ? 'تعديل الجلسة' : 'Edit Session'}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>edit</span>
                        </button>
                      </div>
                    </div>
                  ) : isStranded ? (
                    <Button
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => handleResetStrandedDevice(device)}
                      style={{ width: '100%', minHeight: '38px', borderColor: '#f59e0b', color: '#f59e0b' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>restart_alt</span>
                      <span>{isAr ? 'حالة عالقة — إعادة تعيين إلى متاح' : 'Stranded — Reset to Available'}</span>
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      disabled={isBusy || device.status === 'offline'}
                      onClick={() => setStartTarget(device)}
                      style={{ width: '100%', minHeight: '38px', fontSize: '13px', fontWeight: 700 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>play_arrow</span>
                      <span>
                        {isOnline
                          ? isAr
                            ? 'بدء جلسة وفتح قفل الجهاز'
                            : 'Start Session & Unlock PC'
                          : isAr
                          ? 'بدء جلسة لعب'
                          : 'Start Session'}
                      </span>
                    </Button>
                  )}

                  {/* Full Agent Remote Controls Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                      gap: '6px',
                      paddingTop: '8px',
                      borderTop: '1px solid var(--border-default)',
                    }}
                  >
                    <AgentQuickBtn
                      icon="lock"
                      label={isAr ? 'قفل' : 'Lock'}
                      onClick={() => handleLockPc(device)}
                      disabled={isBusy}
                      title={isAr ? 'قفل شاشة الجهاز فوراً' : 'Lock PC Screen Now'}
                    />
                    <AgentQuickBtn
                      icon="build"
                      label={agentStatus === 'maintenance' ? (isAr ? 'إنهاء صيانة' : 'Exit Maint') : (isAr ? 'صيانة' : 'Maint')}
                      active={agentStatus === 'maintenance'}
                      activeColor="#f59e0b"
                      onClick={() => handleToggleMaintenance(device)}
                      disabled={isBusy || !isAdmin}
                      title={isAr ? 'فتح/قفل وضع الصيانة للإدارة' : 'Toggle Admin Maintenance Mode'}
                    />
                    <AgentQuickBtn
                      icon="chat"
                      label={isAr ? 'رسالة' : 'Msg'}
                      onClick={() => setMessageTarget(device)}
                      disabled={isBusy}
                      title={isAr ? 'إرسال رسالة تظهر على شاشة اللاعب' : 'Send Screen Message'}
                    />
                    <AgentQuickBtn
                      icon="power_settings_new"
                      label={isAr ? 'طاقة' : 'Power'}
                      onClick={() => setPowerTarget({ device, session })}
                      disabled={isBusy}
                      title={isAr ? 'إعادة تشغيل أو إيقاف التشغيل عن بُعد' : 'Remote Restart / Shutdown'}
                    />

                    <AgentQuickBtn
                      icon="qr_code_2"
                      label={isAr ? 'ربط' : 'Pair'}
                      onClick={() => setPairTarget(device)}
                      disabled={isBusy || !isAdmin}
                      title={isAr ? 'توليد كود الربط 6 أرقام وملف التثبيت' : 'Pair PC with 6-digit OTP'}
                    />
                    <AgentQuickBtn
                      icon={isSimulated ? 'stop_circle' : 'bolt'}
                      label={isSimulated ? (isAr ? 'إيقاف تجربة' : 'Stop Demo') : (isAr ? 'تجربة' : 'Demo')}
                      active={isSimulated}
                      activeColor="#C48A69"
                      onClick={() => handleToggleSimulator(device)}
                      disabled={isBusy}
                      title={isAr ? 'تشغيل أو إيقاف وضع التجربة للجهاز' : 'Toggle Demo Mode for this PC'}
                    />
                    <AgentQuickBtn
                      icon="history"
                      label={isAr ? 'السجل' : 'Logs'}
                      onClick={() => setAuditTarget(device)}
                      disabled={isBusy}
                      title={isAr ? 'سجل أوامر الجهاز وإلغاء الربط' : 'Device Command Log & Unlink'}
                    />
                    <AgentQuickBtn
                      icon="tune"
                      label={isAr ? 'تعديل' : 'Edit'}
                      onClick={() => setEditingPc(device)}
                      disabled={isBusy || !isAdmin}
                      title={isAr ? 'تعديل الاسم والأسعار والمواصفات' : 'Edit PC Specs & Rates'}
                    />
                  </div>

                  {/* Subtle Footer: Delete PC (Admin Only) */}
                  {isAdmin && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>
                        {isAr ? 'الإصدار:' : 'Version:'} v{live?.agent_version || device.agent_version || '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(device)}
                        disabled={Boolean(session)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: session ? 'var(--text-muted)' : '#f87171',
                          cursor: session ? 'not-allowed' : 'pointer',
                          fontSize: '11px',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 4px',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
                        <span>{isAr ? 'حذف الجهاز' : 'Remove PC'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Modals ─── */}

      {creatingPc && (
        <DeviceFormModal
          title={isAr ? 'إضافة جهاز كمبيوتر جديد' : 'Add New PC'}
          initial={null}
          defaultType="pc"
          existingDevices={data?.devices ?? []}
          onClose={() => setCreatingPc(false)}
          onDone={async (patch) => {
            await dataService.createDevice(patch as { name: string; type: DeviceType; hourly_rate: number; specs?: Record<string, string> });
            toast(isAr ? 'تم إنشاء جهاز الكمبيوتر بنجاح' : 'PC added successfully', 'success');
            setCreatingPc(false);
            refetch();
          }}
        />
      )}

      {editingPc && (
        <DeviceFormModal
          title={isAr ? `تعديل جهاز · ${editingPc.name}` : `Edit PC · ${editingPc.name}`}
          initial={editingPc}
          defaultType="pc"
          existingDevices={data?.devices ?? []}
          onClose={() => setEditingPc(null)}
          onDone={async (patch) => {
            await dataService.updateDevice(editingPc.id, patch as Partial<Device>);
            toast(isAr ? 'تم تحديث بيانات الجهاز بنجاح' : 'PC updated successfully', 'success');
            setEditingPc(null);
            refetch();
          }}
        />
      )}

      {deleteTarget && (
        <Modal
          open
          title={isAr ? `حذف الجهاز · ${deleteTarget.name}` : `Delete PC · ${deleteTarget.name}`}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t('cancel')}</Button>
              <Button variant="danger" loading={deletingLoading} onClick={handleDeletePc}>
                {t('delete')}
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0, lineHeight: 1.6 }}>
            {isAr
              ? `هل أنت متأكد من حذف جهاز الكمبيوتر (${deleteTarget.name})؟ إذا كان له سجل جلسات سابق فسيتم أرشفته لحفظ الفواتير.`
              : `Are you sure you want to remove (${deleteTarget.name})? Devices with prior sessions are archived to preserve billing history.`}
          </p>
        </Modal>
      )}

      {startTarget && (
        <StartSessionModal
          device={startTarget}
          onClose={() => setStartTarget(null)}
          onDone={() => {
            setStartTarget(null);
            toast(isAr ? 'تم بدء الجلسة وإرسال أمر فتح الشاشة للجهاز' : 'Session started & unlock command sent', 'success');
            refetch();
            refreshTelemetry();
          }}
        />
      )}

      {endTarget && (
        <EndSessionModal
          session={endTarget}
          onClose={() => setEndTarget(null)}
          onDone={() => {
            setEndTarget(null);
            toast(isAr ? 'تم إنهاء الجلسة وقفل الشاشة وإصدار الفاتورة' : 'Session ended, PC locked & invoice issued', 'success');
            refetch();
            refreshTelemetry();
          }}
        />
      )}

      {transferTarget && (
        <TransferSessionModal
          session={transferTarget}
          onClose={() => setTransferTarget(null)}
          onDone={() => {
            setTransferTarget(null);
            toast(isAr ? 'تم تحويل الجلسة بنجاح' : 'Session transferred', 'success');
            refetch();
            refreshTelemetry();
          }}
        />
      )}

      {editSessionTarget && (
        <EditSessionModal
          session={editSessionTarget}
          onClose={() => setEditSessionTarget(null)}
          onDone={() => {
            setEditSessionTarget(null);
            toast(isAr ? 'تم تحديث بيانات الجلسة' : 'Session updated', 'success');
            refetch();
          }}
        />
      )}

      {cafeTarget && (
        <AddCafeModal
          session={cafeTarget}
          onClose={() => setCafeTarget(null)}
          onDone={() => {
            toast(isAr ? 'تم إضافة الطلب للفاتورة' : 'Café order added', 'success');
            refetch();
          }}
        />
      )}

      {pairTarget !== undefined && (
        <PairDeviceModal
          device={pairTarget}
          allDevices={data?.devices ?? []}
          onClose={() => setPairTarget(undefined)}
          onPairedOrSimulated={() => {
            refetch();
            refreshTelemetry();
          }}
        />
      )}

      {messageTarget !== undefined && (
        <SendMessageModal
          device={messageTarget}
          onClose={() => setMessageTarget(undefined)}
          onSent={refreshTelemetry}
        />
      )}

      {powerTarget && (
        <PowerControlModal
          device={powerTarget.device}
          activeSession={powerTarget.session}
          onClose={() => setPowerTarget(null)}
          onEndSessionFirst={(sess) => setEndTarget(sess)}
          onDone={() => {
            refetch();
            refreshTelemetry();
          }}
        />
      )}

      {auditTarget && (
        <DeviceAuditLogModal
          device={auditTarget}
          isAdmin={isAdmin}
          onClose={() => setAuditTarget(null)}
          onUpdated={() => {
            refetch();
            refreshTelemetry();
          }}
        />
      )}

      {showSetupGuide && (
        <SetupAndMobileGuideModal
          onClose={() => setShowSetupGuide(false)}
          onOpenPairModal={() => {
            setShowSetupGuide(false);
            setPairTarget(null);
          }}
        />
      )}
    </Layout>
  );
}

// ─── Helper Subcomponents ────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  accent,
  icon,
  sub,
  isMobile,
}: {
  label: string;
  value: string;
  accent: string;
  icon: string;
  sub?: string;
  isMobile?: boolean;
}) {
  return (
    <div
      className="ccms-card"
      style={{
        padding: isMobile ? '11px 12px' : '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: isMobile ? '8px' : '12px',
        minWidth: 0,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: isMobile ? '11px' : '11.5px',
            color: 'var(--text-secondary)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: isMobile ? '18px' : '22px',
            fontWeight: 800,
            fontFamily: 'JetBrains Mono, monospace',
            fontVariantNumeric: 'tabular-nums',
            color: accent,
            marginTop: '2px',
            lineHeight: 1.2,
          }}
        >
          {value}
        </div>
        {sub && <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
      </div>
      <div
        style={{
          width: isMobile ? '32px' : '38px',
          height: isMobile ? '32px' : '38px',
          borderRadius: '9px',
          background: `${accent}18`,
          color: accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: isMobile ? '16px' : '19px' }}>{icon}</span>
      </div>
    </div>
  );
}

function TelemetryMeter({ label, percent, active }: { label: string; percent: number; active: boolean }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const color = !active
    ? 'var(--text-muted)'
    : clamped >= 85
    ? '#ef4444'
    : clamped >= 65
    ? '#f59e0b'
    : '#10b981';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '11px',
          fontFamily: 'JetBrains Mono, monospace',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{active ? `${clamped}%` : '—'}</span>
      </div>
      <div
        style={{
          height: '5px',
          borderRadius: '999px',
          background: 'rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: active ? `${clamped}%` : '0%',
            height: '100%',
            background: color,
            borderRadius: '999px',
            transition: 'width 0.35s ease',
          }}
        />
      </div>
    </div>
  );
}

function AgentQuickBtn({
  icon,
  label,
  onClick,
  disabled,
  active,
  activeColor = '#DFA842',
  title,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  activeColor?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '3px',
        padding: '7px 4px',
        borderRadius: '8px',
        border: active ? `1px solid ${activeColor}` : '1px solid var(--border-default)',
        background: active ? `${activeColor}1c` : 'var(--bg-elevated)',
        color: disabled ? 'var(--text-muted)' : active ? activeColor : 'var(--text-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: '10.5px',
        fontWeight: 600,
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{icon}</span>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
        {label}
      </span>
    </button>
  );
}

// ─── Interactive Setup & Mobile Remote Control Guide Modal ──────────────────

function SetupAndMobileGuideModal({
  onClose,
  onOpenPairModal,
}: {
  onClose: () => void;
  onOpenPairModal: () => void;
}) {
  const { language, isRtl } = useLanguage();
  const { toast } = useToast();
  const isAr = language === 'ar';

  const [tab, setTab] = useState<'cashier' | 'agent' | 'mobile'>('agent');
  const [discovery, setDiscovery] = useState<ControllerDiscoveryInfo | null>(null);

  useEffect(() => {
    http
      .get('/api/agent/discover')
      .then((res) => setDiscovery(res.data?.data ?? null))
      .catch(() => {});
  }, []);

  const serverLanUrl = discovery
    ? `http://${discovery.controller_ip}:${discovery.port || 5000}`
    : 'http://<CASHIER_PC_IP>:5000';

  const copyText = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      toast(isAr ? 'تم النسخ إلى الحافظة' : 'Copied to clipboard', 'success');
    });
  };

  return (
    <Modal
      open
      title={isAr ? 'دليل التثبيت على الكمبيوتر والتحكم من الموبايل' : 'PC Installation & Mobile Control Guide'}
      onClose={onClose}
      width={660}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
          <Button variant="ghost" onClick={onOpenPairModal}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>qr_code_2</span>
            <span>{isAr ? 'فتح نافذة الربط وتحميل install-cafe.bat' : 'Open OTP Pairing & .bat Script'}</span>
          </Button>
          <Button onClick={onClose}>{isAr ? 'تم' : 'Done'}</Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: isRtl ? 'right' : 'left' }}>
        {/* Live Server Address Banner */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'rgba(223, 168, 66, 0.08)',
            border: '1px solid rgba(223, 168, 66, 0.3)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 700 }}>
              {isAr ? 'عنوان جهاز الكاشير على الشبكة المحلية' : 'Local Network Server Address'}
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px', wordBreak: 'break-all' }}>
              {serverLanUrl}
            </div>
          </div>
          <Button variant="ghost" onClick={() => copyText(serverLanUrl)} style={{ fontSize: '12px', minHeight: '34px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>content_copy</span>
            <span>{isAr ? 'نسخ الرابط' : 'Copy URL'}</span>
          </Button>
        </div>

        {/* Guide Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {(
            [
              { id: 'cashier', icon: 'storefront', label: isAr ? '1. الكاشير' : '1. Cashier PC' },
              { id: 'agent', icon: 'desktop_windows', label: isAr ? '2. أجهزة اللعب' : '2. Gaming PCs' },
              { id: 'mobile', icon: 'smartphone', label: isAr ? '3. الموبايل' : '3. Mobile' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              style={{
                padding: '10px 8px',
                borderRadius: '10px',
                border: tab === item.id ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                background: tab === item.id ? 'rgba(223, 168, 66, 0.14)' : 'var(--bg-elevated)',
                color: tab === item.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '19px' }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'cashier' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <StepItem
              num="1"
              title={isAr ? 'تحميل وتثبيت برنامج سطح المكتب' : 'Install CCMS Desktop on Cashier PC'}
              body={
                isAr
                  ? 'افتح صفحة التحميل وحمّل نسخة الويندوز ثم ثبّتها على جهاز الكاشير الرئيسي. البرنامج يحفظ بياناتك تلقائياً ويعمل بكفاءة حتى بدون إنترنت.'
                  : 'Download the Windows installer from Downloads and run it on your main cashier computer. It saves your data automatically and works even offline.'
              }
            />
            <StepItem
              num="2"
              title={isAr ? 'تثبيت عنوان الشبكة المحلية لجهاز الكاشير' : 'Set Static Network IP on Cashier PC'}
              body={
                isAr
                  ? 'من إعدادات الراوتر ثبّت عنوان IP جهاز الكاشير (مثلاً 192.168.1.10) وتأكد من السماح للبرنامج في جدار حماية ويندوز حتى تتصل به أجهزة اللعب والموبايل.'
                  : 'Assign a static local IP to the cashier PC in your router and allow the app through Windows Firewall.'
              }
            />
            <StepItem
              num="3"
              title={isAr ? 'فتح الوردية وتسجيل الأجهزة' : 'Open Shift & Add PCs'}
              body={
                isAr
                  ? 'سجّل الدخول بحساب المدير، افتح الوردية اليومية، وأضف أجهزة الكمبيوتر من زر "إضافة كمبيوتر" في هذه الصفحة.'
                  : 'Sign in as Admin, start your shift, and add your PCs using "Add PC".'
              }
            />
          </div>
        )}

        {tab === 'agent' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <StepItem
              num="1"
              title={isAr ? 'توليد كود الربط وتحميل ملف الإعداد' : 'Generate Pairing Code & Setup File'}
              body={
                isAr
                  ? 'اضغط على زر "ربط جهاز جديد" في أعلى هذه الصفحة لتوليد كود ربط (6 أرقام) وتحميل ملف الإعداد الجاهز بعنوان جهاز الكاشير الخاص بك.'
                  : 'Click "Connect PC" at the top of this page to generate a 6-digit pairing code and download your ready setup file.'
              }
            />
            <StepItem
              num="2"
              title={isAr ? 'تثبيت برنامج الربط على أجهزة اللعب (Windows 10/11)' : 'Install on Gaming PCs (Windows 10/11)'}
              body={
                isAr
                  ? 'ضع ملف برنامج الربط بجانب ملف الإعداد على فلاشة USB، ثم على كل جهاز كمبيوتر شغّل ملف الإعداد كمسؤول (Run as Administrator).'
                  : 'Place the installer next to the setup file on a USB drive, then run the setup file as Administrator on each gaming PC.'
              }
            />
            <StepItem
              num="3"
              title={isAr ? 'القفل التلقائي والتحكم الكامل المباشر' : 'Automatic Lock & Full Remote Control'}
              body={
                isAr
                  ? 'بمجرد انتهاء التثبيت سيظهر الجهاز هنا بحالة (متصل · مقفل)، وتُقفل شاشته تلقائياً. عند بدء جلسة من التطبيق تُفتح الشاشة فوراً وتظهر قراءات CPU/RAM والبرنامج المفتوح ويمكنك إرسال رسائل أو قفل أو ريستارت عن بُعد.'
                  : 'The PC immediately appears here as Online-Locked. Starting a session unlocks the desktop; ending a session locks it automatically.'
              }
            />
          </div>
        )}

        {tab === 'mobile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <StepItem
              num="1"
              title={isAr ? 'الطريقة الأولى: تطبيق الأندرويد (CCMS.apk)' : 'Option 1: Android App (CCMS.apk)'}
              body={
                isAr
                  ? 'افتح صفحة التحميل (/download) من هاتفك الأندرويد وحمّل ملف CCMS.apk وثبّته. تأكد أن الموبايل متصل بنفس شبكة Wi-Fi الخاصة بالمحل (أو عبر الرابط السحابي).'
                  : 'Download and install CCMS.apk from /download on your Android phone, connected to the same lounge Wi-Fi (or cloud server).'
              }
            />
            <StepItem
              num="2"
              title={isAr ? 'الطريقة الثانية: من متصفح أي موبايل (iPhone أو Android)' : 'Option 2: Any Mobile Browser (iPhone & Android)'}
              body={
                isAr
                  ? `افتح Chrome أو Safari على هاتفك واكتب عنوان سيرفر الكاشير: ${serverLanUrl} ثم اختر "إضافة للشاشة الرئيسية" (Add to Home Screen) ليفتح كتطبيق كامل.`
                  : `Open Chrome or Safari on your phone and navigate to ${serverLanUrl}, then tap "Add to Home Screen" for instant app-like access.`
              }
            />
            <StepItem
              num="3"
              title={isAr ? 'التحكم الكامل بالأجهزة والجلسات من الموبايل' : 'Full Remote Control from Mobile'}
              body={
                isAr
                  ? 'سجّل الدخول بحساب المدير أو الموظف وافتح صفحة "التحكم بأجهزة الكمبيوتر" من القائمة. يمكنك فتح/إنهاء الجلسات، قفل/فتح أي PC، إرسال رسائل للشاشات، إعادة التشغيل، ومتابعة الأرباح والوردية لحظياً.'
                  : 'Sign in with your Admin/Staff credentials and open PC Control to start/end sessions, lock/unlock PCs, send screen alerts, restart machines, and track live revenue.'
              }
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

function StepItem({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px 14px',
        borderRadius: '10px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '8px',
          background: 'rgba(223, 168, 66, 0.16)',
          color: 'var(--accent-cyan)',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 800,
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {num}
      </div>
      <div>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>{title}</div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{body}</div>
      </div>
    </div>
  );
}
