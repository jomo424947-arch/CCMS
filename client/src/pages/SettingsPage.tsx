import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useSystemSettings } from '../context/SystemSettingsContext';
import { useTheme } from '../context/ThemeContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { DEVICE_TYPE_META } from '../utils/constants';
import { formatCurrency } from '../utils/format';
import { DeviceFormModal } from '../components/DeviceFormModal';
import { SoftwareUpdateSection } from '../components/SoftwareUpdateSection';
import type { Device, DeviceType } from '../types';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const { data: devices, loading, refetch } = useAsync(() => dataService.listDevices(), []);
  const [editing, setEditing] = useState<Device | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Device | null>(null);

  const allDevices = devices ?? [];

  return (
    <Layout
      title={t('settings')}
      subtitle={language === 'ar' ? 'إدارة إعدادات الصالة، المظهر، طرق الدفع، والأجهزة.' : 'Manage lounge settings, appearance, payments, and devices.'}
      actions={
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
          <button
            type="button"
            className="ccms-btn ccms-btn-ghost"
            onClick={() => navigate('/super-admin')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              width: isMobile ? '100%' : 'auto',
              justifyContent: 'center',
              borderColor: 'rgba(223, 168, 66, 0.35)',
              color: 'var(--accent-cyan)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>admin_panel_settings</span>
            {language === 'ar' ? 'إدارة الفروع والصالات' : 'Manage Lounges'}
          </button>
          <Button
            onClick={() => setCreating(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              width: isMobile ? '100%' : 'auto',
              justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
            {language === 'ar' ? 'إضافة جهاز جديد' : 'Add Device'}
          </Button>
        </div>
      }
    >
      <SoftwareUpdateSection />
      <ThemeSettingsSection />
      <SystemBrandingSection />
      <PaymentSettingsSection />

      {loading ? (
        <LoadingSpinner label={t('loading')} />
      ) : allDevices.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon="settings"
            title={language === 'ar' ? 'لا توجد أجهزة مضافة' : 'No devices configured'}
            description={language === 'ar' ? 'أضف أول جهاز بالشبكة لبدء إدارته والتحكم به.' : 'Add your first device to start managing the café.'}
            action={<Button onClick={() => setCreating(true)}>{language === 'ar' ? 'إضافة جهاز' : 'Add Device'}</Button>}
          />
        </div>
      ) : (
        <>
          <Card style={{ overflow: 'hidden', marginBottom: '24px' }}>
            <div style={{ padding: isMobile ? '16px' : '20px 24px', borderBottom: '1px solid var(--border-default)' }}>
              <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: isMobile ? '16px' : '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {language === 'ar' ? 'قائمة الأجهزة' : 'Devices List'}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                {allDevices.length} {language === 'ar' ? 'أجهزة مسجلة في الصالة' : `device${allDevices.length === 1 ? '' : 's'} registered`}
              </p>
            </div>
            <Table
              columns={[
                {
                  key: 'name',
                  header: language === 'ar' ? 'اسم الجهاز' : 'Device Name',
                  render: (d: Device) => (
                    <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-cyan)' }}>
                        {d.type === 'pc' ? 'desktop_windows' : d.type === 'console' ? 'sports_esports' : d.type === 'vr' ? 'smart_display' : 'sports_tennis'}
                      </span>
                      {d.name}
                    </strong>
                  ),
                },
                {
                  key: 'type',
                  header: language === 'ar' ? 'النوع' : 'Category',
                  render: (d: Device) => {
                    if (language === 'ar') {
                      if (d.type === 'pc') return 'كمبيوتر';
                      if (d.type === 'console') return 'جهاز كونسول';
                      if (d.type === 'table') return 'طربيزة';
                      return 'شاشة ذكية';
                    }
                    return DEVICE_TYPE_META[d.type].label;
                  },
                },
                {
                  key: 'status',
                  header: language === 'ar' ? 'الحالة' : 'Status',
                  render: (d: Device) => <StatusBadge status={d.status} />,
                },
                {
                  key: 'rate',
                  header: language === 'ar' ? 'سعر الساعة' : 'Hourly Rate',
                  align: 'right',
                  render: (d: Device) => (
                    <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {formatCurrency(d.hourly_rate)}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (d: Device) => (
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Button
                        variant="ghost"
                        onClick={() => setEditing(d)}
                        style={{ padding: '6px 14px', fontSize: '11px', minHeight: '32px' }}
                      >
                        {t('edit')}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => setDeleting(d)}
                        style={{ padding: '6px 14px', fontSize: '11px', minHeight: '32px' }}
                      >
                        {t('delete')}
                      </Button>
                    </div>
                  ),
                },
              ]}
              data={allDevices}
              rowKey={(d) => d.id}
            />
          </Card>
        </>
      )}

      {/* Edit modal */}
      {editing && (
        <DeviceFormModal
          title={language === 'ar' ? `تعديل الجهاز · ${editing.name}` : `Edit Device · ${editing.name}`}
          initial={editing}
          onClose={() => setEditing(null)}
          onDone={async (patch) => {
            try {
              await dataService.updateDevice(editing.id, patch);
              toast(language === 'ar' ? 'تم تحديث بيانات الجهاز بنجاح' : 'Device updated', 'success');
              refetch();
              setEditing(null);
            } catch (err) {
              toast(apiErrorMessage(err, 'Could not update'), 'error');
            }
          }}
        />
      )}

      {/* Create modal */}
      {creating && (
        <DeviceFormModal
          title={language === 'ar' ? 'إضافة جهاز جديد' : 'Add Device'}
          initial={null}
          onClose={() => setCreating(false)}
          onDone={async (patch) => {
            try {
              await dataService.createDevice(patch as { name: string; type: DeviceType; hourly_rate: number; specs?: Record<string, string> });
              toast(language === 'ar' ? 'تم إضافة الجهاز بنجاح' : 'Device added', 'success');
              refetch();
              setCreating(false);
            } catch (err) {
              toast(apiErrorMessage(err, 'Could not create device'), 'error');
            }
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleting && (
        <Modal
          open
          title={language === 'ar' ? 'حذف الجهاز' : 'Delete Device'}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>{t('cancel')}</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await dataService.deleteDevice(deleting.id);
                    toast(language === 'ar' ? 'تمت إزالة الجهاز بنجاح' : 'Device removed', 'success');
                    refetch();
                    setDeleting(null);
                  } catch (err) {
                    toast(apiErrorMessage(err, 'Could not delete'), 'error');
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            {language === 'ar'
              ? `هل أنت متأكد من رغبتك في إزالة الجهاز (${deleting.name}) من النظام؟`
              : `Are you sure you want to remove device (${deleting.name}) from the system?`}
          </p>
        </Modal>
      )}
    </Layout>
  );
}

function SystemBrandingSection() {
  const { systemName, systemLogoUrl, updateSystemSettings } = useSystemSettings();
  const { toast } = useToast();
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const isAr = language === 'ar';

  const [name, setName] = useState(systemName);
  const [logoUrl, setLogoUrl] = useState(systemLogoUrl);

  const handleSave = () => {
    updateSystemSettings(name, logoUrl);
    toast(isAr ? 'تم حفظ إعدادات اسم النظام وشعار المحل بنجاح' : 'System identity & cyber logo updated successfully', 'success');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast(isAr ? 'حجم الصورة كبير جداً (الحد الأقصى 2 ميجابايت)' : 'Image too large (max 2MB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <Card style={{ padding: isMobile ? '16px' : '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border-default)', paddingBottom: '16px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '22px', color: 'var(--accent-cyan)', marginTop: '2px' }}>
          badge
        </span>
        <div>
          <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: isMobile ? '16px' : '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {isAr ? 'هوية الصالة والشعار' : 'Lounge Identity & Logo'}
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0, lineHeight: 1.5 }}>
            {isAr ? 'تخصيص اسم الصالة وشعارها ليظهر في كافة شاشات النظام والفواتير.' : 'Customize your lounge name and logo across the app and invoices.'}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 280px', gap: isMobile ? '20px' : '24px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label={isAr ? 'اسم النظام / المحل' : 'System / Cafe Name'}
            placeholder="e.g. Cyber Zone, Pro Gaming Cafe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isAr ? 'صورة / شعار المحل' : 'Cyber Logo Image'}
            </label>
            <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
              <Input
                placeholder="https://example.com/logo.png or upload image"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                style={{ flex: 1, minWidth: 0, width: '100%' }}
              />
              <label
                className="ccms-btn ccms-btn-ghost"
                style={{
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  minHeight: '42px',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload_file</span>
                {isAr ? 'رفع صورة' : 'Upload'}
                <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '8px' }}>
            <Button
              onClick={handleSave}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
              {isAr ? 'حفظ إعدادات الهوية' : 'Save Identity Settings'}
            </Button>
          </div>
        </div>

        {/* Live Brand Preview Card */}
        <div
          style={{
            padding: isMobile ? '16px' : '20px',
            borderRadius: '12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: '12px',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {isAr ? 'معاينة الشعار المباشرة' : 'Live Brand Preview'}
          </span>
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '16px',
              background: 'var(--bg-surface)',
              border: '1px solid rgba(223, 168, 66, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: '0 0 16px rgba(223, 168, 66, 0.15)',
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: '34px', color: 'var(--accent-cyan)' }}>
                storefront
              </span>
            )}
          </div>
          <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '18px', fontWeight: 700, color: 'var(--accent-cyan)', wordBreak: 'break-word', maxWidth: '100%' }}>
            {name || 'CCMS'}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PaymentSettingsSection() {
  const { walletQrUrl, walletPhoneNumber, bankDetails, updatePaymentSettings } = useSystemSettings();
  const { toast } = useToast();
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const isAr = language === 'ar';

  const [qrUrl, setQrUrl] = useState(walletQrUrl);
  const [phone, setPhone] = useState(walletPhoneNumber);
  const [bank, setBank] = useState(bankDetails);

  const handleSave = () => {
    updatePaymentSettings(qrUrl, phone, bank);
    toast(
      isAr 
        ? 'تم حفظ إعدادات الدفع الإلكتروني والمحفظة بنجاح' 
        : 'Payment & e-wallet settings saved successfully', 
      'success'
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast(isAr ? 'حجم الصورة كبير جداً (الحد الأقصى 3 ميجابايت)' : 'Image too large (max 3MB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setQrUrl(reader.result);
        toast(isAr ? 'تم تحميل صورة QR بنجاح' : 'QR code image loaded', 'info');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLoadSample = () => {
    setQrUrl('/vodafone-qr-sample.jpg');
    toast(isAr ? 'تم تحميل صورة QR فودافون كاش النموذجية' : 'Sample Vodafone QR loaded', 'info');
  };

  const handleClearQr = () => {
    setQrUrl('');
    toast(isAr ? 'تم إزالة صورة QR (الديفولت فارغة)' : 'Cleared QR image (default empty)', 'info');
  };

  return (
    <Card style={{ padding: isMobile ? '16px' : '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border-default)', paddingBottom: '16px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '22px', color: 'var(--accent-green)', marginTop: '2px' }}>
          qr_code_2
        </span>
        <div>
          <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: isMobile ? '16px' : '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {isAr ? 'إعدادات المحفظة الإلكترونية وطرق الدفع' : 'E-Wallet & Digital Payment Settings'}
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0, lineHeight: 1.5 }}>
            {isAr 
              ? 'تخصيص صورة QR كود فودافون كاش / المحفظة ورقم التحويل وتفاصيل البنك التي تظهر للعميل والكاشير أثناء السداد.' 
              : 'Configure Vodafone Cash / E-Wallet QR code, wallet phone number, and bank transfer details.'}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: isMobile ? '20px' : '24px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* QR Image Input */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isAr ? 'صورة QR كود المحفظة (فودافون كاش / اتصالات / أورانج / وي)' : 'E-Wallet QR Code Image'}
            </label>
            <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
              <Input
                placeholder={isAr ? 'رابط الصورة أو ارفع صورة من الجهاز (الديفولت فارغة)' : 'Image URL or upload image (default is empty)'}
                value={qrUrl}
                onChange={(e) => setQrUrl(e.target.value)}
                style={{ flex: 1, minWidth: 0, width: '100%' }}
              />
              <label
                className="ccms-btn ccms-btn-ghost"
                style={{
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  minHeight: '42px',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload_file</span>
                {isAr ? 'رفع صورة QR' : 'Upload QR'}
                <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
            
            {/* Quick Helper buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ccms-btn ccms-btn-ghost"
                onClick={handleLoadSample}
                style={{
                  fontSize: '11px',
                  padding: '6px 12px',
                  color: 'var(--accent-cyan)',
                  flex: isMobile ? '1 1 auto' : 'initial',
                  justifyContent: 'center',
                  minHeight: '34px',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>qr_code_scanner</span>
                {isAr ? 'استخدام صورة فودافون كاش المرفقة' : 'Use Attached Vodafone QR'}
              </button>
              {qrUrl && (
                <button
                  type="button"
                  className="ccms-btn ccms-btn-ghost"
                  onClick={handleClearQr}
                  style={{
                    fontSize: '11px',
                    padding: '6px 12px',
                    color: 'var(--accent-red)',
                    flex: isMobile ? '1 1 auto' : 'initial',
                    justifyContent: 'center',
                    minHeight: '34px',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
                  {isAr ? 'تعيين فارغة (الديفولت)' : 'Clear (Default Empty)'}
                </button>
              )}
            </div>
          </div>

          {/* Wallet Phone Number */}
          <Input
            label={isAr ? 'رقم محفظة فودافون كاش / الهاتف' : 'Wallet Phone Number'}
            placeholder={isAr ? 'مثال: 01012345678' : 'e.g. 01012345678'}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          {/* Bank Transfer / InstaPay details */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isAr ? 'تفاصيل التحويل البنكي / InstaPay' : 'Bank Transfer & InstaPay Details'}
            </label>
            <textarea
              className="ccms-input"
              rows={3}
              placeholder={isAr ? 'مثال: البنك الأهلي المصري | InstaPay: cyber@instapay | حساب رقم: 12345678' : 'Bank name, IBAN, InstaPay handle...'}
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              style={{ width: '100%', resize: 'vertical', fontFamily: isAr ? 'Cairo, sans-serif' : 'inherit' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '8px' }}>
            <Button
              onClick={handleSave}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
              {isAr ? 'حفظ إعدادات الدفع' : 'Save Payment Settings'}
            </Button>
          </div>
        </div>

        {/* Live Wallet QR Preview Card */}
        <div
          style={{
            padding: isMobile ? '16px' : '20px',
            borderRadius: '12px',
            background: 'var(--bg-elevated)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '12px',
            width: '100%',
            maxWidth: '100%',
            boxShadow: '0 0 20px rgba(34, 197, 94, 0.08)',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>account_balance_wallet</span>
            {isAr ? 'معاينة شاشة السداد للمحفظة' : 'Wallet Checkout Preview'}
          </div>

          <div
            style={{
              width: isMobile ? '160px' : '180px',
              height: isMobile ? '160px' : '180px',
              borderRadius: '12px',
              background: '#FFFFFF',
              border: '2px solid var(--accent-green)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
          >
            {qrUrl ? (
              <img src={qrUrl} alt="Wallet QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#666', gap: '6px', textAlign: 'center', padding: '10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '40px', color: '#888' }}>
                  qr_code_2_add
                </span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#444', whiteSpace: 'pre-line' }}>
                  {isAr ? 'الديفولت فارغة\n(قم برفع صورة الـ QR)' : 'Default Empty\n(Upload QR Code)'}
                </span>
              </div>
            )}
          </div>

          {phone && (
            <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace', maxWidth: '100%', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>phone_iphone</span>
              {phone}
            </div>
          )}

          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
            {isAr 
              ? 'هكذا ستظهر للعميل أو الكاشير عند تحديد طريقة الدفع: محفظة إلكترونية.' 
              : 'This QR will be displayed to customers when paying via E-Wallet.'}
          </span>
        </div>
      </div>
    </Card>
  );
}

function ThemeSettingsSection() {
  const { theme, setTheme, fontScale, setFontScale, resetVisualScale } = useTheme();
  const { language, t } = useLanguage();
  const isMobile = useIsMobile();
  const isAr = language === 'ar';

  const fontPresets = [
    { label: isAr ? 'صغير' : 'Small', desc: '94%', value: 94 },
    { label: isAr ? 'عادي' : 'Normal', desc: '100%', value: 100 },
    { label: isAr ? 'كبير' : 'Large', desc: '108%', value: 108 },
  ];

  return (
    <Card style={{ padding: isMobile ? '16px' : '24px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', borderBottom: '1px solid var(--border-default)', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--accent-cyan)' }}>
            palette
          </span>
          <div>
            <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: isMobile ? '15.5px' : '17px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {t('visual_scaling_title')}
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', margin: 0 }}>
              {t('visual_scaling_desc')}
            </p>
          </div>
        </div>
        {fontScale !== 100 && (
          <button
            type="button"
            onClick={resetVisualScale}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--accent-red)',
              border: '1px solid rgba(239, 68, 68, 0.28)',
              cursor: 'pointer',
              width: isMobile ? '100%' : 'auto',
              minHeight: '34px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>restart_alt</span>
            {t('reset_scaling')}
          </button>
        )}
      </div>

      {/* Dark / Light Theme Mode Selectors */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
        {isAr ? 'نمط الألوان' : 'Color Theme'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '10px', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          style={{
            padding: '14px 16px',
            borderRadius: '11px',
            background: 'var(--bg-base)',
            border: theme === 'dark' ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-default)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            textAlign: 'inherit',
            transition: 'border-color 0.2s ease',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '9px',
              background: 'rgba(223, 168, 66, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>dark_mode</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isAr ? 'الوضع الداكن' : 'Dark Mode'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {isAr ? 'مريح للعين في الإضاءة المنخفضة' : 'Comfortable dark theme'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setTheme('light')}
          style={{
            padding: '14px 16px',
            borderRadius: '11px',
            background: 'var(--bg-base)',
            border: theme === 'light' ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-default)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            textAlign: 'inherit',
            transition: 'border-color 0.2s ease',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '9px',
              background: 'var(--accent-cyan-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>light_mode</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isAr ? 'الوضع الفاتح' : 'Light Mode'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {isAr ? 'واضح ومشرق للعمل النهاري' : 'Clean daytime appearance'}
            </div>
          </div>
        </button>
      </div>

      {/* Text Size Selector (Safe Ergonomic Presets Only) */}
      <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>format_size</span>
            <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>{t('font_scale')}</span>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
            {fontScale}%
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
          {fontPresets.map((preset) => {
            const active = fontScale === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => setFontScale(preset.value)}
                style={{
                  padding: '10px 8px',
                  borderRadius: '9px',
                  fontSize: '13px',
                  fontWeight: active ? 700 : 500,
                  background: active ? 'var(--accent-cyan)' : 'var(--bg-base)',
                  color: active ? '#111114' : 'var(--text-secondary)',
                  border: active ? '1px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>{preset.label}</span>
                <span style={{ fontSize: '11px', opacity: active ? 0.85 : 0.65, fontFamily: 'JetBrains Mono, monospace' }}>
                  {preset.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
