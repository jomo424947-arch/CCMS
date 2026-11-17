import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useLanguage } from '../context/LanguageContext';
import { useSystemSettings } from '../context/SystemSettingsContext';
import { SupportModal } from './SupportModal';

export interface NavItem {
  to: string;
  label: string;
  key: string;
  icon: string;
  adminOnly?: boolean;
}

export const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', key: 'dashboard', icon: 'dashboard' },
  { to: '/rooms', label: 'Gaming Rooms', key: 'rooms', icon: 'meeting_room' },
  { to: '/cafe-tables', label: 'Café Tables', key: 'cafe_tables', icon: 'table_restaurant' },
  { to: '/devices', label: 'Device Fleet', key: 'devices', icon: 'devices' },
  { to: '/sessions', label: 'Active Sessions', key: 'sessions', icon: 'p2p' },
  { to: '/products', label: 'Product Catalog', key: 'products', icon: 'inventory_2' },
  { to: '/billing', label: 'Financials', key: 'billing', icon: 'payments', adminOnly: true },
  { to: '/shifts', label: 'Staff Shifts', key: 'shifts', icon: 'schedule' },
  { to: '/expenses', label: 'Expenses', key: 'expenses', icon: 'receipt_long', adminOnly: true },

  { to: '/reports', label: 'Intelligence Reports', key: 'reports', icon: 'query_stats', adminOnly: true },
  { to: '/employees', label: 'Employees', key: 'employees', icon: 'badge', adminOnly: true },
  { to: '/settings', label: 'Security Settings', key: 'settings', icon: 'security', adminOnly: true },
  { to: '/pricing', label: 'Pricing Settings', key: 'pricing', icon: 'price_change', adminOnly: true },
];

export function Sidebar() {
  const { isAdmin, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { t, isRtl } = useLanguage();
  const { systemName, systemLogoUrl } = useSystemSettings();
  const [showSupportModal, setShowSupportModal] = useState(false);

  if (isMobile) return null;

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    await logout();
    toast(t('success'), 'info');
    navigate('/login');
  };

  return (
    <>
      <aside
        style={{
          position: 'fixed',
          left: isRtl ? 'auto' : 0,
          right: isRtl ? 0 : 'auto',
          top: 0,
          bottom: 0,
          width: 'var(--sidebar-width)',
          background: 'var(--bg-base)',
          borderRight: isRtl ? 'none' : '1px solid var(--border-default)',
          borderLeft: isRtl ? '1px solid var(--border-default)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 60,
        }}
      >
        {/* Logo Section */}
        <div
          style={{
            padding: '24px 22px 20px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            borderBottom: '1px solid var(--border-default)',
            background: 'linear-gradient(180deg, rgba(0, 229, 255, 0.06) 0%, transparent 100%)',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              padding: '2px',
              background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.45), rgba(99, 102, 241, 0.45))',
              boxShadow: '0 0 18px rgba(0, 229, 255, 0.22)',
              flexShrink: 0,
            }}
          >
            <img
              src={systemLogoUrl || './ccms-logo.svg'}
              alt="CCMS CyberShield Logo"
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '10px',
                objectFit: 'contain',
                background: '#060911',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: '21px',
                  fontWeight: 800,
                  background: 'linear-gradient(90deg, #FFFFFF 0%, #00E5FF 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '-0.02em',
                  lineHeight: '1.15',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '125px',
                }}
              >
                {systemName || 'CCMS'}
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  fontFamily: 'JetBrains Mono, monospace',
                  padding: '2px 5px',
                  borderRadius: '4px',
                  background: 'rgba(0, 229, 255, 0.14)',
                  border: '1px solid rgba(0, 229, 255, 0.35)',
                  color: 'var(--accent-cyan)',
                }}
              >
                v2.0
              </span>
            </div>
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginTop: '3px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--accent-green)',
                  boxShadow: '0 0 8px var(--accent-green)',
                }}
              />
              {t('admin_terminal')}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0', overflowY: 'auto' }}>
          {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? 'ccms-nav-active' : ''
              }
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '12px 32px',
                color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                borderLeft: !isRtl && isActive
                  ? '2px solid var(--accent-cyan)'
                  : '2px solid transparent',
                borderRight: isRtl && isActive
                  ? '2px solid var(--accent-cyan)'
                  : '2px solid transparent',
                background: isActive 
                  ? (isRtl 
                      ? 'linear-gradient(to left, rgba(0, 194, 255, 0.1), transparent)' 
                      : 'linear-gradient(to right, rgba(0, 194, 255, 0.1), transparent)'
                    )
                  : 'transparent',
                transition: 'all 0.15s ease',
                textDecoration: 'none',
              })}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                {item.icon}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t(item.key)}
              </span>
            </NavLink>
          ))}

          {/* Footer Support/Logout inside Nav flex container */}
          <div style={{ marginTop: 'auto', paddingBottom: '40px', borderTop: '1px solid var(--border-default)', paddingTop: '24px' }}>
            <button
              onClick={() => setShowSupportModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '12px 32px',
                color: 'var(--text-secondary)',
                transition: 'all 0.2s ease',
                background: 'transparent',
                border: 'none',
                width: '100%',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                headset_mic
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('support')}
              </span>
            </button>

            <a
              href="#"
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '12px 32px',
                color: 'var(--text-secondary)',
                transition: 'all 0.2s ease',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                logout
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('logout')}
              </span>
            </a>
          </div>
        </nav>
      </aside>

      <SupportModal open={showSupportModal} onClose={() => setShowSupportModal(false)} />
    </>
  );
}
