/**
 * 工单详情页：生产物料 + 外协管理（对齐 Web OrderDetailModal）
 */

const {
  computeOrderFamilyMaterialStats,
  computeProductMaterialStats,
  filterMaterialRowsWithActivity,
  buildNodeWeightEnabledMap,
  getOrderFamilyIds,
  matRowNetIssue,
  matRowReportCost,
  matRowSurplus,
  roundQty,
} = require('./materialStatsLite.js');
const { buildMaterialIndexes } = require('./materialStockPanel.js');
const { listProductNameSkuFields } = require('./listProductThumb.js');

function resolveRootOrderId(orderId, ordersById) {
  let cur = orderId;
  for (let i = 0; i < 24; i++) {
    const o = ordersById.get(cur);
    if (!o) return cur;
    if (!o.parentOrderId) return o.id;
    cur = o.parentOrderId;
  }
  return cur;
}

function matRowToDisplayRow(row, productsById) {
  const p = productsById.get(row.productId);
  const nameSku = listProductNameSkuFields(p, { name: row.productId });
  const issue = roundQty(row.issue);
  const returnQty = roundQty(row.returnQty);
  const net = matRowNetIssue(row);
  const reportCost = matRowReportCost(row);
  const surplus = matRowSurplus(row);
  return {
    productId: row.productId,
    name: nameSku.productName,
    sku: nameSku.productSku,
    showSku: nameSku.showProductSku,
    issueText: String(issue),
    returnText: String(returnQty),
    netText: String(net),
    reportCostText: String(reportCost),
    surplusText: String(surplus),
  };
}

function buildOrderFamilyIds(order, orders, idx) {
  if (!order || !order.id) return [];
  const rootOrderId = resolveRootOrderId(order.id, idx.ordersById);
  return getOrderFamilyIds(orders, rootOrderId, idx.childrenByParentId);
}

function buildOrderDetailMaterialRows(params) {
  const {
    order,
    orders = [],
    products = [],
    boms = [],
    nodes = [],
    stockRecords = [],
    productMilestoneProgresses = [],
    productionLinkMode = 'order',
  } = params;

  if (!order || !order.id) {
    return { rows: [], emptyText: '该工单暂无 BOM 物料，请先在产品中配置 BOM' };
  }

  const idx = buildMaterialIndexes(products, boms, orders);
  const nodeWeightEnabledMap = buildNodeWeightEnabledMap(nodes);
  let materials = [];

  if (productionLinkMode === 'product' && order.productId) {
    materials = computeProductMaterialStats({
      productId: order.productId,
      orders,
      idx,
      stockRecords,
      productMilestoneProgresses,
      nodeWeightEnabledMap,
    });
  } else {
    const rootOrderId = resolveRootOrderId(order.id, idx.ordersById);
    materials = computeOrderFamilyMaterialStats({
      rootOrderId,
      orders,
      productsById: idx.productsById,
      bomsById: idx.bomsById,
      bomsByParentProduct: idx.bomsByParentProduct,
      childrenByParentId: idx.childrenByParentId,
      stockRecords,
      nodeWeightEnabledMap,
    });
  }

  const visible = filterMaterialRowsWithActivity(materials);
  const rows = visible.map((m) => matRowToDisplayRow(m, idx.productsById));
  const emptyText = productionLinkMode === 'product'
    ? '该产品暂无 BOM 物料，请先在产品中配置 BOM'
    : '该工单暂无 BOM 物料，请先在产品中配置 BOM';

  return { rows, emptyText };
}

function buildOrderDetailOutsourceCards(params) {
  const {
    order,
    records = [],
    hideZeroPendingPartnerOnList = false,
    productName = '',
    orderNumber = '',
    productionLinkMode = 'order',
  } = params;

  if (!order || !order.id) return [];

  const outsourceRecs = (records || []).filter(
    (r) => r.type === 'OUTSOURCE' && !r.sourceReworkId && r.orderId === order.id && r.partner,
  );
  const byKey = {};
  outsourceRecs.forEach((r) => {
    const nodeId = r.nodeId ?? '';
    const key = `${r.partner}|${nodeId}`;
    if (!byKey[key]) {
      byKey[key] = { partner: r.partner, nodeId, dispatched: 0, received: 0 };
    }
    if (r.status === '加工中') byKey[key].dispatched += Number(r.quantity) || 0;
    else if (r.status === '已收回') byKey[key].received += Number(r.quantity) || 0;
  });

  const milestoneIndex = (nodeId) => {
    const idx = (order.milestones || []).findIndex((m) => m.templateId === nodeId);
    return idx >= 0 ? idx : 9999;
  };

  let rows = Object.values(byKey)
    .map((v) => {
      const pending = Math.max(0, v.dispatched - v.received);
      const nodeName = (order.milestones || []).find((m) => m.templateId === v.nodeId)?.name
        || v.nodeId
        || '—';
      const dispatched = Number(v.dispatched) || 0;
      const received = Number(v.received) || 0;
      const progress = dispatched > 0
        ? Math.min(100, Math.round((received / dispatched) * 100))
        : (received > 0 ? 100 : 0);
      return {
        partner: v.partner,
        nodeId: v.nodeId,
        nodeName,
        dispatched,
        received,
        pending,
        chipKey: `${v.partner}|${v.nodeId}`,
        isCompleted: pending <= 0 && dispatched > 0,
        progress,
        metaText: `${dispatched} / ${pending}`,
        orderId: order.id,
        productId: order.productId || '',
        productName,
        orderNumber,
        productionLinkMode,
      };
    })
    .filter((v) => v.dispatched > 0 || v.received > 0)
    .sort((a, b) => milestoneIndex(a.nodeId) - milestoneIndex(b.nodeId));

  if (hideZeroPendingPartnerOnList) {
    rows = rows.filter((r) => r.pending > 0);
  }

  return rows;
}

module.exports = {
  buildOrderFamilyIds,
  buildOrderDetailMaterialRows,
  buildOrderDetailOutsourceCards,
};
