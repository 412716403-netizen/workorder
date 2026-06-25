import React from 'react';
import { Inbox, FlaskConical, BookOpen, ScanLine, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FeaturePluginIconKey } from '../../../types';

export const PLUGIN_ICON_MAP: Record<FeaturePluginIconKey, LucideIcon> = {
  Inbox,
  FlaskConical,
  BookOpen,
  ScanLine,
  Wallet,
};

/** 图标背景 + 浅色环，用于卡片 */
export const PLUGIN_ICON_THEME: Record<
  FeaturePluginIconKey,
  { bg: string; ring: string; soft: string }
> = {
  Inbox: { bg: 'bg-violet-500', ring: 'ring-violet-100', soft: 'bg-violet-50' },
  FlaskConical: { bg: 'bg-amber-500', ring: 'ring-amber-100', soft: 'bg-amber-50' },
  BookOpen: { bg: 'bg-sky-500', ring: 'ring-sky-100', soft: 'bg-sky-50' },
  ScanLine: { bg: 'bg-indigo-500', ring: 'ring-indigo-100', soft: 'bg-indigo-50' },
  Wallet: { bg: 'bg-emerald-500', ring: 'ring-emerald-100', soft: 'bg-emerald-50' },
};

interface PluginIconProps {
  icon: FeaturePluginIconKey;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASS = {
  sm: 'h-7 w-7 rounded-lg [&_svg]:h-3.5 [&_svg]:w-3.5',
  md: 'h-9 w-9 rounded-xl [&_svg]:h-4 [&_svg]:w-4',
  lg: 'h-11 w-11 rounded-xl [&_svg]:h-5 [&_svg]:w-5',
} as const;

export const PluginIcon: React.FC<PluginIconProps> = ({ icon, size = 'md', className = '' }) => {
  const Icon = PLUGIN_ICON_MAP[icon];
  const theme = PLUGIN_ICON_THEME[icon];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center text-white ring-2 ${theme.bg} ${theme.ring} ${SIZE_CLASS[size]} ${className}`}
    >
      <Icon />
    </span>
  );
};

export function formatPluginLaunchLabel(launchedAt: string): string {
  const [y, m] = launchedAt.split('-');
  return `${y}.${m}`;
}
