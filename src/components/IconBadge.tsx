import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type IconBadgeVariant = 'gold' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'slate' | 'purple';
export type IconBadgeSize = 'xs' | 'sm' | 'md' | 'lg' | 'hero';
export type IconBadgeShape = 'squircle' | 'circle';

interface IconBadgeProps {
  icon: LucideIcon | React.ComponentType<{ size?: number; className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  variant?: IconBadgeVariant;
  size?: IconBadgeSize;
  shape?: IconBadgeShape;
  glow?: boolean;
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
}

const VARIANT_COLORS: Record<IconBadgeVariant, { color: string; bg: string }> = {
  gold: { color: 'var(--color-apple-blue)', bg: 'rgba(10, 132, 255, 0.15)' },
  emerald: { color: 'var(--color-apple-green)', bg: 'rgba(48, 209, 88, 0.15)' },
  amber: { color: 'var(--color-apple-orange)', bg: 'rgba(255, 159, 10, 0.15)' },
  rose: { color: 'var(--color-apple-red)', bg: 'rgba(255, 69, 58, 0.15)' },
  cyan: { color: 'var(--color-apple-teal)', bg: 'rgba(100, 210, 255, 0.15)' },
  purple: { color: 'var(--color-apple-purple)', bg: 'rgba(191, 90, 242, 0.15)' },
  slate: { color: 'var(--color-text-secondary)', bg: 'rgba(152, 152, 157, 0.15)' },
};

const SIZE_CONFIGS: Record<IconBadgeSize, { box: number; icon: number; radius: number; stroke: number }> = {
  xs: { box: 24, icon: 14, radius: 6, stroke: 2 },
  sm: { box: 32, icon: 18, radius: 9, stroke: 1.8 },
  md: { box: 40, icon: 22, radius: 12, stroke: 1.6 },
  lg: { box: 48, icon: 26, radius: 14, stroke: 1.5 },
  hero: { box: 56, icon: 30, radius: 16, stroke: 1.5 },
};

export default function IconBadge({
  icon: Icon,
  variant = 'gold',
  size = 'md',
  shape = 'squircle',
  glow = false,
  className = '',
  style = {},
  strokeWidth,
}: IconBadgeProps) {
  const v = VARIANT_COLORS[variant] || VARIANT_COLORS.gold;
  const s = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;
  const finalRadius = shape === 'circle' ? '9999px' : `${s.radius}px`;

  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 ${className}`}
      style={{
        width: s.box,
        height: s.box,
        borderRadius: finalRadius,
        backgroundColor: v.bg,
        color: v.color,
        ...style,
      }}
    >
      <Icon
        size={s.icon}
        strokeWidth={strokeWidth || s.stroke}
      />
    </div>
  );
}
