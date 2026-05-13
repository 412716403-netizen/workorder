import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowUpFromLine, Package, X } from 'lucide-react';
import {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  Warehouse,
  BOM,
  GlobalNodeTemplate,
  PsiRecord,
} from '../../types';
import { categoryUsesBatchManagement } from '../../types';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { clampBatchNoInput } from '../../hooks/useBatchPicker';
import { MaterialIssueBatchSelect } from '../../components/MaterialIssueBatchSelect';
import { useStockSnapshot } from '../../hooks/useStockSnapshot';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import {
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredSingleWarehouse,
  WAREHOUSE_DOC_KIND,
} from '../../utils/warehouseDocPreference';

export interface ReworkMaterialIssueModalProps {
  reworkMaterialOrderId: string;
  orders: ProductionOrder[];
  products: Product[];
  records: ProductionOpRecord[];
  warehouses: Warehouse[];
  boms: BOM[];
  globalNodes: GlobalNodeTemplate[];
  categories?: ProductCategory[];
  /** 与进销存快照合并批次下拉 */
  psiRecords?: PsiRecord[];
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onClose: () => void;
}

const ReworkMaterialIssueModal: React.FC<ReworkMaterialIssueModalProps> = ({
  reworkMaterialOrderId,
  orders,
  products,
  records,
  warehouses,
  boms,
  globalNodes,
  categories = [],
  psiRecords = [],
  onAddRecord,
  onAddRecordBatch,
  onClose,
}) => {
  const { currentUser, tenantCtx, userId } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const [reworkMaterialQty, setReworkMaterialQty] = useState<Record<string, number>>({});
  const [reworkMaterialLineBatch, setReworkMaterialLineBatch] = useState<Record<string, string>>({});
  const [reworkMaterialWarehouseId, setReworkMaterialWarehouseId] = useState<string>(() => warehouses[0]?.id ?? '');
  const reworkIssueOpenKeyRef = useRef<string | null>(null);
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const { listAvailableBatches } = useStockSnapshot({ enabled: !!reworkMaterialOrderId });

  useEffect(() => {
    if (!reworkMaterialOrderId) {
      reworkIssueOpenKeyRef.current = null;
      return;
    }
    if (reworkIssueOpenKeyRef.current === reworkMaterialOrderId) return;
    reworkIssueOpenKeyRef.current = reworkMaterialOrderId;
    const pref = readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_REWORK_MATERIAL_ISSUE);
    const wid = resolvePreferredSingleWarehouse(warehouses, pref, warehouses[0]?.id ?? '');
    setReworkMaterialWarehouseId(wid || '');
  }, [reworkMaterialOrderId, warehouses, tenantCtx?.tenantId, userId]);

  const order = orders.find(o => o.id === reworkMaterialOrderId);
  if (!order) return null;
  const product = products.find(p => p.id === order.productId);
  const orderQty = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const bomMaterials: { productId: string; name: string; sku: string; unitNeeded: number; nodeNames: string[] }[] = [];
  const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
  const addMat = (bom: BOM, qty: number, nodeName: string) => {
    bom.items.forEach(bi => {
      const mp = products.find(px => px.id === bi.productId);
      const add = Number(bi.quantity) * qty;
      const existing = matMap.get(bi.productId);
      if (existing) { existing.unitNeeded += add; if (nodeName) existing.nodeNames.add(nodeName); }
      else { const ns = new Set<string>(); if (nodeName) ns.add(nodeName); matMap.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: add, nodeNames: ns }); }
    });
  };
  const variants = product?.variants ?? [];
  if (variants.length > 0) {
    (order.items ?? []).forEach(item => {
      const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
      const lineQty = item.quantity;
      const seenBomIds = new Set<string>();
      if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
        Object.entries(v.nodeBoms).forEach(([nodeId, bomIdRaw]) => {
          const bomId = bomIdRaw as string;
          if (seenBomIds.has(bomId)) return; seenBomIds.add(bomId);
          const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
          const bom = boms.find(b => b.id === bomId);
          if (bom) addMat(bom, lineQty, nodeName);
        });
      } else {
        boms.filter(b => b.parentProductId === product!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
          if (seenBomIds.has(bom.id)) return; seenBomIds.add(bom.id);
          const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
          addMat(bom, lineQty, nodeName);
        });
      }
    });
  }
  if (matMap.size === 0 && product) {
    const seenBomIds = new Set<string>();
    boms.filter(b => b.parentProductId === product.id && b.nodeId).forEach(bom => {
      if (seenBomIds.has(bom.id)) return; seenBomIds.add(bom.id);
      const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
      const qty = bom.variantId ? ((order.items ?? []).find(i => i.variantId === bom.variantId)?.quantity ?? 0) : orderQty;
      addMat(bom, qty, nodeName);
    });
  }
  matMap.forEach((v, productId) => { bomMaterials.push({ productId, ...v, nodeNames: Array.from(v.nodeNames) }); });

  // docNo 不再前端自算：返工领料的 LL 单号统一由后端 createRecordBatch 在事务+advisory lock 下分配。
  const showBatchCol = bomMaterials.some(m => {
    const p = productMap.get(m.productId);
    return categoryUsesBatchManagement(categoryById.get(p?.categoryId ?? ''));
  });

  const handleConfirm = async () => {
    const toIssue = bomMaterials.filter(m => (reworkMaterialQty[m.productId] ?? 0) > 0);
    if (toIssue.length === 0) return;
    const warehouseId = reworkMaterialWarehouseId || (warehouses[0]?.id ?? '');
    const wh = warehouseId || '';
    if (wh) {
      for (const m of toIssue) {
        const p = productMap.get(m.productId);
        const c = categoryById.get(p?.categoryId ?? '');
        if (!categoryUsesBatchManagement(c)) continue;
        const bn = clampBatchNoInput(reworkMaterialLineBatch[m.productId] ?? '');
        if (!bn) {
          toast.error(`请为物料「${m.name}」选择批次`);
          return;
        }
        try {
          const opts = await api.psi.getStockBatches({ productId: m.productId, warehouseId: wh });
          const av = opts.find(o => o.batchNo === bn)?.stock ?? 0;
          if ((reworkMaterialQty[m.productId] ?? 0) > av) {
            toast.error(`物料「${m.name}」批次「${bn}」可用库存不足（${av}）`);
            return;
          }
        } catch {
          toast.error('校验批次库存失败，请稍后重试');
          return;
        }
      }
    }
    const batch: ProductionOpRecord[] = toIssue.map(m => {
      const p = productMap.get(m.productId);
      const c = categoryById.get(p?.categoryId ?? '');
      const bn = categoryUsesBatchManagement(c) ? clampBatchNoInput(reworkMaterialLineBatch[m.productId] ?? '') : '';
      return {
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'STOCK_OUT' as const,
        orderId: order.id,
        productId: m.productId,
        quantity: reworkMaterialQty[m.productId],
        operator: docOperator,
        timestamp: new Date().toLocaleString(),
        status: '已完成',
        warehouseId: warehouseId || undefined,
        // docNo 留空，由后端统一分配
        reason: '来自于返工',
        ...(bn ? { batchNo: bn } : {}),
      } as ProductionOpRecord;
    });
    if (onAddRecordBatch && batch.length > 1) {
      await onAddRecordBatch(batch);
    } else {
      for (const rec of batch) await onAddRecord(rec);
    }
    if (warehouseId) {
      writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_REWORK_MATERIAL_ISSUE, {
        warehouseId,
      });
    }
    setReworkMaterialQty({});
    setReworkMaterialLineBatch({});
    onClose();
  };

  const handleClose = () => {
    setReworkMaterialQty({});
    setReworkMaterialLineBatch({});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[76] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={handleClose} aria-hidden />
      <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Package className="w-5 h-5 text-indigo-600" /> 返工领料</h3>
            <p className="text-sm text-slate-500 mt-0.5">{order.orderNumber} — {product?.name ?? order.productName}</p>
          </div>
          <button type="button" onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {warehouses.length > 0 && (
            <div className="mb-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
              <select
                value={reworkMaterialWarehouseId}
                onChange={e => {
                  setReworkMaterialWarehouseId(e.target.value);
                  setReworkMaterialLineBatch({});
                }}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                {warehouses.map(w => (<option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>))}
              </select>
            </div>
          )}
          {bomMaterials.length === 0 ? (
            <p className="py-8 text-center text-slate-400 text-sm">该工单未配置 BOM 物料，无法进行领料</p>
          ) : (
            (() => {
              const reworkIssuedMap = new Map<string, number>();
              records.filter(r => r.type === 'STOCK_OUT' && r.orderId === order.id && r.reason === '来自于返工').forEach(r => { reworkIssuedMap.set(r.productId, (reworkIssuedMap.get(r.productId) ?? 0) + r.quantity); });
              return (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">领料累计</th>
                      {showBatchCol ? (
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-44">批次</th>
                      ) : null}
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次领料数量</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {bomMaterials.map(m => (
                      <tr key={m.productId} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-slate-800">{m.name}</p>
                            {m.nodeNames.map(nn => (<span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{nn}</span>))}
                          </div>
                          {m.sku && <p className="text-[10px] text-slate-400 mt-0.5">{m.sku}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{reworkIssuedMap.get(m.productId) ?? 0}</td>
                        {showBatchCol ? (
                          <td className="px-4 py-3 align-top">
                            <MaterialIssueBatchSelect
                              product={productMap.get(m.productId)}
                              categories={categories}
                              warehouseId={reworkMaterialWarehouseId}
                              value={reworkMaterialLineBatch[m.productId] ?? ''}
                              onChange={v => setReworkMaterialLineBatch(prev => ({ ...prev, [m.productId]: v }))}
                              mode="issue"
                              hideLabel
                              mergeBatches={listAvailableBatches(m.productId, reworkMaterialWarehouseId)}
                            />
                          </td>
                        ) : null}
                        <td className="px-4 py-3">
                          <input type="number" min={0} step={1} value={reworkMaterialQty[m.productId] ?? ''} onChange={e => setReworkMaterialQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))} className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()
          )}
        </div>
        {bomMaterials.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button type="button" onClick={handleClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
            <button type="button" onClick={() => void handleConfirm()} disabled={!bomMaterials.some(m => (reworkMaterialQty[m.productId] ?? 0) > 0)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              <ArrowUpFromLine className="w-4 h-4" /> 确认领料
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ReworkMaterialIssueModal);
