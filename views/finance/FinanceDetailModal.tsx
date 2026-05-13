import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Printer, Trash2, X } from 'lucide-react';
import * as api from '../../services/api';
import type {
  AppDictionaries,
  FinanceCategory,
  FinanceOpType,
  FinanceRecord,
  GlobalNodeTemplate,
  Product,
  ProductCategory,
  ProductionOpRecord,
  ProductionOrder,
  PsiRecord,
  Worker,
} from '../../types';
import type { PsiListPrintControllerHandle } from '../../components/psi/PsiListPrintPicker';
import { fmtDT } from '../../utils/formatTime';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { getFinanceRecordFromDetail, isPartnerReconRow, isSettlementReconRow, type DetailTarget } from './financeDetailTypes';

interface FinanceDetailModalProps {
  detailRecord: DetailTarget | null;
  onClose: () => void;
  fillFormFromRecord: (record: FinanceRecord) => void;
  setEditingRecordId: (id: string | null) => void;
  setShowModal: (open: boolean) => void;
  setDetailRecord: (target: DetailTarget | null) => void;
  onUpdateRecord?: (record: FinanceRecord) => void;
  onDeleteRecord?: (id: string) => void;
  canEdit: boolean;
  canDelete: boolean;
  confirm: (options: { message: string; danger?: boolean }) => Promise<boolean>;
  showListPrintButton: boolean;
  canView: boolean;
  financeListPrintRef: React.RefObject<PsiListPrintControllerHandle | null>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  orders: ProductionOrder[];
  productMap: Map<string, Product>;
  workerMap: Map<string, Worker>;
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  categories: ProductCategory[];
  financeCatMap: Map<string, FinanceCategory>;
  bizConfig: Record<FinanceOpType, { label: string; partnerLabel: string }>;
  current: { partnerLabel: string; label?: string };
  type: FinanceOpType;
}

