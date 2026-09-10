import React from 'react';
import {
  Sparkles,
  Gem,
  Cake,
  Heart,
  Home,
  GraduationCap,
  Briefcase,
  Wine,
  Landmark,
  Flame,
  Calendar,
  Compass,
  Feather,
  Smile,
} from 'lucide-react';
import type { EventType } from '../types';

interface EventBadgeIconProps {
  type: EventType | string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
  showGlow?: boolean;
}

interface EventVisualConfig {
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  accentColor: string;
  bgColor: string;
  borderColor: string;
}

const EVENT_CONFIGS: Record<string, EventVisualConfig> = {
  wedding: {
    icon: Sparkles,
    accentColor: '#e5c278', // Warm champagne gold
    bgColor: 'rgba(229, 194, 120, 0.12)',
    borderColor: 'rgba(229, 194, 120, 0.28)',
  },
  engagement: {
    icon: Gem,
    accentColor: '#60a5fa', // Blue diamond
    bgColor: 'rgba(96, 165, 250, 0.12)',
    borderColor: 'rgba(96, 165, 250, 0.28)',
  },
  birthday: {
    icon: Cake,
    accentColor: '#f472b6', // Subtle rose
    bgColor: 'rgba(244, 114, 182, 0.12)',
    borderColor: 'rgba(244, 114, 182, 0.28)',
  },
  anniversary: {
    icon: Heart,
    accentColor: '#fb7185', // Rose red
    bgColor: 'rgba(251, 113, 133, 0.12)',
    borderColor: 'rgba(251, 113, 133, 0.28)',
  },
  house_warming: {
    icon: Home,
    accentColor: '#34d399', // Emerald
    bgColor: 'rgba(52, 211, 153, 0.12)',
    borderColor: 'rgba(52, 211, 153, 0.28)',
  },
  baby_shower: {
    icon: Smile,
    accentColor: '#38bdf8', // Sky
    bgColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.28)',
  },
  graduation: {
    icon: GraduationCap,
    accentColor: '#a78bfa', // Purple
    bgColor: 'rgba(167, 139, 250, 0.12)',
    borderColor: 'rgba(167, 139, 250, 0.28)',
  },
  retirement: {
    icon: Compass,
    accentColor: '#fbbf24', // Amber
    bgColor: 'rgba(251, 191, 36, 0.12)',
    borderColor: 'rgba(251, 191, 36, 0.28)',
  },
  funeral: {
    icon: Feather,
    accentColor: '#94a3b8', // Muted slate
    bgColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
  business_event: {
    icon: Briefcase,
    accentColor: '#38bdf8', // Executive cyan
    bgColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.28)',
  },
  reception: {
    icon: Wine,
    accentColor: '#c084fc', // Royal violet
    bgColor: 'rgba(192, 132, 252, 0.12)',
    borderColor: 'rgba(192, 132, 252, 0.28)',
  },
  cultural: {
    icon: Landmark,
    accentColor: '#fb923c', // Terracotta orange
    bgColor: 'rgba(251, 146, 60, 0.12)',
    borderColor: 'rgba(251, 146, 60, 0.28)',
  },
  religious: {
    icon: Flame,
    accentColor: '#f59e0b', // Golden flame
    bgColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.28)',
  },
  other: {
    icon: Calendar,
    accentColor: '#94a3b8',
    bgColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: 'rgba(148, 163, 184, 0.22)',
  },
};

const SIZE_CONFIGS = {
  xs: { box: 24, icon: 12, radius: 7, stroke: 2 },
  sm: { box: 32, icon: 16, radius: 9, stroke: 1.9 },
  md: { box: 40, icon: 20, radius: 12, stroke: 1.8 },
  lg: { box: 48, icon: 24, radius: 14, stroke: 1.8 },
  hero: { box: 58, icon: 28, radius: 18, stroke: 1.8 },
};

export default function EventBadgeIcon({
  type,
  size = 'md',
  className = '',
  showGlow = false,
}: EventBadgeIconProps) {
  const config = EVENT_CONFIGS[type] || EVENT_CONFIGS.other;
  const sizeConfig = SIZE_CONFIGS[size];
  const IconComponent = config.icon;

  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center ${className}`}
      style={{
        width: sizeConfig.box,
        height: sizeConfig.box,
        borderRadius: sizeConfig.radius,
        backgroundColor: config.bgColor,
        color: config.accentColor,
      }}
      aria-hidden="true"
    >
      <IconComponent size={sizeConfig.icon} strokeWidth={sizeConfig.stroke} />
    </div>
  );
}
