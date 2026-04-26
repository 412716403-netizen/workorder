
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Package, X, ArrowUpFromLine } from 'lucide-react';
import {
  ProductionOrder,
  Product,
  ProductCategory,
  BOM,
  Warehouse,
  AppDictionaries,
  ProductionOpRecord,
  ProdOpType,
  GlobalNodeTemplate,
  PsiRecord,
} from '../../types';
import { categoryUsesBatchManagement } from '../../types';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { clampBatchNoInput } from '../../hooks/useBatchPicker';
import { MaterialIssueBatchSelect } from '../../components/MaterialIssueBatchSelect';
import { toLocalCompactYmd } from '../../utils/localDateTime';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import {
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredSingleWarehouse,
  WAREHOUSE_DOC_KIND,
} from '../../utils/warehouseDocPreference';
import { formatMaterialQtyDisplay } from '../../utils/formatMaterialQtyDisplay';
import { usePsiStockIndex } from '../../hooks/usePsiStockIndex';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';

interface MaterialIssueModalProps {
  orderId: string | null;
  forProduct: { productId: string; orders: ProductionOrder[] } | null;
  orders: ProductionOrder[];
  products: Product[];
  boms: BOM[];
  warehouses: Warehouse[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries: AppDictionaries;
  prodRecords: ProductionOpRecord[];
  productionLinkMode: 'order' | 'product';
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onClose: () => void;
  userPermissions?: string[];
  tenantRole?: string;
  categories?: ProductCategory[];
  /** 与工单中心 PSI 快照合并批次下拉，缓解刚写入尚未刷新 API 的短暂不一致 */
  psiRecords?: PsiRecord[];
}

type BomMaterial = {
  productId: string;
  name: string;
  sku: string;
  unitNeeded: number;
  nodeNames: string[];
};

/**
 * 子工单等场景：明细 variantId 常仍为父成品规格，与本产品 BOM 的 variantId 对不上。
 * 回退用量顺序：命中同 variant 的明细数量 → 仅一条明细时用其数量 → 无任何明细命中本批 BOM 的 variant 时用工单总件数。
 */
function effectiveBomQtyForOrder(
  order: ProductionOrder,
  bom: BOM,
  orderQty: number,
  bomsSameParentAndNode: BOM[],
): number {
  if (!bom.variantId) return orderQty;
  const hit = order.items.find(i => i.variantId === bom.variantId);
  if (hit != null && hit.quantity > 0) return hit.quantity;
  if (order.items.length === 1 && order.items[0].quantity > 0) return order.items[0].quantity;
  const scopeVariantIds = new Set(
    bomsSameParentAndNode.map(b => b.variantId).filter((id): id is string => Boolean(id)),
  );
  const anyItemMatchesScope = order.items.some(i => Boolean(i.variantId && scopeVariantIds.has(i.variantId)));
  if (!anyItemMatchesScope && orderQty > 0) return orderQty;
  return hit?.quantity ?? 0;
}

const MaterialIssueModal: React.FC<MaterialIssueModalProps> = ({
  orderId,
  forProduct,
  orders,
  products,
  boms,
  warehouses,
  globalNodes,
  prodRecords,
  onAddRecord,
  onClose,
  categories = [],
  psiRecords = [],
}) => {
  const { currentUser, tenantCtx, userId } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const [materialIssueQty, setMaterialIssueQty] = useState<Record<string, number>>({});
  const [materialIssueLineBatch, setMaterialIssueLineBatch] = useState<Record<string, string>>({});
  const [materialIssueWarehouseId, setMaterialIssueWarehouseId] = useState<string>(warehouses[0]?.id ?? '');
  const materialIssueOpenKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!orderId && !forProduct) {
      materialIssueOpenKeyRef.current = null;
      return;
    }
    const key = orderId ?? (forProduct ? `fp:${forProduct.productId}` : '');
    if (!key) return;
    if (materialIssueOpenKeyRef.current === key) return;
    materialIssueOpenKeyRef.current = key;
    const pref = readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_MATERIAL_ISSUE);
    const wid = resolvePreferredSingleWarehouse(warehouses, pref, warehouses[0]?.id ?? '');
    setMaterialIssueWarehouseId(wid || '');
  }, [orderId, forProduct?.productId, forProduct, warehouses, tenantCtx?.tenantId, userId]);

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  /** 与工单中心列表产品行一致：展示分类「表单中」勾选的自定义字段（不含附件列） */
  const materialProductCustomTags = (productId: string) => {
    const p = productMap.get(productId);
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
  const { listAvailableBatches } = usePsiStockIndex(psiRecords, prodRecords);

  if (!orderId && !forProduct) return null;

  const handleClose = () => {
    setMaterialIssueQty({});
    setMaterialIssueLineBatch({});
    onClose();
  };

  const getNextStockDocNo = () => {
    const prefix = 'LL';
    const todayStr = toLocalCompactYmd(new Date());
    const pattern = `${prefix}${todayStr}-`;
    const existing = prodRecords.filter(r => r.type === 'STOCK_OUT' && r.docNo && r.docNo.startsWith(pattern));
    const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    return `${prefix}${todayStr}-${String(maxSeq + 1).padStart(4, '0')}`;
  };

  /* ────── Order-based material issue ────── */
  if (orderId && !forProduct) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return null;
    const product = productMap.get(order.productId);
    const orderQty = order.items.reduce((s, i) => s + i.quantity, 0);
    const bomMaterials: BomMaterial[] = [];
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
    const variants = product?.variants ?? [];
    if (variants.length > 0) {
      order.items.forEach(item => {
        if (item.quantity <= 0) return;
        const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
        const lineQty = item.quantity;
        const seenBomIds = new Set<string>();
        if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
          Object.entries(v.nodeBoms).forEach(([nodeId, bomIdRaw]) => {
            const bomId = String(bomIdRaw);
            if (seenBomIds.has(bomId)) return;
            seenBomIds.add(bomId);
            const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
            const bom = boms.find(b => b.id === bomId);
            if (bom) addBomItems(bom, lineQty, nodeName);
          });
        } else {
          boms.filter(b => b.parentProductId === product!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
            if (seenBomIds.has(bom.id)) return;
            seenBomIds.add(bom.id);
            const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
            addBomItems(bom, lineQty, nodeName);
          });
        }
      });
    }
    if (matMap.size === 0 && product) {
      const seenBomIds = new Set<string>();
      const fallbackBoms = boms.filter(b => b.parentProductId === product.id && b.nodeId);
      fallbackBoms.forEach(bom => {
        if (seenBomIds.has(bom.id)) return;
        seenBomIds.add(bom.id);
        const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
        const qty = effectiveBomQtyForOrder(order, bom, orderQty, fallbackBoms);
        if (qty <= 0) return;
        addBomItems(bom, qty, nodeName);
      });
    }
    matMap.forEach((v, productId) => {
      bomMaterials.push({ productId, ...v, nodeNames: Array.from(v.nodeNames) });
    });
    const issuedMap = new Map<string, number>();
    prodRecords.filter(r => r.type === 'STOCK_OUT' && !r.partner && r.orderId === order.id && r.reason !== '来自于返工').forEach(r => {
      issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
    });
    const showOrderBatchCol = bomMaterials.some(m => {
      const p = productMap.get(m.productId);
      return categoryUsesBatchManagement(categoryById.get(p?.categoryId ?? ''));
    });
    const handleIssueMaterials = async () => {
      const toIssue = bomMaterials.filter(m => (materialIssueQty[m.productId] ?? 0) > 0);
      if (toIssue.length === 0) return;
      const wh = materialIssueWarehouseId || '';
      if (wh) {
        for (const m of toIssue) {
          const p = productMap.get(m.productId);
          const c = categoryById.get(p?.categoryId ?? '');
          if (!categoryUsesBatchManagement(c)) continue;
          const bn = clampBatchNoInput(materialIssueLineBatch[m.productId] ?? '');
          if (!bn) {
            toast.error(`请为物料「${m.name}」选择批次`);
            return;
          }
          try {
            const opts = await api.psi.getStockBatches({ productId: m.productId, warehouseId: wh });
            const av = opts.find(o => o.batchNo === bn)?.stock ?? 0;
            if ((materialIssueQty[m.productId] ?? 0) > av) {
              toast.error(`物料「${m.name}」批次「${bn}」可用库存不足（${av}）`);
              return;
            }
          } catch {
            toast.error('校验批次库存失败，请稍后重试');
            return;
          }
        }
      }
      const docNo = getNextStockDocNo();
      toIssue.forEach(m => {
        const p = productMap.get(m.productId);
        const c = categoryById.get(p?.categoryId ?? '');
        const bn = categoryUsesBatchManagement(c) ? clampBatchNoInput(materialIssueLineBatch[m.productId] ?? '') : '';
        const rec: ProductionOpRecord = {
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'STOCK_OUT' as ProdOpType,
          orderId: order.id,
          productId: m.productId,
          quantity: materialIssueQty[m.productId],
          operator: docOperator,
          timestamp: new Date().toLocaleString(),
          status: '已完成',
          warehouseId: materialIssueWarehouseId || undefined,
          docNo,
          ...(bn ? { batchNo: bn } : {}),
        };
        onAddRecord(rec);
      });
      if (materialIssueWarehouseId) {
        writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_MATERIAL_ISSUE, {
          warehouseId: materialIssueWarehouseId,
        });
      }
      handleClose();
    };
    return (
      <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={handleClose} aria-hidden />
        <div className="relative bg-white w-full max-w-4xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 bg-white">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" /> 物料发出
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">{order.orderNumber} — {product?.name ?? order.productName}</p>
            </div>
            <button type="button" onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-5 space-y-4">
            {warehouses.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
                <select
                  value={materialIssueWarehouseId}
                  onChange={e => {
                    setMaterialIssueWarehouseId(e.target.value);
                    setMaterialIssueLineBatch({});
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            {bomMaterials.length === 0 ? (
              <p className="py-8 text-center text-slate-400 text-sm">该工单未配置 BOM 物料，无法进行物料发出</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full min-w-[760px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-100">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap">物料</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest text-right whitespace-nowrap w-24">理论需量</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap w-44">领料进度</th>
                    {showOrderBatchCol ? (
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap w-48">批次</th>
                    ) : null}
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest text-center whitespace-nowrap w-36">本次领料</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bomMaterials.map(m => {
                    const issued = issuedMap.get(m.productId) ?? 0;
                    return (
                    <tr key={m.productId} className="hover:bg-slate-50/50">
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-bold text-slate-800">{m.name}</span>
                          {m.sku ? (
                            <span className="text-xs font-bold text-slate-400 tabular-nums" title="产品编号">
                              {m.sku}
                            </span>
                          ) : null}
                          {m.nodeNames.map(nn => (
                            <span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                              {nn}
                            </span>
                          ))}
                        </div>
                        {materialProductCustomTags(m.productId)}
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-black text-slate-700 tabular-nums">{formatMaterialQtyDisplay(m.unitNeeded)}</td>
                      <td className="px-4 py-4">
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
                      {showOrderBatchCol ? (
                        <td className="px-4 py-4 align-middle">
                          <MaterialIssueBatchSelect
                            product={productMap.get(m.productId)}
                            categories={categories}
                            warehouseId={materialIssueWarehouseId}
                            value={materialIssueLineBatch[m.productId] ?? ''}
                            onChange={v => setMaterialIssueLineBatch(prev => ({ ...prev, [m.productId]: v }))}
                            mode="issue"
                            hideLabel
                            className="min-w-[170px]"
                            mergeBatches={listAvailableBatches(m.productId, materialIssueWarehouseId)}
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-4">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={materialIssueQty[m.productId] ?? ''}
                          onChange={e => setMaterialIssueQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 px-3 text-base font-black text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
          {bomMaterials.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleIssueMaterials()}
                disabled={!bomMaterials.some(m => (materialIssueQty[m.productId] ?? 0) > 0)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <ArrowUpFromLine className="w-4 h-4" /> 确认领料发出
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ────── Product-based material issue (关联产品) ────── */
  if (forProduct) {
    const { productId: sourceProductId, orders: groupOrders } = forProduct;
    const finishedProduct = productMap.get(sourceProductId);
    const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
    const mergeLocal = (local: Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>) => {
      local.forEach((v, pid) => {
        const existing = matMap.get(pid);
        if (existing) {
          existing.unitNeeded += v.unitNeeded;
          v.nodeNames.forEach(n => existing.nodeNames.add(n));
        } else {
          matMap.set(pid, {
            name: v.name,
            sku: v.sku,
            unitNeeded: v.unitNeeded,
            nodeNames: new Set(v.nodeNames)
          });
        }
      });
    };
    const addOrderBom = (order: ProductionOrder) => {
      const orderQty = order.items.reduce((s, i) => s + i.quantity, 0);
      if (orderQty <= 0) return;
      const product = productMap.get(order.productId) ?? finishedProduct;
      const local = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
      const variants = product?.variants ?? [];
      const addLocal = (bom: BOM, qty: number, nodeName: string) => {
        bom.items.forEach(bi => {
          const mp = products.find(px => px.id === bi.productId);
          const add = Number(bi.quantity) * qty;
          const existing = local.get(bi.productId);
          if (existing) {
            existing.unitNeeded += add;
            if (nodeName) existing.nodeNames.add(nodeName);
          } else {
            const ns = new Set<string>();
            if (nodeName) ns.add(nodeName);
            local.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: add, nodeNames: ns });
          }
        });
      };
      if (variants.length > 0) {
        order.items.forEach(item => {
          if (item.quantity <= 0) return;
          const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
          const lineQty = item.quantity;
          const seenBomIds = new Set<string>();
          if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
            Object.entries(v.nodeBoms).forEach(([nodeId, bomIdRaw]) => {
              const bomId = String(bomIdRaw);
              if (seenBomIds.has(bomId)) return;
              seenBomIds.add(bomId);
              const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
              const bom = boms.find(b => b.id === bomId);
              if (bom) addLocal(bom, lineQty, nodeName);
            });
          } else {
            boms.filter(b => b.parentProductId === (product ?? finishedProduct)!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
              if (seenBomIds.has(bom.id)) return;
              seenBomIds.add(bom.id);
              const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
              addLocal(bom, lineQty, nodeName);
            });
          }
        });
      }
      if (local.size === 0 && product) {
        const seenBomIds = new Set<string>();
        const fallbackBoms = boms.filter(b => b.parentProductId === product.id && b.nodeId);
        fallbackBoms.forEach(bom => {
          if (seenBomIds.has(bom.id)) return;
          seenBomIds.add(bom.id);
          const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
          const qty = effectiveBomQtyForOrder(order, bom, orderQty, fallbackBoms);
          if (qty <= 0) return;
          addLocal(bom, qty, nodeName);
        });
      }
      mergeLocal(local);
    };
    groupOrders.forEach(addOrderBom);
    const bomMaterials: BomMaterial[] = [];
    matMap.forEach((v, pid) => {
      bomMaterials.push({ productId: pid, ...v, nodeNames: Array.from(v.nodeNames) });
    });
    const familyIds = new Set(groupOrders.map(o => o.id));
    const issuedMap = new Map<string, number>();
    prodRecords
      .filter(r => r.type === 'STOCK_OUT' && !r.partner && r.reason !== '来自于返工')
      .forEach(r => {
        const hit =
          r.sourceProductId === sourceProductId ||
          (!r.sourceProductId && r.orderId && familyIds.has(r.orderId));
        if (hit) issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
      });
    const showFpBatchCol = bomMaterials.some(m => {
      const p = productMap.get(m.productId);
      return categoryUsesBatchManagement(categoryById.get(p?.categoryId ?? ''));
    });
    const handleIssueMaterials = async () => {
      const toIssue = bomMaterials.filter(m => (materialIssueQty[m.productId] ?? 0) > 0);
      if (toIssue.length === 0) return;
      const wh = materialIssueWarehouseId || '';
      if (wh) {
        for (const m of toIssue) {
          const p = productMap.get(m.productId);
          const c = categoryById.get(p?.categoryId ?? '');
          if (!categoryUsesBatchManagement(c)) continue;
          const bn = clampBatchNoInput(materialIssueLineBatch[m.productId] ?? '');
          if (!bn) {
            toast.error(`请为物料「${m.name}」选择批次`);
            return;
          }
          try {
            const opts = await api.psi.getStockBatches({ productId: m.productId, warehouseId: wh });
            const av = opts.find(o => o.batchNo === bn)?.stock ?? 0;
            if ((materialIssueQty[m.productId] ?? 0) > av) {
              toast.error(`物料「${m.name}」批次「${bn}」可用库存不足（${av}）`);
              return;
            }
          } catch {
            toast.error('校验批次库存失败，请稍后重试');
            return;
          }
        }
      }
      const docNo = getNextStockDocNo();
      toIssue.forEach(m => {
        const p = productMap.get(m.productId);
        const c = categoryById.get(p?.categoryId ?? '');
        const bn = categoryUsesBatchManagement(c) ? clampBatchNoInput(materialIssueLineBatch[m.productId] ?? '') : '';
        onAddRecord({
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'STOCK_OUT' as ProdOpType,
          productId: m.productId,
          quantity: materialIssueQty[m.productId],
          operator: docOperator,
          timestamp: new Date().toLocaleString(),
          status: '已完成',
          warehouseId: materialIssueWarehouseId || undefined,
          docNo,
          sourceProductId,
          ...(bn ? { batchNo: bn } : {}),
        });
      });
      if (materialIssueWarehouseId) {
        writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_MATERIAL_ISSUE, {
          warehouseId: materialIssueWarehouseId,
        });
      }
      handleClose();
    };
    const orderLabels = groupOrders.map(o => o.orderNumber).filter(Boolean).join('、');
    return (
      <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          onClick={handleClose}
          aria-hidden
        />
        <div className="relative bg-white w-full max-w-4xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 bg-white">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" /> 物料发出（关联产品）
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {finishedProduct?.name ?? '—'} · 共 {groupOrders.length} 条工单{orderLabels ? `（${orderLabels}）` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-5 space-y-4">
            {warehouses.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
                <select
                  value={materialIssueWarehouseId}
                  onChange={e => {
                    setMaterialIssueWarehouseId(e.target.value);
                    setMaterialIssueLineBatch({});
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
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
            {bomMaterials.length === 0 ? (
              <p className="py-8 text-center text-slate-400 text-sm">该产品未配置 BOM 物料，无法进行物料发出</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full min-w-[760px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-100">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap">物料</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest text-right whitespace-nowrap w-28">累计需量</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap w-44">领料进度</th>
                    {showFpBatchCol ? (
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap w-48">批次</th>
                    ) : null}
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest text-center whitespace-nowrap w-36">本次领料</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bomMaterials.map(m => {
                    const issued = issuedMap.get(m.productId) ?? 0;
                    return (
                      <tr key={m.productId} className="hover:bg-slate-50/50">
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-sm font-bold text-slate-800">{m.name}</span>
                            {m.sku ? (
                              <span className="text-xs font-bold text-slate-400 tabular-nums" title="产品编号">
                                {m.sku}
                              </span>
                            ) : null}
                            {m.nodeNames.map(nn => (
                              <span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                {nn}
                              </span>
                            ))}
                          </div>
                          {materialProductCustomTags(m.productId)}
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-black text-slate-700 tabular-nums">{formatMaterialQtyDisplay(m.unitNeeded)}</td>
                        <td className="px-4 py-4">
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
                                      <div
                                        className="h-full bg-rose-500"
                                        style={{ width: `${((issued - needed) / issued) * 100}%` }}
                                      />
                                    </>
                                  ) : (
                                    <div
                                      className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                      style={{ width: `${pct}%` }}
                                    />
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
                        {showFpBatchCol ? (
                          <td className="px-4 py-4 align-middle">
                            <MaterialIssueBatchSelect
                              product={productMap.get(m.productId)}
                              categories={categories}
                              warehouseId={materialIssueWarehouseId}
                              value={materialIssueLineBatch[m.productId] ?? ''}
                              onChange={v => setMaterialIssueLineBatch(prev => ({ ...prev, [m.productId]: v }))}
                              mode="issue"
                              hideLabel
                              className="min-w-[170px]"
                              mergeBatches={listAvailableBatches(m.productId, materialIssueWarehouseId)}
                            />
                          </td>
                        ) : null}
                        <td className="px-4 py-4">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={materialIssueQty[m.productId] ?? ''}
                            onChange={e =>
                              setMaterialIssueQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))
                            }
                            className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 px-3 text-base font-black text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
          {bomMaterials.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleIssueMaterials()}
                disabled={!bomMaterials.some(m => (materialIssueQty[m.productId] ?? 0) > 0)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <ArrowUpFromLine className="w-4 h-4" /> 确认领料发出
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default React.memo(MaterialIssueModal);
