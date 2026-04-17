import React, { useEffect, useMemo, useState } from 'react';
import { Package, X, ArrowUpFromLine } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProdOpType,
  BOM,
  GlobalNodeTemplate,
  Warehouse,
  MaterialFormSettings,
} from '../../types';
import { DEFAULT_MATERIAL_FORM_SETTINGS } from '../../types';
import { toLocalCompactYmd } from '../../utils/localDateTime';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { formatMaterialQtyDisplay } from '../../utils/formatMaterialQtyDisplay';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { buildMaterialStockCustomCollabPayload } from '../../utils/productionOpCollab/material';

/**
 * 子工单等：外协记录上的 variantId 常为父成品规格，与本产品 BOM 规格对不上。
 * 若按「工序+规格」拆分量对不上，但工序上仍有外协合计，则在「单规格产品」或「无按规格拆分量」时回退为工序级数量。
 */
function computeOutsourceQtyForNodeVariant(
  nodeId: string,
  variantId: string,
  outsourceQtyByNode: Map<string, number>,
  outsourceQtyByNodeVar: Map<string, number>,
  bomsAtNode: BOM[],
  productVariantCount: number,
): number {
  const direct = outsourceQtyByNodeVar.get(`${nodeId}|${variantId}`) ?? 0;
  if (direct > 0) return direct;
  const nodeTotal = outsourceQtyByNode.get(nodeId) ?? 0;
  if (nodeTotal <= 0) return 0;
  const prefix = `${nodeId}|`;
  const reportedIds = [...outsourceQtyByNodeVar.keys()]
    .filter(k => k.startsWith(prefix))
    .map(k => k.slice(prefix.length));
  const siblingVariantIds = new Set(bomsAtNode.map(b => b.variantId).filter((id): id is string => Boolean(id)));
  const anyReportedHitsSiblingVariant = reportedIds.some(id => siblingVariantIds.has(id));
  if (anyReportedHitsSiblingVariant) return 0;
  if (productVariantCount <= 1 || reportedIds.length === 0) return nodeTotal;
  return 0;
}

function effectiveOutsourceQtyForBomFallback(
  bom: BOM,
  nodeId: string,
  outsourceQtyByNode: Map<string, number>,
  outsourceQtyByNodeVar: Map<string, number>,
  siblingBomsAtNode: BOM[],
  productVariantCount: number,
): number {
  if (!bom.variantId) return outsourceQtyByNode.get(nodeId) ?? 0;
  return computeOutsourceQtyForNodeVariant(
    nodeId,
    bom.variantId,
    outsourceQtyByNode,
    outsourceQtyByNodeVar,
    siblingBomsAtNode,
    productVariantCount,
  );
}

export interface OutsourceMaterialDispatchModalProps {
  productionLinkMode: 'order' | 'product';
  matDispatchOrderId: string | null;
  matDispatchProductId: string | null;
  matDispatchPartnerOptions: string[];
  matDispatchPartner: string;
  setMatDispatchPartner: React.Dispatch<React.SetStateAction<string>>;
  matDispatchWarehouseId: string;
  setMatDispatchWarehouseId: React.Dispatch<React.SetStateAction<string>>;
  matDispatchRemark: string;
  setMatDispatchRemark: React.Dispatch<React.SetStateAction<string>>;
  matDispatchQty: Record<string, number>;
  setMatDispatchQty: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  orders: ProductionOrder[];
  products: Product[];
  boms: BOM[];
  globalNodes: GlobalNodeTemplate[];
  records: ProductionOpRecord[];
  warehouses: Warehouse[];
  /** 外协领料发出自定义字段（生产物料 → 字段配置） */
  materialFormSettings?: MaterialFormSettings;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onClose: () => void;
}

