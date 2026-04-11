import type { ProductionOrder, ProductionOpRecord, ProductMilestoneProgress } from '../types';
import { pmpCompletedAtTemplate, sumBlockOrderQty } from './productReportAggregates';

export type PendingStockComputeItem = {
  /** 列表行键：关联产品合并行为 productId，关联工单为工单 id */
  rowKey: string;
  /** 本行涉及的工单（合并行含多工单） */
  ordersInRow: ProductionOrder[];
  /** 展示用代表工单（合并行取工单号排序首条） */
  order: ProductionOrder;
  orderTotal: number;
  /** 同 productId 下所有工单数量合计（关联产品下列「产品工单总数」用） */
  productBlockOrderTotal: number;
  alreadyIn: number;
  pendingTotal: number;
  alreadyInByVariant: Record<string, number>;
  pendingByVariant: Record<string, number>;
  /** 关联产品合并行：该商品下全部生产入库（STOCK_IN）数量合计 */
  productTotalStockIn?: number;
};


function stockInAggregatesForOrder(order: ProductionOrder, prodRecords: ProductionOpRecord[]) {
  const stockInRecords = prodRecords.filter(r => r.type === 'STOCK_IN' && r.orderId === order.id);
  const alreadyIn = stockInRecords.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const alreadyInByVariant: Record<string, number> = {};
  stockInRecords.forEach(r => {
    const vid = r.variantId ?? '';
    alreadyInByVariant[vid] = (alreadyInByVariant[vid] ?? 0) + (Number(r.quantity) || 0);
  });
  return { alreadyIn, alreadyInByVariant };
}

/** 产品在「最后一道工序模板」上的全局完成量（按规格汇总，与 PMP 存数一致） */
function globalCompletedByVariantAtTemplate(
  pmp: ProductMilestoneProgress[],
  productId: string,
  templateId: string,
): Record<string, number> {
  const globalByVariant: Record<string, number> = {};
  pmp
    .filter(p => p.productId === productId && p.milestoneTemplateId === templateId)
    .forEach(row => {
      const reps = row.reports;
      if (reps && reps.length > 0) {
        reps.forEach(r => {
          const vid = r.variantId ?? row.variantId ?? '';
          globalByVariant[vid] = (globalByVariant[vid] ?? 0) + (Number(r.quantity) || 0);
        });
      } else {
        const vid = row.variantId ?? '';
        globalByVariant[vid] = (globalByVariant[vid] ?? 0) + (Number(row.completedQuantity) || 0);
      }
    });
  return globalByVariant;
}

/**
 * 待入库清单：最后一道工序完成量 − 已入库。
 * 关联工单：每张工单单独一行。
 * 关联产品：按 productId 汇总——产品级全局完成量（PMP）与产品级全部已入库比较，整数无分摊。
 */
export function computePendingStockOrders(
  orders: ProductionOrder[],
  prodRecords: ProductionOpRecord[],
  opts: {
    productionLinkMode?: 'order' | 'product';
    productMilestoneProgresses?: ProductMilestoneProgress[];
  } = {},
): PendingStockComputeItem[] {
  const productionLinkMode = opts.productionLinkMode ?? 'order';
  const pmp = opts.productMilestoneProgresses ?? [];

  if (productionLinkMode !== 'product') {
    return computeOrderMode(orders, prodRecords);
  }

  return computeProductMode(orders, prodRecords, pmp);
}

