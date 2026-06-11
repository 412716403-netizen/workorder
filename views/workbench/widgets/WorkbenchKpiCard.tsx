import React from 'react';
import { RefreshCw } from 'lucide-react';
import {
  WORKBENCH_ORDER_STATS_PERIOD_LABELS,
  WORKBENCH_ORDER_STATS_PERIODS,
  type WorkbenchOrderStatsPeriod,
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

interface WorkbenchStatsHeaderExtraProps {
  period: WorkbenchOrderStatsPeriod;
  onPeriodChange: (period: WorkbenchOrderStatsPeriod) => void;
  theme: WorkbenchStatsTheme;
  isFetching: boolean;
  onRefresh: () => void;
}

export const WorkbenchStatsHeaderExtra: React.FC<WorkbenchStatsHeaderExtraProps> = ({
  period,
  onPeriodChange,
  theme,
  isFetching,
  onRefresh,
}) => (
  <div className="workbench-no-drag flex items-center gap-1.5">
    <div className={`inline-flex overflow-hidden rounded-lg border bg-white shadow-sm ${theme.periodBorder}`}>
      {WORKBENCH_ORDER_STATS_PERIODS.map(key => {
        const active = period === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPeriodChange(key)}
            className={`min-w-[3.25rem] px-3 py-1.5 text-xs font-bold transition ${
              active
                ? `${theme.periodActive} text-white shadow-sm`
                : `${theme.periodText} hover:bg-slate-50`
            }`}
          >
            {WORKBENCH_ORDER_STATS_PERIOD_LABELS[key]}
          </button>
        );
      })}
    </div>
    <WorkbenchStatsRefresh isFetching={isFetching} onRefresh={onRefresh} />
  </div>
);
