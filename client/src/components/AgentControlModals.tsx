import { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import type {
  Device,
  Session,
  AgentPairingCodeInfo,
  DeviceAuditLogEntry,
  DeviceCommandRecord,
} from '../types';

// ─── 1. Pair Device & Mass Deployment Modal ─────────────────────────────────

interface PairDeviceModalProps {
  device?: Device | null;
  allDevices: Device[];
  onClose: () => void;
  onPairedOrSimulated: () => void;
}

export function PairDeviceModal({
  device,
  allDevices,
  onClose,
  onPairedOrSimulated,
}: PairDeviceModalProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const isAr = language === 'ar';

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(device?.id || '');
  const [pairingInfo, setPairingInfo] = useState<AgentPairingCodeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  const pcDevices = allDevices.filter((d) => d.type === 'pc' || d.is_managed);

  const generateCode = async (targetId: string | null) => {
    setLoading(true);
    try {
      const info = await dataService.generateAgentPairingCode(targetId || null, 15);
      setPairingInfo(info);
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to generate pairing code'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateCode(device?.id || null);
  }, [device?.id]);

  const handleDownloadBat = () => {
    if (!pairingInfo?.install_script_bat) return;
    const blob = new Blob([pairingInfo.install_script_bat], { type: 'application/bat;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'install-cafe.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(
      isAr
        ? 'تم تحميل ملف التثبيت السريع install-cafe.bat بنجاح'
        : 'Downloaded install-cafe.bat deployment script',
      'success'
    );
  };

  const handleStartSimulatedAgent = async () => {
    const targetId = selectedDeviceId || pcDevices[0]?.id;
    if (!targetId) {
      toast(isAr ? 'اختر جهاز كمبيوتر أولاً' : 'Please select a PC device first', 'error');
      return;
    }
    setSimulating(true);
    try {
      await dataService.toggleSimulatedAgent(targetId, true);
      toast(
        isAr
          ? 'تم تفعيل وضع التجربة على الجهاز بنجاح!'
          : 'Demo mode enabled on this PC!',
        'success'
      );
      onPairedOrSimulated();
      onClose();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not start demo mode'), 'error');
    } finally {
      setSimulating(false);
    }
  };

  return (
    <Modal
      open
      title={
        isAr
          ? `ربط جهاز الكمبيوتر${device ? ` · ${device.name}` : ''}`
          : `Connect PC${device ? ` · ${device.name}` : ''}`
      }
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {isAr ? 'إغلاق' : 'Close'}
          </Button>
          <Button onClick={() => generateCode(selectedDeviceId || null)} loading={loading}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>refresh</span>
            <span>{isAr ? 'توليد كود جديد' : 'New Code'}</span>
          </Button>
        </>
      }
    >
      {loading || !pairingInfo ? (
        <LoadingSpinner label={isAr ? 'جاري توليد كود الربط...' : 'Generating pairing code...'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Target PC Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {isAr ? 'الجهاز المستهدف (أو اتركه عاماً لتثبيت عدة أجهزة معاً)' : 'Target PC (or leave blank for Bulk Mass Deployment)'}
            </label>
            <select
              value={selectedDeviceId}
              onChange={(e) => {
                setSelectedDeviceId(e.target.value);
                generateCode(e.target.value || null);
              }}
              style={{
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '13px',
              }}
            >
              <option value="">{isAr ? 'جميع أجهزة الصالة (تثبيت جماعي بالاسم التلقائي PC-01..)' : 'All Hall PCs (Auto-match by Hostname PC-01..)'}</option>
              {pcDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.agent_status || 'unpaired'})
                </option>
              ))}
            </select>
          </div>

          {/* 6-Digit OTP Display */}
          <div
            style={{
              background: 'rgba(223, 168, 66, 0.06)',
              border: '1px solid rgba(223, 168, 66, 0.3)',
              borderRadius: '12px',
              padding: '18px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.2px', color: '#DFA842', fontWeight: 700 }}>
              {isAr ? 'كود الربط (صالح لمدة 15 دقيقة)' : '6-Digit Pairing Code (Valid 15 Minutes)'}
            </span>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '36px',
                fontWeight: 800,
                letterSpacing: '8px',
                color: '#FFFFFF',
              }}
            >
              {pairingInfo.code}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
              {isAr ? 'عنوان الكاشير:' : 'Server:'} {pairingInfo.controller_ip}
            </div>
          </div>

          {/* One-Click Mass Deployment */}
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                {isAr ? 'ملف الإعداد السريع لأجهزة الصالة' : 'Quick Setup File for All PCs'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {isAr
                  ? 'ضع الملف بجانب برنامج الربط على فلاشة لتثبيت وربط أجهزة الصالة بسرعة.'
                  : 'Place next to the PC installer on a USB drive to connect all PCs automatically.'}
              </div>
            </div>
            <Button variant="ghost" onClick={handleDownloadBat}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
              <span>{isAr ? 'تحميل ملف الإعداد' : 'Download Setup'}</span>
            </Button>
          </div>

          {/* Demo Mode Trigger */}
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.07)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#10b981' }}>
                {isAr ? 'تجربة التحكم افتراضياً' : 'Try Virtual PC Demo'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {isAr
                  ? 'فعّل وضع التجربة على هذا الجهاز لاختبار القفل والفتح والرسائل فوراً.'
                  : 'Enable demo mode on this PC to test locking, unlocking, and screen messages right away.'}
              </div>
            </div>
            <Button onClick={handleStartSimulatedAgent} loading={simulating}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>bolt</span>
              <span>{isAr ? 'تفعيل التجربة' : 'Enable Demo'}</span>
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── 2. Send / Broadcast Message Modal ───────────────────────────────────────

interface SendMessageModalProps {
  device?: Device | null; // null = broadcast to all managed PCs
  onClose: () => void;
  onSent?: () => void;
}

export function SendMessageModal({ device, onClose, onSent }: SendMessageModalProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const isAr = language === 'ar';

  const [title, setTitle] = useState(isAr ? 'تنبيه من الكاشير' : 'Notice from Counter');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('info');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    setLoading(true);
    try {
      if (device) {
        await dataService.sendDeviceCommand(device.id, 'DISPLAY_MESSAGE', {
          title: title.trim(),
          message: message.trim(),
          severity,
        });
        toast(
          isAr ? `تم إرسال الرسالة الفورية إلى ${device.name}` : `Message displayed on ${device.name}`,
          'success'
        );
      } else {
        const res = await dataService.sendBulkDeviceCommand('DISPLAY_MESSAGE', {
          title: title.trim(),
          message: message.trim(),
          severity,
        });
        toast(
          isAr
            ? `تم بث الرسالة إلى ${res.dispatched_count} جهاز متصل`
            : `Broadcasted message to ${res.dispatched_count} managed PCs`,
          'success'
        );
      }
      onSent?.();
      onClose();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to send message'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      title={
        device
          ? isAr
            ? `إرسال رسالة على الشاشة · ${device.name}`
            : `Display Screen Message · ${device.name}`
          : isAr
          ? 'بث رسالة جماعية لجميع أجهزة الكمبيوتر'
          : 'Broadcast Screen Message to All Managed PCs'
      }
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={handleSend} loading={loading} disabled={!message.trim()}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>send</span>
            <span>{isAr ? 'إرسال الآن' : 'Send to Screen'}</span>
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Input
          label={isAr ? 'عنوان التنبيه' : 'Alert Title'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            {isAr ? 'نص الرسالة للاعب' : 'Message Content'}
          </label>
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              isAr
                ? 'مثال: طلب الكافيه الخاص بك جاهز، أو يرجى التوجه للكاشير...'
                : 'e.g. Your cafe order is ready, or tournament starts in 10 minutes...'
            }
            autoFocus
            style={{
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '13px',
              resize: 'vertical',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['info', 'warning', 'critical'] as const).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setSeverity(lvl)}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border:
                  severity === lvl
                    ? '1.5px solid #DFA842'
                    : '1px solid rgba(255,255,255,0.1)',
                background:
                  severity === lvl ? 'rgba(223, 168, 66, 0.14)' : 'rgba(255,255,255,0.03)',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {lvl === 'info'
                ? isAr
                  ? 'معلومات'
                  : 'Info'
                : lvl === 'warning'
                ? isAr
                  ? 'تنبيه'
                  : 'Warning'
                : isAr
                ? 'هام جداً'
                : 'Critical'}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ─── 3. Safe Power Control Modal (Section 6.3) ──────────────────────────────

interface PowerControlModalProps {
  device: Device;
  activeSession?: Session;
  onClose: () => void;
  onEndSessionFirst?: (session: Session) => void;
  onDone: () => void;
}

export function PowerControlModal({
  device,
  activeSession,
  onClose,
  onEndSessionFirst,
  onDone,
}: PowerControlModalProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const isAr = language === 'ar';

  const [action, setAction] = useState<'restart' | 'shutdown'>('restart');
  const [handling, setHandling] = useState<'keep_alive' | 'end_and_bill'>('keep_alive');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (activeSession && handling === 'end_and_bill' && onEndSessionFirst) {
      onClose();
      onEndSessionFirst(activeSession);
      return;
    }

    setLoading(true);
    try {
      await dataService.sendSafePowerCommand(device.id, action, handling);
      toast(
        isAr
          ? `تم إرسال أمر ${action === 'restart' ? 'إعادة التشغيل' : 'إيقاف التشغيل'} إلى ${device.name}`
          : `Sent ${action} command to ${device.name}`,
        'success'
      );
      onDone();
      onClose();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to send power command'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      title={
        isAr
          ? `التحكم بالطاقة عن بُعد · ${device.name}`
          : `Remote Power Control · ${device.name}`
      }
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            variant={action === 'shutdown' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={loading}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              {action === 'restart' ? 'restart_alt' : 'power_settings_new'}
            </span>
            <span>
              {activeSession && handling === 'end_and_bill'
                ? isAr
                  ? 'إنهاء الجلسة ومحاسبة العميل أولاً'
                  : 'End Session & Bill First'
                : action === 'restart'
                ? isAr
                  ? 'تأكيد إعادة التشغيل'
                  : 'Confirm Restart'
                : isAr
                ? 'تأكيد إيقاف التشغيل'
                : 'Confirm Shutdown'}
            </span>
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setAction('restart')}
            style={{
              padding: '14px',
              borderRadius: '10px',
              border:
                action === 'restart'
                  ? '1.5px solid #DFA842'
                  : '1px solid rgba(255,255,255,0.08)',
              background:
                action === 'restart' ? 'rgba(223, 168, 66, 0.12)' : 'rgba(255,255,255,0.02)',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px', color: '#DFA842' }}>
              restart_alt
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>
              {isAr ? 'إعادة تشغيل (Restart)' : 'System Restart'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAction('shutdown')}
            style={{
              padding: '14px',
              borderRadius: '10px',
              border:
                action === 'shutdown'
                  ? '1.5px solid #ef4444'
                  : '1px solid rgba(255,255,255,0.08)',
              background:
                action === 'shutdown' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255,255,255,0.02)',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px', color: '#ef4444' }}>
              power_settings_new
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>
              {isAr ? 'إيقاف التشغيل (Shutdown)' : 'System Shutdown'}
            </span>
          </button>
        </div>

        {activeSession && (
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontWeight: 700, fontSize: '13px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>warning</span>
              <span>
                {isAr
                  ? 'تنبيه: توجد جلسة نشطة حالياً على هذا الجهاز!'
                  : 'Warning: An active session is currently running on this PC!'}
              </span>
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: '#FFFFFF', cursor: 'pointer' }}>
              <input
                type="radio"
                name="session_handling"
                checked={handling === 'keep_alive'}
                onChange={() => setHandling('keep_alive')}
                style={{ marginTop: '3px' }}
              />
              <span>
                <strong>
                  {isAr
                    ? 'الاحتفاظ بالجلسة مفتوحة (إعادة فتح القفل تلقائياً بعد التشغيل)'
                    : 'Keep Session Alive (Auto-Unlock via Reconcile after reboot)'}
                </strong>
                <br />
                <span style={{ color: 'var(--text-secondary)', fontSize: '11.5px' }}>
                  {isAr
                    ? 'مناسب في حال تعليق اللعبة وحاجة اللاعب لإعادة تشغيل سريع دون إنهاء وقته.'
                    : 'Ideal when a game freezes and the player just needs a quick reboot.'}
                </span>
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: '#FFFFFF', cursor: 'pointer' }}>
              <input
                type="radio"
                name="session_handling"
                checked={handling === 'end_and_bill'}
                onChange={() => setHandling('end_and_bill')}
                style={{ marginTop: '3px' }}
              />
              <span>
                <strong>
                  {isAr
                    ? 'إنهاء الجلسة وإصدار الفاتورة أولاً'
                    : 'End Session & Generate Invoice First'}
                </strong>
              </span>
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── 4. Device Security Audit & Command Queue Modal ─────────────────────────

interface DeviceAuditLogModalProps {
  device: Device;
  isAdmin: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function DeviceAuditLogModal({
  device,
  isAdmin,
  onClose,
  onUpdated,
}: DeviceAuditLogModalProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const isAr = language === 'ar';

  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<DeviceAuditLogEntry[]>([]);
  const [commands, setCommands] = useState<DeviceCommandRecord[]>([]);
  const [deviceMeta, setDeviceMeta] = useState<Partial<Device>>(device);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await dataService.listDeviceAuditLogs(device.id);
      setDeviceMeta(res.device || device);
      setAuditLogs(res.audit_logs || []);
      setCommands(res.commands || []);
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to load device security logs'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [device.id]);

  const handleToggleMaintenance = async () => {
    setActionLoading(true);
    try {
      const enterMaint = device.agent_status !== 'maintenance';
      await dataService.sendDeviceCommand(device.id, 'ADMIN_MAINTENANCE_UNLOCK', {
        enabled: enterMaint,
      });
      toast(
        enterMaint
          ? isAr
            ? 'تم فتح الجهاز في وضع الصيانة للمسؤول'
            : 'Device unlocked in Admin Maintenance Mode'
          : isAr
          ? 'تم إنهاء وضع الصيانة وإعادة قفل الجهاز'
          : 'Exited Maintenance Mode and locked device',
        'success'
      );
      onUpdated();
      loadData();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to toggle maintenance mode'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnpair = async () => {
    setActionLoading(true);
    try {
      await dataService.unpairAgentDevice(device.id);
      toast(
        isAr ? 'تم إلغاء ربط الجهاز بنجاح' : 'PC unlinked successfully',
        'success'
      );
      onUpdated();
      onClose();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to unlink device'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Modal
      open
      title={
        isAr
          ? `سجل أوامر الجهاز · ${device.name}`
          : `Device Activity Log · ${device.name}`
      }
      onClose={onClose}
      width={620}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {isAdmin && (
              <>
                <Button variant="ghost" onClick={handleToggleMaintenance} loading={actionLoading}>
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>build</span>
                  <span>
                    {device.agent_status === 'maintenance'
                      ? isAr
                        ? 'إنهاء الصيانة (قفل)'
                        : 'Exit Maintenance'
                      : isAr
                      ? 'وضع الصيانة'
                      : 'Maintenance Mode'}
                  </span>
                </Button>
                {device.agent_status !== 'unpaired' && (
                  <Button variant="danger" onClick={handleUnpair} loading={actionLoading}>
                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>link_off</span>
                    <span>{isAr ? 'إلغاء الربط' : 'Unlink PC'}</span>
                  </Button>
                )}
              </>
            )}
          </div>
          <Button onClick={onClose}>{isAr ? 'إغلاق' : 'Close'}</Button>
        </div>
      }
    >
      {loading ? (
        <LoadingSpinner label={isAr ? 'جاري تحميل السجل...' : 'Loading activity log...'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '62vh', overflowY: 'auto' }}>
          {/* Device Identity Summary */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'rgba(223, 168, 66, 0.05)',
              border: '1px solid rgba(223, 168, 66, 0.2)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '10px',
              fontSize: '12px',
            }}
          >
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{isAr ? 'معرّف الجهاز' : 'Device ID'}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#DFA842', fontWeight: 700, wordBreak: 'break-all' }}>
                {deviceMeta.hardware_fingerprint || (isAr ? 'غير مربوط' : 'Not Linked')}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{isAr ? 'عنوان الشبكة والإصدار' : 'IP & Version'}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#FFFFFF' }}>
                {deviceMeta.last_ip || '—'} · v{deviceMeta.agent_version || '1.0'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{isAr ? 'آخر اتصال' : 'Last Seen'}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#FFFFFF' }}>
                {deviceMeta.last_seen_at ? new Date(deviceMeta.last_seen_at).toLocaleTimeString() : '—'}
              </div>
            </div>
          </div>

          {/* Commands History */}
          <div>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#FFFFFF', fontWeight: 700 }}>
              {isAr ? 'آخر الأوامر المرسلة' : 'Recent Commands'}
            </h5>
            {commands.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '8px 0' }}>
                {isAr ? 'لا توجد أوامر مسجلة بعد.' : 'No commands dispatched yet.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {commands.slice(0, 10).map((cmd) => (
                  <div
                    key={cmd.id}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 700,
                          color: '#DFA842',
                        }}
                      >
                        {cmd.command_type}
                      </span>
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background:
                            cmd.status === 'succeeded' || cmd.status === 'sent'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                          color:
                            cmd.status === 'succeeded' || cmd.status === 'sent'
                              ? '#10b981'
                              : '#f59e0b',
                        }}
                      >
                        {cmd.status}
                      </span>
                    </div>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {new Date(cmd.issued_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Audit Trail */}
          <div>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#FFFFFF', fontWeight: 700 }}>
              {isAr ? 'سجل نشاط الجهاز' : 'Device Activity History'}
            </h5>
            {auditLogs.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '8px 0' }}>
                {isAr ? 'لا توجد أحداث مسجلة بعد.' : 'No activity recorded yet.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {auditLogs.slice(0, 15).map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <strong
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          color: log.event_type.includes('ALERT') || log.event_type.includes('CLONE')
                            ? '#ef4444'
                            : '#10b981',
                        }}
                      >
                        {log.event_type}
                      </strong>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                      {JSON.stringify(log.details)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
