/**
 * 工单 / 成品维度的生产物料统计（领料、退料、报工理论耗材）。
 * 从 StockMaterialPanel 抽离，供面板与工单详情页共用同一口径。
 */
import type {
  BOM,
  Product,
  ProductionOpRecord,
  ProductionOrder,
  ProductMilestoneProgress,
} from '../types';
import { getOrderFamilyIds } from '../views/production-ops/types';
import {
  applyMaterialBreakdown,
  resolveBomItems,
  type MatRow,
} from '../views/production-ops/stockMaterialPanelHelpers';
import type { DataIndexes } from '../views/production-ops/useDataIndexes';

type MatAcc = { issue: number; returnQty: number; theoryCost: number; actualCost: number };

const emptyAcc = (): MatAcc => ({ issue: 0, returnQty: 0, theoryCost: 0, actualCost: 0 });

function matMapToRows(prodMap: Map<string, MatAcc>): MatRow[] {
  return Array.from(prodMap.entries()).map(([productId, v]) => ({ productId, ...v }));
}

function resolveOrderRootId(orderId: string, ordersById: Map<string, ProductionOrder>): string {
  let cur = orderId;
  for (let i = 0; i < 24; i++) {
    const o = ordersById.get(cur);
    if (!o) return cur;
    if (!o.parentOrderId) return o.id;
    cur = o.parentOrderId;
  }
  return cur;
}

function finishedProductHasBom(
  fpId: string,
  productsById: Map<string, Product>,
  bomsById: Map<string, BOM>,
  bomsByParentProduct: Map<string, BOM[]>,
): boolean {
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
}

