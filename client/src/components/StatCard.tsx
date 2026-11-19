import { ReactNode } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  accent: string;
  hint?: string;
  index?: number;
  onClick?: () => void;
}

function getMaterialIconName(icon: unknown): string {
  if (typeof icon !== 'string' || !icon) return 'analytics';
  switch (icon) {
    case '✓':
    case 'check':
      return 'check_circle';
    case '!':
    case 'warning':
      return 'warning';
    case 'invoices':
      return 'receipt_long';
    case 'timer':
      return 'history_toggle_off';
    case 'pc':
      return 'devices';
    case '$':
    case 'usd':
      return 'payments';
    case 'calendar':
      return 'event_upcoming';
    case 'gamepad':
      return 'sports_esports';
    case 'card':
      return 'credit_card';
    default:
      return icon;
  }
}

export function StatCard({ icon, label, value, accent, hint, index = 0, onClick }: StatCardProps) {
  const isMobile = useIsMobile();
  const iconName = getMaterialIconName(icon);

  return (
    <div
      onClick={onClick}
      className={`ccms-card-stat ccms-card-stat-hover ccms-stagger ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        animationDelay: `${index * 60}ms`,
        padding: isMobile ? '12px 14px' : '18px 20px',
        borderTop: `2px solid ${accent}`,
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: isMobile ? '8px' : '10px',
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      {/* Header: Icon + Label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}>
        <span
          style={{
            fontSize: isMobile ? '11.5px' : '12.5px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
          title={label}
        >
          {label}
        </span>
        <span
          style={{
            width: isMobile ? '26px' : '30px',
            height: isMobile ? '26px' : '30px',
            borderRadius: '8px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ color: accent, fontSize: isMobile ? '15px' : '17px' }}
          >
            {iconName}
          </span>
        </span>
      </div>

      {/* Value & Optional Real Hint */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'JetBrains Mono, Plus Jakarta Sans, monospace',
            fontVariantNumeric: 'tabular-nums',
            fontSize: isMobile ? '20px' : '26px',
            fontWeight: 700,
            lineHeight: 1.15,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </div>
        {hint && (
          <span
            style={{
              fontSize: isMobile ? '11px' : '12px',
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
