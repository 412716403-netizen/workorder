import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { X } from 'lucide-react';
import type { TheoreticalCostBreakdown } from '../../types';
import { formatWorkbenchAmount } from './widgets/WorkbenchKpiCard';

const CHART_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
];

interface TheoreticalCostBreakdownPopoverProps {
  open: boolean;
  onClose: () => void;
  productName: string;
  breakdown: TheoreticalCostBreakdown | null | undefined;
  showAmount: boolean;
}

function toAmount(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const TheoreticalCostBreakdownPopover: React.FC<TheoreticalCostBreakdownPopoverProps> = ({
  open,
  onClose,
  productName,
  breakdown,
  showAmount,
}) => {
  const rows = useMemo(
    () =>
      (breakdown?.items ?? [])
        .filter(item => item.amount > 0)
        .map(item => ({
          key: item.key,
          name: item.label,
          amount: item.amount,
          pct: item.pct ?? 0,
          kind: item.kind,
        })),
    [breakdown?.items],
  );

  const materialRows = rows.filter(r => r.kind === 'material');
  const processRows = rows.filter(r => r.kind === 'process');
  const total = breakdown?.total ?? 0;

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theoretical-cost-breakdown-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="theoretical-cost-breakdown-title" className="text-base font-black text-slate-900">
              成本组成 · {productName}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              单件理论成本 {formatWorkbenchAmount(total, showAmount)}/件
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">暂无成本组成数据</p>
          ) : (
            <>
              <div className="relative h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={rows}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={72}
                      innerRadius={44}
                      paddingAngle={rows.length > 1 ? 2 : 0}
                      stroke="none"
                    >
                      {rows.map((row, idx) => (
                        <Cell key={row.key} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | undefined, _name, item) => {
                        const pct = toAmount(item?.payload?.pct);
                        return [
                          `${formatWorkbenchAmount(toAmount(value), showAmount)} (${pct.toFixed(1)}%)`,
                          item?.payload?.name,
                        ];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
                  <span className="text-[10px] font-medium text-slate-400">单件合计</span>
                  <span className="mt-0.5 text-sm font-bold tabular-nums text-slate-700">
                    {formatWorkbenchAmount(total, showAmount)}
                  </span>
                </div>
              </div>

              {materialRows.length > 0 ? (
                <section className="mt-4">
                  <h3 className="mb-2 text-[11px] font-bold text-slate-500">BOM 物料</h3>
                  <ul className="divide-y divide-slate-50 rounded-lg border border-slate-100">
                    {materialRows.map((row, idx) => (
                      <li key={row.key} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                            aria-hidden
                          />
                          <span className="truncate text-xs font-medium text-slate-700">{row.name}</span>
                        </div>
                        <div className="shrink-0 text-right text-[11px] tabular-nums">
                          <span className="font-bold text-slate-800">
                            {formatWorkbenchAmount(row.amount, showAmount)}
                          </span>
                          <span className="ml-1.5 text-slate-400">{row.pct.toFixed(1)}%</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {processRows.length > 0 ? (
                <section className="mt-4">
                  <h3 className="mb-2 text-[11px] font-bold text-slate-500">标准路线工序</h3>
                  <ul className="divide-y divide-slate-50 rounded-lg border border-slate-100">
                    {processRows.map((row, idx) => (
                      <li key={row.key} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                CHART_COLORS[(materialRows.length + idx) % CHART_COLORS.length],
                            }}
                            aria-hidden
                          />
                          <span className="truncate text-xs font-medium text-slate-700">{row.name}</span>
                        </div>
                        <div className="shrink-0 text-right text-[11px] tabular-nums">
                          <span className="font-bold text-slate-800">
                            {formatWorkbenchAmount(row.amount, showAmount)}
                          </span>
                          <span className="ml-1.5 text-slate-400">{row.pct.toFixed(1)}%</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TheoreticalCostBreakdownPopover;
