import type { TenantPrismaClient } from '../lib/prisma.js';

import {
  isWeightPurchaseUnit,
  type MaterialBreakdownRowIn,
} from '../../../shared/productMaterialConsumableCost.js';

type MatAcc = {
  issue: number;
  returnQty: number;
  theoryCost: number;
  actualCostKg: number;
  actualCostTheoryQty: number;
};

type BomWithItems = {
  id: string;
  parentProductId: string;
  variantId: string | null;
  nodeId: string | null;
  items: { productId: string; quantity: unknown }[];
};

type ProductWithVariants = {
  id: string;
  unitId: string | null;
  variants: { id: string; nodeBoms: unknown }[];
};

type MaterialBreakdownRow = MaterialBreakdownRowIn;

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyAcc(): MatAcc {
  return { issue: 0, returnQty: 0, theoryCost: 0, actualCostKg: 0, actualCostTheoryQty: 0 };
}

function parseBreakdown(raw: unknown): MaterialBreakdownRow[] {
  if (!Array.isArray(raw)) return [];
  return raw as MaterialBreakdownRow[];
}

function matRowReportQtyInPurchaseUnit(
  row: MatAcc,
  materialId: string,
  unitNameById: Map<string, string>,
  materialUnitIdByProduct: Map<string, string | null>,
): number {
  const unitId = materialUnitIdByProduct.get(materialId);
  const unitName = unitId ? (unitNameById.get(unitId) ?? '') : '';
  const actualPart = isWeightPurchaseUnit(unitName) ? row.actualCostKg : row.actualCostTheoryQty;
  return round2(row.theoryCost + actualPart);
}

function getOrderFamilyIds(
  orders: { id: string; parentOrderId: string | null }[],
  parentId: string,
  childrenByParentId: Map<string, { id: string; parentOrderId: string | null }[]>,
): string[] {
  const ids: string[] = [parentId];
  const queue = [parentId];
  while (queue.length > 0) {
    const pid = queue.shift()!;
    for (const o of childrenByParentId.get(pid) ?? []) {
      ids.push(o.id);
      queue.push(o.id);
    }
  }
  return ids;
}

function resolveOrderRootId(
  orderId: string,
  ordersById: Map<string, { id: string; parentOrderId: string | null }>,
): string {
  let cur = orderId;
  for (let i = 0; i < 24; i++) {
    const o = ordersById.get(cur);
    if (!o) return cur;
    if (!o.parentOrderId) return o.id;
    cur = o.parentOrderId;
  }
  return cur;
}

function resolveBomItems(
  productsById: Map<string, ProductWithVariants>,
  bomsById: Map<string, BomWithItems>,
  bomsByParentProduct: Map<string, BomWithItems[]>,
  productId: string,
  nodeId: string,
  variantId?: string | null,
): { productId: string; quantity: number }[] {
  const product = productsById.get(productId);
  if (!product) return [];
  const items: { productId: string; quantity: number }[] = [];
  const variants = product.variants ?? [];

  if (variantId && variants.length > 0) {
    const v = variants.find(vv => vv.id === variantId);
    if (v?.nodeBoms && typeof v.nodeBoms === 'object') {
      const bomId = (v.nodeBoms as Record<string, string>)[nodeId];
      if (bomId) {
        const bom = bomsById.get(bomId);
        if (bom) {
          bom.items.forEach(bi => items.push({ productId: bi.productId, quantity: num(bi.quantity) }));
          return items;
        }
      }
    }
    (bomsByParentProduct.get(product.id) ?? [])
      .filter(b => b.nodeId === nodeId && b.variantId === variantId)
      .forEach(bom => bom.items.forEach(bi => items.push({ productId: bi.productId, quantity: num(bi.quantity) })));
    if (items.length > 0) return items;
  }

  (bomsByParentProduct.get(product.id) ?? [])
    .filter(b => b.nodeId === nodeId)
    .forEach(bom => bom.items.forEach(bi => items.push({ productId: bi.productId, quantity: num(bi.quantity) })));
  return items;
}

