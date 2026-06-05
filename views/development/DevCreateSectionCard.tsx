import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface DevCreateSectionCardProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  iconTone?: 'indigo' | 'violet' | 'emerald' | 'amber';
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
  className?: string;
}

const iconToneClass: Record<NonNullable<DevCreateSectionCardProps['iconTone']>, string> = {
  indigo: 'bg-indigo-50 text-indigo-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
};

const DevCreateSectionCard: React.FC<DevCreateSectionCardProps> = ({
  title,
  description,
  icon: Icon,
  iconTone = 'indigo',
  children,
  headerExtra,
  className,
}) => (
  <section
    className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden${className ? ` ${className}` : ''}`}
  >
    <div className="px-5 py-3.5 border-b border-slate-100 flex items-start justify-between gap-3 bg-white">
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconToneClass[iconTone]}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {description ? (
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{description}</p>
          ) : null}
        </div>
      </div>
      {headerExtra ? <div className="shrink-0">{headerExtra}</div> : null}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

export default DevCreateSectionCard;
