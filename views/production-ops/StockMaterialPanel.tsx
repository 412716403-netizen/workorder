import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Product } from '../../types';
import {
  ArrowUpFromLine,
  Undo2,
  Layers,
  ScrollText,
  Check,
  Package,
  Sliders,
  Building2,
  Search,
} from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type {
  ProductionOpRecord,
  ProductionOrder,
  ProdOpType,
  MaterialPanelSettings,
} from '../../types';
import { DEFAULT_MATERIAL_PANEL_SETTINGS } from '../../types';
import { PanelProps, hasOpsPerm, getOrderFamilyIds, type StockDocDetail } from './types';

type MatRow = { productId: string; issue: number; returnQty: number; theoryCost: number };

/** Resolve BOM items for a specific product + nodeId (+ optional variantId).
 *  Shared between partnerMaterialGroups and potentially other BOM-aware logic. */
function resolveBomItems(
  productsById: Map<string, Product>,
  bomsById: Map<string, import('../../types').BOM>,
  bomsByParentProduct: Map<string, import('../../types').BOM[]>,
  productId: string,
  nodeId: string,
  variantId?: string,
): { productId: string; quantity: number }[] {
  const product = productsById.get(productId);
  if (!product) return [];
  const items: { productId: string; quantity: number }[] = [];
  const variants = product.variants ?? [];

  if (variantId && variants.length > 0) {
    const v = variants.find(vv => vv.id === variantId);
    if (v?.nodeBoms) {
      const bomId = (v.nodeBoms as Record<string, string>)[nodeId];
      if (bomId) {
        const bom = bomsById.get(bomId);
        if (bom) { bom.items.forEach(bi => items.push({ productId: bi.productId, quantity: Number(bi.quantity) })); return items; }
      }
    }
    (bomsByParentProduct.get(product.id) ?? [])
      .filter(b => b.nodeId === nodeId && b.variantId === variantId)
      .forEach(bom => bom.items.forEach(bi => items.push({ productId: bi.productId, quantity: Number(bi.quantity) })));
    if (items.length > 0) return items;
  }

  (bomsByParentProduct.get(product.id) ?? [])
    .filter(b => b.nodeId === nodeId)
    .forEach(bom => bom.items.forEach(bi => items.push({ productId: bi.productId, quantity: Number(bi.quantity) })));
  return items;
}

