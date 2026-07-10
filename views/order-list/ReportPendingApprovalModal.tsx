/**
 * 工单中心「报工审核」：仅展示待审报工，通过后进入报工流水。
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, ClipboardCheck, FileText, Loader2, X } from 'lucide-react';
import type {
  AppDictionaries,
  Product,
  ProductCategory,
  GlobalNodeTemplate,
  ProductionOpRecord,
  ProductionOrder,
} from '../../types';
import { ReportApprovalStatus } from '../../types';
import { fmtDT } from '../../utils/formatTime';
import {
  buildPendingApprovalDetailBatch,
  type PendingLineInput,
} from '../../utils/buildPendingApprovalDetailBatch';
import type { ReportDetailBatch } from '../../hooks/useReportBatchDetail';
import { orders as ordersApi } from '../../services/api';
import {
  dateInputToIsoEndExclusive,
  dateInputToIsoStart,
} from '../production-ops/sharedFlowListHelpers';
import FlowListProductCell from '../../components/flow/FlowListProductCell';
import FlowListTableShell from '../../components/flow/FlowListTableShell';
import ReportPendingApprovalDetailModal from './ReportPendingApprovalDetailModal';

type PendingRow = PendingLineInput;

type PendingBatch = {
  key: string;
  reportIds: string[];
  source: 'order' | 'pmp';
  timestamp: string;
  orderNumber: string;
  reportNo: string;
  productId: string;
  productName: string;
  sku: string;
  milestoneName: string;
  quantity: number;
  defectiveQuantity: number;
  operator: string;
  lineItems: PendingRow[];
};

function pendingBatchGroupKey(row: PendingRow): string {
  return row.reportBatchId || row.reportId;
}

function groupPendingReportRows(rows: PendingRow[]): PendingBatch[] {
  const groups = new Map<string, PendingRow[]>();
  rows.forEach((row) => {
    const key = pendingBatchGroupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  });
  return Array.from(groups.entries())
    .map(([key, items]) => {
      const first = items[0];
      const reportNo = items.map((r) => r.reportNo).find((n) => n && n !== '—') || first.reportNo;
      return {
        key,
        reportIds: items.map((r) => r.reportId),
        source: first.source,
        timestamp: first.timestamp,
        orderNumber: first.orderNumber,
        reportNo,
        productId: first.productId,
        productName: first.productName,
        sku: first.sku,
        milestoneName: first.milestoneName,
        quantity: items.reduce((s, r) => s + r.quantity, 0),
        defectiveQuantity: items.reduce((s, r) => s + r.defectiveQuantity, 0),
        operator: first.operator,
        lineItems: items,
      };
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

interface ReportPendingApprovalModalProps {
  open: boolean;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  prodRecords: ProductionOpRecord[];
  productionLinkMode: 'order' | 'product';
}

const ReportPendingApprovalModal: React.FC<ReportPendingApprovalModalProps> = ({
  open,
  onClose,
  orders,
  products,
  categories,
  globalNodes,
  dictionaries,
  prodRecords,
  productionLinkMode,
}) => {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actingKeys, setActingKeys] = useState<Set<string>>(new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [batchActing, setBatchActing] = useState(false);
  const [detailBatch, setDetailBatch] = useState<ReportDetailBatch | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDetailBatch(null);
    setSelectedKeys(new Set());
  }, [open]);

  React.useEffect(() => {
    setSelectedKeys(new Set());
  }, [dateFrom, dateTo]);

  const pendingQuery = useQuery({
    queryKey: ['flow.reportPendingApproval', dateFrom, dateTo, productionLinkMode],
    queryFn: () =>
      ordersApi.listReportHistory({
        startDate: dateInputToIsoStart(dateFrom),
        endDate: dateInputToIsoEndExclusive(dateTo),
        productionLinkMode: 'product',
        approvalStatus: ReportApprovalStatus.PENDING,
      }),
    enabled: open,
    staleTime: 10_000,
  });

  const rows = useMemo((): PendingBatch[] => {
    const nodeName = (templateId: string) =>
      globalNodes.find((n) => n.id === templateId)?.name || '工序';
    const mapRaw = (r: Record<string, unknown>, source: 'order' | 'pmp'): PendingRow => ({
      reportId: String(r.reportId || ''),
      reportBatchId: String(r.reportBatchId || r.reportId || ''),
      source,
      timestamp: String(r.timestamp || ''),
      orderNumber: source === 'order' ? String(r.orderNumber || '—') : '—',
      orderId: String(r.orderId || ''),
      milestoneId: String(r.milestoneId || ''),
      templateId: String(r.templateId || ''),
      progressId: source === 'pmp' ? String(r.progressId || '') : undefined,
      productId: String(r.productId || ''),
      productName: String(r.productName || ''),
      sku: String(r.sku || ''),
      milestoneName: String(r.milestoneName || nodeName(String(r.templateId || ''))),
      variantId: String(r.variantId || ''),
      quantity: Number(r.quantity) || 0,
      defectiveQuantity: Number(r.defectiveQuantity) || 0,
      operator: String(r.operator || ''),
      reportNo: String(r.reportNo || '—'),
      weight: r.weight != null ? Number(r.weight) : null,
      rate: r.rate != null ? Number(r.rate) : null,
      customData:
        r.customData && typeof r.customData === 'object' && !Array.isArray(r.customData)
          ? (r.customData as Record<string, unknown>)
          : undefined,
    });
    const orderRows = ((pendingQuery.data?.orderReports ?? []) as Array<Record<string, unknown>>).map(
      (r) => mapRaw(r, 'order'),
    );
    const pmpRows = ((pendingQuery.data?.productReports ?? []) as Array<Record<string, unknown>>).map(
      (r) => mapRaw(r, 'pmp'),
    );
    return groupPendingReportRows(
      orderRows.concat(pmpRows).filter((r) => r.reportId),
    );
  }, [pendingQuery.data, globalNodes]);

  const runAction = useCallback(
    async (batch: PendingBatch, action: 'approve' | 'reject') => {
      setActingKeys((prev) => new Set(prev).add(batch.key));
      try {
        for (const reportId of batch.reportIds) {
          if (action === 'approve') await ordersApi.approveReport(reportId);
          else await ordersApi.rejectReport(reportId);
        }
        if (detailBatch?.key === batch.key) setDetailBatch(null);
        setSelectedKeys((prev) => {
          if (!prev.has(batch.key)) return prev;
          const next = new Set(prev);
          next.delete(batch.key);
          return next;
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['flow.reportPendingApproval'] }),
          queryClient.invalidateQueries({ queryKey: ['flow.reportHistory'] }),
        ]);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : '审核失败');
      } finally {
        setActingKeys((prev) => {
          const next = new Set(prev);
          next.delete(batch.key);
          return next;
        });
      }
    },
    [queryClient, detailBatch?.key],
  );

  const runBatchAction = useCallback(
    async (action: 'approve' | 'reject') => {
      const targets = rows.filter((batch) => selectedKeys.has(batch.key) && !actingKeys.has(batch.key));
      if (!targets.length) return;
      const verb = action === 'approve' ? '通过' : '驳回';
      if (!window.confirm(`确定批量${verb} ${targets.length} 条待审报工？`)) return;
      setBatchActing(true);
      const processed = new Set<string>();
      try {
        for (const batch of targets) {
          setActingKeys((prev) => new Set(prev).add(batch.key));
          try {
            for (const reportId of batch.reportIds) {
              if (action === 'approve') await ordersApi.approveReport(reportId);
              else await ordersApi.rejectReport(reportId);
            }
            processed.add(batch.key);
            if (detailBatch?.key === batch.key) setDetailBatch(null);
          } finally {
            setActingKeys((prev) => {
              const next = new Set(prev);
              next.delete(batch.key);
              return next;
            });
          }
        }
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          processed.forEach((key) => next.delete(key));
          return next;
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['flow.reportPendingApproval'] }),
          queryClient.invalidateQueries({ queryKey: ['flow.reportHistory'] }),
        ]);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : `批量${verb}失败`);
      } finally {
        setBatchActing(false);
      }
    },
    [rows, selectedKeys, actingKeys, queryClient, detailBatch?.key],
  );

  const selectableRows = useMemo(
    () => rows.filter((batch) => !actingKeys.has(batch.key)),
    [rows, actingKeys],
  );
  const allSelectableSelected =
    selectableRows.length > 0 && selectableRows.every((batch) => selectedKeys.has(batch.key));
  const selectedCount = useMemo(
    () => rows.filter((batch) => selectedKeys.has(batch.key)).length,
    [rows, selectedKeys],
  );

  const toggleSelectAll = useCallback(() => {
    if (allSelectableSelected) {
      setSelectedKeys(new Set());
      return;
    }
    setSelectedKeys(new Set(selectableRows.map((batch) => batch.key)));
  }, [allSelectableSelected, selectableRows]);

  const toggleSelectOne = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const openDetail = useCallback(
    (batch: PendingBatch) => {
      const built = buildPendingApprovalDetailBatch(batch.key, batch.lineItems, orders, products);
      if (!built) {
        window.alert('无法打开详情');
        return;
      }
      setDetailBatch(built);
    },
    [orders, products],
  );

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[88] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
        <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[28px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-amber-600" /> 报工审核
            </h3>
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-50 text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-3 border-b border-slate-50 bg-slate-50/60 shrink-0">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">开始时间</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">结束时间</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
              {pendingQuery.isFetching && (
                <span className="text-xs text-amber-600 inline-flex items-center gap-1 mb-1">
                  <Loader2 className="w-3 h-3 animate-spin" />加载中
                </span>
              )}
              <p className="text-[11px] text-slate-400 mb-1.5">
                默认不限日期，展示全部待审；可选日期范围收窄。通过后出现在「报工流水」
              </p>
              {selectedCount > 0 && (
                <div className="flex items-center gap-2 ml-auto mb-1">
                  <span className="text-xs font-bold text-slate-500">已选 {selectedCount} 条</span>
                  <button
                    type="button"
                    disabled={batchActing}
                    onClick={() => void runBatchAction('approve')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" /> 批量通过
                  </button>
                  <button
                    type="button"
                    disabled={batchActing}
                    onClick={() => void runBatchAction('reject')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <Ban className="w-3.5 h-3.5" /> 批量驳回
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col p-4">
            {pendingQuery.isLoading ? (
              <p className="text-slate-500 text-center py-12">加载中…</p>
            ) : rows.length === 0 ? (
              <p className="text-slate-500 text-center py-12">暂无待审核报工</p>
            ) : (
              <FlowListTableShell className="flex-1 min-h-0">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allSelectableSelected}
                          disabled={!selectableRows.length || batchActing}
                          onChange={toggleSelectAll}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                          aria-label="全选"
                        />
                      </th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">时间</th>
                      {productionLinkMode !== 'product' && (
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>
                      )}
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">报工单号</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">良品</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">不良</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">操作人</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap min-w-[220px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((batch) => {
                      const product = products.find((p) => p.id === batch.productId);
                      const acting = actingKeys.has(batch.key);
                      const unitName =
                        (product?.unitId && dictionaries?.units?.find((u) => u.id === product.unitId)?.name) ||
                        '件';
                      return (
                        <tr key={batch.key} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(batch.key)}
                              disabled={acting || batchActing}
                              onChange={() => toggleSelectOne(batch.key)}
                              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                              aria-label={`选择 ${batch.reportNo}`}
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDT(batch.timestamp)}</td>
                          {productionLinkMode !== 'product' && (
                            <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{batch.orderNumber}</td>
                          )}
                          <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{batch.reportNo}</td>
                          <td className="px-4 py-3">
                            <FlowListProductCell
                              product={product}
                              name={batch.productName || product?.name}
                              sku={batch.sku || product?.sku}
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{batch.milestoneName}</td>
                          <td className="px-4 py-3 font-bold text-emerald-600 text-right whitespace-nowrap">
                            {batch.quantity} {unitName}
                          </td>
                          <td className="px-4 py-3 font-bold text-amber-600 text-right whitespace-nowrap">
                            {batch.defectiveQuantity > 0 ? batch.defectiveQuantity : '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{batch.operator || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 flex-nowrap justify-end">
                              <button
                                type="button"
                                onClick={() => openDetail(batch)}
                                className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 whitespace-nowrap"
                              >
                                <FileText className="w-3.5 h-3.5" /> 详情
                              </button>
                              <button
                                type="button"
                                disabled={acting}
                                onClick={() => void runAction(batch, 'approve')}
                                className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-[11px] font-black rounded-xl border border-emerald-100 text-emerald-700 bg-white hover:bg-emerald-50 disabled:opacity-50 whitespace-nowrap"
                              >
                                <Check className="w-3.5 h-3.5" /> 通过
                              </button>
                              <button
                                type="button"
                                disabled={acting}
                                onClick={() => void runAction(batch, 'reject')}
                                className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-[11px] font-black rounded-xl border border-rose-100 text-rose-600 bg-white hover:bg-rose-50 disabled:opacity-50 whitespace-nowrap"
                              >
                                <Ban className="w-3.5 h-3.5" /> 驳回
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </FlowListTableShell>
            )}
          </div>
        </div>
      </div>

      {detailBatch && dictionaries && (
        <ReportPendingApprovalDetailModal
          batch={detailBatch}
          onClose={() => setDetailBatch(null)}
          orders={orders}
          products={products}
          categories={categories}
          dictionaries={dictionaries}
          globalNodes={globalNodes}
          prodRecords={prodRecords}
        />
      )}
    </>
  );
};

export default React.memo(ReportPendingApprovalModal);
