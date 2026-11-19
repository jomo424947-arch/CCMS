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
  { to: '/pcs', label: 'PC Control', key: 'pc_control', icon: 'desktop_windows' },
  { to: '/rooms', label: 'Rooms', key: 'rooms', icon: 'meeting_room' },
  { to: '/cafe-tables', label: 'Café Tables', key: 'cafe_tables', icon: 'table_restaurant' },
  { to: '/devices', label: 'All Devices', key: 'devices', icon: 'devices' },
  { to: '/sessions', label: 'Active Sessions', key: 'sessions', icon: 'p2p' },
  { to: '/products', label: 'Products & Menu', key: 'products', icon: 'inventory_2' },
  { to: '/billing', label: 'Invoices', key: 'billing', icon: 'payments', adminOnly: true },
  { to: '/shifts', label: 'Shifts', key: 'shifts', icon: 'schedule' },
  { to: '/expenses', label: 'Expenses', key: 'expenses', icon: 'receipt_long', adminOnly: true },

  { to: '/reports', label: 'Reports & Profits', key: 'reports', icon: 'query_stats', adminOnly: true },
  { to: '/employees', label: 'Staff', key: 'employees', icon: 'badge', adminOnly: true },
  { to: '/settings', label: 'Settings', key: 'settings', icon: 'settings', adminOnly: true },
  { to: '/pricing', label: 'Pricing', key: 'pricing', icon: 'price_change', adminOnly: true },
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
            padding: '22px 20px 18px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '11px',
              overflow: 'hidden',
              border: '1px solid var(--border-default)',
              background: '#0B0B0D',
              flexShrink: 0,
            }}
          >
            <img
              src={systemLogoUrl || './ccms-logo.svg'}
              alt="CCMS Logo"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontFamily: 'Plus Jakarta Sans, Alexandria, sans-serif',
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                lineHeight: '1.2',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {systemName || 'CCMS'}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--text-muted)',
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t('admin_terminal')}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', padding: '14px 12px', overflowY: 'auto' }}>
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
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '10px',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--accent-primary-dim)' : 'transparent',
                fontWeight: isActive ? 600 : 500,
                transition: 'background-color 0.16s ease, color 0.16s ease',
                textDecoration: 'none',
              })}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                {item.icon}
              </span>
              <span style={{ fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t(item.key)}
              </span>
            </NavLink>
          ))}

          {/* Footer Support/Logout inside Nav flex container */}
          <div style={{ marginTop: 'auto', paddingBottom: '20px', borderTop: '1px solid var(--border-default)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <button
              onClick={() => setShowSupportModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '10px',
                color: 'var(--text-secondary)',
                transition: 'color 0.16s ease',
                background: 'transparent',
                border: 'none',
                width: '100%',
                cursor: 'pointer',
                textAlign: isRtl ? 'right' : 'left',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                headset_mic
              </span>
              <span style={{ fontSize: '13.5px', fontWeight: 500 }}>
                {t('support')}
              </span>
            </button>

            <a
              href="#"
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '10px',
                color: 'var(--text-secondary)',
                transition: 'color 0.16s ease',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                logout
              </span>
              <span style={{ fontSize: '13.5px', fontWeight: 500 }}>
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
