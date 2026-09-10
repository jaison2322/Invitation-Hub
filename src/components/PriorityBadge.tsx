import type { Priority } from '../types';

interface PriorityBadgeProps {
  priority: Priority;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

const CONFIGS: Record<Priority, { label: string; tier: string; dot: string; bg: string; border: string; text: string }> = {
  high: {
    label: 'Tier 1 · Critical',
    tier: 'T1',
    dot: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.28)',
    text: '#fca5a5',
  },
  medium: {
    label: 'Tier 2 · Priority',
    tier: 'T2',
    dot: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.28)',
    text: '#fde68a',
  },
  low: {
    label: 'Tier 3 · Routine',
    tier: 'T3',
    dot: '#64748b',
    bg: 'rgba(100, 116, 139, 0.12)',
    border: 'rgba(100, 116, 139, 0.25)',
    text: '#cbd5e1',
  },
};

export default function PriorityBadge({
  priority,
  size = 'md',
  showLabel = true,
}: PriorityBadgeProps) {
  const c = CONFIGS[priority] || CONFIGS.low;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{
        padding: size === 'sm' ? '2px 6px' : '3px 8px',
        borderRadius: '6px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        fontSize: size === 'sm' ? '10px' : '11px',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em',
        color: c.text,
        lineHeight: 1.2,
      }}
    >
      <span
        style={{
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          background: c.dot,
          boxShadow: `0 0 6px ${c.dot}`,
          flexShrink: 0,
        }}
      />
      <span>{showLabel ? c.label : c.tier}</span>
    </span>
  );
}
