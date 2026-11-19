import { ReactNode, useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { dataService } from '../services';
import { formatCurrency } from '../utils/format';
import { StartShiftModal, CloseShiftModal } from './ShiftModals';
import { SupportModal } from './SupportModal';
import type { Shift } from '../types';

interface LayoutProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  currentShift?: Shift | null;
}

export function Layout({ title, subtitle, actions, children, currentShift }: LayoutProps) {
  const isMobile = useIsMobile();
  const { user, isAdmin, logout, tenant, activationStatus, refreshActivationStatus } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const { language, setLanguage, t, isRtl } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const isTrial = activationStatus === 'trial' || tenant?.status === 'trial' || tenant?.plan === 'trial';
  const expiresAt = tenant?.expires_at;
  const daysRemaining = expiresAt ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const isExpiringSoon = daysRemaining !== null && daysRemaining <= 3;

  const effectiveShift = currentShift !== undefined ? currentShift : activeShift;

  const refreshActiveShift = () => {
    dataService.getActiveShift()
      .then((s) => setActiveShift(s))
      .catch(() => setActiveShift(null));
  };

  useEffect(() => {
    let mounted = true;
    const fetchShift = () => {
      dataService.getActiveShift()
        .then((s) => {
          if (mounted) setActiveShift(s);
        })
        .catch(() => { });
    };

    fetchShift();
    refreshActivationStatus();
    window.addEventListener('shift-changed', fetchShift);
    window.addEventListener('focus', () => {
      fetchShift();
      refreshActivationStatus();
    });

    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        fetchShift();
      }
    }, 60000);

    return () => {
      mounted = false;
      window.removeEventListener('shift-changed', fetchShift);
      clearInterval(interval);
    };
  }, [refreshActivationStatus]);

  const handleLogout = async () => {
    setShowMoreMenu(false);
    await logout();
    toast(t('success'), 'info');
    navigate('/login');
  };

  const mobileMainItems = [
    { to: '/dashboard', label: t('dashboard'), icon: 'dashboard' },
    { to: '/pcs', label: language === 'ar' ? 'أجهزة PC' : 'PCs', icon: 'desktop_windows' },
    { to: '/rooms', label: t('rooms'), icon: 'meeting_room' },
    { to: '/sessions', label: t('sessions'), icon: 'p2p' },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Sidebar for Desktop */}
      {!isMobile && <Sidebar />}

      {/* Top AppBar for Desktop */}
      {!isMobile && (
        <header
          style={{
            height: '64px',
            position: 'fixed',
            top: 0,
            left: isRtl ? 0 : 'auto',
            right: isRtl ? 'auto' : 0,
            width: 'calc(100% - var(--sidebar-width))',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            borderBottom: '1px solid var(--border-default)',
            backdropFilter: 'blur(16px)',
            background: 'var(--header-bg)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {/* Left panel: Active shift badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {effectiveShift ? (
              <button
                onClick={() => navigate('/shifts')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '10px',
                  padding: '6px 14px',
                  color: 'var(--accent-green)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title={language === 'ar' ? 'عرض تفاصيل الوردية النشطة' : 'View active shift details'}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: 'var(--accent-green)',
                  }}
                />
                <span>{language === 'ar' ? 'الوردية مفتوحة' : 'Active Shift'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>•</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(Number(effectiveShift.total_revenue || 0))}
                </span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/shifts')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '10px',
                  padding: '6px 12px',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--accent-yellow)' }}>schedule</span>
                <span>{language === 'ar' ? 'لا توجد وردية مفتوحة' : 'No Open Shift'}</span>
              </button>
            )}
          </div>

          {/* Middle: Trial or Expiry Warning Banner */}
          {(isTrial || isExpiringSoon) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 14px',
                borderRadius: '10px',
                background: isTrial
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                border: isTrial
                  ? '1px solid rgba(245, 158, 11, 0.3)'
                  : '1px solid rgba(239, 68, 68, 0.3)',
                color: isTrial ? '#fbbf24' : '#f87171',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '16px',
                  color: isTrial ? '#fbbf24' : '#f87171',
                }}
              >
                {isTrial ? 'hourglass_top' : 'warning'}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600 }}>
                <span>
                  {isTrial
                    ? (language === 'ar' ? 'فترة تجريبية' : 'Trial Period')
                    : (language === 'ar' ? 'اقتراب انتهاء الاشتراك' : 'Subscription Expiring')}
                </span>

                <span style={{ opacity: 0.5 }}>•</span>

                <span style={{ color: daysRemaining === 0 ? '#ef4444' : 'inherit' }}>
                  {daysRemaining !== null
                    ? (daysRemaining <= 0
                        ? (language === 'ar' ? 'تنتهي اليوم' : 'Expires Today')
                        : (language === 'ar' ? `متبقي ${daysRemaining} يوم` : `${daysRemaining}d left`))
                    : (language === 'ar' ? 'تجريبي' : 'Trial')}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowSupportModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: isTrial ? 'rgba(245, 158, 11, 0.18)' : 'rgba(239, 68, 68, 0.18)',
                  border: isTrial ? '1px solid rgba(245, 158, 11, 0.38)' : '1px solid rgba(239, 68, 68, 0.38)',
                  color: 'var(--text-primary)',
                  padding: '3px 10px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title={language === 'ar' ? 'تواصل مع الدعم لتفعيل الاشتراك' : 'Contact support to upgrade'}
              >
                <span>{language === 'ar' ? 'تفعيل الاشتراك' : 'Upgrade'}</span>
              </button>
            </div>
          )}

          {/* Right panel: Theme, Language & User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={toggleTheme}
                aria-label={t('toggle_theme')}
                style={{
                  color: 'var(--accent-primary)',
                  width: '34px',
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--accent-primary-dim)',
                  border: '1px solid var(--border-glow)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                title={t('toggle_theme')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>
                  {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                </span>
              </button>

              <button
                onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                style={{
                  color: 'var(--text-primary)',
                  height: '34px',
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                title={language === 'en' ? 'التبديل للعربية' : 'Switch to English'}
              >
                {language === 'en' ? 'العربية' : 'English'}
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 12px',
                borderRadius: '8px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'var(--accent-primary-dim)',
                  color: 'var(--accent-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                {(user?.full_name ?? 'A').charAt(0).toUpperCase()}
              </div>
              <p
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  lineHeight: '1.2',
                  margin: 0,
                }}
              >
                {user?.full_name ? user.full_name : (language === 'ar' ? 'المدير' : 'Admin')}
              </p>
            </div>
          </div>
        </header>
      )}

      {/* Top AppBar for Mobile (Compact Brand + Active Shift + Controls) */}
      {isMobile && (
        <header
          style={{
            height: 'calc(52px + var(--safe-top))',
            paddingTop: 'var(--safe-top)',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            paddingLeft: '12px',
            paddingRight: '12px',
            borderBottom: '1px solid var(--border-default)',
            backdropFilter: 'blur(16px)',
            background: 'var(--header-bg)',
          }}
        >
          {/* Left: Mini Logo + Shift Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              aria-label="Home"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid var(--border-glow)',
                background: '#0B0B0D',
                flexShrink: 0,
                padding: 0,
              }}
            >
              <img src="./ccms-logo.svg" alt="CCMS" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
            </button>

            {effectiveShift ? (
              <button
                onClick={() => navigate('/shifts')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '8px',
                  padding: '5px 9px',
                  color: 'var(--accent-green)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minWidth: 0,
                  maxWidth: '100%',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--accent-green)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {language === 'ar' ? 'الوردية' : 'Shift'}
                </span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {formatCurrency(Number(effectiveShift.total_revenue || 0))}
                </span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/shifts')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '5px 9px',
                  color: 'var(--text-secondary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--accent-yellow)',
                    flexShrink: 0,
                  }}
                />
                <span>{language === 'ar' ? 'لا توجد وردية' : 'No Shift'}</span>
              </button>
            )}
          </div>

          {/* Right: Compact Language & Theme buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: '8px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              aria-label="Toggle language"
            >
              {language === 'en' ? 'عربي' : 'EN'}
            </button>

            <button
              onClick={toggleTheme}
              aria-label={t('toggle_theme')}
              style={{
                color: 'var(--accent-primary)',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--accent-primary-dim)',
                border: '1px solid var(--border-glow)',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
              title={t('toggle_theme')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
          </div>
        </header>
      )}

      <main
        style={{
          marginLeft: isRtl ? 0 : (isMobile ? 0 : 'var(--sidebar-width)'),
          marginRight: isRtl ? (isMobile ? 0 : 'var(--sidebar-width)') : 0,
          padding: isMobile ? '12px' : '28px 32px',
          paddingTop: isMobile ? 'calc(64px + var(--safe-top))' : (title || subtitle ? '92px' : '78px'),
          paddingBottom: isMobile ? 'calc(74px + var(--safe-bottom))' : '32px',
          minHeight: '100vh',
          maxWidth: '100%',
          overflowX: 'hidden',
          flex: 1,
        }}
      >
        {/* Page header */}
        {(title || subtitle || actions) && (
          <header
            style={{
              display: 'flex',
              alignItems: isMobile ? 'stretch' : 'center',
              flexDirection: isMobile && (title || subtitle) ? 'column' : 'row',
              justifyContent: (title || subtitle) ? 'space-between' : (isRtl ? 'flex-start' : 'flex-end'),
              gap: isMobile ? '10px' : '16px',
              marginBottom: (title || subtitle) ? (isMobile ? '14px' : '24px') : '14px',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
            }}
          >
            {(title || subtitle) && (
              <div style={{ width: isMobile ? '100%' : 'auto', minWidth: 0 }}>
                {title && (
                  <h1
                    className="ccms-page-title"
                    style={{
                      fontSize: isMobile ? '20px' : '28px',
                      wordBreak: 'break-word',
                    }}
                  >
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      marginTop: '4px',
                      fontSize: isMobile ? '12.5px' : '14px',
                      wordBreak: 'break-word',
                    }}
                  >
                    {subtitle}
                  </p>
                )}
              </div>
            )}
            {actions && (
              <div
                style={{
                  display: 'flex',
                  gap: isMobile ? '8px' : '10px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  width: isMobile ? '100%' : 'auto',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  justifyContent: isMobile ? 'stretch' : (isRtl ? 'flex-start' : 'flex-end'),
                }}
              >
                {actions}
              </div>
            )}
          </header>
        )}

        {/* Page body */}
        <div style={{ maxWidth: '100%', minWidth: 0 }}>{children}</div>
      </main>

      {/* Mobile Adaptive Bottom Navigation */}
      {isMobile && (
        <>
          <nav
            aria-label="Mobile Navigation"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              height: 'calc(58px + var(--safe-bottom))',
              paddingBottom: 'var(--safe-bottom)',
              background: 'var(--bg-surface)',
              borderTop: '1px solid var(--border-default)',
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center',
              zIndex: 999,
              boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.28)',
            }}
          >
            {mobileMainItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  fontSize: '10.5px',
                  fontWeight: isActive ? 700 : 500,
                  flex: 1,
                  minWidth: 0,
                  height: '100%',
                  minHeight: '44px',
                  padding: '0 2px',
                  transition: 'color 0.2s ease',
                })}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{item.icon}</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{item.label}</span>
              </NavLink>
            ))}

            <button
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                color: showMoreMenu ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: '10.5px',
                fontWeight: showMoreMenu ? 700 : 500,
                flex: 1,
                minWidth: 0,
                height: '100%',
                minHeight: '44px',
                padding: '0 2px',
                transition: 'color 0.2s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>menu</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{t('more')}</span>
            </button>
          </nav>

          {/* More Items Drawer */}
          {showMoreMenu && (
            <>
              <div
                onClick={() => setShowMoreMenu(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(10, 10, 11, 0.72)',
                  backdropFilter: 'blur(6px)',
                  zIndex: 1000,
                  animation: 'fade-in 0.2s ease',
                }}
              />
              <div
                style={{
                  position: 'fixed',
                  bottom: 'calc(60px + var(--safe-bottom))',
                  left: 0,
                  right: 0,
                  maxHeight: 'calc(100vh - 75px)',
                  overflowY: 'auto',
                  background: 'var(--bg-surface)',
                  borderTop: '1px solid var(--border-default)',
                  borderTopLeftRadius: '20px',
                  borderTopRightRadius: '20px',
                  padding: '20px 16px 24px 16px',
                  zIndex: 1001,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: 'var(--shadow-glow-strong)',
                  animation: 'slide-up 0.25s ease-out',
                }}
              >
                {/* Header bar: user info + close button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'var(--accent-cyan-dim)',
                        border: '1px solid var(--border-glow)',
                        color: 'var(--accent-cyan)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '16px',
                      }}
                    >
                      {(user?.full_name ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 700 }}>{user?.full_name ?? 'User'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 600, marginTop: '1px' }}>
                        {user?.role === 'admin' ? t('administrator') : t('staff_operator')}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowMoreMenu(false)}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                    title={language === 'ar' ? 'إغلاق القائمة' : 'Close'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                  </button>
                </div>

                {/* Theme & Language Toggles */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={toggleTheme}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      color: theme === 'dark' ? '#F59E0B' : 'var(--accent-cyan)',
                      background: theme === 'dark' ? 'rgba(245, 158, 11, 0.12)' : 'var(--accent-cyan-dim)',
                      border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-glow)',
                      borderRadius: '10px',
                      fontWeight: 600,
                      fontSize: '13px',
                      minHeight: '44px',
                      cursor: 'pointer',
                    }}
                    title={t('toggle_theme')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                    </span>
                    <span>{theme === 'dark' ? t('light_mode') : t('dark_mode')}</span>
                  </button>

                  <button
                    onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      color: 'var(--accent-cyan)',
                      background: 'var(--accent-cyan-dim)',
                      border: '1px solid var(--border-glow)',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '13px',
                      minHeight: '44px',
                      cursor: 'pointer',
                      fontFamily: isRtl ? 'Cairo, sans-serif' : 'Plus Jakarta Sans, sans-serif'
                    }}
                    title={language === 'en' ? 'Arabic' : 'English'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>language</span>
                    <span>{language === 'en' ? 'العربية' : 'English'}</span>
                  </button>
                </div>

                {/* Section 1: Operations & Services */}
                <div style={{ marginTop: '4px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 8px', marginBottom: '4px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace' }}>
                    {language === 'ar' ? 'العمليات والخدمات' : 'Operations & Services'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <NavLink
                      to="/pcs"
                      onClick={() => setShowMoreMenu(false)}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                        background: isActive ? 'var(--accent-primary-dim)' : 'transparent',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 700,
                        minHeight: '42px',
                      })}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>desktop_windows</span>
                      <span>{t('pc_control')}</span>
                    </NavLink>

                    <NavLink
                      to="/devices"
                      onClick={() => setShowMoreMenu(false)}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                        background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 500,
                        minHeight: '42px',
                      })}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>devices</span>
                      <span>{t('devices')}</span>
                    </NavLink>

                    <NavLink
                      to="/cafe-tables"
                      onClick={() => setShowMoreMenu(false)}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                        background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 500,
                        minHeight: '42px',
                      })}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-yellow)' }}>table_restaurant</span>
                      <span>{t('cafe_tables')}</span>
                    </NavLink>

                    <NavLink
                      to="/products"
                      onClick={() => setShowMoreMenu(false)}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                        background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 500,
                        minHeight: '42px',
                      })}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>inventory_2</span>
                      <span>{t('products')}</span>
                    </NavLink>

                    <NavLink
                      to="/shifts"
                      onClick={() => setShowMoreMenu(false)}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                        background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 500,
                        minHeight: '42px',
                      })}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-green)' }}>schedule</span>
                      <span>{t('shifts')}</span>
                    </NavLink>
                  </div>
                </div>

                {/* Section 2: Administration (Admin Only) */}
                {isAdmin && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 8px', marginBottom: '4px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace' }}>
                      {language === 'ar' ? 'لوحة الإدارة والتحكم' : 'Administration'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <NavLink
                        to="/expenses"
                        onClick={() => setShowMoreMenu(false)}
                        style={({ isActive }) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 500,
                          minHeight: '42px',
                        })}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-red)' }}>receipt_long</span>
                        <span>{t('expenses')}</span>
                      </NavLink>

                      <NavLink
                        to="/billing"
                        onClick={() => setShowMoreMenu(false)}
                        style={({ isActive }) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 500,
                          minHeight: '42px',
                        })}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-yellow)' }}>payments</span>
                        <span>{t('billing')}</span>
                      </NavLink>

                      <NavLink
                        to="/reports"
                        onClick={() => setShowMoreMenu(false)}
                        style={({ isActive }) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 500,
                          minHeight: '42px',
                        })}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-purple)' }}>query_stats</span>
                        <span>{t('reports')}</span>
                      </NavLink>
                      <NavLink
                        to="/employees"
                        onClick={() => setShowMoreMenu(false)}
                        style={({ isActive }) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 500,
                          minHeight: '42px',
                        })}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>badge</span>
                        <span>{t('employees')}</span>
                      </NavLink>

                      <NavLink
                        to="/pricing"
                        onClick={() => setShowMoreMenu(false)}
                        style={({ isActive }) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 500,
                          minHeight: '42px',
                        })}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>price_change</span>
                        <span>{t('pricing')}</span>
                      </NavLink>

                      <NavLink
                        to="/settings"
                        onClick={() => setShowMoreMenu(false)}
                        style={({ isActive }) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 500,
                          minHeight: '42px',
                        })}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>security</span>
                        <span>{t('settings')}</span>
                      </NavLink>
                    </div>
                  </div>
                )}

                {/* Section 3: Support & Actions */}
                <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowSupportModal(true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      color: 'var(--text-secondary)',
                      fontSize: '13px',
                      fontWeight: 600,
                      textAlign: isRtl ? 'right' : 'left',
                      minHeight: '42px',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>headset_mic</span>
                    <span>{t('support')}</span>
                  </button>

                  <button
                    onClick={handleLogout}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      color: 'var(--accent-red)',
                      fontSize: '13px',
                      fontWeight: 600,
                      textAlign: isRtl ? 'right' : 'left',
                      minHeight: '42px',
                      background: 'rgba(255, 68, 102, 0.08)',
                      border: '1px solid rgba(255, 68, 102, 0.2)',
                      cursor: 'pointer',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span>
                    <span>{t('logout')}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Global Quick Shift Modals */}
      <StartShiftModal
        open={showStartModal}
        onClose={() => setShowStartModal(false)}
        onStarted={() => {
          setShowStartModal(false);
          refreshActiveShift();
        }}
      />
      <CloseShiftModal
        open={showCloseModal}
        shift={activeShift}
        onClose={() => setShowCloseModal(false)}
        onClosed={() => {
          setShowCloseModal(false);
          refreshActiveShift();
        }}
      />
      <SupportModal open={showSupportModal} onClose={() => setShowSupportModal(false)} />
    </div>
  );
}