/** Reusable material stats table used in all 4 layout branches */
const MaterialStatsTable: React.FC<{
  materials: MatRow[];
  selecting: boolean;
  compact?: boolean;
  selectedIds: Set<string>;
  onSelectAll: (ids: Set<string>) => void;
  onToggleSelect: (productId: string) => void;
  productsById: Map<string, Product>;
  emptyMessage?: string;
}> = ({ materials, selecting, compact, selectedIds, onSelectAll, onToggleSelect, productsById, emptyMessage = '暂无物料' }) => {
  const cols = selecting ? 7 : 6;
  const px = compact ? 'px-2.5' : 'px-6';
  const py = compact ? 'py-2' : 'py-3';
  const thTrack = compact ? 'tracking-wider' : 'tracking-widest';
  const thBase = `${compact ? '' : px} ${py} text-[10px] font-black text-slate-400 uppercase ${thTrack}`;
  return (
    <div className={compact ? 'overflow-x-auto min-w-0 pr-4 sm:pr-5' : 'overflow-x-auto'}>
      <table className={compact ? 'w-full min-w-[680px] table-fixed border-collapse text-left' : 'w-full text-left border-collapse'}>
        {compact && (
          <colgroup>
            {selecting ? <col className="w-[5%]" /> : null}
            <col className={selecting ? 'w-[10%]' : 'w-[15%]'} />
            <col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[17%]" />
          </colgroup>
        )}
        <thead>
          <tr className="bg-slate-50/80">
            {selecting && (
              <th className={compact ? 'px-2 py-2 align-middle w-10' : 'px-4 py-3 w-12'}>
                <input type="checkbox" checked={materials.length > 0 && materials.every(m => selectedIds.has(m.productId))} onChange={e => { if (e.target.checked) onSelectAll(new Set(materials.map(m => m.productId))); else onSelectAll(new Set()); }} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              </th>
            )}
            <th className={compact ? `pl-4 pr-1 ${py} ${thBase} text-left align-middle` : `${thBase}`}>{compact ? '物料' : '物料信息'}</th>
            <th className={compact ? `pl-2 pr-2 ${py} ${thBase} text-right align-middle whitespace-nowrap tabular-nums` : `${thBase} text-center`}>{compact ? '领料(+)' : '生产领料(+)'}</th>
            <th className={compact ? `${px} ${py} ${thBase} text-right align-middle whitespace-nowrap tabular-nums` : `${thBase} text-center`}>{compact ? '退料(-)' : '生产退料(-)'}</th>
            <th className={compact ? `${px} ${py} ${thBase} text-right align-middle whitespace-nowrap tabular-nums` : `${thBase} text-center`}>净领用</th>
            <th className={compact ? `${px} ${py} ${thBase} text-right align-middle whitespace-nowrap` : `${thBase} text-center`}>报工耗材<span className="text-slate-300 font-normal">(理论)</span></th>
            <th className={compact ? `pl-2 pr-6 ${py} ${thBase} text-right align-middle whitespace-nowrap tabular-nums` : `${thBase} text-center`}>{compact ? '结余' : '当前结余'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {materials.length === 0 ? (
            <tr><td colSpan={cols} className={compact ? 'px-4 py-6 text-center text-slate-400 text-sm' : 'px-6 py-8 text-center text-slate-400 text-sm'}>{emptyMessage}</td></tr>
          ) : materials.map(({ productId, issue, returnQty, theoryCost }) => {
            const prod = productsById.get(productId);
            const net = issue - returnQty;
            const balance = Math.round((net - theoryCost) * 100) / 100;
            return (
              <tr key={productId} className="hover:bg-slate-50/50 transition-colors">
                {selecting && (
                  <td className={compact ? 'px-2 py-2 align-middle w-10' : 'px-4 py-3'}>
                    <input type="checkbox" checked={selectedIds.has(productId)} onChange={() => onToggleSelect(productId)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  </td>
                )}
                <td className={compact ? `pl-4 pr-1 ${py} align-middle min-w-0` : `${px} ${py}`}>
                  {compact ? (
                    <>
                      <p className="text-sm font-bold text-slate-800 truncate" title={prod?.name}>{prod?.name ?? '未知物料'}</p>
                      {prod?.sku && <p className="text-[10px] text-slate-400 truncate">{prod.sku}</p>}
                    </>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-slate-800">{prod?.name ?? '未知物料'}</p>
                      {prod?.sku && <p className="text-[10px] text-slate-400 font-medium">{prod.sku}</p>}
                    </div>
                  )}
                </td>
                {compact ? (
                  <>
                    <td className={`pl-2 pr-2 ${py} text-right align-middle tabular-nums`}><span className="text-sm font-bold text-indigo-600">{issue}</span></td>
                    <td className={`${px} ${py} text-right align-middle tabular-nums`}><span className="text-sm font-bold text-rose-600">{returnQty}</span></td>
                    <td className={`${px} ${py} text-right align-middle tabular-nums`}><span className="text-sm font-bold text-slate-800">{net}</span></td>
                    <td className={`${px} ${py} text-right align-middle tabular-nums`}><span className="text-sm font-bold text-amber-600">{Math.round(theoryCost * 100) / 100}</span></td>
                    <td className={`pl-2 pr-6 ${py} text-right align-middle tabular-nums`}><span className={`text-sm font-bold ${balance >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{balance}</span></td>
                  </>
                ) : (
                  <>
                    <td className={`${px} ${py} text-center`}><span className="text-sm font-bold text-indigo-600 inline-flex items-center gap-0.5">{issue} <ArrowUpFromLine className="w-3.5 h-3.5 opacity-70" /></span></td>
                    <td className={`${px} ${py} text-center`}><span className="text-sm font-bold text-rose-600 inline-flex items-center gap-0.5">{returnQty} <Undo2 className="w-3.5 h-3.5 opacity-70" /></span></td>
                    <td className={`${px} ${py} text-center`}><span className="text-sm font-bold text-slate-800">{net}</span></td>
                    <td className={`${px} ${py} text-center`}><span className="text-sm font-bold text-amber-600">{Math.round(theoryCost * 100) / 100}</span></td>
                    <td className={`${px} ${py} text-center`}><span className={`text-sm font-bold ${balance >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{balance}</span></td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

interface StockMaterialPanelProps extends PanelProps {
  materialPanelSettings?: MaterialPanelSettings;
  onUpdateMaterialPanelSettings?: (settings: MaterialPanelSettings) => void;
}
import { useDataIndexes } from './useDataIndexes';
import {
  moduleHeaderRowClass,
  outlineAccentToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
} from '../../styles/uiDensity';
import StockConfirmModal from './StockConfirmModal';
import StockDocDetailModal from './StockDocDetailModal';
import StockFlowListModal from './StockFlowListModal';
import StockMaterialFormModal from './StockMaterialFormModal';
import MaterialPanelConfigModal from './MaterialPanelConfigModal';

const StockMaterialPanel: React.FC<StockMaterialPanelProps> = ({
  productionLinkMode,
  productMilestoneProgresses,
  records,
  orders,
  products,
  warehouses,
  boms,
  dictionaries,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  userPermissions,
  tenantRole,
  materialPanelSettings = DEFAULT_MATERIAL_PANEL_SETTINGS,
  onUpdateMaterialPanelSettings,
}) => {
  const canViewMainList = hasOpsPerm(tenantRole, userPermissions, 'production:material_list:allow');
  const toggleSelect = (productId: string) => setStockSelectedIds(prev => { const next = new Set(prev); if (next.has(productId)) next.delete(productId); else next.add(productId); return next; });

  const [showModal, setShowModal] = useState(false);
  const [stockModalMode, setStockModalMode] = useState<'stock_out' | 'stock_return' | null>(null);
  const [showStockFlowModal, setShowStockFlowModal] = useState(false);
  const [stockSelectOrderId, setStockSelectOrderId] = useState<string | null>(null);
  const [stockSelectMode, setStockSelectMode] = useState<'stock_out' | 'stock_return' | null>(null);
  const [stockSelectedIds, setStockSelectedIds] = useState<Set<string>>(new Set());
  const [stockSelectSourceProductId, setStockSelectSourceProductId] = useState<string | null>(null);
  const [showStockConfirmModal, setShowStockConfirmModal] = useState(false);
  const [stockConfirmQuantities, setStockConfirmQuantities] = useState<Record<string, number>>({});
  const [stockConfirmWarehouseId, setStockConfirmWarehouseId] = useState('');
  const [stockConfirmReason, setStockConfirmReason] = useState('');
  const [stockDocDetail, setStockDocDetail] = useState<StockDocDetail | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [stockSelectPartner, setStockSelectPartner] = useState<string | null>(null);
  const [materialSearch, setMaterialSearch] = useState('');
  const debouncedMaterialSearch = useDebouncedValue(materialSearch, 300);

  const PAGE_SIZE = materialPanelSettings.groupByOutsourcePartner ? 5 : 10;
  const [stockPage, setStockPage] = useState(1);
  useEffect(() => { setStockPage(1); }, [productionLinkMode, materialPanelSettings.groupByOutsourcePartner, debouncedMaterialSearch]);

  const idx = useDataIndexes(orders, products, boms, [] /* no globalNodes needed */, productMilestoneProgresses);

  const parentOrders = useMemo(() => orders.filter(o => !o.parentOrderId), [orders]);

  /** 按父工单聚合：父工单 id -> 该父工单及所有子工单下各物料的 领料/退料/净领用/报工理论耗材 汇总；含 BOM 全部物料（无记录时也显示） */
  const parentMaterialStats = useMemo(() => {
    const { productsById, bomsById, bomsByParentProduct, childrenByParentId } = idx;
    const result = new Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number }[]>();
    const parentList = orders.filter(o => !o.parentOrderId);

    const stockRecordsByOrder = new Map<string, typeof records>();
    for (const r of records) {
      if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') continue;
      if (!r.orderId) continue;
      let arr = stockRecordsByOrder.get(r.orderId);
      if (!arr) { arr = []; stockRecordsByOrder.set(r.orderId, arr); }
      arr.push(r);
    }

    parentList.forEach(parent => {
      const familyIds = new Set(getOrderFamilyIds(orders, parent.id, childrenByParentId));
      const prodMap = new Map<string, { issue: number; returnQty: number; theoryCost: number }>();
      const familyOrders = orders.filter(o => familyIds.has(o.id));
      familyOrders.forEach(ord => {
        const ordProduct = productsById.get(ord.productId);
        const variants = ordProduct?.variants ?? [];
        const variantCompletedMap = new Map<string, number>();
        ord.milestones.forEach(ms => {
          (ms.reports || []).forEach(r => {
            const vid = r.variantId ?? '';
            variantCompletedMap.set(vid, (variantCompletedMap.get(vid) ?? 0) + Number(r.quantity));
          });
        });
        const bestMsIdx = ord.milestones.reduce((bi, ms, i) => ms.completedQuantity > (ord.milestones[bi]?.completedQuantity ?? 0) ? i : bi, 0);
        const bestMs = ord.milestones[bestMsIdx];
        if (bestMs) {
          variantCompletedMap.clear();
          (bestMs.reports || []).forEach(r => {
            const vid = r.variantId ?? '';
            variantCompletedMap.set(vid, (variantCompletedMap.get(vid) ?? 0) + Number(r.quantity));
          });
        }
        const totalCompleted = ord.milestones.reduce((max, ms) => Math.max(max, ms.completedQuantity), 0);

        const addTheory = (bi: { productId: string; quantity: number }, qty: number) => {
          const theory = Number(bi.quantity) * qty;
          if (!prodMap.has(bi.productId)) prodMap.set(bi.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
          prodMap.get(bi.productId)!.theoryCost += theory;
        };

        if (variants.length > 0 && variantCompletedMap.size > 0) {
          variants.forEach(v => {
            const vCompleted = variantCompletedMap.get(v.id) ?? 0;
            if (vCompleted <= 0) return;
            const seenBomIds = new Set<string>();
            if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
              (Object.values(v.nodeBoms) as string[]).forEach(bomId => {
                if (seenBomIds.has(bomId)) return;
                seenBomIds.add(bomId);
                const bom = bomsById.get(bomId);
                bom?.items.forEach(bi => addTheory(bi, vCompleted));
              });
            } else {
              (bomsByParentProduct.get(ordProduct!.id) ?? []).filter(b => b.variantId === v.id && b.nodeId).forEach(bom => {
                if (seenBomIds.has(bom.id)) return;
                seenBomIds.add(bom.id);
                bom.items.forEach(bi => addTheory(bi, vCompleted));
              });
            }
          });
        } else if (variants.length > 0) {
          variants.forEach(v => {
            const seenBomIds = new Set<string>();
            if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
              (Object.values(v.nodeBoms) as string[]).forEach(bomId => {
                if (seenBomIds.has(bomId)) return;
                seenBomIds.add(bomId);
                const bom = bomsById.get(bomId);
                bom?.items.forEach(bi => addTheory(bi, totalCompleted));
              });
            }
          });
          if (prodMap.size === 0 && ordProduct) {
            (bomsByParentProduct.get(ordProduct.id) ?? []).filter(b => b.nodeId).forEach(bom => {
              bom.items.forEach(bi => addTheory(bi, totalCompleted));
            });
          }
        } else if (ordProduct) {
          (bomsByParentProduct.get(ordProduct.id) ?? []).filter(b => b.nodeId).forEach(bom => {
            bom.items.forEach(bi => addTheory(bi, totalCompleted));
          });
        }
      });
      familyIds.forEach(fid => {
        const recs = stockRecordsByOrder.get(fid);
        if (!recs) return;
        for (const r of recs) {
          if (!prodMap.has(r.productId)) prodMap.set(r.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
          const cur = prodMap.get(r.productId)!;
          if (r.type === 'STOCK_OUT') cur.issue += r.quantity;
          else cur.returnQty += r.quantity;
        }
      });
      result.set(parent.id, Array.from(prodMap.entries()).map(([productId, v]) => ({ productId, ...v })));
    });
    return result;
  }, [records, orders, boms, products, idx]);

  /** 关联产品模式：按成品聚合物料（多工单同产品合并一行卡片） */
  const productMaterialStatsByProduct = useMemo(() => {
    if (productionLinkMode !== 'product') return null as Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number }[]> | null;
    const { productsById, bomsById, bomsByParentProduct, childrenByParentId, rootOrdersByProductId, pmpByKey } = idx;
    const result = new Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number }[]>();
    const finishedProductHasBom = (fpId: string): boolean => {
      const ordProduct = productsById.get(fpId);
      if (!ordProduct) return false;
      const variants = ordProduct.variants ?? [];
      if (variants.length > 0) {
        for (const v of variants) {
          if (v.nodeBoms) {
            for (const bomId of Object.values(v.nodeBoms) as string[]) {
              const bom = bomsById.get(bomId);
              if (bom && bom.items.length > 0) return true;
            }
          }
        }
      }
      const parentBoms = bomsByParentProduct.get(ordProduct.id) ?? [];
      return parentBoms.some(b => b.nodeId && b.items.length > 0);
    };

    const pmpByProduct = new Map<string, number>();
    if (productMilestoneProgresses.length > 0) {
      for (const p of productMilestoneProgresses) {
        pmpByProduct.set(p.productId, Math.max(pmpByProduct.get(p.productId) ?? 0, p.completedQuantity ?? 0));
      }
    }

    const finishedIds = ([...new Set(orders.filter(o => !o.parentOrderId).map(o => o.productId))] as string[])
      .filter(Boolean)
      .filter(fpId => finishedProductHasBom(fpId));
    for (const fpId of finishedIds) {
      const roots = rootOrdersByProductId.get(fpId) ?? [];
      const allFamilyIds = new Set<string>();
      roots.forEach(p => getOrderFamilyIds(orders, p.id, childrenByParentId).forEach(id => allFamilyIds.add(id)));
      const prodMap = new Map<string, { issue: number; returnQty: number; theoryCost: number }>();
      roots.forEach(parent => {
        const familyIds = new Set(getOrderFamilyIds(orders, parent.id, childrenByParentId));
        const familyOrders = orders.filter(o => familyIds.has(o.id));
        familyOrders.forEach(ord => {
          const ordProduct = productsById.get(ord.productId);
          const variants = ordProduct?.variants ?? [];
          let totalCompleted = ord.milestones.reduce((max, ms) => Math.max(max, ms.completedQuantity), 0);
          if (totalCompleted <= 0 && productMilestoneProgresses.length > 0) {
            totalCompleted = pmpByProduct.get(fpId) ?? 0;
          }

          const variantCompletedMap = new Map<string, number>();
          const bestMsIdx = ord.milestones.reduce((bi, ms, i) => ms.completedQuantity > (ord.milestones[bi]?.completedQuantity ?? 0) ? i : bi, 0);
          const bestMs = ord.milestones[bestMsIdx];
          if (bestMs) {
            (bestMs.reports || []).forEach(r => {
              const vid = r.variantId ?? '';
              variantCompletedMap.set(vid, (variantCompletedMap.get(vid) ?? 0) + Number(r.quantity));
            });
          }

          const addTheory2 = (bi: { productId: string; quantity: number }, qty: number) => {
            const theory = Number(bi.quantity) * qty;
            if (!prodMap.has(bi.productId)) prodMap.set(bi.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
            prodMap.get(bi.productId)!.theoryCost += theory;
          };

          if (variants.length > 0 && variantCompletedMap.size > 0) {
            variants.forEach(v => {
              const vCompleted = variantCompletedMap.get(v.id) ?? 0;
              if (vCompleted <= 0) return;
              const seenBomIds = new Set<string>();
              if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
                (Object.values(v.nodeBoms) as string[]).forEach(bomId => {
                  if (seenBomIds.has(bomId)) return;
                  seenBomIds.add(bomId);
                  const bom = bomsById.get(bomId);
                  bom?.items.forEach(bi => addTheory2(bi, vCompleted));
                });
              } else {
                (bomsByParentProduct.get(ordProduct!.id) ?? []).filter(b => b.variantId === v.id && b.nodeId).forEach(bom => {
                  if (seenBomIds.has(bom.id)) return;
                  seenBomIds.add(bom.id);
                  bom.items.forEach(bi => addTheory2(bi, vCompleted));
                });
              }
            });
          } else if (ordProduct) {
            const bomItems: { productId: string; quantity: number }[] = [];
            if (variants.length > 0) {
              variants.forEach(v => {
                if (v.nodeBoms) {
                  const seenBomIds = new Set<string>();
                  (Object.values(v.nodeBoms) as string[]).forEach(bomId => {
                    if (seenBomIds.has(bomId)) return;
                    seenBomIds.add(bomId);
                    const bom = bomsById.get(bomId);
                    bom?.items.forEach(bi => bomItems.push({ productId: bi.productId, quantity: Number(bi.quantity) }));
                  });
                }
              });
            }
            if (bomItems.length === 0) {
              (bomsByParentProduct.get(ordProduct.id) ?? []).filter(b => b.nodeId).forEach(bom => {
                bom.items.forEach(bi => bomItems.push({ productId: bi.productId, quantity: Number(bi.quantity) }));
              });
            }
            bomItems.forEach(bi => addTheory2(bi, totalCompleted));
          }
        });
      });
      records.forEach(r => {
        if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') return;
        const bySource = r.sourceProductId === fpId;
        const byOrder = r.orderId && allFamilyIds.has(r.orderId);
        if (!bySource && !byOrder) return;
        if (!prodMap.has(r.productId)) prodMap.set(r.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
        const cur = prodMap.get(r.productId)!;
        if (r.type === 'STOCK_OUT') cur.issue += r.quantity;
        else cur.returnQty += r.quantity;
      });
      result.set(fpId, Array.from(prodMap.entries()).map(([productId, v]) => ({ productId, ...v })));
    }
    return result;
  }, [productionLinkMode, records, orders, boms, products, productMilestoneProgresses, idx]);

  /** 开启「按委外加工厂展示」时：按 partner 拆分领退 + 理论耗材 */
  const partnerMaterialGroups = useMemo(() => {
    if (!materialPanelSettings.groupByOutsourcePartner) return null;

    const INTERNAL_KEY = '__internal__';
    const { productsById, bomsById, bomsByParentProduct, ordersById } = idx;

    const rootIdCache = new Map<string, string>();
    const getRootOrderId = (orderId: string): string => {
      const cached = rootIdCache.get(orderId);
      if (cached !== undefined) return cached;
      let cur = orderId;
      for (let i = 0; i < 10; i++) {
        const o = ordersById.get(cur);
        if (!o?.parentOrderId) break;
        cur = o.parentOrderId;
      }
      rootIdCache.set(orderId, cur);
      return cur;
    };

    type MatAcc = { issue: number; returnQty: number; theoryCost: number };
    type Buckets = Map<string, Map<string, Map<string, MatAcc>>>;
    const buckets: Buckets = new Map();
    const ensure = (pk: string, sk: string, matId: string): MatAcc => {
      if (!buckets.has(pk)) buckets.set(pk, new Map());
      const pMap = buckets.get(pk)!;
      if (!pMap.has(sk)) pMap.set(sk, new Map());
      const sMap = pMap.get(sk)!;
      if (!sMap.has(matId)) sMap.set(matId, { issue: 0, returnQty: 0, theoryCost: 0 });
      return sMap.get(matId)!;
    };

    // Step 1: seed internal bucket with total theory from existing aggregation
    const totalSource = productionLinkMode === 'product' ? productMaterialStatsByProduct : parentMaterialStats;
    if (totalSource) {
      for (const [scopeKey, rows] of totalSource.entries()) {
        for (const row of rows) {
          ensure(INTERNAL_KEY, scopeKey, row.productId).theoryCost = row.theoryCost;
        }
      }
    }

    // Step 2: split STOCK_OUT / STOCK_RETURN by partner
    const getScopeKey = (r: ProductionOpRecord): string | null => {
      if (productionLinkMode === 'product') {
        if (r.sourceProductId) return r.sourceProductId;
        if (r.orderId) {
          const rootId = getRootOrderId(r.orderId);
          return ordersById.get(rootId)?.productId || null;
        }
        return null;
      }
      return r.orderId ? getRootOrderId(r.orderId) : null;
    };

    for (const r of records) {
      if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') continue;
      const pk = r.partner?.trim() || INTERNAL_KEY;
      const sk = getScopeKey(r);
      if (!sk) continue;
      const acc = ensure(pk, sk, r.productId);
      if (r.type === 'STOCK_OUT') acc.issue += r.quantity;
      else acc.returnQty += r.quantity;
    }

    // Step 3: compute outsource partner theory from OUTSOURCE 已收回 × BOM, deduct from internal
    for (const r of records) {
      if (r.type !== 'OUTSOURCE' || r.status !== '已收回' || r.sourceReworkId) continue;
      const pk = r.partner?.trim() || INTERNAL_KEY;
      if (pk === INTERNAL_KEY || !r.nodeId) continue;

      let scopeKey: string | null = null;
      let productForBom: string | null = null;
      if (productionLinkMode === 'product') {
        scopeKey = r.productId;
        productForBom = r.productId;
      } else if (r.orderId) {
        scopeKey = getRootOrderId(r.orderId);
        productForBom = ordersById.get(r.orderId)?.productId || null;
      }
      if (!scopeKey || !productForBom) continue;

      const bomItems = resolveBomItems(productsById, bomsById, bomsByParentProduct, productForBom, r.nodeId, r.variantId);
      for (const bi of bomItems) {
        const theory = Number(bi.quantity) * r.quantity;
        ensure(pk, scopeKey, bi.productId).theoryCost += theory;
        const internal = ensure(INTERNAL_KEY, scopeKey, bi.productId);
        internal.theoryCost = Math.max(0, internal.theoryCost - theory);
      }
    }

    // Step 4: build sorted output — 本厂首位，其余加工厂按名称字母序
    const allKeys = [...buckets.keys()].sort((a, b) => {
      if (a === INTERNAL_KEY) return b === INTERNAL_KEY ? 0 : -1;
      if (b === INTERNAL_KEY) return 1;
      return a.localeCompare(b);
    });

    return allKeys.map(pk => {
      const scopeMap = buckets.get(pk)!;
      const data = new Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number }[]>();
      for (const [sk, matMap] of scopeMap.entries()) {
        data.set(sk, Array.from(matMap.entries()).map(([pid, v]) => ({ productId: pid, ...v })));
      }
      return { partnerKey: pk, partnerLabel: pk === INTERNAL_KEY ? '本厂' : pk, data };
    });
  }, [materialPanelSettings.groupByOutsourcePartner, records, orders, productionLinkMode, idx, parentMaterialStats, productMaterialStatsByProduct]);

  const materialKw = debouncedMaterialSearch.trim().toLowerCase();

  const partnerGroupsForDisplay = useMemo(() => {
    if (!materialPanelSettings.groupByOutsourcePartner || !partnerMaterialGroups) return null;
    if (!materialKw) return partnerMaterialGroups;

    const materialsHit = (materials: MatRow[]) =>
      materials.some(m => {
        const p = idx.productsById.get(m.productId);
        return (p?.name ?? '').toLowerCase().includes(materialKw) || (p?.sku ?? '').toLowerCase().includes(materialKw);
      });

    const productScopeHit = (fpId: string, materials: MatRow[]) => {
      if (materialsHit(materials)) return true;
      const fp = idx.productsById.get(fpId);
      if ((fp?.name ?? '').toLowerCase().includes(materialKw) || (fp?.sku ?? '').toLowerCase().includes(materialKw)) return true;
      const roots = idx.rootOrdersByProductId.get(fpId) ?? [];
      return roots.some(o =>
        (o.orderNumber ?? '').toLowerCase().includes(materialKw) ||
        (o.customer ?? '').toLowerCase().includes(materialKw) ||
        (o.productName ?? '').toLowerCase().includes(materialKw)
      );
    };

    const orderScopeHit = (orderId: string, materials: MatRow[]) => {
      if (materialsHit(materials)) return true;
      const order = idx.ordersById.get(orderId);
      if (!order) return false;
      const prod = idx.productsById.get(order.productId);
      return (
        (order.orderNumber ?? '').toLowerCase().includes(materialKw) ||
        (order.customer ?? '').toLowerCase().includes(materialKw) ||
        (order.productName ?? '').toLowerCase().includes(materialKw) ||
        (prod?.name ?? '').toLowerCase().includes(materialKw) ||
        (prod?.sku ?? '').toLowerCase().includes(materialKw)
      );
    };

    return partnerMaterialGroups
      .map(pg => {
        const partnerHit =
          (pg.partnerLabel || '').toLowerCase().includes(materialKw) ||
          (pg.partnerKey !== '__internal__' && (pg.partnerKey || '').toLowerCase().includes(materialKw));
        if (partnerHit) return pg;

        const next = new Map<string, MatRow[]>();
        for (const [scopeKey, materials] of pg.data.entries()) {
          const ok = productionLinkMode === 'product'
            ? productScopeHit(scopeKey, materials)
            : orderScopeHit(scopeKey, materials);
          if (ok) next.set(scopeKey, materials);
        }
        return { ...pg, data: next };
      })
      .filter(pg => pg.data.size > 0);
  }, [materialPanelSettings.groupByOutsourcePartner, partnerMaterialGroups, materialKw, productionLinkMode, idx]);

  const productEntriesForDisplay = useMemo(() => {
    if (!productMaterialStatsByProduct) return null;
    if (!materialKw) return Array.from(productMaterialStatsByProduct.entries());
    return Array.from(productMaterialStatsByProduct.entries()).filter(([fpId, materials]) => {
      if (materials.some(m => {
        const p = idx.productsById.get(m.productId);
        return (p?.name ?? '').toLowerCase().includes(materialKw) || (p?.sku ?? '').toLowerCase().includes(materialKw);
      })) return true;
      const fp = idx.productsById.get(fpId);
      if ((fp?.name ?? '').toLowerCase().includes(materialKw) || (fp?.sku ?? '').toLowerCase().includes(materialKw)) return true;
      const roots = idx.rootOrdersByProductId.get(fpId) ?? [];
      return roots.some(o =>
        (o.orderNumber ?? '').toLowerCase().includes(materialKw) ||
        (o.customer ?? '').toLowerCase().includes(materialKw) ||
        (o.productName ?? '').toLowerCase().includes(materialKw)
      );
    });
  }, [productMaterialStatsByProduct, materialKw, idx]);

  const parentOrdersForDisplay = useMemo(() => {
    if (!materialKw) return parentOrders;
    return parentOrders.filter(parent => {
      const materials = parentMaterialStats.get(parent.id) ?? [];
      if (materials.some(m => {
        const p = idx.productsById.get(m.productId);
        return (p?.name ?? '').toLowerCase().includes(materialKw) || (p?.sku ?? '').toLowerCase().includes(materialKw);
      })) return true;
      const prod = idx.productsById.get(parent.productId);
      return (
        (parent.orderNumber ?? '').toLowerCase().includes(materialKw) ||
        (parent.customer ?? '').toLowerCase().includes(materialKw) ||
        (parent.productName ?? '').toLowerCase().includes(materialKw) ||
        (prod?.name ?? '').toLowerCase().includes(materialKw) ||
        (prod?.sku ?? '').toLowerCase().includes(materialKw)
      );
    });
  }, [parentOrders, parentMaterialStats, materialKw, idx]);

  /** 有搜索词时表格内只显示名称/SKU 含关键词的物料行；若当前卡片因工单/产品名等命中、但物料名都不含关键词，则仍显示全部行 */
  const displayMaterialsForSearch = useCallback((materials: MatRow[]): MatRow[] => {
    if (!materialKw) return materials;
    const hit = materials.filter(m => {
      const p = idx.productsById.get(m.productId);
      return (p?.name ?? '').toLowerCase().includes(materialKw) || (p?.sku ?? '').toLowerCase().includes(materialKw);
    });
    return hit.length > 0 ? hit : materials;
  }, [materialKw, idx.productsById]);

  /** 领料/退料单据号：领料 LLyyyyMMdd-0001，退料 TLyyyyMMdd-0001，当日同类型顺序递增 */
  const getNextStockDocNo = (type: 'STOCK_OUT' | 'STOCK_RETURN') => {
    const prefix = type === 'STOCK_OUT' ? 'LL' : 'TL';
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pattern = `${prefix}${todayStr}-`;
    const existing = records.filter(r => r.type === type && r.docNo && r.docNo.startsWith(pattern));
    const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    return `${prefix}${todayStr}-${String(maxSeq + 1).padStart(4, '0')}`;
  };

  const handleStockConfirmSubmit = async () => {
    if (!stockSelectMode) return;
    const toSubmit = Array.from(stockSelectedIds).filter(pid => (stockConfirmQuantities[pid] ?? 0) > 0);
    if (toSubmit.length === 0) return;
    const recordType: ProdOpType = stockSelectMode === 'stock_out' ? 'STOCK_OUT' : 'STOCK_RETURN';
    const docNo = getNextStockDocNo(recordType);
    const timestamp = new Date().toLocaleString();
    const partnerForRecord = stockSelectPartner && stockSelectPartner !== '__internal__' ? stockSelectPartner : undefined;
    const srcPid = stockSelectSourceProductId;
    if (srcPid) {
      const batch: ProductionOpRecord[] = toSubmit.map(pid => ({
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: recordType,
        orderId: undefined,
        sourceProductId: srcPid,
        productId: pid,
        quantity: stockConfirmQuantities[pid],
        reason: stockConfirmReason || undefined,
        timestamp,
        status: '已完成',
        warehouseId: stockConfirmWarehouseId || undefined,
        partner: partnerForRecord,
        docNo
      } as ProductionOpRecord));
      if (onAddRecordBatch && batch.length > 1) {
        await onAddRecordBatch(batch);
      } else {
        for (const rec of batch) await onAddRecord(rec);
      }
      setStockDocDetail({
        docNo,
        type: recordType,
        orderId: '',
        sourceProductId: srcPid,
        timestamp,
        warehouseId: stockConfirmWarehouseId || '',
        lines: toSubmit.map(pid => ({ productId: pid, quantity: stockConfirmQuantities[pid] })),
        reason: stockConfirmReason || undefined,
        operator: '',
        partner: partnerForRecord,
      });
    } else if (stockSelectOrderId) {
      const batch: ProductionOpRecord[] = toSubmit.map(pid => ({
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: recordType,
        orderId: stockSelectOrderId,
        productId: pid,
        quantity: stockConfirmQuantities[pid],
        reason: stockConfirmReason || undefined,
        timestamp,
        status: '已完成',
        warehouseId: stockConfirmWarehouseId || undefined,
        partner: partnerForRecord,
        docNo
      } as ProductionOpRecord));
      if (onAddRecordBatch && batch.length > 1) {
        await onAddRecordBatch(batch);
      } else {
        for (const rec of batch) await onAddRecord(rec);
      }
      setStockDocDetail({
        docNo,
        type: recordType,
        orderId: stockSelectOrderId,
        timestamp,
        warehouseId: stockConfirmWarehouseId || '',
        lines: toSubmit.map(pid => ({ productId: pid, quantity: stockConfirmQuantities[pid] })),
        reason: stockConfirmReason || undefined,
        operator: '',
        partner: partnerForRecord,
      });
    } else return;
    setShowStockConfirmModal(false);
    setStockSelectOrderId(null);
    setStockSelectSourceProductId(null);
    setStockSelectPartner(null);
    setStockSelectMode(null);
    setStockSelectedIds(new Set());
    setStockConfirmQuantities({});
    setStockConfirmReason('');
  };

  return (
    <div className="space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>生产物料</h1>
          <p className={pageSubtitleClass}>物料下发与库存扣减</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
        {!showModal && (
            <div className="relative w-full sm:w-56 sm:max-w-xs order-last sm:order-none">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                placeholder="搜索产品、工单号、客户、物料..."
                value={materialSearch}
                onChange={e => setMaterialSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>
        )}
        <div className="flex flex-wrap items-center gap-2 justify-end">
        {!showModal && hasOpsPerm(tenantRole, userPermissions, 'production:material_records:view') && (
            <button
              type="button"
              onClick={() => setShowStockFlowModal(true)}
              className={outlineAccentToolbarButtonClass}
            >
              <ScrollText className="w-4 h-4 shrink-0" />
              领料退料流水
            </button>
        )}
        {!showModal && hasOpsPerm(tenantRole, userPermissions, 'production:material_form_config:allow') && (
            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              className={outlineAccentToolbarButtonClass}
            >
              <Sliders className="w-4 h-4 shrink-0" />
              表单配置
            </button>
        )}
        </div>
        </div>
      </div>

      {!showModal && !canViewMainList && (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
          <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">无权限查看生产物料列表</p>
        </div>
      )}
      {!showModal && canViewMainList && (
        <div className="space-y-4">
          {materialPanelSettings.groupByOutsourcePartner && partnerGroupsForDisplay ? (
            (() => {
              if (partnerGroupsForDisplay.length === 0) {
                return (
                  <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
                    <p className="text-slate-400 text-sm">{materialKw ? '无匹配项，请调整搜索条件' : '暂无物料数据'}</p>
                  </div>
                );
              }
              const totalPartnerPages = Math.max(1, Math.ceil(partnerGroupsForDisplay.length / PAGE_SIZE));
              const pagedPartners = partnerGroupsForDisplay.slice((stockPage - 1) * PAGE_SIZE, stockPage * PAGE_SIZE);

              return (<>
                {pagedPartners.map(({ partnerKey, partnerLabel, data }) => {
                  const entries = Array.from(data.entries());
                  return (
                    <div key={partnerKey} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                      <div className={`px-6 py-3 border-b border-slate-100 flex items-center gap-3 ${partnerKey === '__internal__' ? 'bg-slate-50' : 'bg-gradient-to-r from-indigo-50/80 to-white'}`}>
                        <Building2 className={`w-5 h-5 ${partnerKey === '__internal__' ? 'text-slate-400' : 'text-indigo-500'}`} />
                        <span className="text-sm font-black text-slate-700">{partnerLabel}</span>
                        <span className="text-[10px] text-slate-400 font-medium">({entries.length} 项)</span>
                      </div>
                      <div className="p-4 space-y-3">
                        {entries.map(([scopeKey, materials]) => {
                          if (productionLinkMode === 'product') {
                            const fp = idx.productsById.get(scopeKey);
                            const selecting = stockSelectSourceProductId === scopeKey && stockSelectPartner === partnerKey && !!stockSelectMode;
                            const displayMaterials = displayMaterialsForSearch(materials);
                            return (
                              <div key={scopeKey} className="rounded-2xl border border-slate-100 overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-50 flex flex-wrap items-center justify-between gap-3 bg-white">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <Package className="w-4 h-4 text-indigo-400 shrink-0" />
                                    <p className="text-sm font-bold text-slate-800 truncate">{fp?.name ?? '—'}{fp?.sku ? <span className="text-slate-400 font-medium text-xs ml-2">{fp.sku}</span> : null}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {selecting ? (
                                      <>
                                        <span className="text-xs font-bold text-slate-500">已选 {stockSelectedIds.size} 项</span>
                                        <button type="button" onClick={() => { if (stockSelectedIds.size === 0) return; setStockConfirmQuantities({}); setStockConfirmWarehouseId(warehouses[0]?.id ?? ''); setShowStockConfirmModal(true); }} disabled={stockSelectedIds.size === 0} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-sm disabled:opacity-50 ${stockSelectMode === 'stock_out' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}><Check className="w-3 h-3" /> {stockSelectMode === 'stock_out' ? '确认领料' : '确认退料'}</button>
                                        <button type="button" onClick={() => { setStockSelectSourceProductId(null); setStockSelectPartner(null); setStockSelectMode(null); setStockSelectedIds(new Set()); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">取消</button>
                                      </>
                                    ) : (
                                      <>
                                        {hasOpsPerm(tenantRole, userPermissions, 'production:material_issue:allow') && (
                                          <button type="button" onClick={() => { setStockSelectSourceProductId(scopeKey); setStockSelectOrderId(null); setStockSelectPartner(partnerKey); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"><ArrowUpFromLine className="w-3 h-3" /> 领料</button>
                                        )}
                                        {hasOpsPerm(tenantRole, userPermissions, 'production:material_return:allow') && (
                                          <button type="button" onClick={() => { setStockSelectSourceProductId(scopeKey); setStockSelectOrderId(null); setStockSelectPartner(partnerKey); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"><Undo2 className="w-3 h-3" /> 退料</button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                                <MaterialStatsTable materials={displayMaterials} selecting={selecting} compact selectedIds={stockSelectedIds} onSelectAll={setStockSelectedIds} onToggleSelect={toggleSelect} productsById={idx.productsById} />
                              </div>
                            );
                          } else {
                            const order = idx.ordersById.get(scopeKey);
                            if (!order) return null;
                            const product = idx.productsById.get(order.productId);
                            const selecting = stockSelectOrderId === scopeKey && stockSelectPartner === partnerKey && !!stockSelectMode;
                            const displayMaterials = displayMaterialsForSearch(materials);
                            return (
                              <div key={scopeKey} className="rounded-2xl border border-slate-100 overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-50 flex flex-wrap items-center justify-between gap-3 bg-white">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <Layers className="w-4 h-4 text-slate-400 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-bold text-slate-400 truncate">{order.orderNumber}</p>
                                      <p className="text-sm font-bold text-slate-800 truncate">{product?.name ?? order.productName ?? '—'}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {selecting ? (
                                      <>
                                        <span className="text-xs font-bold text-slate-500">已选 {stockSelectedIds.size} 项</span>
                                        <button type="button" onClick={() => { if (stockSelectedIds.size === 0) return; setStockConfirmQuantities({}); setStockConfirmWarehouseId(warehouses[0]?.id ?? ''); setShowStockConfirmModal(true); }} disabled={stockSelectedIds.size === 0} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-sm disabled:opacity-50 ${stockSelectMode === 'stock_out' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}><Check className="w-3 h-3" /> {stockSelectMode === 'stock_out' ? '确认领料' : '确认退料'}</button>
                                        <button type="button" onClick={() => { setStockSelectOrderId(null); setStockSelectPartner(null); setStockSelectMode(null); setStockSelectedIds(new Set()); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">取消</button>
                                      </>
                                    ) : (
                                      <>
                                        {hasOpsPerm(tenantRole, userPermissions, 'production:material_issue:allow') && (
                                          <button type="button" onClick={() => { setStockSelectOrderId(scopeKey); setStockSelectSourceProductId(null); setStockSelectPartner(partnerKey); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"><ArrowUpFromLine className="w-3 h-3" /> 领料</button>
                                        )}
                                        {hasOpsPerm(tenantRole, userPermissions, 'production:material_return:allow') && (
                                          <button type="button" onClick={() => { setStockSelectOrderId(scopeKey); setStockSelectSourceProductId(null); setStockSelectPartner(partnerKey); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"><Undo2 className="w-3 h-3" /> 退料</button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                                <MaterialStatsTable materials={displayMaterials} selecting={selecting} compact selectedIds={stockSelectedIds} onSelectAll={setStockSelectedIds} onToggleSelect={toggleSelect} productsById={idx.productsById} />
                              </div>
                            );
                          }
                        })}
                      </div>
                    </div>
                  );
                })}
                {totalPartnerPages > 1 && (
                  <div className="flex items-center justify-center gap-3 py-4">
                    <span className="text-xs text-slate-400">共 {partnerGroupsForDisplay.length} 个加工厂，第 {stockPage} / {totalPartnerPages} 页</span>
                    <button type="button" disabled={stockPage <= 1} onClick={() => setStockPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">上一页</button>
                    <button type="button" disabled={stockPage >= totalPartnerPages} onClick={() => setStockPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">下一页</button>
                  </div>
                )}
              </>);
            })()
          ) : productionLinkMode === 'product' && productMaterialStatsByProduct ? (
            (() => {
              const pEntries = productEntriesForDisplay ?? [];
              if (pEntries.length === 0) {
                return (
                  <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
                    <p className="text-slate-400 text-sm">{materialKw ? '无匹配项，请调整搜索条件' : '暂无工单，请先在「生产计划」下达工单'}</p>
                  </div>
                );
              }
              const totalProductPages = Math.max(1, Math.ceil(pEntries.length / PAGE_SIZE));
              const pagedEntries = pEntries.slice((stockPage - 1) * PAGE_SIZE, stockPage * PAGE_SIZE);
              return (<>
              {pagedEntries.map(([fpId, materials]) => {
                const fp = idx.productsById.get(fpId);
                const orderCnt = (idx.rootOrdersByProductId.get(fpId) ?? []).length;
                const selecting = stockSelectSourceProductId === fpId && stockSelectMode;
                const displayMaterials = displayMaterialsForSearch(materials);
                return (
                  <div key={`fp-${fpId}`} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">关联产品（共 {orderCnt} 条工单）</p>
                          <p className="text-base font-bold text-slate-900 mt-0.5">{fp?.name ?? '—'}{fp?.sku ? <span className="text-slate-400 font-medium text-sm ml-2">{fp.sku}</span> : null}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selecting ? (
                          <>
                            <span className="text-sm font-bold text-slate-500">已选 {stockSelectedIds.size} 项</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (stockSelectedIds.size === 0) return;
                                setStockConfirmQuantities({});
                                setStockConfirmWarehouseId(warehouses[0]?.id ?? '');
                                setShowStockConfirmModal(true);
                              }}
                              disabled={stockSelectedIds.size === 0}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-sm disabled:opacity-50 ${stockSelectMode === 'stock_out' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                            >
                              <Check className="w-3.5 h-3.5" /> {stockSelectMode === 'stock_out' ? '确认领料' : '确认退料'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setStockSelectSourceProductId(null); setStockSelectMode(null); setStockSelectedIds(new Set()); }}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <>
                            {hasOpsPerm(tenantRole, userPermissions, 'production:material_issue:allow') && (
                            <button
                              type="button"
                              onClick={() => { setStockSelectSourceProductId(fpId); setStockSelectOrderId(null); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                            >
                              <ArrowUpFromLine className="w-3.5 h-3.5" /> 领料发出
                            </button>
                            )}
                            {hasOpsPerm(tenantRole, userPermissions, 'production:material_return:allow') && (
                            <button
                              type="button"
                              onClick={() => { setStockSelectSourceProductId(fpId); setStockSelectOrderId(null); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                            >
                              <Undo2 className="w-3.5 h-3.5" /> 生产退料
                            </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <MaterialStatsTable materials={displayMaterials} selecting={!!selecting} selectedIds={stockSelectedIds} onSelectAll={setStockSelectedIds} onToggleSelect={toggleSelect} productsById={idx.productsById} emptyMessage="该产品暂无 BOM 物料，请先在产品中配置 BOM" />
                </div>
              );
              })}
              {totalProductPages > 1 && (
                <div className="flex items-center justify-center gap-3 py-4">
                  <span className="text-xs text-slate-400">共 {pEntries.length} 项，第 {stockPage} / {totalProductPages} 页</span>
                  <button type="button" disabled={stockPage <= 1} onClick={() => setStockPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">上一页</button>
                  <button type="button" disabled={stockPage >= totalProductPages} onClick={() => setStockPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">下一页</button>
                </div>
              )}
              </>);
            })()
          ) : parentOrdersForDisplay.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <p className="text-slate-400 text-sm">
                {parentOrders.length === 0
                  ? '暂无工单，请先在「生产计划」下达工单'
                  : materialKw
                    ? '无匹配项，请调整搜索条件'
                    : '暂无工单，请先在「生产计划」下达工单'}
              </p>
            </div>
          ) : (
            (() => {
              const totalOrderPages = Math.max(1, Math.ceil(parentOrdersForDisplay.length / PAGE_SIZE));
              const pagedParentOrders = parentOrdersForDisplay.slice((stockPage - 1) * PAGE_SIZE, stockPage * PAGE_SIZE);
              return (<>
            {pagedParentOrders.map(order => {
              const product = idx.productsById.get(order.productId);
              const materials = parentMaterialStats.get(order.id) ?? [];
              const displayMaterials = displayMaterialsForSearch(materials);
              const familyIds = getOrderFamilyIds(orders, order.id, idx.childrenByParentId);
              const childCount = familyIds.length - 1;
              return (
                <div key={order.id} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          工单号: {order.orderNumber}
                          {childCount > 0 && <span className="ml-2 text-slate-400 font-normal">（含 {childCount} 个子工单）</span>}
                        </p>
                        {order.priority && order.priority !== 'Medium' && (
                          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[9px] font-bold ${order.priority === 'High' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {order.priority === 'High' ? 'HIGH' : 'LOW'}
                          </span>
                        )}
                        <p className="text-base font-bold text-slate-900 mt-0.5">{product?.name ?? order.productName ?? '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stockSelectOrderId === order.id && stockSelectMode ? (
                        <>
                          <span className="text-sm font-bold text-slate-500">已选 {stockSelectedIds.size} 项</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (stockSelectedIds.size === 0) return;
                              setStockConfirmQuantities({});
                              setStockConfirmWarehouseId(warehouses[0]?.id ?? '');
                              setShowStockConfirmModal(true);
                            }}
                            disabled={stockSelectedIds.size === 0}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-sm disabled:opacity-50 ${stockSelectMode === 'stock_out' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                          >
                            <Check className="w-3.5 h-3.5" /> {stockSelectMode === 'stock_out' ? '确认领料' : '确认退料'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(null); setStockSelectMode(null); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          {hasOpsPerm(tenantRole, userPermissions, 'production:material_issue:allow') && (
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(order.id); setStockSelectSourceProductId(null); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                          >
                            <ArrowUpFromLine className="w-3.5 h-3.5" /> 领料发出
                          </button>
                          )}
                          {hasOpsPerm(tenantRole, userPermissions, 'production:material_return:allow') && (
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(order.id); setStockSelectSourceProductId(null); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                          >
                            <Undo2 className="w-3.5 h-3.5" /> 生产退料
                          </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <MaterialStatsTable materials={displayMaterials} selecting={stockSelectOrderId === order.id && !!stockSelectMode} selectedIds={stockSelectedIds} onSelectAll={setStockSelectedIds} onToggleSelect={toggleSelect} productsById={idx.productsById} emptyMessage="该工单暂无 BOM 物料，请先在产品中配置 BOM" />
                </div>
              );
            })}
            {totalOrderPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-4">
                <span className="text-xs text-slate-400">共 {parentOrdersForDisplay.length} 条工单，第 {stockPage} / {totalOrderPages} 页</span>
                <button type="button" disabled={stockPage <= 1} onClick={() => setStockPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">上一页</button>
                <button type="button" disabled={stockPage >= totalOrderPages} onClick={() => setStockPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">下一页</button>
              </div>
            )}
            </>);
            })()
          )}
        </div>
      )}

      <StockConfirmModal
        visible={showStockConfirmModal}
        onClose={() => { setShowStockConfirmModal(false); setStockConfirmReason(''); }}
        onSubmit={handleStockConfirmSubmit}
        stockSelectMode={stockSelectMode}
        stockSelectOrderId={stockSelectOrderId}
        stockSelectSourceProductId={stockSelectSourceProductId}
        stockSelectedIds={stockSelectedIds}
        stockConfirmQuantities={stockConfirmQuantities}
        onQuantityChange={(pid, qty) => setStockConfirmQuantities(prev => ({ ...prev, [pid]: qty }))}
        stockConfirmWarehouseId={stockConfirmWarehouseId}
        onWarehouseChange={setStockConfirmWarehouseId}
        stockConfirmReason={stockConfirmReason}
        onReasonChange={setStockConfirmReason}
        orders={orders}
        products={products}
        warehouses={warehouses}
        dictionaries={dictionaries}
        partnerLabel={stockSelectPartner && stockSelectPartner !== '__internal__' ? stockSelectPartner : undefined}
      />

      <StockDocDetailModal
        detail={stockDocDetail}
        onClose={() => setStockDocDetail(null)}
        onDetailChange={setStockDocDetail}
        records={records}
        orders={orders}
        products={products}
        warehouses={warehouses}
        dictionaries={dictionaries}
        onUpdateRecord={onUpdateRecord}
        onDeleteRecord={onDeleteRecord}
        userPermissions={userPermissions}
        tenantRole={tenantRole}
      />

      <StockFlowListModal
        visible={showStockFlowModal}
        onClose={() => setShowStockFlowModal(false)}
        records={records}
        orders={orders}
        products={products}
        productionLinkMode={productionLinkMode}
        onOpenDocDetail={setStockDocDetail}
        userPermissions={userPermissions}
        tenantRole={tenantRole}
      />

      <StockMaterialFormModal
        visible={showModal}
        onClose={() => { setShowModal(false); setStockModalMode(null); }}
        stockModalMode={stockModalMode}
        orders={orders}
        products={products}
        warehouses={warehouses}
        productionLinkMode={productionLinkMode}
        onAddRecord={onAddRecord}
        getNextStockDocNo={getNextStockDocNo}
      />

      {showConfigModal && onUpdateMaterialPanelSettings && (
        <MaterialPanelConfigModal
          onClose={() => setShowConfigModal(false)}
          settings={materialPanelSettings}
          onUpdate={onUpdateMaterialPanelSettings}
        />
      )}
    </div>
  );
};

export default React.memo(StockMaterialPanel);