function FinanceDetailModal({
  detailRecord,
  onClose,
  fillFormFromRecord,
  setEditingRecordId,
  setShowModal,
  setDetailRecord,
  onUpdateRecord,
  onDeleteRecord,
  canEdit,
  canDelete,
  confirm,
  showListPrintButton,
  canView,
  financeListPrintRef,
  onRefreshPrintTemplates,
  orders,
  productMap,
  workerMap,
  globalNodes,
  dictionaries,
  categories,
  financeCatMap,
  bizConfig,
  current,
  type: _type,
}: FinanceDetailModalProps) {
  const financeRec = detailRecord ? getFinanceRecordFromDetail(detailRecord) : null;
  /**
   * Phase 3.A：详情区按 docNumber/docNo 后端窄查 PSI / 生产明细，避免依赖 AppDataContext 全量。
   * 仅在对账详情且数据来源命中时才发起请求，结果缓存 30s。
   */
  const psiDocLookup = (() => {
    if (!detailRecord || !isPartnerReconRow(detailRecord) || detailRecord.source !== 'psi') return null;
    const docType = detailRecord.docType === '采购单' ? 'PURCHASE_BILL' : 'SALES_BILL';
    return { docNumber: detailRecord.docNo, type: docType };
  })();
  const psiDocQuery = useQuery({
    queryKey: ['finance-detail', 'psi', psiDocLookup?.type, psiDocLookup?.docNumber],
    queryFn: () =>
      api.psi.list({
        type: psiDocLookup!.type,
        docNumber: psiDocLookup!.docNumber,
        all: 'true',
      } as Record<string, string>),
    enabled: !!psiDocLookup,
    staleTime: 30_000,
  });
  // Phase 3.D follow-up：context 已删除 psiRecords/prodRecords，详情完全依赖按 docNo 的 query。
  const psiDocRecords = (psiDocQuery.data as unknown as PsiRecord[] | undefined) ?? [];

  const prodDocLookup = (() => {
    if (!detailRecord || !isPartnerReconRow(detailRecord) || detailRecord.source !== 'prod') return null;
    const rec = detailRecord.rec;
    return rec.docNo ? { docNo: rec.docNo } : null;
  })();
  const prodDocQuery = useQuery({
    queryKey: ['finance-detail', 'prod', prodDocLookup?.docNo],
    queryFn: () =>
      api.production.listPage({
        type: 'OUTSOURCE',
        status: '已收回',
        docNo: prodDocLookup!.docNo,
        pageSize: 200,
      }),
    enabled: !!prodDocLookup,
    staleTime: 30_000,
  });
  const prodDocRecords =
    (prodDocQuery.data?.data as ProductionOpRecord[] | undefined) ?? [];

  if (!detailRecord) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col">
        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <h2 className="text-lg font-bold text-slate-800">单据详情</h2>
          <div className="flex items-center gap-2">
            {financeRec && onUpdateRecord && canEdit && (
              <button
                type="button"
                onClick={() => {
                  fillFormFromRecord(financeRec);
                  setEditingRecordId(financeRec.id);
                  setDetailRecord(null);
                  setShowModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-sm font-bold transition-all"
              >
                <Pencil className="w-4 h-4" /> 编辑
              </button>
            )}
            {financeRec && onDeleteRecord && canDelete && (
              <button
                type="button"
                onClick={() => {
                  void confirm({ message: '确定删除该单据？', danger: true }).then((ok) => {
                    if (!ok) return;
                    onDeleteRecord(financeRec.id);
                    setDetailRecord(null);
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-sm font-bold transition-all"
              >
                <Trash2 className="w-4 h-4" /> 删除
              </button>
            )}
            {financeRec && showListPrintButton && canView && (
              <button
                type="button"
                onClick={() => {
                  void onRefreshPrintTemplates?.();
                  financeListPrintRef.current?.openPicker(financeRec.id);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 text-sm font-bold transition-all"
              >
                <Printer className="w-4 h-4" /> 打印
              </button>
            )}
            <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="p-8 overflow-y-auto flex-1 space-y-5">
          {isSettlementReconRow(detailRecord) && detailRecord.source === 'work_report' && (() => {
            const row = detailRecord;
            return (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据类型</span><p className="text-sm font-bold text-slate-800 mt-0.5">报工单</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">报工单号</span><p className="text-sm font-bold text-slate-800 mt-0.5">{row.reportNo}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</span><p className="text-sm font-bold text-slate-800 mt-0.5">{fmtDT(row.timestamp)}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">工人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{row.workerName || '-'}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">合计金额</span><p className="text-sm font-black text-slate-800 mt-0.5">¥ {row.amount.toLocaleString()}</p></div>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">明细（工单/产品、工序、数量、单价）</span>
                  <div className="mt-2 border border-slate-100 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 font-black text-slate-500">工单号</th>
                          <th className="px-4 py-2 font-black text-slate-500">产品</th>
                          <th className="px-4 py-2 font-black text-slate-500">工序</th>
                          <th className="px-4 py-2 font-black text-slate-500 text-right">数量</th>
                          <th className="px-4 py-2 font-black text-slate-500 text-right">单价</th>
                          <th className="px-4 py-2 font-black text-slate-500 text-right">金额</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {row.items.map((item, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 font-bold text-slate-800">{item.orderNumber}</td>
                            <td className="px-4 py-2 font-bold text-slate-800">{item.productName}</td>
                            <td className="px-4 py-2 font-bold text-slate-800">{item.milestoneName}</td>
                            <td className="px-4 py-2 text-right font-bold text-slate-800">{item.quantity}</td>
                            <td className="px-4 py-2 text-right font-bold text-slate-800">¥ {item.rate.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right font-black text-slate-800">¥ {item.amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
          {isSettlementReconRow(detailRecord) && detailRecord.source === 'rework_report' && (() => {
            const row = detailRecord;
            const rec = row.rec;
            const order = orders.find(o => o.id === rec.orderId);
            const product = productMap.get(rec.productId);
            const node = rec.nodeId ? globalNodes.find(n => n.id === rec.nodeId) : null;
            const unitPrice = rec.unitPrice != null && rec.unitPrice !== undefined ? Number(rec.unitPrice) : null;
            const amount = Number(rec.amount) || 0;
            return (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据类型</span><p className="text-sm font-bold text-slate-800 mt-0.5">返工报工</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据编号</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.docNo || rec.id}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</span><p className="text-sm font-bold text-slate-800 mt-0.5">{fmtDT(rec.timestamp)}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">工人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{workerMap.get(rec.workerId)?.name ?? rec.workerId ?? '-'}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">生产订单</span><p className="text-sm font-bold text-slate-800 mt-0.5">{order?.orderNumber ?? rec.orderId ?? '-'}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">产品</span><p className="text-sm font-bold text-slate-800 mt-0.5">{product?.name ?? rec.productId ?? '-'}</p></div>
                  {node && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">工序节点</span><p className="text-sm font-bold text-slate-800 mt-0.5">{node.name}</p></div>}
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">数量</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.quantity}</p></div>
                  {(unitPrice != null) && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单价</span><p className="text-sm font-bold text-slate-800 mt-0.5">¥ {unitPrice.toLocaleString()}</p></div>}
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">金额</span><p className="text-sm font-black text-slate-800 mt-0.5">¥ {amount.toLocaleString()}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">经办人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.operator}</p></div>
                </div>
              </div>
            );
          })()}
          {isPartnerReconRow(detailRecord) && detailRecord.source === 'psi' && (() => {
            const row = detailRecord;
            if (row.source !== 'psi') return null;
            const psiType = row.docType === '采购单' ? 'PURCHASE_BILL' : 'SALES_BILL';
            const lineRecords = (psiDocRecords as any[]).filter((r: any) => r.type === psiType && (r.docNumber === row.docNo || r.docNo === row.docNo));
            return (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据类型</span><p className="text-sm font-bold text-slate-800 mt-0.5">{row.docType}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据编号</span><p className="text-sm font-bold text-slate-800 mt-0.5">{row.docNo}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</span><p className="text-sm font-bold text-slate-800 mt-0.5">{fmtDT(row.timestamp)}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">合作单位</span><p className="text-sm font-bold text-slate-800 mt-0.5">{row.partner || '-'}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">合计金额</span><p className="text-sm font-black text-slate-800 mt-0.5">¥ {row.amount.toLocaleString()}</p></div>
                  {row.operator != null && row.operator !== '' && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">经办人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{row.operator}</p></div>}
                  {(row.note != null && row.note !== '') && <div className="col-span-2"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">备注</span><p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{row.note}</p></div>}
                </div>
                {lineRecords.length > 0 && (() => {
                  const byProduct = new Map<string, { product: Product | undefined; lines: any[] }>();
                  lineRecords.forEach((r: any) => {
                    const pid = r.productId || 'unknown';
                    if (!byProduct.has(pid)) byProduct.set(pid, { product: productMap.get(pid), lines: [] });
                    byProduct.get(pid)!.lines.push(r);
                  });
                  return (
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">明细（产品、数量、单价）</span>
                      <div className="mt-2 space-y-3">
                        {Array.from(byProduct.entries()).map(([pid, { product: prod, lines }]) => {
                          const productName = prod?.name ?? lines[0]?.productName ?? pid;
                          const category = prod ? categories.find(c => c.id === prod.categoryId) : null;
                          const hasColorSize = productHasColorSizeMatrix(prod, category ?? undefined);
                          const totalQty = lines.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
                          const unitPrice = Number(lines[0]?.purchasePrice ?? lines[0]?.salesPrice ?? 0);
                          const totalAmt = lines.reduce((s: number, r: any) => s + (Number(r.amount) || (Number(r.quantity) || 0) * Number(r.purchasePrice ?? r.salesPrice ?? 0)), 0);
                          return (
                            <div key={pid} className="border border-slate-100 rounded-xl overflow-hidden">
                              <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-800">{productName}</span>
                                <div className="flex items-center gap-4 text-sm">
                                  <span className="font-bold text-slate-600">数量: {totalQty.toLocaleString()}</span>
                                  <span className="font-bold text-slate-600">单价: ¥ {unitPrice.toLocaleString()}</span>
                                  <span className="font-black text-slate-800">金额: ¥ {totalAmt.toLocaleString()}</span>
                                </div>
                              </div>
                              {hasColorSize && (
                                <div className="px-4 py-2 space-y-1.5">
                                  {(() => {
                                    const colorGroups = new Map<string, { colorName: string; items: { sizeName: string; qty: number }[] }>();
                                    const colorOrder = prod!.colorIds || [];
                                    lines.forEach((r: any) => {
                                      if (!r.variantId) return;
                                      const v = prod!.variants.find(vx => vx.id === r.variantId);
                                      if (!v) return;
                                      const cid = v.colorId;
                                      if (!colorGroups.has(cid)) {
                                        const cName = dictionaries?.colors?.find(c => c.id === cid)?.name ?? cid;
                                        colorGroups.set(cid, { colorName: cName, items: [] });
                                      }
                                      const sName = dictionaries?.sizes?.find(s => s.id === v.sizeId)?.name ?? v.sizeId;
                                      colorGroups.get(cid)!.items.push({ sizeName: sName, qty: Number(r.quantity) || 0 });
                                    });
                                    const sortedEntries = Array.from(colorGroups.entries()).sort(([a], [b]) => {
                                      const ia = colorOrder.indexOf(a);
                                      const ib = colorOrder.indexOf(b);
                                      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
                                    });
                                    if (sortedEntries.length === 0) return null;
                                    return sortedEntries.map(([cid, { colorName, items }]) => {
                                      const color = dictionaries?.colors?.find(c => c.id === cid);
                                      return (
                                        <div key={cid} className="flex items-center gap-3 py-1">
                                          <div className="flex items-center gap-1.5 w-20 shrink-0">
                                            {color && <div className="w-3.5 h-3.5 rounded-full border border-slate-200" style={{ backgroundColor: color.value }} />}
                                            <span className="text-xs font-bold text-slate-700">{colorName}</span>
                                          </div>
                                          <div className="flex flex-wrap gap-3">
                                            {items.map((it, idx) => (
                                              <span key={idx} className="text-xs text-slate-600"><span className="font-bold">{it.sizeName}</span> <span className="text-indigo-600 font-black">{it.qty}</span></span>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    });
                                  })()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
          {isPartnerReconRow(detailRecord) && detailRecord.source === 'prod' && (() => {
            const row = detailRecord;
            if (row.source !== 'prod') return null;
            const rec = row.rec;
            const order = orders.find(o => o.id === rec.orderId);
            const product = productMap.get(rec.productId);
            const node = rec.nodeId ? globalNodes.find(n => n.id === rec.nodeId) : null;
            const unitPrice = rec.unitPrice != null && rec.unitPrice !== undefined ? Number(rec.unitPrice) : null;
            const amount = Number(rec.amount) || 0;
            const relatedRecs = (prodDocRecords as ProductionOpRecord[]).filter(r =>
              r.type === 'OUTSOURCE' && r.status === '已收回' && r.docNo === rec.docNo
            );
            const category = product ? categories.find(c => c.id === product.categoryId) : null;
            const hasColorSize = productHasColorSizeMatrix(product ?? undefined, category ?? undefined);
            const totalQty = relatedRecs.length > 1
              ? relatedRecs.reduce((s, r) => s + Number(r.quantity), 0)
              : Number(rec.quantity);
            return (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据类型</span><p className="text-sm font-bold text-slate-800 mt-0.5">外协收回</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据编号</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.docNo || rec.id}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</span><p className="text-sm font-bold text-slate-800 mt-0.5">{fmtDT(rec.timestamp)}</p></div>
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">合作单位</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.partner || '-'}</p></div>
                  {order && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">生产订单</span><p className="text-sm font-bold text-slate-800 mt-0.5">{order.orderNumber}</p></div>}
                  {node && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">工序节点</span><p className="text-sm font-bold text-slate-800 mt-0.5">{node.name}</p></div>}
                  {rec.status != null && rec.status !== '' && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">状态</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.status}</p></div>}
                  <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">经办人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.operator}</p></div>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">产品、数量、单价</span>
                  <div className="mt-2 border border-slate-100 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-800">{product?.name ?? rec.productId ?? '—'}</span>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="font-bold text-slate-600">数量: {totalQty}</span>
                        <span className="font-bold text-slate-600">单价: {unitPrice != null ? `¥ ${unitPrice.toLocaleString()}` : '—'}</span>
                        <span className="font-black text-slate-800">金额: ¥ {amount.toLocaleString()}</span>
                      </div>
                    </div>
                    {hasColorSize && (() => {
                      const colorGroups = new Map<string, { colorName: string; items: { sizeName: string; qty: number }[] }>();
                      const colorOrder = product!.colorIds || [];
                      const recsToShow = relatedRecs.length > 1 ? relatedRecs : [rec];
                      recsToShow.forEach(r => {
                        if (!r.variantId) return;
                        const v = product!.variants.find(vx => vx.id === r.variantId);
                        if (!v) return;
                        const cid = v.colorId;
                        if (!colorGroups.has(cid)) {
                          const cName = dictionaries?.colors?.find(c => c.id === cid)?.name ?? cid;
                          colorGroups.set(cid, { colorName: cName, items: [] });
                        }
                        const sName = dictionaries?.sizes?.find(s => s.id === v.sizeId)?.name ?? v.sizeId;
                        colorGroups.get(cid)!.items.push({ sizeName: sName, qty: Number(r.quantity) || 0 });
                      });
                      const sortedEntries = Array.from(colorGroups.entries()).sort(([a], [b]) => {
                        const ia = colorOrder.indexOf(a);
                        const ib = colorOrder.indexOf(b);
                        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
                      });
                      if (sortedEntries.length === 0) return null;
                      return (
                        <div className="px-4 py-2 space-y-1.5">
                          {sortedEntries.map(([cid, { colorName, items }]) => {
                            const color = dictionaries?.colors?.find(c => c.id === cid);
                            return (
                              <div key={cid} className="flex items-center gap-3 py-1">
                                <div className="flex items-center gap-1.5 w-20 shrink-0">
                                  {color && <div className="w-3.5 h-3.5 rounded-full border border-slate-200" style={{ backgroundColor: color.value }} />}
                                  <span className="text-xs font-bold text-slate-700">{colorName}</span>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                  {items.map((it, idx) => (
                                    <span key={idx} className="text-xs text-slate-600"><span className="font-bold">{it.sizeName}</span> <span className="text-indigo-600 font-black">{it.qty}</span></span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })()}
          {(financeRec != null) && (
            <>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据编号</span><p className="text-sm font-bold text-slate-800 mt-0.5">{financeRec.docNo || financeRec.id}</p></div>
                <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据类型</span><p className="text-sm font-bold text-slate-800 mt-0.5">{financeRec.categoryId ? (financeCatMap.get(financeRec.categoryId)?.name ?? bizConfig[financeRec.type]?.label) : (bizConfig[financeRec.type]?.label ?? financeRec.type)}</p></div>
                <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</span><p className="text-sm font-bold text-slate-800 mt-0.5">{fmtDT(financeRec.timestamp)}</p></div>
                <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{current.partnerLabel}</span><p className="text-sm font-bold text-slate-800 mt-0.5">{financeRec.partner || '-'}</p></div>
                {financeRec.workerId && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">关联工人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{workerMap.get(financeRec.workerId)?.name ?? financeRec.workerId}</p></div>}
                {financeRec.relatedId && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">关联工单</span><p className="text-sm font-bold text-slate-800 mt-0.5">{financeRec.relatedId}</p></div>}
                {financeRec.paymentAccount && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">收支账户</span><p className="text-sm font-bold text-slate-800 mt-0.5">{financeRec.paymentAccount}</p></div>}
                <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务金额</span><p className={`text-sm font-black mt-0.5 ${financeRec.type === 'RECEIPT' ? 'text-emerald-600' : 'text-slate-800'}`}>¥ {financeRec.amount.toLocaleString()}</p></div>
                <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">经办人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{financeRec.operator}</p></div>
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">产品、数量、单价</span>
                <div className="mt-2 border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 font-black text-slate-500">产品</th>
                        <th className="px-4 py-2 font-black text-slate-500 text-right">数量</th>
                        <th className="px-4 py-2 font-black text-slate-500 text-right">单价</th>
                        <th className="px-4 py-2 font-black text-slate-500 text-right">金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-4 py-2 font-bold text-slate-800">{financeRec.productId ? (productMap.get(financeRec.productId)?.name ?? financeRec.productId) : '—'}</td>
                        <td className="px-4 py-2 text-right font-bold text-slate-800">—</td>
                        <td className="px-4 py-2 text-right font-bold text-slate-800">—</td>
                        <td className="px-4 py-2 text-right font-black text-slate-800">¥ {financeRec.amount.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              {(financeRec.note != null && financeRec.note !== '') && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">备注</span><p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{financeRec.note}</p></div>}
              {financeRec.customData && Object.keys(financeRec.customData).length > 0 && (() => {
                const cat = financeRec.categoryId ? financeCatMap.get(financeRec.categoryId) ?? null : null;
                const fields = cat?.customFields ?? [];
                return fields.length > 0 ? <div className="space-y-3"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">自定义内容</span><div className="grid grid-cols-2 gap-x-8 gap-y-2">{fields.map(f => <div key={f.id}><span className="text-[10px] text-slate-400">{f.label}</span><p className="text-sm font-bold text-slate-800 mt-0.5">{String(financeRec.customData![f.id] ?? '-')}</p></div>)}</div></div> : null;
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(FinanceDetailModal);
