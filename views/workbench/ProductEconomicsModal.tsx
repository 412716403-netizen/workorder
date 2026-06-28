import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ImageIcon, Loader2, RefreshCw, Search, X } from 'lucide-react';
import type { ProductEconomicsRow } from '../../services/api/dashboard';
import { useProductEconomics, useProductEconomicsDetail } from '../../hooks/useProductEconomics';
import type { ProductMaterialCostMode } from '../../types';
import {
  formatWorkbenchAmount,
  formatWorkbenchCount,
} from './widgets/WorkbenchKpiCard';

interface ProductEconomicsModalProps {
  open: boolean;
  onClose: () => void;
  showAmount: boolean;
  materialCostMode: ProductMaterialCostMode;
  title: string;
}

function AmountCell({ value, show }: { value: number; show: boolean }) {
  return (
    <span className="tabular-nums">{formatWorkbenchAmount(value, show)}</span>
  );
}

function QtyCell({ value }: { value: number }) {
  return <span className="tabular-nums">{formatWorkbenchCount(value)}</span>;
}

function ProductThumb({
  imageUrl,
  name,
  size = 'sm',
}: {
  imageUrl: string | null;
  name: string;
  size?: 'sm' | 'lg';
}) {
  const dim = size === 'lg' ? 'h-16 w-16' : 'h-10 w-10';
  const icon = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
  if (imageUrl) {
    return (
      <div className={`${dim} shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50`}>
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300`}
    >
      <ImageIcon className={icon} aria-hidden />
    </div>
  );
}

function MetricRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 py-2 last:border-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <div className="text-right">
        <div className="text-xs font-bold tabular-nums text-slate-800">{value}</div>
        {sub ? <div className="mt-0.5 text-[10px] text-slate-400">{sub}</div> : null}
      </div>
    </div>
  );
}

const ProductEconomicsModal: React.FC<ProductEconomicsModalProps> = ({
  open,
  onClose,
  showAmount,
  materialCostMode,
  title,
}) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, isFetching, refetch } = useProductEconomics(undefined, materialCostMode);
  const detailQuery = useProductEconomicsDetail(selectedId, materialCostMode);

  const filteredRows = useMemo(() => {
    const rows = (data?.rows ?? []).filter(r => r.hasProcessNodes);
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      r =>
        r.name.toLowerCase().includes(q)
        || r.sku.toLowerCase().includes(q)
        || r.productId.toLowerCase().includes(q),
    );
  }, [data?.rows, search]);

  const selectedRow = useMemo(
    () => filteredRows.find(r => r.productId === selectedId) ?? null,
    [filteredRows, selectedId],
  );

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedId(null);
    }
  }, [open]);

  if (!open) return null;

  const canProduction = data?.canProduction ?? false;
  const canPsi = data?.canPsi ?? false;
  const canFinance = data?.canFinance ?? false;
  const documentLinked = materialCostMode === 'document_linked';
  const detail = detailQuery.data;
  const display = detail ?? selectedRow;

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
        aria-labelledby="product-economics-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="product-economics-title" className="text-lg font-black text-slate-900">
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              累计口径 · 点击产品查看生产经营明细
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-300" />
          </div>
        ) : !data ? (
          <div className="py-16 text-center text-sm text-slate-400">
            无生产或进销存模块权限
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
            <div className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-slate-100 lg:w-[17.5rem] lg:border-b-0 lg:border-r">
              <div className="shrink-0 border-b border-slate-100 px-3 py-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
                  <input
                    className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs"
                    placeholder="搜索产品名称 / SKU"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  共 {filteredRows.length} 个有工序的产品
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {filteredRows.length === 0 ? (
                  <div className="px-4 py-12 text-center text-xs text-slate-400">暂无匹配的有工序产品</div>
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {filteredRows.map((row: ProductEconomicsRow) => {
                      const active = selectedId === row.productId;
                      return (
                        <li key={row.productId}>
                          <button
                            type="button"
                            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-violet-50/50 ${
                              active ? 'bg-violet-50' : ''
                            }`}
                            onClick={() => setSelectedId(row.productId)}
                          >
                            <ProductThumb imageUrl={row.imageUrl} name={row.name} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-bold text-slate-800">{row.name}</div>
                              <div className="truncate text-[10px] text-slate-400">
                                {row.sku || row.productId}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div
                                className={`text-[11px] font-bold tabular-nums ${
                                  row.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                }`}
                              >
                                {formatWorkbenchAmount(row.grossProfit, showAmount)}
                              </div>
                              <div className="text-[9px] text-slate-400">毛利</div>
                            </div>
                            <ChevronRight
                              className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-violet-400' : 'text-slate-300'}`}
                              aria-hidden
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {!selectedId || !display ? (
                <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-sm text-slate-400">
                  点击左侧产品查看生产经营明细
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  <div className="mb-5 flex items-start gap-4">
                    <ProductThumb
                      imageUrl={display.imageUrl}
                      name={display.name}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-black text-slate-900">{display.name}</h3>
                      <p className="mt-0.5 text-xs text-slate-400">{display.sku || display.productId}</p>
                      {detailQuery.isFetching && selectedId ? (
                        <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          同步工序明细…
                        </p>
                      ) : null}
                    </div>
                    <div
                      className={`shrink-0 rounded-xl border px-4 py-2.5 text-right ${
                        display.grossProfit >= 0
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-rose-200 bg-rose-50/60'
                      }`}
                    >
                      <div className="text-[10px] font-medium text-slate-500">毛利参考</div>
                      <div
                        className={`text-lg font-black tabular-nums ${
                          display.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatWorkbenchAmount(display.grossProfit, showAmount)}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {(canProduction || canPsi) && (
                      <section
                        className={`rounded-xl border border-slate-100 bg-slate-50/40 px-4 py-3 ${
                          !canProduction ? 'lg:col-span-2' : ''
                        }`}
                      >
                        <h4 className="mb-2 text-xs font-bold text-slate-700">数量（累计）</h4>
                        {canProduction && (
                          <>
                            <MetricRow
                              label="下单总量"
                              value={
                                detail ? (
                                  <QtyCell value={detail.totalOrderQty} />
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )
                              }
                            />
                            <MetricRow
                              label="生产入库数量"
                              value={
                                detail ? (
                                  <QtyCell value={detail.stockInQty} />
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )
                              }
                            />
                          </>
                        )}
                        {canPsi && (
                          <>
                            <MetricRow
                              label="销售数量"
                              value={<QtyCell value={display.salesQty} />}
                            />
                            <MetricRow
                              label="销售出库金额"
                              value={<AmountCell value={display.salesAmount} show={showAmount} />}
                            />
                            {documentLinked && canFinance && display.linkedReceiptAmount > 0 && (
                              <MetricRow
                                label="关联收款"
                                value={<AmountCell value={display.linkedReceiptAmount} show={showAmount} />}
                              />
                            )}
                            {documentLinked && (
                              <MetricRow
                                label="收入合计"
                                value={<AmountCell value={display.totalRevenue} show={showAmount} />}
                              />
                            )}
                          </>
                        )}
                      </section>
                    )}

                    {canProduction && (
                      <section className="rounded-xl border border-slate-100 bg-slate-50/40 px-4 py-3">
                        <h4 className="mb-2 text-xs font-bold text-slate-700">生产成本（累计）</h4>
                        {documentLinked ? (
                          <>
                            <MetricRow
                              label="关联采购入库"
                              value={<AmountCell value={display.linkedPurchaseCost} show={showAmount} />}
                            />
                            {canFinance && (
                              <MetricRow
                                label="关联付款"
                                value={<AmountCell value={display.linkedPaymentCost} show={showAmount} />}
                              />
                            )}
                          </>
                        ) : (
                          <>
                            <MetricRow
                              label="物料成本"
                              value={<AmountCell value={display.materialCost} show={showAmount} />}
                            />
                            <MetricRow
                              label="物料结余（损耗）"
                              value={<AmountCell value={display.materialSurplusLoss} show={showAmount} />}
                            />
                          </>
                        )}
                        <MetricRow
                          label="报工成本"
                          value={<AmountCell value={display.reportCost} show={showAmount} />}
                        />
                        <MetricRow
                          label="外协加工费"
                          value={<AmountCell value={display.outsourceFee} show={showAmount} />}
                        />
                        <MetricRow
                          label="返工费"
                          value={<AmountCell value={display.reworkFee} show={showAmount} />}
                        />
                        <MetricRow
                          label="报损"
                          value={<QtyCell value={display.scrapQty} />}
                          sub={<AmountCell value={display.scrapAmount} show={showAmount} />}
                        />
                        <MetricRow
                          label="总成本"
                          value={<AmountCell value={display.totalCost} show={showAmount} />}
                        />
                      </section>
                    )}
                  </div>

                  {canProduction && detail && detail.byNode.length > 0 && (
                    <section className="mt-4">
                      <h4 className="mb-2 text-xs font-bold text-slate-700">工序明细</h4>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {detail.byNode.map(node => (
                          <div
                            key={node.nodeId}
                            className="rounded-lg border border-slate-100 px-3 py-2.5 text-[11px]"
                          >
                            <div className="mb-2 font-bold text-slate-800">{node.nodeName}</div>
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="text-[10px] text-slate-400">
                                  <th className="pb-1 text-left font-medium" />
                                  <th className="pb-1 text-right font-medium">数量</th>
                                  <th className="pb-1 text-right font-medium">金额</th>
                                </tr>
                              </thead>
                              <tbody className="text-slate-600">
                                <tr>
                                  <td className="py-1 pr-2 text-slate-500">报工</td>
                                  <td className="py-1 text-right tabular-nums font-bold text-indigo-600">
                                    {formatWorkbenchCount(node.reportQty)}
                                  </td>
                                  <td className="py-1 text-right tabular-nums text-slate-700">
                                    {formatWorkbenchAmount(node.reportCost, showAmount)}
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-1 pr-2 text-slate-500">外协</td>
                                  <td className="py-1 text-right tabular-nums font-bold text-violet-600">
                                    {formatWorkbenchCount(node.outsourceQty)}
                                  </td>
                                  <td className="py-1 text-right tabular-nums text-slate-700">
                                    {formatWorkbenchAmount(node.outsourceFee, showAmount)}
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-1 pr-2 text-slate-500">返工</td>
                                  <td className="py-1 text-right tabular-nums font-bold text-amber-600">
                                    {formatWorkbenchCount(node.reworkQty)}
                                  </td>
                                  <td className="py-1 text-right tabular-nums text-slate-700">
                                    {formatWorkbenchAmount(node.reworkFee, showAmount)}
                                  </td>
                                </tr>
                                {node.hasNodeBom && (
                                  <tr className="border-t border-slate-100">
                                    <td className="pt-1.5 pr-2 text-slate-500">物料</td>
                                    <td className="pt-1.5 text-right tabular-nums font-bold text-emerald-600">
                                      {formatWorkbenchCount(node.materialQty)}
                                    </td>
                                    <td className="pt-1.5 text-right tabular-nums text-slate-700">
                                      {formatWorkbenchAmount(node.materialCost, showAmount)}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {documentLinked && (
                    <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-[11px] leading-relaxed text-amber-900/80">
                      单据关联口径下，关联采购入库与关联付款分别计入成本。给供应商付货款时请勿再关联产品，以免重复；关联付款适用于运费、外协等无法通过入库体现的费用。
                    </p>
                  )}

                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default ProductEconomicsModal;