function computeOrderMode(
  orders: ProductionOrder[],
  prodRecords: ProductionOpRecord[],
): PendingStockComputeItem[] {
  const list: PendingStockComputeItem[] = [];
  for (const order of orders) {
    if (!order.milestones?.length) continue;
    const orderTotal = order.items.reduce((s, i) => s + i.quantity, 0);
    const lastMilestone = order.milestones[order.milestones.length - 1];
    const { alreadyIn, alreadyInByVariant } = stockInAggregatesForOrder(order, prodRecords);

    let completedByVariant: Record<string, number> = {};
    (lastMilestone?.reports ?? []).forEach(r => {
      const vid = r.variantId ?? '';
      completedByVariant[vid] = (completedByVariant[vid] ?? 0) + (Number(r.quantity) || 0);
    });
    let hasVariantBreakdown = Object.keys(completedByVariant).some(k => k !== '');
    if (!hasVariantBreakdown) {
      completedByVariant = { '': Number(lastMilestone?.completedQuantity) || 0 };
    }

    const completedProduced = hasVariantBreakdown
      ? Object.values(completedByVariant).reduce((s, q) => s + q, 0)
      : (completedByVariant[''] ?? 0);
    const pendingTotal = Math.max(0, completedProduced - alreadyIn);
    if (pendingTotal <= 0) continue;

    const pendingByVariant: Record<string, number> = {};
    if (hasVariantBreakdown) {
      Object.entries(completedByVariant).forEach(([vid, qty]) => {
        pendingByVariant[vid] = Math.max(0, qty - (alreadyInByVariant[vid] ?? 0));
      });
    }

    const productBlockOrderTotal = sumBlockOrderQty(orders.filter(o => o.productId === order.productId));
    list.push({
      rowKey: order.id,
      ordersInRow: [order],
      order,
      orderTotal,
      productBlockOrderTotal,
      alreadyIn,
      pendingTotal,
      alreadyInByVariant,
      pendingByVariant: Object.keys(pendingByVariant).length > 0 ? pendingByVariant : { '': pendingTotal },
    });
  }
  return list.sort((a, b) => (b.order.orderNumber || '').localeCompare(a.order.orderNumber || '', 'zh-CN'));
}

function computeProductMode(
  orders: ProductionOrder[],
  prodRecords: ProductionOpRecord[],
  pmp: ProductMilestoneProgress[],
): PendingStockComputeItem[] {
  const byProduct = new Map<string, ProductionOrder[]>();
  for (const o of orders) {
    if (!o.milestones?.length) continue;
    if (!byProduct.has(o.productId)) byProduct.set(o.productId, []);
    byProduct.get(o.productId)!.push(o);
  }

  const merged: PendingStockComputeItem[] = [];

  for (const [productId, blockOrders] of byProduct) {
    const rep = blockOrders[0];
    const lastMilestone = rep.milestones[rep.milestones.length - 1];
    if (!lastMilestone) continue;
    const lastTid = lastMilestone.templateId;

    const globalByVariant = globalCompletedByVariantAtTemplate(pmp, productId, lastTid);
    const globalKeys = Object.keys(globalByVariant);

    const productStockInRecords = prodRecords.filter(r => r.type === 'STOCK_IN' && r.productId === productId);
    const productAlreadyIn = productStockInRecords.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const productAlreadyInByVariant: Record<string, number> = {};
    productStockInRecords.forEach(r => {
      const vid = r.variantId ?? '';
      productAlreadyInByVariant[vid] = (productAlreadyInByVariant[vid] ?? 0) + (Number(r.quantity) || 0);
    });

    const anyNamedVariant = globalKeys.some(k => k !== '');
    let globalCompleted: number;
    let pendingByVariant: Record<string, number> = {};

    if (anyNamedVariant) {
      globalCompleted = globalKeys.reduce((s, k) => s + (globalByVariant[k] ?? 0), 0);
      globalKeys.forEach(vid => {
        const done = globalByVariant[vid] ?? 0;
        const already = productAlreadyInByVariant[vid] ?? 0;
        const p = Math.max(0, done - already);
        if (p > 0) pendingByVariant[vid] = p;
      });
    } else {
      globalCompleted = globalKeys.length > 0
        ? globalKeys.reduce((s, k) => s + (globalByVariant[k] ?? 0), 0)
        : pmpCompletedAtTemplate(pmp, productId, lastTid);
    }

    const pendingTotal = Math.max(0, globalCompleted - productAlreadyIn);
    if (pendingTotal <= 0) continue;

    const blockOrderTotal = sumBlockOrderQty(blockOrders);
    const normalizedPbv = Object.keys(pendingByVariant).length > 0 ? pendingByVariant : { '': pendingTotal };

    merged.push({
      rowKey: productId,
      ordersInRow: blockOrders,
      order: rep,
      orderTotal: blockOrderTotal,
      productBlockOrderTotal: blockOrderTotal,
      alreadyIn: productAlreadyIn,
      pendingTotal,
      alreadyInByVariant: productAlreadyInByVariant,
      pendingByVariant: normalizedPbv,
      productTotalStockIn: productAlreadyIn,
    });
  }

  return merged.sort(
    (a, b) =>
      (a.order.productName || '').localeCompare(b.order.productName || '', 'zh-CN') || a.rowKey.localeCompare(b.rowKey),
  );
}
