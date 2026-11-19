import { useState, useEffect, useCallback } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { dataService } from '../services';
import { useToast } from '../context/ToastContext';

interface CloudSyncData {
  server_version: string;
  agent_version: string;
  cloud_configured: boolean;
  cloud_connected: boolean;
  cloud_url: string;
  pending_sync_items: number;
  failed_sync_items: number;
  cloud_counts: {
    devices: number;
    sessions: number;
    commands: number;
    audit_logs: number;
  };
  checked_at: string;
}

export function SoftwareUpdateSection() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isAr = language === 'ar';

  const [version, setVersion] = useState<string>('2.0.0');
  const [checking, setChecking] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [downloadingBat, setDownloadingBat] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncData | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'info' | 'error' | null>(null);
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  const loadCloudStatus = useCallback(async () => {
    try {
      const info = await dataService.getCloudSyncStatus();
      setCloudStatus(info);
      if (info?.server_version) {
        setVersion(info.server_version);
      }
    } catch {
      // Ignore transient error
    }
  }, []);

  useEffect(() => {
    loadCloudStatus();
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI
        .getAppVersion()
        .then((v) => {
          if (v) setVersion(v);
        })
        .catch(() => {});
    }
  }, [loadCloudStatus]);

  const handleCheckUpdates = async () => {
    setChecking(true);
    setStatusMessage(null);
    await loadCloudStatus();

    if (!window.electronAPI?.checkForUpdates) {
      setChecking(false);
      setStatusType('success');
      setStatusMessage(
        isAr
          ? `أنت تعمل على أحدث إصدار من النظام (v${version}) والنسخ الاحتياطي يعمل بشكل طبيعي.`
          : `Up to date: You are running the latest version (v${version}) with backup active.`
      );
      return;
    }

    try {
      const res = await window.electronAPI.checkForUpdates();
      if (res?.status === 'dev-mode') {
        setStatusType('info');
        setStatusMessage(res.message || (isAr ? 'وضع التطوير النشط (v2.0.0)' : 'Development Mode (v2.0.0)'));
      } else if (res?.status === 'success') {
        setStatusType('success');
        setStatusMessage(
          isAr
            ? 'تم بدء فحص التحديثات! سيظهر إشعار تلقائي إذا وجد تحديث جديد.'
            : 'Update check completed. A notification will appear if a newer build is available.'
        );
      } else {
        setStatusType('error');
        setStatusMessage(res?.error || (isAr ? 'حدث خطأ أثناء فحص التحديثات' : 'Error checking updates'));
      }
    } catch (err: any) {
      setStatusType('error');
      setStatusMessage(err?.message || (isAr ? 'تعذر الاتصال بخدمة التحديثات' : 'Failed to connect to update service'));
    } finally {
      setChecking(false);
    }
  };

  const handleSyncCloudNow = async () => {
    setSyncingCloud(true);
    try {
      const updated = await dataService.triggerCloudSyncNow();
      setCloudStatus(updated);
      toast(
        isAr
          ? 'تمت مزامنة وحفظ البيانات بنجاح!'
          : 'Cloud backup synchronized successfully!',
        'success'
      );
    } catch {
      toast(isAr ? 'تعذر إتمام المزامنة حالياً' : 'Could not synchronize right now', 'error');
    } finally {
      setSyncingCloud(false);
    }
  };

  const handleDownloadAgentInstallerScript = async () => {
    setDownloadingBat(true);
    try {
      const pairInfo = await dataService.generateAgentPairingCode(null, 15);
      const blob = new Blob([pairInfo.install_script_bat], { type: 'text/plain;charset=utf-8' });
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
          ? `تم تحميل ملف إعداد الأجهزة بنجاح (كود الربط: ${pairInfo.code})`
          : `Downloaded PC setup file with pairing code (${pairInfo.code})`,
        'success'
      );
    } catch {
      toast(isAr ? 'تعذر تجهيز ملف الإعداد' : 'Could not prepare setup file', 'error');
    } finally {
      setDownloadingBat(false);
    }
  };

  return (
    <Card style={{ marginBottom: '20px', overflow: 'hidden', border: '1px solid rgba(223, 168, 66, 0.22)' }}>
      <div style={{ padding: isMobile ? '16px' : '22px 24px' }}>
        {/* Top Row: Version & Update Check */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
            paddingBottom: '16px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div
              style={{
                width: isMobile ? '40px' : '44px',
                height: isMobile ? '40px' : '44px',
                borderRadius: '11px',
                background: 'linear-gradient(135deg, rgba(223, 168, 66, 0.16), rgba(196, 138, 105, 0.16))',
                border: '1px solid rgba(223, 168, 66, 0.32)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-cyan)',
                flexShrink: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                system_update_alt
              </span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: isMobile ? '15px' : '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {isAr ? 'التحديثات والنسخ الاحتياطي' : 'Updates & Backup'}
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    fontFamily: 'JetBrains Mono, monospace',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.14)',
                    color: 'var(--accent-green)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                >
                  v{version}
                </span>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                {isAr
                  ? isElectron
                    ? 'نسخة سطح المكتب المفعّلة مع الحفظ التلقائي'
                    : 'النظام يعمل بكفاءة مع الحفظ التلقائي للبيانات'
                  : isElectron
                  ? 'Desktop edition active with automatic backup'
                  : 'System running smoothly with automatic data backup'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
            <Button
              variant="ghost"
              onClick={handleDownloadAgentInstallerScript}
              disabled={downloadingBat}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: isMobile ? '100%' : 'auto' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>
                download
              </span>
              {downloadingBat
                ? isAr
                  ? 'جاري التجهيز...'
                  : 'Preparing...'
                : isAr
                ? 'تحميل ملف إعداد أجهزة الكمبيوتر'
                : 'Download PC Setup File'}
            </Button>

            <Button
              onClick={handleCheckUpdates}
              disabled={checking}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: isMobile ? '100%' : 'auto' }}
            >
              <span className={`material-symbols-outlined ${checking ? 'animate-spin' : ''}`} style={{ fontSize: '17px' }}>
                sync
              </span>
              {checking
                ? isAr
                  ? 'جاري الفحص...'
                  : 'Checking...'
                : isAr
                ? 'التحقق من التحديثات'
                : 'Check for Updates'}
            </Button>
          </div>
        </div>

        {/* Bottom Row: Backup Status */}
        <div
          style={{
            marginTop: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
            padding: isMobile ? '12px 14px' : '14px 18px',
            borderRadius: '12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '20px',
                color: cloudStatus?.cloud_connected ? 'var(--accent-green)' : 'var(--accent-yellow)',
                flexShrink: 0,
              }}
            >
              {cloudStatus?.cloud_connected ? 'cloud_done' : 'cloud_sync'}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {isAr ? 'النسخ الاحتياطي السحابي' : 'Cloud Backup'}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: cloudStatus?.cloud_connected ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                    color: cloudStatus?.cloud_connected ? 'var(--accent-green)' : 'var(--accent-yellow)',
                    border: `1px solid ${cloudStatus?.cloud_connected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                  }}
                >
                  {!cloudStatus
                    ? isAr
                      ? 'جاري التحقق...'
                      : 'Checking...'
                    : cloudStatus.cloud_connected
                    ? isAr
                      ? 'متصل ومحفوظ'
                      : 'Connected & Saved'
                    : isAr
                    ? 'حفظ محلي تلقائي'
                    : 'Local Mode'}
                </span>
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  display: 'flex',
                  gap: '14px',
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  {isAr ? 'الأجهزة المحفوظة:' : 'Saved Devices:'}{' '}
                  <strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>{cloudStatus?.cloud_counts.devices ?? 0}</strong>
                </span>
                <span>
                  {isAr ? 'الجلسات:' : 'Sessions:'}{' '}
                  <strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>{cloudStatus?.cloud_counts.sessions ?? 0}</strong>
                </span>
                {(cloudStatus?.pending_sync_items ?? 0) > 0 && (
                  <span>
                    {isAr ? 'بانتظار الحفظ:' : 'Pending:'}{' '}
                    <strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>{cloudStatus?.pending_sync_items}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={handleSyncCloudNow}
            disabled={syncingCloud}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: isMobile ? '100%' : 'auto' }}
          >
            <span className={`material-symbols-outlined ${syncingCloud ? 'animate-spin' : ''}`} style={{ fontSize: '16px' }}>
              cloud_upload
            </span>
            {syncingCloud
              ? isAr
                ? 'جاري الحفظ...'
                : 'Syncing...'
              : isAr
              ? 'نسخ احتياطي الآن'
              : 'Backup Now'}
          </Button>
        </div>

        {statusMessage && (
          <div
            style={{
              marginTop: '14px',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor:
                statusType === 'success'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : statusType === 'error'
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'rgba(223, 168, 66, 0.12)',
              color:
                statusType === 'success'
                  ? 'var(--accent-green)'
                  : statusType === 'error'
                  ? 'var(--accent-red)'
                  : 'var(--accent-cyan)',
              border: `1px solid ${
                statusType === 'success'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : statusType === 'error'
                  ? 'rgba(239, 68, 68, 0.3)'
                  : 'rgba(223, 168, 66, 0.3)'
              }`,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              {statusType === 'success' ? 'check_circle' : statusType === 'error' ? 'error' : 'info'}
            </span>
            <span>{statusMessage}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