function applyMaterialBreakdownPurchaseUnit(
  breakdown: unknown,
  weightEnabled: boolean,
  addActualKg: (productId: string, amount: number) => void,
  addActualTheoryQty: (productId: string, amount: number) => void,
): boolean {
  if (!weightEnabled) return false;
  const mb = parseBreakdown(breakdown);
  if (mb.length === 0) return false;
  for (const row of mb) {
    const pid = row.materialProductId;
    if (!pid) continue;
    const aw = num(row.actualWeight);
    const tq = num(row.theoreticalQty);
    if (aw > 0) addActualKg(pid, aw);
    if (tq > 0) addActualTheoryQty(pid, tq);
  }
  return true;
}

async function extendPriceMap(
  db: TenantPrismaClient,
  priceMap: Map<string, number>,
  materialIds: string[],
): Promise<Map<string, number>> {
  const missing = [...new Set(materialIds.filter(id => id && !priceMap.has(id)))];
  if (missing.length === 0) return priceMap;

  const [products, purchaseBills] = await Promise.all([
    db.product.findMany({
      where: { id: { in: missing } },
      select: { id: true, purchasePrice: true },
    }),
    db.psiRecord.findMany({
      where: {
        productId: { in: missing },
        type: 'PURCHASE_BILL',
        purchasePrice: { not: null },
        quantity: { not: null },
      },
      select: { productId: true, quantity: true, purchasePrice: true },
    }),
  ]);

  const weighted = new Map<string, { totalQty: number; totalAmount: number }>();
  for (const r of purchaseBills) {
    if (!r.productId) continue;
    const qty = num(r.quantity);
    const price = num(r.purchasePrice);
    if (qty === 0 || !(price > 0)) continue;
    const prev = weighted.get(r.productId) ?? { totalQty: 0, totalAmount: 0 };
    prev.totalQty += qty;
    prev.totalAmount += qty * price;
    weighted.set(r.productId, prev);
  }

  const extended = new Map(priceMap);
  for (const id of missing) {
    const agg = weighted.get(id);
    if (agg && agg.totalQty > 0) {
      extended.set(id, agg.totalAmount / agg.totalQty);
      continue;
    }
    const fallback = num(products.find(p => p.id === id)?.purchasePrice);
    if (fallback > 0) extended.set(id, fallback);
  }
  return extended;
}

type OrderWithMilestones = {
  id: string;
  productId: string;
  parentOrderId: string | null;
  milestones: {
    templateId: string;
    reports: { quantity: unknown; variantId: string | null; materialBreakdown: unknown }[];
  }[];
};

