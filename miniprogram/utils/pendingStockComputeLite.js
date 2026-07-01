/**
 * 待入库计算精简版（对齐 utils/pendingStockCompute.ts）
 */

const { sumOrderQty } = require('./orderProcessChips.js');

function stockInAggregatesForOrder(order, prodRecords) {
  const stockInRecords = (prodRecords || []).filter(
    (r) => r.type === 'STOCK_IN' && r.orderId === order.id,
  );
  const alreadyIn = stockInRecords.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const alreadyInByVariant = {};
  stockInRecords.forEach((r) => {
    const vid = r.variantId ?? '';
    alreadyInByVariant[vid] = (alreadyInByVariant[vid] ?? 0) + (Number(r.quantity) || 0);
  });
  return { alreadyIn, alreadyInByVariant };
}

function sumBlockOrderQty(orders) {
  return (orders || []).reduce((s, o) => s + sumOrderQty(o), 0);
}

function combinedCompletedByVariantAtTemplate(blockOrders, pmp, productId, templateId) {
  const byVariant = {};
  const add = (vid, q) => {
    if (!(q > 0)) return;
    const key = vid || '';
    byVariant[key] = (byVariant[key] ?? 0) + q;
  };

  (pmp || [])
    .filter((p) => p.productId === productId && p.milestoneTemplateId === templateId)
    .forEach((row) => {
      const reps = row.reports;
      if (reps && reps.length > 0) {
        reps.forEach((r) => add(r.variantId ?? row.variantId ?? '', Number(r.quantity) || 0));
      } else {
        add(row.variantId ?? '', Number(row.completedQuantity) || 0);
      }
    });

  (blockOrders || []).forEach((o) => {
    const m = (o.milestones || []).find((x) => x.templateId === templateId);
    if (!m) return;
    const reps = m.reports;
    if (reps && reps.length > 0) {
      reps.forEach((r) => add(r.variantId ?? '', Number(r.quantity) || 0));
    } else {
      const total = m.completedQuantity ?? 0;
      if (total <= 0) return;
      const totalQty = (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      if (totalQty <= 0) {
        add('', total);
        return;
      }
      let rem = total;
      (o.items || []).forEach((item, idx) => {
        const part = idx === o.items.length - 1
          ? rem
          : Math.floor((total * item.quantity) / totalQty);
        rem -= part;
        add(item.variantId ?? '', part);
      });
    }
  });

  return byVariant;
}

function combinedCompletedAtTemplate(blockOrders, pmp, productId, templateId) {
  const byVariant = combinedCompletedByVariantAtTemplate(blockOrders, pmp, productId, templateId);
  return Object.values(byVariant).reduce((s, n) => s + n, 0);
}

function computeOrderMode(orders, prodRecords) {
  const list = [];

  for (const order of orders || []) {
    if (!order.milestones || !order.milestones.length) continue;
    const orderTotal = sumOrderQty(order);
    const lastMilestone = order.milestones[order.milestones.length - 1];
    const { alreadyIn, alreadyInByVariant } = stockInAggregatesForOrder(order, prodRecords);

    let completedByVariant = {};
    (lastMilestone.reports || []).forEach((r) => {
      const vid = r.variantId ?? '';
      completedByVariant[vid] = (completedByVariant[vid] ?? 0) + (Number(r.quantity) || 0);
    });
    let hasVariantBreakdown = Object.keys(completedByVariant).some((k) => k !== '');
    if (!hasVariantBreakdown) {
      completedByVariant = { '': Number(lastMilestone.completedQuantity) || 0 };
    }

    const completedProduced = hasVariantBreakdown
      ? Object.values(completedByVariant).reduce((s, q) => s + q, 0)
      : (completedByVariant[''] ?? 0);
    const pendingTotal = Math.max(0, completedProduced - alreadyIn);
    if (pendingTotal <= 0) continue;

    const pendingByVariant = {};
    if (hasVariantBreakdown) {
      Object.entries(completedByVariant).forEach(([vid, qty]) => {
        pendingByVariant[vid] = Math.max(0, qty - (alreadyInByVariant[vid] ?? 0));
      });
    }

    const productBlockOrderTotal = sumBlockOrderQty(
      (orders || []).filter((o) => o.productId === order.productId),
    );

    list.push({
      rowKey: order.id,
      orderId: order.id,
      orderNumber: order.orderNumber || '',
      productName: order.productName || '',
      orderTotal,
      productBlockOrderTotal,
      completed: completedProduced,
      alreadyIn,
      pendingTotal,
      alreadyInByVariant,
      pendingByVariant: Object.keys(pendingByVariant).length > 0 ? pendingByVariant : { '': pendingTotal },
      canStockIn: pendingTotal > 0,
    });
  }

  return list.sort((a, b) =>
    (b.orderNumber || '').localeCompare(a.orderNumber || '', 'zh-CN'),
  );
}

function computeProductMode(orders, prodRecords, pmp) {
  const byProduct = new Map();

  for (const o of orders || []) {
    if (!o.milestones || !o.milestones.length) continue;
    if (!byProduct.has(o.productId)) byProduct.set(o.productId, []);
    byProduct.get(o.productId).push(o);
  }

  const merged = [];

  for (const [productId, blockOrders] of byProduct) {
    const rep = blockOrders[0];
    const lastMilestone = rep.milestones[rep.milestones.length - 1];
    if (!lastMilestone) continue;
    const lastTid = lastMilestone.templateId;

    const globalByVariant = combinedCompletedByVariantAtTemplate(blockOrders, pmp, productId, lastTid);
    const globalKeys = Object.keys(globalByVariant);

    const productStockInRecords = (prodRecords || []).filter(
      (r) => r.type === 'STOCK_IN' && r.productId === productId,
    );
    const productAlreadyIn = productStockInRecords.reduce(
      (s, r) => s + (Number(r.quantity) || 0),
      0,
    );
    const productAlreadyInByVariant = {};
    productStockInRecords.forEach((r) => {
      const vid = r.variantId ?? '';
      productAlreadyInByVariant[vid] = (productAlreadyInByVariant[vid] ?? 0) + (Number(r.quantity) || 0);
    });

    const anyNamedVariant = globalKeys.some((k) => k !== '');
    let globalCompleted;
    let pendingByVariant = {};

    if (anyNamedVariant) {
      globalCompleted = globalKeys.reduce((s, k) => s + (globalByVariant[k] ?? 0), 0);
      globalKeys.forEach((vid) => {
        const done = globalByVariant[vid] ?? 0;
        const already = productAlreadyInByVariant[vid] ?? 0;
        const p = Math.max(0, done - already);
        if (p > 0) pendingByVariant[vid] = p;
      });
    } else {
      globalCompleted = globalKeys.length > 0
        ? globalKeys.reduce((s, k) => s + (globalByVariant[k] ?? 0), 0)
        : combinedCompletedAtTemplate(blockOrders, pmp, productId, lastTid);
    }

    const pendingTotal = Math.max(0, globalCompleted - productAlreadyIn);
    if (pendingTotal <= 0) continue;

    const blockOrderTotal = sumBlockOrderQty(blockOrders);
    const normalizedPbv = Object.keys(pendingByVariant).length > 0
      ? pendingByVariant
      : { '': pendingTotal };

    merged.push({
      rowKey: productId,
      orderId: rep.id,
      orderNumber: rep.orderNumber || '',
      productName: rep.productName || '',
      orderTotal: blockOrderTotal,
      productBlockOrderTotal: blockOrderTotal,
      completed: globalCompleted,
      alreadyIn: productAlreadyIn,
      pendingTotal,
      alreadyInByVariant: productAlreadyInByVariant,
      pendingByVariant: normalizedPbv,
      canStockIn: pendingTotal > 0,
      productionLinkMode: 'product',
    });
  }

  return merged.sort(
    (a, b) =>
      (a.productName || '').localeCompare(b.productName || '', 'zh-CN') ||
      a.rowKey.localeCompare(b.rowKey),
  );
}

function computePendingStockOrders(orders, prodRecords, opts) {
  const productionLinkMode = (opts && opts.productionLinkMode) || 'order';
  const pmp = (opts && opts.productMilestoneProgresses) || [];

  if (productionLinkMode !== 'product') {
    return computeOrderMode(orders, prodRecords);
  }
  return computeProductMode(orders, prodRecords, pmp);
}

/** @deprecated 单工单行，保留兼容 */
function lastMilestoneCompletedQty(order) {
  const milestones = order.milestones || [];
  if (!milestones.length) return 0;
  const last = milestones[milestones.length - 1];
  return Number(last.completedQuantity) || 0;
}

function computeOrderPendingStockRow(order, prodRecords) {
  const rows = computeOrderMode([order], prodRecords);
  if (rows.length) return rows[0];
  const orderTotal = sumOrderQty(order);
  const { alreadyIn } = stockInAggregatesForOrder(order, prodRecords);
  const completed = lastMilestoneCompletedQty(order);
  const pendingTotal = Math.max(0, completed - alreadyIn);
  return {
    rowKey: order.id,
    orderId: order.id,
    orderNumber: order.orderNumber || '',
    productName: order.productName || '',
    orderTotal,
    completed,
    alreadyIn,
    pendingTotal,
    canStockIn: pendingTotal > 0,
  };
}

function computePendingStockForOrders(orders, prodRecords, opts) {
  return computePendingStockOrders(orders, prodRecords, opts).filter(
    (row) => row.pendingTotal > 0 || row.alreadyIn > 0,
  );
}

module.exports = {
  computeOrderPendingStockRow,
  computePendingStockForOrders,
  computePendingStockOrders,
  stockInAggregatesForOrder,
  lastMilestoneCompletedQty,
};
