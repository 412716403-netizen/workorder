import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useFinanceData } from '../../contexts/AppDataContext';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useFinancePartnerWorkbenchStats } from '../../hooks/useFinancePartnerWorkbenchStats';
import { useFinanceWorkbenchStats } from '../../hooks/useFinanceWorkbenchStats';
import { useWorkbenchPeriodFilter } from '../../hooks/useWorkbenchPeriodFilter';
import type { FinanceCategory, WorkbenchPeriodFilter } from '../../types';
import {
  formatWorkbenchAmount,
  formatWorkbenchCount,
  WorkbenchKpiHero,
  WorkbenchStatsHeaderExtra,
} from './widgets/WorkbenchKpiCard';

interface FinanceStatsModalProps {
  open: boolean;
  onClose: () => void;
  showAmount: boolean;
  initialFilter: WorkbenchPeriodFilter;
}

const FINANCE_MODAL_THEME = {
  periodBorder: 'border-indigo-200',
  periodActive: 'bg-indigo-500',
  periodText: 'text-indigo-700',
} as const;

/** 日期 Tab 下调日期时防抖请求，避免每次改日都闪屏 */
const CUSTOM_DATE_FETCH_DEBOUNCE_MS = 400;

const FINANCE_TYPE_LABELS: Record<string, string> = {
  SETTLEMENT: '工资结算',
  RECONCILIATION: '财务对账',
};

const RECEIVABLE_PIE_COLORS = ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#0369a1', '#075985', '#bae6fd'];
const PAYABLE_PIE_COLORS = ['#d97706', '#f59e0b', '#fbbf24', '#fcd34d', '#b45309', '#92400e', '#fde68a'];

function toAmount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface AmountPieRow {
  key: string;
  name: string;
  amount: number;
  pct: number;
  sub?: string;
}

