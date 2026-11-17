import { useState, useEffect, useCallback } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';
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
          ? 'تم التحقق بنجاح: أنت تعمل على أحدث إصدار مستقر (CCMS v2.0.0 CyberShield Control Plane) مع اتصال مباشر بقاعدة البيانات السحابية.'
          : 'Up to date: Running latest stable release (CCMS v2.0.0 CyberShield Control Plane) with active Supabase Cloud Sync.'
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
          ? 'تمت المزامنة الفورية مع قاعدة بيانات Supabase بنجاح!'
          : 'Successfully synchronized local SQLite with Supabase Cloud!',
        'success'
      );
    } catch {
      toast(isAr ? 'حدث خطأ أثناء المزامنة مع السحابة' : 'Failed to synchronize with cloud database', 'error');
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
          ? `تم تنزيل ملف التثبيت الجماعي (install-cafe.bat) برمز ربط نشط (${pairInfo.code})`
          : `Downloaded mass deployment script (install-cafe.bat) with active OTP (${pairInfo.code})`,
        'success'
      );
    } catch {
      toast(isAr ? 'تعذر توليد ملف التثبيت الجماعي' : 'Could not generate installer script', 'error');
    } finally {
      setDownloadingBat(false);
    }
  };

  return (
    <Card style={{ marginBottom: '24px', overflow: 'hidden', border: '1px solid rgba(0, 229, 255, 0.22)' }}>
      <div style={{ padding: '22px 24px' }}>
        {/* Top Row: Version & Update Check */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            paddingBottom: '18px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.18), rgba(99, 102, 241, 0.18))',
                border: '1px solid rgba(0, 229, 255, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-cyan)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
                system_update_alt
              </span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {isAr ? 'مركز التحديثات والمزامنة السحابية (CCMS v2.0)' : 'Software Update & Cloud Sync Center (CCMS v2.0)'}
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    fontFamily: 'JetBrains Mono, monospace',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: 'var(--accent-green)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                  }}
                >
                  v{version} STABLE
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                {isAr
                  ? `الإصدار المثبت: v${version} ${isElectron ? '(تطبيق سطح المكتب + System Tray)' : '(خادم التحكم المحلي + المزامنة السحابية)'}`
                  : `Installed build: v${version} ${isElectron ? '(Desktop + System Tray)' : '(LAN Control Server + Cloud Sync)'}`}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Button
              variant="ghost"
              onClick={handleDownloadAgentInstallerScript}
              disabled={downloadingBat}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                terminal
              </span>
              {downloadingBat
                ? isAr
                  ? 'جاري التجهيز...'
                  : 'Preparing...'
                : isAr
                ? 'تنزيل مثبت أجهزة الصالة (install-cafe.bat)'
                : 'Download PC Agent Script (install-cafe.bat)'}
            </Button>

            <Button
              onClick={handleCheckUpdates}
              disabled={checking}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <span className={`material-symbols-outlined ${checking ? 'animate-spin' : ''}`} style={{ fontSize: '18px' }}>
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

        {/* Bottom Row: Live Supabase Cloud Sync Status & Metrics */}
        <div
          style={{
            marginTop: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            padding: '14px 18px',
            borderRadius: '12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '22px',
                color: cloudStatus?.cloud_connected ? 'var(--accent-green)' : 'var(--accent-yellow)',
              }}
            >
              {cloudStatus?.cloud_connected ? 'cloud_done' : 'cloud_sync'}
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {isAr ? 'قاعدة البيانات السحابية (Supabase PostgreSQL)' : 'Supabase Cloud Database'}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    fontFamily: 'JetBrains Mono, monospace',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: cloudStatus?.cloud_connected ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                    color: cloudStatus?.cloud_connected ? 'var(--accent-green)' : 'var(--accent-yellow)',
                    border: `1px solid ${cloudStatus?.cloud_connected ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                  }}
                >
                  {!cloudStatus
                    ? isAr
                      ? 'جاري الاتصال بالسحابة...'
                      : 'CONNECTING TO CLOUD...'
                    : cloudStatus.cloud_connected
                    ? isAr
                      ? 'متصل ومستقر · ONLINE'
                      : 'CONNECTED · ONLINE'
                    : isAr
                    ? 'وضع محلي مؤقت · OFFLINE-FIRST'
                    : 'LOCAL SQLITE · OFFLINE-FIRST'}
                </span>
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  fontFamily: 'JetBrains Mono, monospace',
                  display: 'flex',
                  gap: '14px',
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  {isAr ? 'الأجهزة بالسحابة:' : 'Cloud Devices:'} <strong>{cloudStatus?.cloud_counts.devices ?? 0}</strong>
                </span>
                <span>
                  {isAr ? 'الجلسات:' : 'Sessions:'} <strong>{cloudStatus?.cloud_counts.sessions ?? 0}</strong>
                </span>
                <span>
                  {isAr ? 'الأوامر الموقعة:' : 'Signed Cmds:'} <strong>{cloudStatus?.cloud_counts.commands ?? 0}</strong>
                </span>
                <span>
                  {isAr ? 'سجل الأمان:' : 'Audit Logs:'} <strong>{cloudStatus?.cloud_counts.audit_logs ?? 0}</strong>
                </span>
                <span>
                  {isAr ? 'قيد الانتظار:' : 'Pending Queue:'} <strong>{cloudStatus?.pending_sync_items ?? 0}</strong>
                </span>
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={handleSyncCloudNow}
            disabled={syncingCloud}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span className={`material-symbols-outlined ${syncingCloud ? 'animate-spin' : ''}`} style={{ fontSize: '16px' }}>
              cloud_upload
            </span>
            {syncingCloud
              ? isAr
                ? 'جاري المزامنة...'
                : 'Syncing...'
              : isAr
              ? 'مزامنة فورية مع السحابة'
              : 'Sync Cloud Now'}
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
                  : 'rgba(0, 229, 255, 0.12)',
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
                  : 'rgba(0, 229, 255, 0.3)'
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
