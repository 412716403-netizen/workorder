import React from 'react';
import { RefreshCw } from 'lucide-react';
import {
  WORKBENCH_ORDER_STATS_PERIOD_LABELS,
  type WorkbenchPeriodTab,
} from '../../../types';

export function formatWorkbenchAmount(value: number, show: boolean): string {
  if (!show) return '***';
  return `¥${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatWorkbenchCount(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

interface WorkbenchKpiHeroProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'sky' | 'emerald' | 'indigo' | 'amber' | 'rose';
}

const HERO_TONES = {
  sky: 'border-sky-200/80 from-sky-50/80 to-white text-sky-700',
  emerald: 'border-emerald-200/80 from-emerald-50/80 to-white text-emerald-700',
  indigo: 'border-indigo-200/80 from-indigo-50/80 to-white text-indigo-700',
  amber: 'border-amber-200/80 from-amber-50/80 to-white text-amber-700',
  rose: 'border-rose-200/80 from-rose-50/80 to-white text-rose-700',
} as const;

export const WorkbenchKpiHero: React.FC<WorkbenchKpiHeroProps> = ({
  label,
  value,
  hint,
  tone = 'sky',
}) => (
  <div
    className={`rounded-xl border bg-gradient-to-b p-4 shadow-sm ${HERO_TONES[tone]}`}
  >
    <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
    <div className="mt-1 text-[2rem] font-black leading-none tracking-tight text-slate-900 tabular-nums">
      {value}
    </div>
    {hint && <div className="mt-2 text-[11px] font-medium text-slate-500">{hint}</div>}
  </div>
);

interface WorkbenchKpiMetricProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';
}

const METRIC_VALUE_TONES = {
  default: 'text-slate-900',
  emerald: 'text-emerald-600',
  amber: 'text-amber-600',
  rose: 'text-rose-600',
  sky: 'text-sky-600',
  violet: 'text-violet-600',
} as const;

export const WorkbenchKpiMetric: React.FC<WorkbenchKpiMetricProps> = ({
  label,
  value,
  sub,
  tone = 'default',
}) => (
  <div className="flex min-h-[88px] flex-col justify-between rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/50 p-3 shadow-sm">
    <div className="text-[11px] font-medium text-slate-400">{label}</div>
    <div>
      <div className={`text-xl font-black tabular-nums leading-tight ${METRIC_VALUE_TONES[tone]}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[10px] font-medium text-slate-400">{sub}</div>}
    </div>
  </div>
);

interface WorkbenchStatsRefreshProps {
  isFetching: boolean;
  onRefresh: () => void;
}

export const WorkbenchStatsRefresh: React.FC<WorkbenchStatsRefreshProps> = ({
  isFetching,
  onRefresh,
}) => (
  <button
    type="button"
    onClick={() => void onRefresh()}
    className="workbench-no-drag rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
    aria-label="刷新"
  >
    <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
  </button>
);

export const WORKBENCH_KPI_GRID_CLASS =
  'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,9.5rem),1fr))]';

export interface WorkbenchStatsTheme {
  periodBorder: string;
  periodActive: string;
  periodText: string;
}

const PERIOD_TABS: { key: WorkbenchPeriodTab; label: string }[] = [
  { key: 'today', label: WORKBENCH_ORDER_STATS_PERIOD_LABELS.today },
  { key: 'yesterday', label: WORKBENCH_ORDER_STATS_PERIOD_LABELS.yesterday },
  { key: 'month', label: WORKBENCH_ORDER_STATS_PERIOD_LABELS.month },
  { key: 'custom', label: '自定义' },
];

interface WorkbenchStatsHeaderExtraProps {
  periodTab: WorkbenchPeriodTab;
  onPeriodTabChange: (tab: WorkbenchPeriodTab) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  theme: WorkbenchStatsTheme;
  isFetching: boolean;
  onRefresh: () => void;
  /** 刷新按钮前的附加控件（如设置） */
  middleExtra?: React.ReactNode;
}

export const WorkbenchStatsHeaderExtra: React.FC<WorkbenchStatsHeaderExtraProps> = ({
  periodTab,
  onPeriodTabChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  theme,
  isFetching,
  onRefresh,
  middleExtra,
}) => (
  <div
    className="flex min-w-0 items-center justify-end gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    onClick={e => e.stopPropagation()}
    onMouseDown={e => e.stopPropagation()}
  >
    <div
      className={`inline-flex shrink-0 overflow-hidden rounded-lg border bg-white shadow-sm ${theme.periodBorder}`}
    >
      {PERIOD_TABS.map(({ key, label }) => {
        const active = periodTab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPeriodTabChange(key)}
            className={`whitespace-nowrap px-1.5 py-1.5 text-[10px] font-bold transition sm:min-w-[2.75rem] sm:px-2 sm:text-[11px] md:min-w-[3rem] md:px-2.5 md:text-xs ${
              active
                ? `${theme.periodActive} text-white shadow-sm`
                : `${theme.periodText} hover:bg-slate-50`
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
    {periodTab === 'custom' && (
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <input
          type="date"
          value={customStart}
          max={customEnd || undefined}
          onChange={e => onCustomStartChange(e.target.value)}
          aria-label="开始日期"
          className="w-[5.85rem] rounded border border-slate-200 bg-white px-0.5 py-0.5 text-[10px] text-slate-700 sm:w-[6.5rem] sm:px-1 sm:py-1 sm:text-[11px]"
        />
        <span className="shrink-0 text-[10px] text-slate-400">至</span>
        <input
          type="date"
          value={customEnd}
          min={customStart || undefined}
          onChange={e => onCustomEndChange(e.target.value)}
          aria-label="结束日期"
          className="w-[5.85rem] rounded border border-slate-200 bg-white px-0.5 py-0.5 text-[10px] text-slate-700 sm:w-[6.5rem] sm:px-1 sm:py-1 sm:text-[11px]"
        />
      </div>
    )}
    {middleExtra}
    <WorkbenchStatsRefresh isFetching={isFetching} onRefresh={onRefresh} />
  </div>
);
