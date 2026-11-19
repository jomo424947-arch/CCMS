import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { DeviceCard } from '../components/DeviceCard';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { useAsync } from '../hooks/useAsync';
import { usePolling } from '../hooks/usePolling';
import { useIsMobile } from '../hooks/useIsMobile';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import {
  StartSessionModal,
  EndSessionModal,
  EditSessionModal,
  TransferSessionModal,
} from '../components/SessionModals';
import { DeviceFormModal } from '../components/DeviceFormModal';
import { useAgentLiveStatus } from '../hooks/useAgentLiveStatus';
import type { Device, DeviceType, Session } from '../types';

export default function DevicesPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { isAdmin } = useAuth();

  const { data, loading, refetch } = useAsync(async () => {
    const [devices, sessions, rooms, tables] = await Promise.all([
      dataService.listDevices(),
      dataService.listSessions('active'),
      dataService.listRooms().catch(() => []),
      dataService.listCafeTables().catch(() => []),
    ]);
    return { devices, sessions, rooms, tables };
  }, []);

  // Auto-poll every 15 seconds for cross-instance sync (Desktop ↔ Web ↔ Mobile)
  usePolling(refetch, 15000);

  // Map device_id → active session for the live timer.
  const activeByDevice = useMemo(() => {
    const map = new Map<string, Session>();
    (data?.sessions ?? []).forEach((s) => map.set(s.device_id, s));
    return map;
  }, [data]);

  // Set of device IDs assigned to private rooms and cafe tables
  const excludedDeviceIds = useMemo(() => {
    const set = new Set<string>();
    (data?.rooms ?? []).forEach((r) => {
      if (r.device_id) set.add(r.device_id);
    });
    (data?.tables ?? []).forEach((t) => {
      if (t.device_id) set.add(t.device_id);
    });
    return set;
  }, [data?.rooms, data?.tables]);

  const [startTarget, setStartTarget] = useState<Device | null>(null);
  const [endTarget, setEndTarget] = useState<Session | null>(null);
  const [editTarget, setEditTarget] = useState<Session | null>(null);
  const [transferTarget, setTransferTarget] = useState<Session | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [resetDeviceTarget, setResetDeviceTarget] = useState<Device | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const { telemetryByDevice, wsConnected } = useAgentLiveStatus();

  const managedPcs = useMemo(() => {
    return (data?.devices ?? []).filter(
      (d) => !excludedDeviceIds.has(d.id) && (d.is_managed || d.type === 'pc')
    );
  }, [data?.devices, excludedDeviceIds]);

  const hallDevices = useMemo(() => {
    return (data?.devices ?? []).filter(
      (d) =>
        !excludedDeviceIds.has(d.id) &&
        !d.is_managed &&
        d.type !== 'pc' &&
        d.type !== 'table' &&
        !d.name.toLowerCase().includes('billiards') &&
        !d.name.toLowerCase().includes('بلياردو')
    );
  }, [data?.devices, excludedDeviceIds]);

  const billiardsDevices = useMemo(() => {
    return (data?.devices ?? []).filter(
      (d) => !excludedDeviceIds.has(d.id) && (d.type === 'table' || d.name.toLowerCase().includes('billiards') || d.name.toLowerCase().includes('بلياردو'))
    );
  }, [data?.devices, excludedDeviceIds]);

  const handleAction = (device: Device) => {
    if (device.status === 'in_use') {
      const session = activeByDevice.get(device.id);
      if (session) {
        setEndTarget(session);
      } else {
        setResetDeviceTarget(device);
      }
    } else if (device.status === 'available') {
      setStartTarget(device);
    } else {
      toast(
        language === 'ar'
          ? `الجهاز ${device.name} حالته (${device.status}) — يمكنك تعديله من الإعدادات.`
          : `${device.name} is ${device.status} — manage it from Settings.`,
        'info'
      );
    }
  };

  const handleConfirmResetDevice = async () => {
    if (!resetDeviceTarget) return;
    setResetLoading(true);
    try {
      await dataService.updateDevice(resetDeviceTarget.id, { status: 'available' });
      toast(
        language === 'ar'
          ? `تمت إعادة تعيين ${resetDeviceTarget.name} إلى متاح`
          : `Reset ${resetDeviceTarget.name} to available`,
        'success'
      );
      setResetDeviceTarget(null);
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to reset device status'), 'error');
    } finally {
      setResetLoading(false);
    }
  };

  const handleExtendSession = async (session: Session) => {
    try {
      await dataService.extendSession(session.id, 30);
      toast(language === 'ar' ? 'تم تمديد الجلسة بمقدار 30 دقيقة' : 'Session extended by 30 minutes', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not extend session'), 'error');
    }
  };

  const handlePauseSession = async (session: Session) => {
    try {
      await dataService.pauseSession(session.id);
      toast(language === 'ar' ? 'تم تعليق الجلسة' : 'Session paused', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not pause session'), 'error');
    }
  };

  const handleResumeSession = async (session: Session) => {
    try {
      await dataService.resumeSession(session.id);
      toast(language === 'ar' ? 'تم استئناف الجلسة' : 'Session resumed', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not resume session'), 'error');
    }
  };

  const handleDeleteDevice = async () => {
    if (!deleteTarget) return;
    setDeletingLoading(true);
    try {
      await dataService.deleteDevice(deleteTarget.id);
      toast(language === 'ar' ? 'تمت إزالة الجهاز بنجاح' : 'Device removed successfully', 'success');
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not delete device'), 'error');
    } finally {
      setDeletingLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <Layout title={t('devices')} subtitle={t('loading')}>
        <LoadingSpinner label={t('loading')} />
      </Layout>
    );
  }

  const totalHallDevices = hallDevices.length + billiardsDevices.length;
  const availableHallDevices = [...hallDevices, ...billiardsDevices].filter((d) => d.status === 'available').length;
  const onlineAgentsCount = managedPcs.filter((d) => {
    const st = telemetryByDevice[d.id]?.agent_status || d.agent_status;
    return st === 'online_locked' || st === 'online_in_session' || st === 'maintenance';
  }).length;

  return (
    <Layout
      title={t('devices')}
      subtitle={
        language === 'ar'
          ? `${totalHallDevices} محطات أجهزة بالصالة · ${availableHallDevices} متاح حالياً`
          : `${totalHallDevices} hall stations · ${availableHallDevices} available`
      }
      actions={
        <div style={{ display: 'flex', gap: isMobile ? '8px' : '10px', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
          {isAdmin && (
            <Button
              onClick={() => setCreating(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
                minHeight: '38px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
              <span>{language === 'ar' ? 'إضافة جهاز' : 'Add Device'}</span>
            </Button>
          )}
          <button
            className="ccms-btn ccms-btn-ghost"
            onClick={refetch}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              flex: isMobile ? (isAdmin ? '1 1 calc(50% - 4px)' : '1 1 100%') : 'none',
              minHeight: '38px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>sync</span>
            <span>{language === 'ar' ? 'تحديث' : 'Refresh'}</span>
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Dedicated PC Control Link Banner */}
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, rgba(223, 168, 66, 0.09) 0%, rgba(10, 14, 26, 0.95) 100%)',
            border: '1px solid rgba(223, 168, 66, 0.28)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(223, 168, 66, 0.14)',
                border: '1px solid rgba(223, 168, 66, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#DFA842',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '21px' }}>desktop_windows</span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {language === 'ar'
                    ? 'إدارة أجهزة الكمبيوتر'
                    : 'PC Control Center'}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: wsConnected ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                    color: wsConnected ? '#10b981' : '#f59e0b',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: wsConnected ? '#10b981' : '#f59e0b',
                    }}
                  />
                  {wsConnected
                    ? language === 'ar' ? 'متصل مباشر' : 'Live'
                    : language === 'ar' ? 'تحديث تلقائي' : 'Syncing'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {language === 'ar'
                  ? `${managedPcs.length} جهاز كمبيوتر · ${onlineAgentsCount} متصل (قفل الشاشة، الرسائل، الصيانة، والطاقة)`
                  : `${managedPcs.length} PCs · ${onlineAgentsCount} online (Screen lock, messages, maintenance & power)`}
              </div>
            </div>
          </div>

          <Button
            onClick={() => navigate('/pcs')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
            <span>{language === 'ar' ? 'فتح إدارة الكمبيوتر' : 'Open PC Control'}</span>
          </Button>
        </div>

        {totalHallDevices === 0 ? (
          <div className="ccms-card">
            <EmptyState
              icon="sports_esports"
              title={language === 'ar' ? 'لا توجد أجهزة كونسول أو بلياردو بالصالة' : 'No console or billiards stations yet'}
              description={
                language === 'ar'
                  ? 'أجهزة الكمبيوتر (PC) لها صفحتها الخاصة أعلى الشاشة. أضف أجهزة PlayStation أو VR أو طاولات بلياردو هنا.'
                  : 'PCs are managed on the dedicated PC Control page above. Add PlayStation, VR, or Billiards stations here.'
              }
              action={isAdmin ? <Button onClick={() => setCreating(true)}>{language === 'ar' ? 'إضافة جهاز' : 'Add Device'}</Button> : undefined}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Section 1: أجهزة الصالة (PlayStation / Consoles / VR) */}
            {hallDevices.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'Plus Jakarta Sans, Cairo, sans-serif' }}>
                    {language === 'ar' ? 'أجهزة الصالة (كونسول / VR)' : 'Hall Stations (Console / VR)'}
                  </span>
                  <span className="material-symbols-outlined" style={{ fontSize: '22px', color: '#B67B1B' }}>
                    sports_esports
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
                    gap: '20px',
                  }}
                >
                  {hallDevices.map((device, i) => (
                    <DeviceCard
                      key={device.id}
                      device={device}
                      index={i}
                      activeSession={activeByDevice.get(device.id)}
                      onAction={handleAction}
                      onEditSession={(session) => setEditTarget(session)}
                      onTransferSession={(session) => setTransferTarget(session)}
                      onExtendSession={handleExtendSession}
                      onPauseSession={handlePauseSession}
                      onResumeSession={handleResumeSession}
                      onDeleteDevice={isAdmin ? (dev) => setDeleteTarget(dev) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

          {/* Section 2: أجهزة البلياردو (Billiards & Tables) */}
          {billiardsDevices.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'Plus Jakarta Sans, Cairo, sans-serif' }}>
                  {language === 'ar' ? 'أجهزة البلياردو' : 'Billiards Devices'}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#10b981',
                    color: '#000',
                    fontWeight: 900,
                    fontSize: '13px',
                  }}
                >
                  8
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
                  gap: '20px',
                }}
              >
                {billiardsDevices.map((device, i) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    index={i}
                    activeSession={activeByDevice.get(device.id)}
                    onAction={handleAction}
                    onEditSession={(session) => setEditTarget(session)}
                    onTransferSession={(session) => setTransferTarget(session)}
                    onExtendSession={handleExtendSession}
                    onPauseSession={handlePauseSession}
                    onResumeSession={handleResumeSession}
                    onDeleteDevice={isAdmin ? (dev) => setDeleteTarget(dev) : undefined}
                  />
                ))}
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      {/* Start session modal */}
      {startTarget && (
        <StartSessionModal
          device={startTarget}
          onClose={() => setStartTarget(null)}
          onDone={() => {
            setStartTarget(null);
            toast(language === 'ar' ? 'تم بدء اللعب وتنشيط الجهاز' : 'Session started', 'success');
            refetch();
          }}
        />
      )}

      {/* End session modal */}
      {endTarget && (
        <EndSessionModal
          session={endTarget}
          onClose={() => setEndTarget(null)}
          onDone={() => {
            setEndTarget(null);
            toast(language === 'ar' ? 'تم إنهاء الجلسة وحساب الفاتورة' : 'Session ended — invoice generated', 'success');
            refetch();
          }}
        />
      )}

      {/* Transfer session modal */}
      {transferTarget && (
        <TransferSessionModal
          session={transferTarget}
          onClose={() => setTransferTarget(null)}
          onDone={() => {
            setTransferTarget(null);
            toast(language === 'ar' ? 'تم تحويل الجلسة بنجاح' : 'Session transferred successfully', 'success');
            refetch();
          }}
        />
      )}

      {/* Edit session modal */}
      {editTarget && (
        <EditSessionModal
          session={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => {
            setEditTarget(null);
            toast(language === 'ar' ? 'تم تحديث بيانات الجلسة' : 'Session details updated', 'success');
            refetch();
          }}
        />
      )}

      {/* Create device modal */}
      {creating && (
        <DeviceFormModal
          title={language === 'ar' ? 'تسجيل جهاز جديد' : 'Register New Device'}
          initial={null}
          defaultType="console"
          existingDevices={data.devices}
          onClose={() => setCreating(false)}
          onDone={async (patch) => {
            try {
              const created = await dataService.createDevice(patch as { name: string; type: DeviceType; hourly_rate: number; specs?: Record<string, string> });
              if (created.type === 'pc') {
                toast(
                  language === 'ar'
                    ? 'تم إضافة جهاز الكمبيوتر — يمكنك التحكم به من صفحة أجهزة الكمبيوتر (PC)'
                    : 'PC added — manage it from the dedicated PC Control page',
                  'success'
                );
              } else {
                toast(language === 'ar' ? 'تم إضافة الجهاز بنجاح' : 'Device added successfully', 'success');
              }
              refetch();
              setCreating(false);
            } catch (err) {
              toast(apiErrorMessage(err, 'Could not create device'), 'error');
              throw err;
            }
          }}
        />
      )}

      {deleteTarget && (
        <Modal
          open
          title={language === 'ar' ? `حذف الجهاز · ${deleteTarget.name}` : `Delete Device · ${deleteTarget.name}`}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t('cancel')}</Button>
              <Button variant="danger" loading={deletingLoading} onClick={handleDeleteDevice}>
                {t('delete')}
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0, lineHeight: 1.6 }}>
            {language === 'ar'
              ? `هل أنت متأكد من رغبتك في حذف وإزالة الجهاز (${deleteTarget.name}) من النظام نهائياً؟`
              : `Are you sure you want to delete and remove device (${deleteTarget.name}) from the system?`}
          </p>
        </Modal>
      )}

      {resetDeviceTarget && (
        <Modal
          open
          title={language === 'ar' ? `إعادة تعيين حالة الجهاز · ${resetDeviceTarget.name}` : `Reset Device Status · ${resetDeviceTarget.name}`}
          onClose={() => setResetDeviceTarget(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setResetDeviceTarget(null)} disabled={resetLoading}>{t('cancel')}</Button>
              <Button loading={resetLoading} onClick={handleConfirmResetDevice}>
                {language === 'ar' ? 'تحويل إلى متاح' : 'Reset to Available'}
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0, lineHeight: 1.6 }}>
            {language === 'ar'
              ? `الجهاز (${resetDeviceTarget.name}) مسجل كـ "مشغول" ولكن لا توجد جلسة نشطة مرتبطة به حالياً. هل تريد إعادة تعيين حالته إلى "متاح"؟`
              : `Device (${resetDeviceTarget.name}) is marked "In Use" but has no active session. Reset status to "Available"?`}
          </p>
        </Modal>
      )}
    </Layout>
  );
}