/** 单父工单族：领退料 + 报工理论耗材（含 BOM 全部子物料，无流水时也展示 0 行） */
export function computeOrderFamilyMaterialStats(params: {
  rootOrderId: string;
  orders: ProductionOrder[];
  productsById: Map<string, Product>;
  bomsById: Map<string, BOM>;
  bomsByParentProduct: Map<string, BOM[]>;
  childrenByParentId: Map<string, ProductionOrder[]>;
  stockRecords: ProductionOpRecord[];
  nodeWeightEnabledMap: Map<string, boolean>;
}): MatRow[] {
  const {
    rootOrderId,
    orders,
    productsById,
    bomsById,
    bomsByParentProduct,
    childrenByParentId,
    stockRecords,
    nodeWeightEnabledMap,
  } = params;

  const familyIds = new Set(getOrderFamilyIds(orders, rootOrderId, childrenByParentId));
  const prodMap = new Map<string, MatAcc>();

  const addTheory = (bi: { productId: string; quantity: number }, qty: number) => {
    const theory = Number(bi.quantity) * qty;
    if (!prodMap.has(bi.productId)) prodMap.set(bi.productId, emptyAcc());
    prodMap.get(bi.productId)!.theoryCost += theory;
  };
  // 走 applyMaterialBreakdown（开启称重的工序）：按实际称重计入 actualCost
  const addActual = (productId: string, amount: number) => {
    if (!prodMap.has(productId)) prodMap.set(productId, emptyAcc());
    prodMap.get(productId)!.actualCost += amount;
  };

  const familyOrders = orders.filter(o => familyIds.has(o.id));
  familyOrders.forEach(ord => {
    const ordProduct = productsById.get(ord.productId);
    const variants = ordProduct?.variants ?? [];
    const bestMsIdx = ord.milestones.reduce(
      (bi, ms, i) => (ms.completedQuantity > (ord.milestones[bi]?.completedQuantity ?? 0) ? i : bi),
      0,
    );
    const bestMs = ord.milestones[bestMsIdx];
    const variantCompletedMap = new Map<string, number>();
    let totalCompleted = 0;
    if (bestMs) {
      const bestMsWeightOn = !!nodeWeightEnabledMap.get(bestMs.templateId);
      (bestMs.reports || []).forEach(r => {
        if (applyMaterialBreakdown(r, addActual, bestMsWeightOn)) return;
        const qty = Number(r.quantity);
        totalCompleted += qty;
        const vid = r.variantId ?? '';
        variantCompletedMap.set(vid, (variantCompletedMap.get(vid) ?? 0) + qty);
      });
    } else {
      totalCompleted = ord.milestones.reduce((max, ms) => Math.max(max, ms.completedQuantity), 0);
    }

    const hasReportQtyForAnyProductVariant = variants.some(v => (variantCompletedMap.get(v.id) ?? 0) > 0);
    if (variants.length > 0 && variantCompletedMap.size > 0 && hasReportQtyForAnyProductVariant) {
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
        } else if (ordProduct) {
          (bomsByParentProduct.get(ordProduct.id) ?? [])
            .filter(b => b.variantId === v.id && b.nodeId)
            .forEach(bom => {
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
        (bomsByParentProduct.get(ordProduct.id) ?? [])
          .filter(b => b.nodeId)
          .forEach(bom => {
            bom.items.forEach(bi => addTheory(bi, totalCompleted));
          });
      }
    } else if (ordProduct) {
      (bomsByParentProduct.get(ordProduct.id) ?? [])
        .filter(b => b.nodeId)
        .forEach(bom => {
          bom.items.forEach(bi => addTheory(bi, totalCompleted));
        });
    }
  });

  for (const r of stockRecords) {
    if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') continue;
    if (!r.orderId || !familyIds.has(r.orderId)) continue;
    if (!prodMap.has(r.productId)) prodMap.set(r.productId, emptyAcc());
    const cur = prodMap.get(r.productId)!;
    if (r.type === 'STOCK_OUT') cur.issue += r.quantity;
    else cur.returnQty += r.quantity;
  }

  return matMapToRows(prodMap);
}

/** 所有父工单的物料统计 Map（StockMaterialPanel 工单模式列表用） */
export function computeAllParentMaterialStats(params: {
  orders: ProductionOrder[];
  idx: Pick<DataIndexes, 'productsById' | 'bomsById' | 'bomsByParentProduct' | 'childrenByParentId'>;
  stockRecords: ProductionOpRecord[];
  nodeWeightEnabledMap: Map<string, boolean>;
}): Map<string, MatRow[]> {
  const { orders, idx, stockRecords, nodeWeightEnabledMap } = params;
  const result = new Map<string, MatRow[]>();
  const parentList = orders.filter(o => !o.parentOrderId);
  for (const parent of parentList) {
    result.set(
      parent.id,
      computeOrderFamilyMaterialStats({
        rootOrderId: parent.id,
        orders,
        productsById: idx.productsById,
        bomsById: idx.bomsById,
        bomsByParentProduct: idx.bomsByParentProduct,
        childrenByParentId: idx.childrenByParentId,
        stockRecords,
        nodeWeightEnabledMap,
      }),
    );
  }
  return result;
}

/** 关联产品模式：按成品 id 聚合物料统计 */
export function computeProductMaterialStats(params: {
  productId: string;
  orders: ProductionOrder[];
  idx: Pick<
    DataIndexes,
    | 'productsById'
    | 'bomsById'
    | 'bomsByParentProduct'
    | 'childrenByParentId'
    | 'rootOrdersByProductId'
    | 'ordersByProductId'
    | 'ordersById'
  >;
  stockRecords: ProductionOpRecord[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  nodeWeightEnabledMap: Map<string, boolean>;
}): MatRow[] {
  const { productId: fpId, orders, idx, stockRecords, productMilestoneProgresses, nodeWeightEnabledMap } = params;
  const { productsById, bomsById, bomsByParentProduct, childrenByParentId, rootOrdersByProductId, ordersByProductId, ordersById } = idx;

  const roots = rootOrdersByProductId.get(fpId) ?? [];
  const ordersForThisProduct = ordersByProductId.get(fpId) ?? [];
  const allFamilyIds = new Set<string>();
  if (roots.length > 0) {
    roots.forEach(p => getOrderFamilyIds(orders, p.id, childrenByParentId).forEach(id => allFamilyIds.add(id)));
  } else {
    ordersForThisProduct.forEach(o => {
      const rootId = resolveOrderRootId(o.id, ordersById);
      getOrderFamilyIds(orders, rootId, childrenByParentId).forEach(id => allFamilyIds.add(id));
    });
  }

  const prodMap = new Map<string, MatAcc>();
  const fpProduct = productsById.get(fpId);

  // 开启称重的工序经 applyMaterialBreakdown 走此处，按实际称重计入 actualCost
  const addActual = (materialProductId: string, amount: number) => {
    if (!prodMap.has(materialProductId)) prodMap.set(materialProductId, emptyAcc());
    prodMap.get(materialProductId)!.actualCost += amount;
  };
  // 未开启称重的工序按「BOM × 件数」走此处，计入 theoryCost
  const addTheory = (materialProductId: string, amount: number) => {
    if (!prodMap.has(materialProductId)) prodMap.set(materialProductId, emptyAcc());
    prodMap.get(materialProductId)!.theoryCost += amount;
  };
  const applyBomForNode = (nodeId: string, variantId: string, qty: number) => {
    if (!fpProduct || qty <= 0 || !nodeId) return false;
    const bomItems = resolveBomItems(productsById, bomsById, bomsByParentProduct, fpId, nodeId, variantId || undefined);
    if (bomItems.length === 0) return false;
    for (const bi of bomItems) addTheory(bi.productId, Number(bi.quantity) * qty);
    return true;
  };

  let usedPmp = false;
  if (productMilestoneProgresses.length > 0) {
    const pmpForProduct = productMilestoneProgresses.filter(p => p.productId === fpId);
    for (const p of pmpForProduct) {
      const nodeId = p.milestoneTemplateId;
      const nodeWeightOn = !!nodeWeightEnabledMap.get(nodeId);
      const byVid = new Map<string, number>();
      for (const r of p.reports ?? []) {
        if (applyMaterialBreakdown(r, addActual, nodeWeightOn)) {
          usedPmp = true;
          continue;
        }
        const qty = Number(r.quantity) || 0;
        if (qty <= 0) continue;
        const vid = r.variantId ?? p.variantId ?? '';
        byVid.set(vid, (byVid.get(vid) ?? 0) + qty);
      }
      for (const [vid, qty] of byVid.entries()) {
        if (applyBomForNode(nodeId, vid, qty)) usedPmp = true;
      }
    }
  }

  if (!usedPmp) {
    const accumulateMilestoneForOrder = (ord: ProductionOrder) => {
      for (const ms of ord.milestones) {
        if (!ms?.templateId) continue;
        const msWeightOn = !!nodeWeightEnabledMap.get(ms.templateId);
        const byVid = new Map<string, number>();
        for (const r of ms.reports ?? []) {
          if (applyMaterialBreakdown(r, addActual, msWeightOn)) continue;
          const qty = Number(r.quantity) || 0;
          if (qty <= 0) continue;
          const vid = r.variantId ?? '';
          byVid.set(vid, (byVid.get(vid) ?? 0) + qty);
        }
        for (const [vid, qty] of byVid.entries()) {
          applyBomForNode(ms.templateId, vid, qty);
        }
      }
    };
    if (roots.length > 0) {
      roots.forEach(parent => {
        const familyIds = new Set(getOrderFamilyIds(orders, parent.id, childrenByParentId));
        orders.filter(o => familyIds.has(o.id)).forEach(accumulateMilestoneForOrder);
      });
    } else {
      ordersForThisProduct.forEach(accumulateMilestoneForOrder);
    }
  }

  for (const r of stockRecords) {
    if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') continue;
    const bySource = r.sourceProductId === fpId;
    const byOrder = r.orderId && allFamilyIds.has(r.orderId);
    if (!bySource && !byOrder) continue;
    if (!prodMap.has(r.productId)) prodMap.set(r.productId, emptyAcc());
    const cur = prodMap.get(r.productId)!;
    if (r.type === 'STOCK_OUT') cur.issue += r.quantity;
    else cur.returnQty += r.quantity;
  }

  return matMapToRows(prodMap);
}

/** 所有有 BOM 成品的物料统计 Map（StockMaterialPanel 产品模式列表用） */
export function computeAllProductMaterialStats(params: {
  orders: ProductionOrder[];
  idx: Pick<
    DataIndexes,
    | 'productsById'
    | 'bomsById'
    | 'bomsByParentProduct'
    | 'childrenByParentId'
    | 'rootOrdersByProductId'
    | 'ordersByProductId'
    | 'ordersById'
  >;
  stockRecords: ProductionOpRecord[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  nodeWeightEnabledMap: Map<string, boolean>;
}): Map<string, MatRow[]> {
  const { orders, idx, stockRecords, productMilestoneProgresses, nodeWeightEnabledMap } = params;
  const result = new Map<string, MatRow[]>();
  const finishedIds = ([...new Set(orders.map(o => o.productId))] as string[])
    .filter(Boolean)
    .filter(fpId => finishedProductHasBom(fpId, idx.productsById, idx.bomsById, idx.bomsByParentProduct));
  for (const fpId of finishedIds) {
    result.set(
      fpId,
      computeProductMaterialStats({
        productId: fpId,
        orders,
        idx,
        stockRecords,
        productMilestoneProgresses,
        nodeWeightEnabledMap,
      }),
    );
  }
  return result;
}

/** 从任意工单 id 解析父工单根 id（详情页子工单与父工单展示同一族统计） */
export function resolveRootOrderIdForMaterial(
  orderId: string,
  orders: ProductionOrder[],
): string {
  const ordersById = new Map(orders.map(o => [o.id, o]));
  let cur = orderId;
  for (let i = 0; i < 24; i++) {
    const o = ordersById.get(cur);
    if (!o) return cur;
    if (!o.parentOrderId) return o.id;
    cur = o.parentOrderId;
  }
  return cur;
}
