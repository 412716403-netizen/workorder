import React, { useEffect, useMemo, useState } from 'react';
import { Check, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  ProdOpType,
  BOM,
  Warehouse,
  MaterialFormSettings,
  PsiRecord,
} from '../../types';
import { DEFAULT_MATERIAL_FORM_SETTINGS, categoryUsesBatchManagement } from '../../types';
import { clampBatchNoInput } from '../../hooks/useBatchPicker';
import { MaterialIssueBatchSelect } from '../../components/MaterialIssueBatchSelect';
import { toLocalCompactYmd } from '../../utils/localDateTime';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { buildMaterialStockCustomCollabPayload } from '../../utils/productionOpCollab/material';
import { writeWarehousePreference, WAREHOUSE_DOC_KIND } from '../../utils/warehouseDocPreference';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import { usePsiStockIndex } from '../../hooks/usePsiStockIndex';

export interface OutsourceMaterialReturnModalProps {
  productionLinkMode: 'order' | 'product';
  matReturnOrderId: string | null;
  matReturnProductId: string | null;
  matReturnPartnerOptions: string[];
  matReturnPartner: string;
  setMatReturnPartner: React.Dispatch<React.SetStateAction<string>>;
  matReturnWarehouseId: string;
  setMatReturnWarehouseId: React.Dispatch<React.SetStateAction<string>>;
  matReturnRemark: string;
  setMatReturnRemark: React.Dispatch<React.SetStateAction<string>>;
  matReturnQty: Record<string, number>;
  setMatReturnQty: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  orders: ProductionOrder[];
  products: Product[];
  boms: BOM[];
  records: ProductionOpRecord[];
  warehouses: Warehouse[];
  categories?: ProductCategory[];
  /** 外协生产退料自定义字段（生产物料 → 字段配置） */
  materialFormSettings?: MaterialFormSettings;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onClose: () => void;
  psiRecords?: PsiRecord[];
}

