import React from 'react';
import {
  Coins,
  Shield,
  Banknote,
  Shirt,
  Laptop,
  Home,
  Gem,
  Gift,
} from 'lucide-react';
import type { GiftCategory } from '../types';

interface GiftBadgeIconProps {
  category: GiftCategory | string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const GIFT_CONFIGS: Record<string, { icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; color: string; bg: string; border: string }> = {
  gold: {
    icon: Coins,
    color: '#e5c278',
    bg: 'rgba(229, 194, 120, 0.15)',
    border: 'rgba(229, 194, 120, 0.3)',
  },
  silver: {
    icon: Shield,
    color: '#cbd5e1',
    bg: 'rgba(203, 213, 225, 0.15)',
    border: 'rgba(203, 213, 225, 0.3)',
  },
  cash: {
    icon: Banknote,
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.15)',
    border: 'rgba(52, 211, 153, 0.3)',
  },
  clothing: {
    icon: Shirt,
    color: '#a78bfa',
    bg: 'rgba(167, 139, 250, 0.15)',
    border: 'rgba(167, 139, 250, 0.3)',
  },
  electronics: {
    icon: Laptop,
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.15)',
    border: 'rgba(56, 189, 248, 0.3)',
  },
  household: {
    icon: Home,
    color: '#fb923c',
    bg: 'rgba(251, 146, 60, 0.15)',
    border: 'rgba(251, 146, 60, 0.3)',
  },
  jewelry: {
    icon: Gem,
    color: '#60a5fa',
    bg: 'rgba(96, 165, 250, 0.15)',
    border: 'rgba(96, 165, 250, 0.3)',
  },
  other: {
    icon: Gift,
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.15)',
    border: 'rgba(148, 163, 184, 0.25)',
  },
};

const SIZES = {
  xs: { box: 22, icon: 11, radius: 6 },
  sm: { box: 30, icon: 15, radius: 8 },
  md: { box: 38, icon: 18, radius: 10 },
  lg: { box: 46, icon: 22, radius: 13 },
};

export default function GiftBadgeIcon({
  category,
  size = 'md',
  className = '',
}: GiftBadgeIconProps) {
  const conf = GIFT_CONFIGS[category] || GIFT_CONFIGS.other;
  const s = SIZES[size];
  const Icon = conf.icon;

  return (
    <div
      className={`gift-badge-icon ${className}`}
      style={{
        width: `${s.box}px`,
        height: `${s.box}px`,
        minWidth: `${s.box}px`,
        minHeight: `${s.box}px`,
        borderRadius: `${s.radius}px`,
        background: `linear-gradient(135deg, ${conf.bg}, rgba(15, 23, 42, 0.6))`,
        border: `1px solid ${conf.border}`,
        boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.12)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: conf.color,
        flexShrink: 0,
        transition: 'all 0.2s ease',
      }}
      aria-hidden="true"
    >
      <Icon size={s.icon} strokeWidth={1.9} />
    </div>
  );
}
