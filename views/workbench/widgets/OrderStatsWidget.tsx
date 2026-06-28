import React, { useState } from 'react';
import { CheckCircle2, Loader2, Settings } from 'lucide-react';
import WidgetShell from '../WidgetShell';
import OrderStatsEditModal from './OrderStatsEditModal';
import { useDashboardOrderStats } from '../../../hooks/useDashboardOrderStats';
import { useDashboardOrderStatsSettings } from '../../../hooks/useDashboardOrderStatsSettings';
import { useWorkbenchPeriodFilter } from '../../../hooks/useWorkbenchPeriodFilter';
import type { DashboardOrderStatsRow } from '../../../types';
import { WorkbenchStatsHeaderExtra } from './WorkbenchKpiCard';

const ORDER_STATS_THEME = {
  periodBorder: 'border-emerald-200',
  periodActive: 'bg-emerald-500',
  periodText: 'text-emerald-700',
} as const;

const NODE_THEMES = [
  { tag: 'bg-sky-100 text-sky-700', bar: 'bg-sky-500' },
  { tag: 'bg-indigo-100 text-indigo-700', bar: 'bg-indigo-500' },
  { tag: 'bg-violet-100 text-violet-700', bar: 'bg-violet-500' },
  { tag: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' },
  { tag: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  { tag: 'bg-rose-100 text-rose-700', bar: 'bg-rose-500' },
  { tag: 'bg-cyan-100 text-cyan-700', bar: 'bg-cyan-500' },
  { tag: 'bg-orange-100 text-orange-700', bar: 'bg-orange-500' },
] as const;

const PROCESS_GRID_CLASS =
  'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,10.75rem),1fr))]';

interface OrderStatsWidgetProps {
  editing?: boolean;
  onRemove?: () => void;
}

function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function MetricRow({ label, value, valueClass = 'text-slate-800' }: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 text-[11px] leading-tight">
      <span className="whitespace-nowrap text-slate-400">{label}</span>
      <span className={`text-right font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

const ProcessCard: React.FC<{ row: DashboardOrderStatsRow; themeIndex: number }> = ({ row, themeIndex }) => {
  const theme = NODE_THEMES[themeIndex % NODE_THEMES.length];
  const done = row.progress >= 100;
  const idle = row.taskCount === 0 && row.reportedQty === 0 && row.remainingQty === 0;
  const progressPct = Math.min(100, Math.max(0, row.progress));

  return (
    <article
      className={`flex min-h-[158px] min-w-0 flex-col rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 p-3 shadow-sm transition hover:border-slate-300 hover:shadow ${
        idle ? 'opacity-80' : ''
      }`}
    >
      <span
        className={`mb-3 inline-flex max-w-full truncate rounded-lg px-2.5 py-1 text-xs font-bold ${theme.tag}`}
        title={row.name}
      >
        {row.name}
      </span>

      <div className="mb-3 flex flex-1 items-start justify-between gap-2">
        <div className="min-w-0 shrink-0">
          <div className="text-[2rem] font-black leading-none tracking-tight text-slate-900">
            {row.taskCount}
          </div>
          <div className="mt-1.5 text-[11px] font-medium text-slate-400">生产任务数</div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
          <MetricRow label="剩余可报" value={formatQty(row.remainingQty)} />
          <MetricRow label="良品数" value={formatQty(row.goodQty)} valueClass="text-emerald-600" />
          <MetricRow label="不良品数" value={formatQty(row.defectiveQty)} valueClass="text-amber-600" />
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-2.5">
        <span className="shrink-0 text-[10px] font-semibold text-slate-400">进度</span>
        <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ${theme.bar}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="flex w-10 shrink-0 items-center justify-end gap-0.5 text-[11px] font-bold tabular-nums text-slate-700">
          {progressPct}%
          {done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label="已完成" />}
        </span>
      </div>
    </article>
  );
};

const OrderStatsWidget: React.FC<OrderStatsWidgetProps> = ({ editing, onRemove }) => {
  const periodState = useWorkbenchPeriodFilter('today');
  const {
    periodTab,
    setPeriodTab,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    filter,
    customRangeInvalid,
    headerShellProps,
  } = periodState;
  const [editOpen, setEditOpen] = useState(false);
  const settings = useDashboardOrderStatsSettings();
  const { data, isLoading, isFetching, refetch } = useDashboardOrderStats(filter);

  const headerExtra = (
    <WorkbenchStatsHeaderExtra
      periodTab={periodTab}
      onPeriodTabChange={setPeriodTab}
      customStart={customStart}
      customEnd={customEnd}
      onCustomStartChange={setCustomStart}
      onCustomEndChange={setCustomEnd}
      theme={ORDER_STATS_THEME}
      isFetching={isFetching}
      onRefresh={() => void refetch()}
      middleExtra={
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="workbench-no-drag shrink-0 rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50"
          aria-label="设置"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      }
    />
  );

  return (
    <>
      <WidgetShell
        title="工单统计"
        editing={editing}
        onRemove={onRemove}
        headerExtra={headerExtra}
        {...headerShellProps}
      >
        <div className="flex h-full min-h-0 flex-col">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
            </div>
          ) : data === null ? (
            <p className="py-10 text-center text-sm text-slate-400">无生产模块权限</p>
          ) : !data.rows.length ? (
            <p className="py-10 text-center text-sm text-slate-400">暂无工序数据，请点击「设置」选择工序</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <div className={PROCESS_GRID_CLASS}>
                {data.rows.map((row, idx) => (
                  <ProcessCard key={row.templateId} row={row} themeIndex={idx} />
                ))}
              </div>
            </div>
          )}
          {customRangeInvalid && (
            <p className="pb-2 text-center text-[10px] text-rose-500">结束日期不能早于开始</p>
          )}
        </div>
      </WidgetShell>

      <OrderStatsEditModal
        open={editOpen}
        nodes={settings.nodes}
        selectedIds={settings.selectedIds}
        isSaving={settings.isSaving}
        onClose={() => setEditOpen(false)}
        onSave={ids => {
          settings.save(ids, {
            onSuccess: () => setEditOpen(false),
          });
        }}
      />
    </>
  );
};

export default OrderStatsWidget;