function buildAmountPieRows(
  items: Array<{ key: string; name: string; amount: number; sub?: string }>,
  totalAmount: number,
): AmountPieRow[] {
  return items
    .filter(item => item.amount > 0)
    .map(item => ({
      ...item,
      amount: toAmount(item.amount),
      pct: totalAmount > 0 ? (toAmount(item.amount) / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

const RECEIPT_PIE_COLORS = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#047857', '#065f46', '#a7f3d0'];
const PAYMENT_PIE_COLORS = ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#be123c', '#9f1239', '#fecdd3'];

function buildCategoryRows(
  byCategory: Array<{ categoryId: string | null; amount: number; count: number }> | undefined,
  categories: FinanceCategory[],
  totalAmount: number,
): AmountPieRow[] {
  if (!byCategory?.length) return [];
  const nameMap = new Map(categories.map(c => [c.id, c.name]));
  return buildAmountPieRows(
    byCategory.map(item => ({
      key: item.categoryId ?? '__none',
      name: item.categoryId ? (nameMap.get(item.categoryId) ?? '未知分类') : '未分类',
      amount: toAmount(item.amount),
      sub: `${item.count} 笔`,
    })),
    totalAmount,
  );
}

function buildPartnerPieRows(
  slices: Array<{ partner: string; amount: number }> | undefined,
  totalAmount: number,
): AmountPieRow[] {
  if (!slices?.length) return [];
  return buildAmountPieRows(
    slices.map(item => ({ key: item.partner, name: item.partner, amount: item.amount })),
    totalAmount,
  );
}

function FlowCategoryCard({
  summaryLabel,
  summaryAmount,
  summarySub,
  rows,
  showAmount,
  tone,
  colors,
  centerHint = '分类',
}: {
  summaryLabel: string;
  summaryAmount: number;
  summarySub?: string;
  rows: AmountPieRow[];
  showAmount: boolean;
  tone: 'emerald' | 'rose' | 'sky' | 'amber';
  colors: string[];
  centerHint?: string;
}) {
  const headTone = {
    emerald: 'border-emerald-100/80 bg-gradient-to-b from-emerald-50/80 to-white text-emerald-700',
    rose: 'border-rose-100/80 bg-gradient-to-b from-rose-50/80 to-white text-rose-700',
    sky: 'border-sky-100/80 bg-gradient-to-b from-sky-50/80 to-white text-sky-700',
    amber: 'border-amber-100/80 bg-gradient-to-b from-amber-50/80 to-white text-amber-700',
  }[tone];

  const valueTone = {
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
    sky: 'text-sky-600',
    amber: 'text-amber-600',
  }[tone];

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <div className={`shrink-0 border-b px-4 py-3 ${headTone}`}>
        <div className="text-[11px] font-medium opacity-80">{summaryLabel}</div>
        <div className={`mt-1 text-2xl font-black tabular-nums leading-none ${valueTone}`}>
          {formatWorkbenchAmount(summaryAmount, showAmount)}
        </div>
        {summarySub ? <div className="mt-1 text-[10px] font-medium text-slate-500">{summarySub}</div> : null}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-xs text-slate-400">暂无{centerHint}数据</p>
      ) : (
        <>
          <div className="relative h-[168px] w-full px-2 py-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="amount"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={68}
                  innerRadius={42}
                  paddingAngle={rows.length > 1 ? 2 : 0}
                  stroke="none"
                >
                  {rows.map((row, idx) => (
                    <Cell key={row.key} fill={colors[idx % colors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number | undefined) =>
                    formatWorkbenchAmount(toAmount(value), showAmount)
                  }
                  labelFormatter={label => String(label)}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
              <span className="text-[10px] font-medium text-slate-400">{centerHint}</span>
              <span className="mt-0.5 text-xs font-bold text-slate-600">{rows.length} 项</span>
            </div>
          </div>
          <ul className="max-h-[120px] shrink-0 divide-y divide-slate-50 overflow-y-auto border-t border-slate-100 px-4 py-1">
            {rows.map((row, idx) => (
              <li key={row.key} className="flex items-center justify-between gap-2 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colors[idx % colors.length] }}
                    aria-hidden
                  />
                  <span className="truncate text-xs font-medium text-slate-700">{row.name}</span>
                </div>
                <div className="shrink-0 text-right text-[11px] tabular-nums">
                  <span className="font-bold text-slate-800">
                    {formatWorkbenchAmount(row.amount, showAmount)}
                  </span>
                  <span className="ml-1.5 text-slate-400">
                    {row.pct.toFixed(1)}%
                    {row.sub ? ` · ${row.sub}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

const FinanceStatsModal: React.FC<FinanceStatsModalProps> = ({
  open,
  onClose,
  showAmount,
  initialFilter,
}) => {
  const { financeCategories } = useFinanceData();
  const periodState = useWorkbenchPeriodFilter('today');
  const {
    periodTab,
    setPeriodTab,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    filter,
    periodLabel,
    customRangeInvalid,
    queryEnabled,
  } = periodState;

  const syncedOnOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      syncedOnOpenRef.current = false;
      return;
    }
    if (syncedOnOpenRef.current) return;
    syncedOnOpenRef.current = true;
    if (initialFilter.mode === 'custom') {
      setPeriodTab('custom');
      setCustomStart(initialFilter.startDate);
      setCustomEnd(initialFilter.endDate);
    } else {
      setPeriodTab(initialFilter.period);
    }
  }, [open, initialFilter, setPeriodTab, setCustomStart, setCustomEnd]);

  const fetchFilter = useDebouncedValue(
    filter,
    filter.mode === 'custom' ? CUSTOM_DATE_FETCH_DEBOUNCE_MS : 0,
  );

  const fetchQueryEnabled =
    queryEnabled
    && (fetchFilter.mode !== 'custom'
      || (fetchFilter.startDate <= fetchFilter.endDate));

  const { data: dashboardData, isLoading: dashboardLoading, isFetching: dashboardFetching, refetch: refetchDashboard } =
    useDashboardStats('finance', fetchFilter);
  const fin = dashboardData?.finance;

  const {
    periodReceipt,
    periodPayment,
    otherTypes,
    isLoading: statsLoading,
    isFetching: statsFetching,
    refetch: refetchStats,
  } = useFinanceWorkbenchStats(fetchFilter);

  const {
    data: partnerStats,
    isLoading: partnerLoading,
    isFetching: partnerFetching,
    refetch: refetchPartnerStats,
  } = useFinancePartnerWorkbenchStats(fetchFilter);

  const isLoading = dashboardLoading || statsLoading || partnerLoading;
  const isFetching = dashboardFetching || statsFetching || partnerFetching;
  const showInitialLoading = fetchQueryEnabled && isLoading && !fin;

  const refetchAll = () => {
    void refetchDashboard();
    refetchStats();
    void refetchPartnerStats();
  };

  const partnerSummary = partnerStats?.summary;

  const receiptCategories = useMemo(
    () =>
      buildCategoryRows(
        periodReceipt?.byCategory,
        financeCategories.filter(c => c.kind === 'RECEIPT'),
        fin?.receiptAmount ?? 0,
      ),
    [periodReceipt?.byCategory, financeCategories, fin?.receiptAmount],
  );

  const paymentCategories = useMemo(
    () =>
      buildCategoryRows(
        periodPayment?.byCategory,
        financeCategories.filter(c => c.kind === 'PAYMENT'),
        fin?.paymentAmount ?? 0,
      ),
    [periodPayment?.byCategory, financeCategories, fin?.paymentAmount],
  );

  const periodReceivablePartners = useMemo(
    () => buildPartnerPieRows(partnerStats?.periodReceivableByPartner, partnerSummary?.periodReceivable ?? 0),
    [partnerStats?.periodReceivableByPartner, partnerSummary?.periodReceivable],
  );
  const periodPayablePartners = useMemo(
    () => buildPartnerPieRows(partnerStats?.periodPayableByPartner, partnerSummary?.periodPayable ?? 0),
    [partnerStats?.periodPayableByPartner, partnerSummary?.periodPayable],
  );
  const remainingReceivablePartners = useMemo(
    () => buildPartnerPieRows(partnerStats?.remainingReceivableByPartner, partnerSummary?.remainingReceivable ?? 0),
    [partnerStats?.remainingReceivableByPartner, partnerSummary?.remainingReceivable],
  );
  const remainingPayablePartners = useMemo(
    () => buildPartnerPieRows(partnerStats?.remainingPayableByPartner, partnerSummary?.remainingPayable ?? 0),
    [partnerStats?.remainingPayableByPartner, partnerSummary?.remainingPayable],
  );

  const cashFlowTone = useMemo(() => {
    if (!fin || !showAmount) return 'indigo' as const;
    if (fin.cashFlow > 0) return 'emerald' as const;
    if (fin.cashFlow < 0) return 'rose' as const;
    return 'indigo' as const;
  }, [fin, showAmount]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,820px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-stats-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="finance-stats-title" className="text-lg font-black text-slate-900">
                财务统计详情
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">{periodLabel} 周期统计</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
          <WorkbenchStatsHeaderExtra
            periodTab={periodTab}
            onPeriodTabChange={setPeriodTab}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            theme={FINANCE_MODAL_THEME}
            isFetching={isFetching}
            onRefresh={refetchAll}
          />
        </div>

        {!queryEnabled ? (
          <div className="py-16 text-center text-sm text-rose-500">结束日期不能早于开始日期</div>
        ) : !fin && !showInitialLoading ? (
          <div className="py-16 text-center text-sm text-slate-400">无财务模块权限</div>
        ) : showInitialLoading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-300" />
          </div>
        ) : fin ? (
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-6 py-5 transition-opacity duration-200 ${
              isFetching ? 'opacity-60' : 'opacity-100'
            }`}
          >
            <div className="flex flex-col gap-4">
              <WorkbenchKpiHero
                label={`${periodLabel}净现金流`}
                value={formatWorkbenchAmount(fin.cashFlow, showAmount)}
                hint={`收款 ${formatWorkbenchCount(fin.receiptCount)} 笔 · 付款 ${formatWorkbenchCount(fin.paymentCount)} 笔`}
                tone={cashFlowTone}
              />
              {customRangeInvalid && (
                <p className="text-center text-[10px] text-rose-500">结束日期不能早于开始</p>
              )}

              <div className="grid min-h-[280px] grid-cols-1 gap-4 lg:grid-cols-2">
                <FlowCategoryCard
                  summaryLabel={`${periodLabel}收款`}
                  summaryAmount={fin.receiptAmount}
                  summarySub={`${formatWorkbenchCount(fin.receiptCount)} 笔`}
                  rows={receiptCategories}
                  showAmount={showAmount}
                  tone="emerald"
                  colors={RECEIPT_PIE_COLORS}
                />
                <FlowCategoryCard
                  summaryLabel={`${periodLabel}支出`}
                  summaryAmount={fin.paymentAmount}
                  summarySub={`${formatWorkbenchCount(fin.paymentCount)} 笔`}
                  rows={paymentCategories}
                  showAmount={showAmount}
                  tone="rose"
                  colors={PAYMENT_PIE_COLORS}
                />
              </div>

              <div className="grid min-h-[280px] grid-cols-1 gap-4 lg:grid-cols-2">
                <FlowCategoryCard
                  summaryLabel={`${periodLabel}应收款`}
                  summaryAmount={partnerSummary?.periodReceivable ?? 0}
                  summarySub="本期累计增加"
                  rows={periodReceivablePartners}
                  showAmount={showAmount}
                  tone="sky"
                  colors={RECEIVABLE_PIE_COLORS}
                  centerHint="合作单位"
                />
                <FlowCategoryCard
                  summaryLabel={`${periodLabel}应付款`}
                  summaryAmount={partnerSummary?.periodPayable ?? 0}
                  summarySub="本期累计减少"
                  rows={periodPayablePartners}
                  showAmount={showAmount}
                  tone="amber"
                  colors={PAYABLE_PIE_COLORS}
                  centerHint="合作单位"
                />
                <FlowCategoryCard
                  summaryLabel="剩余应收款"
                  summaryAmount={partnerSummary?.remainingReceivable ?? 0}
                  summarySub="期末正余额合计"
                  rows={remainingReceivablePartners}
                  showAmount={showAmount}
                  tone="sky"
                  colors={RECEIVABLE_PIE_COLORS}
                  centerHint="合作单位"
                />
                <FlowCategoryCard
                  summaryLabel="剩余应付款"
                  summaryAmount={partnerSummary?.remainingPayable ?? 0}
                  summarySub="期末负余额合计"
                  rows={remainingPayablePartners}
                  showAmount={showAmount}
                  tone="amber"
                  colors={PAYABLE_PIE_COLORS}
                  centerHint="合作单位"
                />
              </div>

              {otherTypes.length > 0 && (
                <section className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3">
                  <h3 className="text-xs font-bold text-slate-600">其他单据（同期）</h3>
                  <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                    {otherTypes.map(item => (
                      <li key={item.type} className="text-xs text-slate-600">
                        <span className="font-medium">{FINANCE_TYPE_LABELS[item.type] ?? item.type}</span>
                        {' · '}
                        <span className="font-bold tabular-nums text-slate-800">
                          {formatWorkbenchAmount(item.amount, showAmount)}
                        </span>
                        <span className="text-slate-400">（{formatWorkbenchCount(item.count)} 笔）</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};

export default FinanceStatsModal;
