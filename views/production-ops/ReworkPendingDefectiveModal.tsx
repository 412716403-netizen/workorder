import React from 'react';
import { ClipboardList, ScrollText, X } from 'lucide-react';
import { Product, ProductMilestoneProgress, ProductionOrder } from '../../types';
import { ReworkPendingRow } from './types';

function reworkReportsMatchDocSearch(
  reports: { reportNo?: string; reportBatchId?: string; id: string }[] | undefined,
  kwLower: string
): boolean {
  if (!kwLower || !reports?.length) return false;
  return reports.some(
    r =>
      (r.reportNo && r.reportNo.toLowerCase().includes(kwLower)) ||
      (r.reportBatchId && String(r.reportBatchId).toLowerCase().includes(kwLower)) ||
      String(r.id).toLowerCase().includes(kwLower)
  );
}

export interface ReworkPendingDefectiveModalProps {
  productionLinkMode: 'order' | 'product';
  products: Product[];
  orders: ProductionOrder[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  reworkPendingRows: ReworkPendingRow[];
  reworkListSearchOrder: string;
  setReworkListSearchOrder: (v: string) => void;
  reworkListSearchProduct: string;
  setReworkListSearchProduct: (v: string) => void;
  reworkListSearchNodeId: string;
  setReworkListSearchNodeId: (v: string) => void;
  onClose: () => void;
  onAction: (row: ReworkPendingRow) => void;
  /** 有权限时展示，打开「处理不良品流水」弹窗 */
  onOpenDefectTreatmentFlow?: () => void;
}

const ReworkPendingDefectiveModal: React.FC<ReworkPendingDefectiveModalProps> = ({
  productionLinkMode,
  products,
  orders,
  productMilestoneProgresses,
  reworkPendingRows,
  reworkListSearchOrder,
  setReworkListSearchOrder,
  reworkListSearchProduct,
  setReworkListSearchProduct,
  reworkListSearchNodeId,
  setReworkListSearchNodeId,
  onClose,
  onAction,
  onOpenDefectTreatmentFlow,
}) => {
  const filteredReworkPendingRows = React.useMemo(() => {
    const orderKw = (reworkListSearchOrder || '').trim().toLowerCase();
    const productKw = (reworkListSearchProduct || '').trim().toLowerCase();
    return reworkPendingRows.filter(row => {
      if (orderKw) {
        const numOk = (row.orderNumber || '').toLowerCase().includes(orderKw);
        let docOk = false;
        if (row.scope === 'order') {
          const o = orders.find(x => x.id === row.orderId);
          const ms = o?.milestones?.find(m => m.templateId === row.nodeId);
          docOk = reworkReportsMatchDocSearch(ms?.reports, orderKw);
        } else {
          for (const p of productMilestoneProgresses) {
            if (p.productId !== row.productId || p.milestoneTemplateId !== row.nodeId) continue;
            if (reworkReportsMatchDocSearch(p.reports, orderKw)) {
              docOk = true;
              break;
            }
          }
          if (!docOk) {
            for (const o of orders) {
              if (o.productId !== row.productId) continue;
              const ms = o.milestones?.find(m => m.templateId === row.nodeId);
              if (reworkReportsMatchDocSearch(ms?.reports, orderKw)) {
                docOk = true;
                break;
              }
            }
          }
          if (!docOk) {
            docOk = orders.some(
              o => !o.parentOrderId && o.productId === row.productId && (o.orderNumber || '').toLowerCase().includes(orderKw)
            );
          }
        }
        if (!numOk && !docOk) return false;
      }
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (reworkListSearchNodeId && row.nodeId !== reworkListSearchNodeId) return false;
      return true;
    });
  }, [reworkPendingRows, reworkListSearchOrder, reworkListSearchProduct, reworkListSearchNodeId, products, orders, productMilestoneProgresses]);

  const displayReworkPendingRows = React.useMemo(() => {
    return [...filteredReworkPendingRows].sort((a, b) => {
      if (b.pendingQty !== a.pendingQty) return b.pendingQty - a.pendingQty;
      const aKey = a.scope === 'order' ? a.orderNumber : a.productName;
      const bKey = b.scope === 'order' ? b.orderNumber : b.productName;
      return (aKey || '').localeCompare(bKey || '', 'zh-CN');
    });
  }, [filteredReworkPendingRows]);

  const reworkPendingTotalPending = React.useMemo(
    () => displayReworkPendingRows.reduce((s, r) => s + r.pendingQty, 0),
    [displayReworkPendingRows]
  );

  const reworkPendingNodeOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const init: { value: string; label: string }[] = [];
    return reworkPendingRows.reduce((acc, row) => {
      if (row.nodeId && !seen.has(row.nodeId)) {
        seen.add(row.nodeId);
        acc.push({ value: row.nodeId, label: row.milestoneName });
      }
      return acc;
    }, init);
  }, [reworkPendingRows]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-600 shrink-0" /> 待处理不良</h3>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed hidden sm:block">
              {productionLinkMode === 'product'
                ? '合并产品工序与各工单报工不良；单号支持工单号或报工单号 BG…。列表按「待返工」从高到低排列。'
                : '扣除已返工/报损后的待处理数量；单号支持工单号或报工单号。按待返工数量优先显示。'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenDefectTreatmentFlow && (
              <button
                type="button"
                onClick={onOpenDefectTreatmentFlow}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-all whitespace-nowrap"
              >
                <ScrollText className="w-4 h-4 shrink-0" /> 处理不良品流水
              </button>
            )}
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 shrink-0" aria-label="关闭">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex flex-wrap items-end gap-3 sm:gap-4">
            <div className="flex flex-col gap-1 min-w-[140px] flex-1 sm:flex-initial sm:min-w-[180px]">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">单号</label>
              <input
                type="text"
                value={reworkListSearchOrder}
                onChange={e => setReworkListSearchOrder(e.target.value)}
                placeholder="工单号 / BG报工单号"
                className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[120px] flex-1 sm:flex-initial sm:min-w-[160px]">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">产品</label>
              <input
                type="text"
                value={reworkListSearchProduct}
                onChange={e => setReworkListSearchProduct(e.target.value)}
                placeholder="名称 / SKU"
                className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[100px]">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">工序</label>
              <select
                value={reworkListSearchNodeId}
                onChange={e => setReworkListSearchNodeId(e.target.value)}
                className="rounded-xl border border-slate-200 py-2 pl-3 pr-8 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white min-w-[120px]"
              >
                <option value="">全部工序</option>
                {reworkPendingNodeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <table className={`w-full text-left border-collapse ${productionLinkMode === 'product' ? 'min-w-[720px]' : 'min-w-[880px]'}`}>
            <thead>
              <tr className="bg-slate-100/95 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                {productionLinkMode !== 'product' && (
                  <th className="px-4 sm:px-5 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider w-[22%]">工单号</th>
                )}
                <th className={`px-4 sm:px-5 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider ${productionLinkMode === 'product' ? 'w-[30%]' : 'w-[24%]'}`}>产品</th>
                <th className="px-4 sm:px-5 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider w-[14%]">工序</th>
                <th className="px-3 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap w-[9%]">不良</th>
                <th className="px-3 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap w-[9%]">已返工</th>
                <th className="px-3 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap w-[9%]">已报损</th>
                <th className="px-3 py-3 text-right text-[10px] font-black amber-700 uppercase tracking-wider whitespace-nowrap w-[10%]">待返工</th>
                <th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider w-[11%]">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredReworkPendingRows.length === 0 ? (
                <tr>
                  <td colSpan={productionLinkMode === 'product' ? 7 : 8} className="px-6 py-16 text-center text-slate-400 text-sm">
                    {reworkPendingRows.length === 0
                      ? '暂无待处理不良。请先在工单中心报工中登记不良品数量。'
                      : '无匹配项，可尝试报工单号（BG…）或清空筛选。'}
                  </td>
                </tr>
              ) : (
                displayReworkPendingRows.map((row, idx) => {
                  const p = products.find(pr => pr.id === row.productId);
                  return (
                    <tr
                      key={row.scope === 'product' ? `p-${row.productId}|${row.nodeId}` : `${row.orderId}|${row.nodeId}`}
                      className={`border-b border-slate-100/80 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-indigo-50/40`}
                    >
                      {productionLinkMode !== 'product' && (
                        <td className="px-4 sm:px-5 py-3 align-top min-w-0">
                          {row.scope === 'product' && row.productOrderCount != null ? (
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 shrink-0">按产品</span>
                                <span className="text-sm font-bold text-slate-800 tabular-nums">{row.productOrderCount} 条工单</span>
                              </div>
                              {row.productOrdersLine ? (
                                <p
                                  className="text-[11px] text-slate-500 mt-1.5 leading-snug line-clamp-2 break-all"
                                  title={row.productOrdersTitle || row.productOrdersLine}
                                >
                                  {row.productOrdersLine}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-sm font-bold text-slate-800 tabular-nums" title={row.orderNumber}>{row.orderNumber}</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 sm:px-5 py-3 align-top min-w-0">
                        <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2" title={row.productName}>{row.productName}</p>
                        {p?.sku ? <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate" title={p.sku}>{p.sku}</p> : null}
                      </td>
                      <td className="px-4 sm:px-5 py-3 align-middle">
                        <span className="inline-flex items-center text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg max-w-full truncate" title={row.milestoneName}>
                          {row.milestoneName}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right align-middle tabular-nums text-sm font-bold text-slate-600">{row.defectiveTotal}</td>
                      <td className="px-3 py-3 text-right align-middle tabular-nums text-sm font-semibold text-slate-500">{row.reworkTotal}</td>
                      <td className="px-3 py-3 text-right align-middle tabular-nums text-sm font-semibold text-slate-500">{row.scrapTotal}</td>
                      <td className="px-3 py-3 text-right align-middle">
                        <span className="inline-block min-w-[2rem] tabular-nums text-sm font-black text-amber-800 bg-amber-100/90 px-2 py-1 rounded-lg">{row.pendingQty}</span>
                      </td>
                      <td className="px-4 py-3 text-right align-middle">
                        <button
                          type="button"
                          onClick={() => onAction(row)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                          处理
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {displayReworkPendingRows.length > 0 && (
          <div className="px-5 sm:px-6 py-3 border-t border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/30 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <span className="text-xs font-bold text-slate-600">
              当前列表 <span className="text-slate-900 tabular-nums">{displayReworkPendingRows.length}</span> 条
            </span>
            <span className="text-xs font-bold text-slate-600">
              待返工合计 <span className="text-base font-black text-amber-700 tabular-nums">{reworkPendingTotalPending}</span> 件
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ReworkPendingDefectiveModal);