const OutsourceMaterialReturnModal: React.FC<OutsourceMaterialReturnModalProps> = ({
  productionLinkMode,
  matReturnOrderId,
  matReturnProductId,
  matReturnPartnerOptions,
  matReturnPartner,
  setMatReturnPartner,
  matReturnWarehouseId,
  setMatReturnWarehouseId,
  matReturnRemark,
  setMatReturnRemark,
  matReturnQty,
  setMatReturnQty,
  orders,
  products,
  boms,
  records,
  warehouses,
  categories = [],
  materialFormSettings = DEFAULT_MATERIAL_FORM_SETTINGS,
  onAddRecord,
  onAddRecordBatch,
  onClose,
  psiRecords = [],
}) => {
  const { currentUser, tenantCtx, userId } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const [matReturnCustomValues, setMatReturnCustomValues] = useState<Record<string, unknown>>({});
  const [lineBatchByProduct, setLineBatchByProduct] = useState<Record<string, string>>({});
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const { listAvailableBatches } = usePsiStockIndex(psiRecords, records);
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const materialProductCustomTags = (productId: string) => {
    const p = productById.get(productId);
    if (!p?.categoryId) return null;
    const entries = getProductCategoryCustomFieldEntries(p, categoryById.get(p.categoryId), { includeFile: false });
    if (entries.length === 0) return null;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {entries.map(({ field, display }) => (
          <span key={field.id} className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">
            {field.label}: {display}
          </span>
        ))}
      </div>
    );
  };
  const materialCustomFieldDefs = useMemo(
    () => (materialFormSettings.outsourceMaterialReturnCustomFields ?? []).filter(f => f.showInCreate),
    [materialFormSettings.outsourceMaterialReturnCustomFields],
  );
  useEffect(() => {
    setMatReturnCustomValues({});
    setLineBatchByProduct({});
  }, [matReturnOrderId, matReturnProductId]);

  useEffect(() => {
    setLineBatchByProduct({});
  }, [matReturnPartner, matReturnWarehouseId]);
  const isProductMode = productionLinkMode === 'product';
  const targetOrder = !isProductMode && matReturnOrderId ? orders.find(o => o.id === matReturnOrderId) : undefined;
  const targetProductId = isProductMode ? matReturnProductId : targetOrder?.productId;
  const targetProduct = targetProductId ? products.find(p => p.id === targetProductId) : undefined;
  const dispatchedByPartnerMat = new Map<string, number>();
  const returnedByPartnerMat = new Map<string, number>();
  const matInfoMap = new Map<string, { name: string; sku: string }>();
  const filterForCard = (r: ProductionOpRecord) => {
    if (isProductMode) {
      return r.sourceProductId === targetProductId || (!r.orderId && !r.sourceProductId && r.productId);
    }
    return r.orderId === matReturnOrderId;
  };
  records.filter(r => r.type === 'STOCK_OUT' && !!r.partner && r.partner === matReturnPartner && filterForCard(r)).forEach(r => {
    const key = r.productId;
    dispatchedByPartnerMat.set(key, (dispatchedByPartnerMat.get(key) ?? 0) + r.quantity);
    if (!matInfoMap.has(key)) {
      const mp = products.find(px => px.id === key);
      matInfoMap.set(key, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '' });
    }
  });
  if (isProductMode) {
    const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
    records.filter(r => r.type === 'STOCK_OUT' && !!r.partner && r.partner === matReturnPartner && r.orderId && relatedOrderIds.has(r.orderId)).forEach(r => {
      const key = r.productId;
      dispatchedByPartnerMat.set(key, (dispatchedByPartnerMat.get(key) ?? 0) + r.quantity);
      if (!matInfoMap.has(key)) {
        const mp = products.find(px => px.id === key);
        matInfoMap.set(key, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '' });
      }
    });
  }
  records.filter(r => r.type === 'STOCK_RETURN' && !!r.partner && r.partner === matReturnPartner && filterForCard(r)).forEach(r => {
    returnedByPartnerMat.set(r.productId, (returnedByPartnerMat.get(r.productId) ?? 0) + r.quantity);
  });
  if (isProductMode) {
    const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
    records.filter(r => r.type === 'STOCK_RETURN' && !!r.partner && r.partner === matReturnPartner && r.orderId && relatedOrderIds.has(r.orderId)).forEach(r => {
      returnedByPartnerMat.set(r.productId, (returnedByPartnerMat.get(r.productId) ?? 0) + r.quantity);
    });
  }
  const consumedByPartnerMat = new Map<string, number>();
  (() => {
    const receivedByNodeVar = new Map<string, number>();
    const outsourceFilter = (r: ProductionOpRecord) => {
      if (isProductMode) {
        return !r.orderId && r.productId === targetProductId;
      }
      return r.orderId === matReturnOrderId;
    };
    const accum = (r: ProductionOpRecord) => {
      const key = r.variantId ? `${r.nodeId!}|${r.variantId}` : r.nodeId!;
      receivedByNodeVar.set(key, (receivedByNodeVar.get(key) ?? 0) + r.quantity);
    };
    records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.partner === matReturnPartner && r.nodeId && outsourceFilter(r)).forEach(accum);
    if (isProductMode) {
      const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
      records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.partner === matReturnPartner && r.nodeId && r.orderId && relatedOrderIds.has(r.orderId)).forEach(accum);
    }
    const variants = targetProduct?.variants ?? [];
    receivedByNodeVar.forEach((recvQty, key) => {
      const sepIdx = key.indexOf('|');
      const nodeId = sepIdx >= 0 ? key.slice(0, sepIdx) : key;
      const variantId = sepIdx >= 0 ? key.slice(sepIdx + 1) : undefined;
      let matchedBoms: BOM[] = [];
      if (variantId) {
        const v = variants.find(vx => vx.id === variantId);
        if (v?.nodeBoms) {
          const bomId = (v.nodeBoms as Record<string, string>)[nodeId];
          if (bomId) {
            const b = boms.find(bx => bx.id === bomId);
            if (b) matchedBoms = [b];
          }
        }
        if (matchedBoms.length === 0) {
          matchedBoms = boms.filter(b => b.parentProductId === targetProductId && b.nodeId === nodeId && b.variantId === variantId);
        }
      }
      if (matchedBoms.length === 0) {
        matchedBoms = boms.filter(b => b.parentProductId === targetProductId && b.nodeId === nodeId && !b.variantId);
      }
      matchedBoms.forEach(bom => {
        bom.items.forEach(bi => {
          consumedByPartnerMat.set(bi.productId, (consumedByPartnerMat.get(bi.productId) ?? 0) + Number(bi.quantity) * recvQty);
        });
      });
    });
  })();
  const returnableMaterials = Array.from(dispatchedByPartnerMat.entries()).map(([pid, dispatched]) => ({
    productId: pid,
    name: matInfoMap.get(pid)?.name ?? '未知物料',
    sku: matInfoMap.get(pid)?.sku ?? '',
    dispatched,
    consumed: consumedByPartnerMat.get(pid) ?? 0,
    returned: returnedByPartnerMat.get(pid) ?? 0,
  })).filter(m => m.dispatched > 0);
  const showReturnBatchCol = returnableMaterials.some(m => {
    const p = products.find(x => x.id === m.productId);
    return categoryUsesBatchManagement(categoryById.get(p?.categoryId ?? ''));
  });
  const getNextWtDocNo = () => {
    const prefix = 'WT';
    const todayStr = toLocalCompactYmd(new Date());
    const pattern = `${prefix}${todayStr}-`;
    const existing = records.filter(r => r.type === 'STOCK_RETURN' && r.docNo && r.docNo.startsWith(pattern));
    const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    return `${pattern}${String(maxSeq + 1).padStart(4, '0')}`;
  };
  const handleMatReturnSubmit = async () => {
    if (!matReturnPartner) { toast.warning('请选择外协工厂'); return; }
    const toReturn = returnableMaterials.filter(m => (matReturnQty[m.productId] ?? 0) > 0);
    if (toReturn.length === 0) { toast.warning('请至少填写一项退回数量'); return; }
    const wh = matReturnWarehouseId || '';
    for (const m of toReturn) {
      const p = products.find(x => x.id === m.productId);
      const c = categoryById.get(p?.categoryId ?? '');
      if (!categoryUsesBatchManagement(c)) continue;
      if (!wh) {
        toast.error('启用批次管理时请先在上方选择退回仓库');
        return;
      }
      const bn = clampBatchNoInput(lineBatchByProduct[m.productId] ?? '');
      if (!bn) {
        toast.error(`请为物料「${m.name}」选择批次`);
        return;
      }
    }
    const overItems = toReturn.filter(m => (matReturnQty[m.productId] ?? 0) > Math.max(0, Math.round((m.dispatched - m.consumed - m.returned) * 100) / 100));
    if (overItems.length > 0) { toast.warning(`「${overItems[0].name}」退回数量超过可退回数量`); return; }
    const docNo = getNextWtDocNo();
    const timestamp = new Date().toLocaleString();
    const collabExtra = buildMaterialStockCustomCollabPayload(matReturnCustomValues, 'STOCK_RETURN', matReturnPartner);
    const batch: ProductionOpRecord[] = toReturn.map(m => {
      const p = products.find(x => x.id === m.productId);
      const c = categoryById.get(p?.categoryId ?? '');
      const bn = categoryUsesBatchManagement(c) ? clampBatchNoInput(lineBatchByProduct[m.productId] ?? '') : '';
      return {
        id: `wt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'STOCK_RETURN' as ProdOpType,
        orderId: isProductMode ? undefined : (matReturnOrderId ?? undefined),
        productId: m.productId,
        quantity: matReturnQty[m.productId],
        operator: docOperator,
        timestamp,
        status: '已完成',
        partner: matReturnPartner,
        warehouseId: matReturnWarehouseId || undefined,
        docNo,
        reason: matReturnRemark.trim() || undefined,
        sourceProductId: isProductMode ? (targetProductId ?? undefined) : undefined,
        ...(bn ? { batchNo: bn } : {}),
        ...collabExtra,
      };
    });
    if (onAddRecordBatch && batch.length > 1) { await onAddRecordBatch(batch); } else { for (const rec of batch) onAddRecord(rec); }
    if (matReturnWarehouseId) {
      writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.OUTSOURCE_MAT_RETURN, {
        warehouseId: matReturnWarehouseId,
      });
    }
    toast.success(`已退回 ${toReturn.length} 种物料，来自「${matReturnPartner}」`);
    onClose();
  };
  const headerLabel = isProductMode ? (targetProduct?.name ?? '—') : `${targetOrder?.orderNumber ?? '—'} — ${targetProduct?.name ?? '—'}`;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 bg-white">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 shrink-0">
                <Undo2 className="w-5 h-5" />
              </span>
              物料退回
            </h3>
            <p className="text-sm text-slate-500 mt-1 font-medium line-clamp-2">{headerLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 shrink-0" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">外协工厂</label>
              {matReturnPartnerOptions.length <= 1 ? (
                <div className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-white">{matReturnPartnerOptions[0] ?? '—'}</div>
              ) : (
                <select
                  value={matReturnPartner}
                  onChange={e => {
                    setMatReturnPartner(e.target.value);
                    setMatReturnQty({});
                    setMatReturnCustomValues({});
                    setLineBatchByProduct({});
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none bg-white"
                >
                  {matReturnPartnerOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
            </div>
            {warehouses.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">退回仓库</label>
                <select
                  value={matReturnWarehouseId}
                  onChange={e => {
                    setMatReturnWarehouseId(e.target.value);
                    setLineBatchByProduct({});
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none bg-white"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.code ? ` (${w.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">备注说明</label>
            <input
              type="text"
              value={matReturnRemark}
              onChange={e => setMatReturnRemark(e.target.value)}
              placeholder="选填"
              className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-rose-500 outline-none placeholder:text-slate-400"
            />
          </div>
          {materialCustomFieldDefs.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">外协生产退料自定义内容</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {materialCustomFieldDefs.map(cf => (
                  <div key={cf.id} className="space-y-1">
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
                    <PlanFormCustomFieldInput
                      cf={cf}
                      value={matReturnCustomValues[cf.id]}
                      onChange={v => setMatReturnCustomValues(prev => ({ ...prev, [cf.id]: v }))}
                      controlClassName="h-[52px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {returnableMaterials.length === 0 ? (
            <p className="py-8 text-center text-slate-400 text-sm">该工厂暂无外发记录</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full min-w-[960px] text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-100">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap">物料</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest text-right whitespace-nowrap">已外发</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest text-right whitespace-nowrap">交货耗材</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest text-right whitespace-nowrap">已退回</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest text-right whitespace-nowrap">可退回</th>
                  {showReturnBatchCol ? (
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap w-52">批次</th>
                  ) : null}
                  <th className="min-w-[11rem] w-48 pl-2 pr-4 py-3 text-[10px] font-black text-rose-500/90 tracking-widest text-right whitespace-nowrap border-l-2 border-rose-100 bg-rose-50/50">
                    本次退回数量
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {returnableMaterials.map(m => {
                  const consumedDisplay = Math.round(m.consumed * 100) / 100;
                  const remaining = Math.max(0, Math.round((m.dispatched - m.consumed - m.returned) * 100) / 100);
                  return (
                    <tr key={m.productId} className="hover:bg-slate-50/50">
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-bold text-slate-800">{m.name}</span>
                          {m.sku ? (
                            <span className="text-xs font-bold text-slate-400 tabular-nums" title="产品编号">
                              {m.sku}
                            </span>
                          ) : null}
                        </div>
                        {materialProductCustomTags(m.productId)}
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-bold text-indigo-600 tabular-nums">{m.dispatched}</td>
                      <td className="px-4 py-4 text-right text-sm font-bold text-rose-600 tabular-nums">{consumedDisplay}</td>
                      <td className="px-4 py-4 text-right text-sm font-bold text-amber-600 tabular-nums">{m.returned}</td>
                      <td className="px-4 py-4 text-right text-sm font-black text-emerald-600 tabular-nums">{remaining}</td>
                      {showReturnBatchCol ? (
                        <td className="px-4 py-4 align-middle">
                          <MaterialIssueBatchSelect
                            product={products.find(x => x.id === m.productId)}
                            categories={categories}
                            warehouseId={matReturnWarehouseId}
                            value={lineBatchByProduct[m.productId] ?? ''}
                            onChange={v => setLineBatchByProduct(prev => ({ ...prev, [m.productId]: v }))}
                            mode="issue"
                            hideLabel
                            className="min-w-[170px]"
                            mergeBatches={listAvailableBatches(m.productId, matReturnWarehouseId)}
                          />
                        </td>
                      ) : null}
                      <td className="min-w-[11rem] w-48 pl-2 pr-4 py-4 border-l-2 border-rose-100 bg-rose-50/35 align-middle">
                        <div className="flex justify-end">
                          <input
                            type="number"
                            min={0}
                            max={remaining}
                            step="any"
                            value={matReturnQty[m.productId] ?? ''}
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw === '') {
                                setMatReturnQty(prev => {
                                  const n = { ...prev };
                                  delete n[m.productId];
                                  return n;
                                });
                                return;
                              }
                              const n = Number(raw);
                              if (!Number.isFinite(n) || n < 0) return;
                              setMatReturnQty(prev => ({ ...prev, [m.productId]: Math.min(n, remaining) }));
                            }}
                            className="w-full min-w-[7.5rem] max-w-[10rem] min-h-[2.75rem] rounded-2xl border-2 border-rose-200 bg-white py-2.5 px-3 text-base font-black text-slate-900 text-right tabular-nums shadow-sm transition-[box-shadow,border-color] placeholder:text-rose-300/80 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200/90"
                            placeholder="输入数量"
                            aria-label={`${m.name} 本次退回数量，最多 ${remaining}`}
                          />
                        </div>
                        <p className="mt-1 text-right text-[9px] font-bold text-rose-400/90 tabular-nums">
                          最多 {remaining}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
        {returnableMaterials.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
              取消
            </button>
            <button
              type="button"
              onClick={handleMatReturnSubmit}
              disabled={!returnableMaterials.some(m => (matReturnQty[m.productId] ?? 0) > 0) || !matReturnPartner}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-colors"
            >
              <Check className="w-4 h-4" /> 确认退回
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(OutsourceMaterialReturnModal);