function computeProductMaterialRows(params: {
  fpId: string;
  orders: OrderWithMilestones[];
  pmps: {
    productId: string;
    milestoneTemplateId: string;
    variantId: string | null;
    reports: { quantity: unknown; variantId: string | null; materialBreakdown: unknown }[];
  }[];
  stockRecords: {
    type: string;
    orderId: string | null;
    productId: string;
    quantity: unknown;
    sourceProductId: string | null;
  }[];
  productsById: Map<string, ProductWithVariants>;
  bomsById: Map<string, BomWithItems>;
  bomsByParentProduct: Map<string, BomWithItems[]>;
  childrenByParentId: Map<string, OrderWithMilestones[]>;
  rootOrdersByProductId: Map<string, OrderWithMilestones[]>;
  ordersByProductId: Map<string, OrderWithMilestones[]>;
  ordersById: Map<string, { id: string; parentOrderId: string | null }>;
  nodeWeightEnabledMap: Map<string, boolean>;
}): Map<string, MatAcc> {
  const {
    fpId,
    orders,
    pmps,
    stockRecords,
    productsById,
    bomsById,
    bomsByParentProduct,
    childrenByParentId,
    rootOrdersByProductId,
    ordersByProductId,
    ordersById,
    nodeWeightEnabledMap,
  } = params;

  const prodMap = new Map<string, MatAcc>();
  const fpProduct = productsById.get(fpId);

  const addActualKg = (materialProductId: string, amount: number) => {
    if (!prodMap.has(materialProductId)) prodMap.set(materialProductId, emptyAcc());
    prodMap.get(materialProductId)!.actualCostKg += amount;
  };
  const addActualTheoryQty = (materialProductId: string, amount: number) => {
    if (!prodMap.has(materialProductId)) prodMap.set(materialProductId, emptyAcc());
    prodMap.get(materialProductId)!.actualCostTheoryQty += amount;
  };
  const addTheory = (materialProductId: string, amount: number) => {
    if (!prodMap.has(materialProductId)) prodMap.set(materialProductId, emptyAcc());
    prodMap.get(materialProductId)!.theoryCost += amount;
  };

  const applyBomForNode = (nodeId: string, variantId: string, qty: number) => {
    if (!fpProduct || qty <= 0 || !nodeId) return false;
    const bomItems = resolveBomItems(productsById, bomsById, bomsByParentProduct, fpId, nodeId, variantId || undefined);
    if (bomItems.length === 0) return false;
    for (const bi of bomItems) addTheory(bi.productId, bi.quantity * qty);
    return true;
  };

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

  let usedPmp = false;
  const pmpForProduct = pmps.filter(p => p.productId === fpId);
  for (const p of pmpForProduct) {
    const nodeId = p.milestoneTemplateId;
    const nodeWeightOn = !!nodeWeightEnabledMap.get(nodeId);
    const byVid = new Map<string, number>();
    for (const r of p.reports ?? []) {
      if (
        applyMaterialBreakdownPurchaseUnit(
          r.materialBreakdown,
          nodeWeightOn,
          addActualKg,
          addActualTheoryQty,
        )
      ) {
        usedPmp = true;
        continue;
      }
      const qty = num(r.quantity);
      if (qty <= 0) continue;
      const vid = r.variantId ?? p.variantId ?? '';
      byVid.set(vid, (byVid.get(vid) ?? 0) + qty);
    }
    for (const [vid, qty] of byVid.entries()) {
      if (applyBomForNode(nodeId, vid, qty)) usedPmp = true;
    }
  }

  if (!usedPmp) {
    const accumulateMilestoneForOrder = (ord: (typeof orders)[number]) => {
      for (const ms of ord.milestones) {
        if (!ms?.templateId) continue;
        const msWeightOn = !!nodeWeightEnabledMap.get(ms.templateId);
        const byVid = new Map<string, number>();
        for (const r of ms.reports ?? []) {
          if (
            applyMaterialBreakdownPurchaseUnit(
              r.materialBreakdown,
              msWeightOn,
              addActualKg,
              addActualTheoryQty,
            )
          ) {
            continue;
          }
          const qty = num(r.quantity);
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
    if (r.type === 'STOCK_OUT') cur.issue += num(r.quantity);
    else cur.returnQty += num(r.quantity);
  }

  return prodMap;
}

function surplusAmountFromMatRows(
  prodMap: Map<string, MatAcc>,
  unitNameById: Map<string, string>,
  materialUnitIdByProduct: Map<string, string | null>,
  priceMap: Map<string, number>,
): number {
  let total = 0;
  for (const [materialId, row] of prodMap.entries()) {
    const net = round2(row.issue - row.returnQty);
    const reportQty = matRowReportQtyInPurchaseUnit(row, materialId, unitNameById, materialUnitIdByProduct);
    const balance = Math.max(0, round2(net - reportQty));
    if (!(balance > 0)) continue;
    total += balance * (priceMap.get(materialId) ?? 0);
  }
  return round2(total);
}

/**
 * 按成品 id 聚合「物料结余（损耗）」金额。
 * 口径对齐生产物料面板：结余 = max(0, 净领用 − 报工耗材)；报工耗材 = theoryCost + actual（统一到采购单位）。
 */
export async function computeMaterialSurplusLossByProduct(
  db: TenantPrismaClient,
  finishedProductIds: string[],
  basePriceMap: Map<string, number>,
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(finishedProductIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const [orders, pmps, stockRecords, globalNodes, units, boms, finishedProducts] = await Promise.all([
    db.productionOrder.findMany({
      select: {
        id: true,
        productId: true,
        parentOrderId: true,
        milestones: {
          select: {
            templateId: true,
            reports: {
              select: { quantity: true, variantId: true, materialBreakdown: true },
            },
          },
        },
      },
    }),
    db.productMilestoneProgress.findMany({
      where: { productId: { in: uniqueIds } },
      select: {
        productId: true,
        milestoneTemplateId: true,
        variantId: true,
        reports: {
          select: { quantity: true, variantId: true, materialBreakdown: true },
        },
      },
    }),
    db.productionOpRecord.findMany({
      where: { type: { in: ['STOCK_OUT', 'STOCK_RETURN'] } },
      select: {
        type: true,
        orderId: true,
        productId: true,
        quantity: true,
        sourceProductId: true,
      },
    }),
    db.globalNodeTemplate.findMany({
      select: { id: true, enableWeightOnReport: true },
    }),
    db.dictionaryItem.findMany({
      where: { type: 'unit' },
      select: { id: true, name: true },
    }),
    db.bom.findMany({
      where: { parentProductId: { in: uniqueIds } },
      include: { items: true },
    }),
    db.product.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        unitId: true,
        variants: { select: { id: true, nodeBoms: true } },
      },
    }),
  ]);

  const nodeWeightEnabledMap = new Map(
    globalNodes.map(n => [n.id, n.enableWeightOnReport]),
  );
  const unitNameById = new Map(units.map(u => [u.id, u.name]));

  const bomsById = new Map(boms.map(b => [b.id, b as BomWithItems]));
  const bomsByParentProduct = new Map<string, BomWithItems[]>();
  for (const b of boms) {
    const list = bomsByParentProduct.get(b.parentProductId) ?? [];
    list.push(b as BomWithItems);
    bomsByParentProduct.set(b.parentProductId, list);
  }

  const materialIdsFromBoms = boms.flatMap(b => b.items.map(i => i.productId));
  const materialIdsFromStock = stockRecords.map(r => r.productId);
  const priceMap = await extendPriceMap(
    db,
    basePriceMap,
    [...materialIdsFromBoms, ...materialIdsFromStock],
  );

  const productsById = new Map<string, ProductWithVariants>();
  for (const p of finishedProducts) productsById.set(p.id, p);

  const materialUnitIds = [...new Set([...materialIdsFromBoms, ...materialIdsFromStock])];
  if (materialUnitIds.length > 0) {
    const materialProducts = await db.product.findMany({
      where: { id: { in: materialUnitIds } },
      select: { id: true, unitId: true, variants: { select: { id: true, nodeBoms: true } } },
    });
    for (const p of materialProducts) productsById.set(p.id, p);
  }

  const materialUnitIdByProduct = new Map<string, string | null>();
  for (const [id, p] of productsById.entries()) {
    materialUnitIdByProduct.set(id, p.unitId);
  }

  const childrenByParentId = new Map<string, OrderWithMilestones[]>();
  const rootOrdersByProductId = new Map<string, OrderWithMilestones[]>();
  const ordersByProductId = new Map<string, OrderWithMilestones[]>();
  const ordersById = new Map(orders.map(o => [o.id, o]));

  for (const o of orders) {
    if (o.parentOrderId) {
      const list = childrenByParentId.get(o.parentOrderId) ?? [];
      list.push(o);
      childrenByParentId.set(o.parentOrderId, list);
    }
    if (!o.parentOrderId) {
      const list = rootOrdersByProductId.get(o.productId) ?? [];
      list.push(o);
      rootOrdersByProductId.set(o.productId, list);
    }
    const byProd = ordersByProductId.get(o.productId) ?? [];
    byProd.push(o);
    ordersByProductId.set(o.productId, byProd);
  }

  const result = new Map<string, number>();
  for (const fpId of uniqueIds) {
    const prodMap = computeProductMaterialRows({
      fpId,
      orders,
      pmps,
      stockRecords,
      productsById,
      bomsById,
      bomsByParentProduct,
      childrenByParentId,
      rootOrdersByProductId,
      ordersByProductId,
      ordersById,
      nodeWeightEnabledMap,
    });
    result.set(
      fpId,
      surplusAmountFromMatRows(prodMap, unitNameById, materialUnitIdByProduct, priceMap),
    );
  }

  return result;
}