const OutsourceMaterialDispatchModal: React.FC<OutsourceMaterialDispatchModalProps> = ({
  productionLinkMode,
  matDispatchOrderId,
  matDispatchProductId,
  matDispatchPartnerOptions,
  matDispatchPartner,
  setMatDispatchPartner,
  matDispatchWarehouseId,
  setMatDispatchWarehouseId,
  matDispatchRemark,
  setMatDispatchRemark,
  matDispatchQty,
  setMatDispatchQty,
  orders,
  products,
  boms,
  globalNodes,
  records,
  warehouses,
  materialFormSettings = DEFAULT_MATERIAL_FORM_SETTINGS,
  onAddRecord,
  onAddRecordBatch,
  onClose,
}) => {
  const { currentUser } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const [matDispatchCustomValues, setMatDispatchCustomValues] = useState<Record<string, unknown>>({});
  const materialCustomFieldDefs = useMemo(
    () => (materialFormSettings.outsourceMaterialIssueCustomFields ?? []).filter(f => f.showInCreate),
    [materialFormSettings.outsourceMaterialIssueCustomFields],
  );
  useEffect(() => {
    setMatDispatchCustomValues({});
  }, [matDispatchOrderId, matDispatchProductId]);
  const isProductMode = productionLinkMode === 'product';
  const targetOrder = !isProductMode && matDispatchOrderId ? orders.find(o => o.id === matDispatchOrderId) : undefined;
  const targetProductId = isProductMode ? matDispatchProductId : targetOrder?.productId;
  const targetProduct = targetProductId ? products.find(p => p.id === targetProductId) : undefined;
  const orderQty = targetOrder?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const bomMaterials: { productId: string; name: string; sku: string; unitNeeded: number; nodeNames: string[] }[] = [];
  const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
  const addBomItems = (bom: BOM, qty: number, nodeName: string) => {
    bom.items.forEach(bi => {
      const mp = products.find(px => px.id === bi.productId);
      const add = Number(bi.quantity) * qty;
      const existing = matMap.get(bi.productId);
      if (existing) {
        existing.unitNeeded += add;
        if (nodeName) existing.nodeNames.add(nodeName);
      } else {
        const ns = new Set<string>();
        if (nodeName) ns.add(nodeName);
        matMap.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: add, nodeNames: ns });
      }
    });
  };
  const outsourceQtyByNode = new Map<string, number>();
  const outsourceQtyByNodeVar = new Map<string, number>();
  {
    const relOrderIds = isProductMode
      ? new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id))
      : undefined;
    records.forEach(r => {
      if (r.type !== 'OUTSOURCE' || !r.nodeId || r.sourceReworkId) return;
      if (r.status !== '加工中') return;
      const match = isProductMode
        ? ((r.productId === targetProductId && !r.orderId) || (r.orderId && relOrderIds!.has(r.orderId)))
        : (r.orderId === targetOrder?.id);
      if (!match) return;
      outsourceQtyByNode.set(r.nodeId, (outsourceQtyByNode.get(r.nodeId) ?? 0) + r.quantity);
      if (r.variantId) {
        const vk = `${r.nodeId}|${r.variantId}`;
        outsourceQtyByNodeVar.set(vk, (outsourceQtyByNodeVar.get(vk) ?? 0) + r.quantity);
      }
    });
  }
  if (targetProduct) {
    const variants = targetProduct.variants ?? [];
    const productVariantCount = variants.length;
    const bomsForProduct = boms.filter(b => b.parentProductId === targetProduct.id);
    if (variants.length > 0) {
      for (const v of variants) {
        const seenBomIds = new Set<string>();
        if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
          (Object.entries(v.nodeBoms) as [string, string][]).forEach(([nodeId, bomId]) => {
            if (seenBomIds.has(bomId)) return;
            seenBomIds.add(bomId);
            const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
            const bom = boms.find(b => b.id === bomId);
            const bomsAtNode = bomsForProduct.filter(b => b.nodeId === nodeId);
            const qty = computeOutsourceQtyForNodeVariant(
              nodeId,
              v.id,
              outsourceQtyByNode,
              outsourceQtyByNodeVar,
              bomsAtNode,
              productVariantCount,
            );
            if (bom && qty > 0) addBomItems(bom, qty, nodeName);
          });
        } else {
          boms.filter(b => b.parentProductId === targetProduct.id && b.variantId === v.id && b.nodeId).forEach(bom => {
            if (seenBomIds.has(bom.id)) return;
            seenBomIds.add(bom.id);
            const nodeId = bom.nodeId!;
            const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
            const bomsAtNode = bomsForProduct.filter(b => b.nodeId === nodeId);
            const qty = computeOutsourceQtyForNodeVariant(
              nodeId,
              v.id,
              outsourceQtyByNode,
              outsourceQtyByNodeVar,
              bomsAtNode,
              productVariantCount,
            );
            if (qty > 0) addBomItems(bom, qty, nodeName);
          });
        }
      }
    }
    if (matMap.size === 0) {
      const fallbackBoms = boms.filter(b => b.parentProductId === targetProduct.id && b.nodeId);
      fallbackBoms.forEach(bom => {
        const nodeId = bom.nodeId!;
        const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
        const siblingAtNode = fallbackBoms.filter(b => b.nodeId === nodeId);
        const qty = effectiveOutsourceQtyForBomFallback(
          bom,
          nodeId,
          outsourceQtyByNode,
          outsourceQtyByNodeVar,
          siblingAtNode,
          productVariantCount,
        );
        if (qty > 0) addBomItems(bom, qty, nodeName);
      });
    }
  }
  matMap.forEach((v, pid) => {
    bomMaterials.push({ productId: pid, ...v, nodeNames: Array.from(v.nodeNames) });
  });
  const issuedMap = new Map<string, number>();
  if (isProductMode) {
    records.filter(r => r.type === 'STOCK_OUT' && r.partner && r.productId && (r.sourceProductId === targetProductId || (!r.orderId && !r.sourceProductId && r.productId))).forEach(r => {
      issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
    });
    const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
    records.filter(r => r.type === 'STOCK_OUT' && r.partner && r.orderId && relatedOrderIds.has(r.orderId)).forEach(r => {
      issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
    });
  } else if (targetOrder) {
    records.filter(r => r.type === 'STOCK_OUT' && r.partner && r.orderId === targetOrder.id && r.reason !== '来自于返工').forEach(r => {
      issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
    });
  }
  const getNextWfDocNo = () => {
    const prefix = 'WF';
    const todayStr = toLocalCompactYmd(new Date());
    const pattern = `${prefix}${todayStr}-`;
    const existing = records.filter(r => r.type === 'STOCK_OUT' && r.docNo && r.docNo.startsWith(pattern));
    const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    return `${pattern}${String(maxSeq + 1).padStart(4, '0')}`;
  };
  const handleMatDispatchSubmit = async () => {
    if (!matDispatchPartner) {
      toast.warning('请选择外协工厂');
      return;
    }
    const toIssue = bomMaterials.filter(m => (matDispatchQty[m.productId] ?? 0) > 0);
    if (toIssue.length === 0) {
      toast.warning('请至少填写一项发出数量');
      return;
    }
    const docNo = getNextWfDocNo();
    const timestamp = new Date().toLocaleString();
    const collabExtra = buildMaterialStockCustomCollabPayload(matDispatchCustomValues, 'STOCK_OUT', matDispatchPartner);
    const batch: ProductionOpRecord[] = toIssue.map(m => ({
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'STOCK_OUT' as ProdOpType,
      orderId: isProductMode ? undefined : (matDispatchOrderId ?? undefined),
      productId: m.productId,
      quantity: matDispatchQty[m.productId],
      operator: docOperator,
      timestamp,
      status: '已完成',
      partner: matDispatchPartner,
      warehouseId: matDispatchWarehouseId || undefined,
      docNo,
      reason: matDispatchRemark.trim() || undefined,
      sourceProductId: isProductMode ? (targetProductId ?? undefined) : undefined,
      ...collabExtra,
    }));
    if (onAddRecordBatch && batch.length > 1) {
      await onAddRecordBatch(batch);
    } else {
      for (const rec of batch) onAddRecord(rec);
    }
    toast.success(`已外发 ${toIssue.length} 种物料至「${matDispatchPartner}」`);
    onClose();
  };
  const headerLabel = isProductMode
    ? (targetProduct?.name ?? '—')
    : `${targetOrder?.orderNumber ?? '—'} — ${targetProduct?.name ?? '—'}`;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" /> 物料外发
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">{headerLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">外协工厂</label>
              {matDispatchPartnerOptions.length <= 1 ? (
                <div className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-slate-50">{matDispatchPartnerOptions[0] ?? '—'}</div>
              ) : (
                <select
                  value={matDispatchPartner}
                  onChange={e => {
                    setMatDispatchPartner(e.target.value);
                    setMatDispatchCustomValues({});
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {matDispatchPartnerOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
            </div>
            {warehouses.length > 0 && (
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
                <select
                  value={matDispatchWarehouseId}
                  onChange={e => setMatDispatchWarehouseId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">备注说明</label>
            <input
              type="text"
              value={matDispatchRemark}
              onChange={e => setMatDispatchRemark(e.target.value)}
              placeholder="选填"
              className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400"
            />
          </div>
          {materialCustomFieldDefs.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">外协领料发出自定义内容</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {materialCustomFieldDefs.map(cf => (
                  <div key={cf.id} className="space-y-1">
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
                    <PlanFormCustomFieldInput
                      cf={cf}
                      value={matDispatchCustomValues[cf.id]}
                      onChange={v => setMatDispatchCustomValues(prev => ({ ...prev, [cf.id]: v }))}
                      controlClassName="h-[52px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {bomMaterials.length === 0 ? (
            <p className="py-8 text-center text-slate-400 text-sm">该{isProductMode ? '产品' : '工单'}未配置 BOM 物料，无法进行物料外发</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">理论需量</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-36">已发进度</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次外发数量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bomMaterials.map(m => {
                  const issued = issuedMap.get(m.productId) ?? 0;
                  return (
                    <tr key={m.productId} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-800">{m.name}</p>
                          {m.nodeNames.map(nn => (
                            <span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{nn}</span>
                          ))}
                        </div>
                        {m.sku && <p className="text-[10px] text-slate-400 mt-0.5">{m.sku}</p>}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-600 tabular-nums">{formatMaterialQtyDisplay(m.unitNeeded)}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const needed = m.unitNeeded;
                          const pct = needed > 0 ? Math.min(100, (issued / needed) * 100) : 0;
                          const overIssue = issued > needed;
                          return (
                            <div className="flex flex-col gap-1">
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                                {overIssue ? (
                                  <>
                                    <div className="h-full bg-emerald-500" style={{ width: `${(needed / issued) * 100}%` }} />
                                    <div className="h-full bg-rose-500" style={{ width: `${((issued - needed) / issued) * 100}%` }} />
                                  </>
                                ) : (
                                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                                )}
                              </div>
                              <span className="text-[9px] font-bold text-slate-500 tabular-nums">
                                {overIssue ? (
                                  <span>
                                    已发 {formatMaterialQtyDisplay(issued)}{' '}
                                    <span className="text-rose-500">（超发 {formatMaterialQtyDisplay(issued - needed)}）</span>
                                  </span>
                                ) : (
                                  `已发 ${formatMaterialQtyDisplay(issued)}`
                                )}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={matDispatchQty[m.productId] ?? ''}
                          onChange={e => setMatDispatchQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))}
                          className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {bomMaterials.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleMatDispatchSubmit}
              disabled={!bomMaterials.some(m => (matDispatchQty[m.productId] ?? 0) > 0) || !matDispatchPartner}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <ArrowUpFromLine className="w-4 h-4" /> 确认外发
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(OutsourceMaterialDispatchModal);
