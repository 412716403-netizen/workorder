/**
 * 工单详情页：生产物料 + 外协管理（对齐 Web OrderDetailModal）
 */

const _require =









  require('./materialStatsLite.js'),computeOrderFamilyMaterialStats = _require.computeOrderFamilyMaterialStats,computeProductMaterialStats = _require.computeProductMaterialStats,filterMaterialRowsWithActivity = _require.filterMaterialRowsWithActivity,buildNodeWeightEnabledMap = _require.buildNodeWeightEnabledMap,getOrderFamilyIds = _require.getOrderFamilyIds,matRowNetIssue = _require.matRowNetIssue,matRowReportCost = _require.matRowReportCost,matRowSurplus = _require.matRowSurplus,roundQty = _require.roundQty;
const _require2 = require('./materialStockPanel.js'),buildMaterialIndexes = _require2.buildMaterialIndexes;
const _require3 = require('./listProductThumb.js'),listProductNameSkuFields = _require3.listProductNameSkuFields;

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
    surplusText: String(surplus)
  };
}

function buildOrderFamilyIds(order, orders, idx) {
  if (!order || !order.id) return [];
  const rootOrderId = resolveRootOrderId(order.id, idx.ordersById);
  return getOrderFamilyIds(orders, rootOrderId, idx.childrenByParentId);
}

function buildOrderDetailMaterialRows(params) {
  const
    order =







    params.order,_params$orders = params.orders,orders = _params$orders === void 0 ? [] : _params$orders,_params$products = params.products,products = _params$products === void 0 ? [] : _params$products,_params$boms = params.boms,boms = _params$boms === void 0 ? [] : _params$boms,_params$nodes = params.nodes,nodes = _params$nodes === void 0 ? [] : _params$nodes,_params$stockRecords = params.stockRecords,stockRecords = _params$stockRecords === void 0 ? [] : _params$stockRecords,_params$productMilest = params.productMilestoneProgresses,productMilestoneProgresses = _params$productMilest === void 0 ? [] : _params$productMilest,_params$productionLin = params.productionLinkMode,productionLinkMode = _params$productionLin === void 0 ? 'order' : _params$productionLin;

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
      nodeWeightEnabledMap
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
      nodeWeightEnabledMap
    });
  }

  const visible = filterMaterialRowsWithActivity(materials);
  const rows = visible.map((m) => matRowToDisplayRow(m, idx.productsById));
  const emptyText = productionLinkMode === 'product' ?
  '该产品暂无 BOM 物料，请先在产品中配置 BOM' :
  '该工单暂无 BOM 物料，请先在产品中配置 BOM';

  return { rows, emptyText };
}

function buildOrderDetailOutsourceCards(params) {
  const
    order =





    params.order,_params$records = params.records,records = _params$records === void 0 ? [] : _params$records,_params$hideZeroPendi = params.hideZeroPendingPartnerOnList,hideZeroPendingPartnerOnList = _params$hideZeroPendi === void 0 ? false : _params$hideZeroPendi,_params$productName = params.productName,productName = _params$productName === void 0 ? '' : _params$productName,_params$orderNumber = params.orderNumber,orderNumber = _params$orderNumber === void 0 ? '' : _params$orderNumber,_params$productionLin2 = params.productionLinkMode,productionLinkMode = _params$productionLin2 === void 0 ? 'order' : _params$productionLin2;

  if (!order || !order.id) return [];

  const outsourceRecs = (records || []).filter(
    (r) => r.type === 'OUTSOURCE' && !r.sourceReworkId && r.orderId === order.id && r.partner
  );
  const byKey = {};
  outsourceRecs.forEach((r) => {var _r$nodeId;
    const nodeId = (_r$nodeId = r.nodeId) != null ? _r$nodeId : '';
    const key = `${r.partner}|${nodeId}`;
    if (!byKey[key]) {
      byKey[key] = { partner: r.partner, nodeId, dispatched: 0, received: 0 };
    }
    if (r.status === '加工中') byKey[key].dispatched += Number(r.quantity) || 0;else
    if (r.status === '已收回') byKey[key].received += Number(r.quantity) || 0;
  });

  const milestoneIndex = (nodeId) => {
    const idx = (order.milestones || []).findIndex((m) => m.templateId === nodeId);
    return idx >= 0 ? idx : 9999;
  };

  let rows = Object.values(byKey).
  map((v) => {var _find;
    const pending = Math.max(0, v.dispatched - v.received);
    const nodeName = ((_find = (order.milestones || []).find((m) => m.templateId === v.nodeId)) == null ? void 0 : _find.name) ||
    v.nodeId ||
    '—';
    const dispatched = Number(v.dispatched) || 0;
    const received = Number(v.received) || 0;
    const progress = dispatched > 0 ?
    Math.min(100, Math.round(received / dispatched * 100)) :
    received > 0 ? 100 : 0;
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
      productionLinkMode
    };
  }).
  filter((v) => v.dispatched > 0 || v.received > 0).
  sort((a, b) => milestoneIndex(a.nodeId) - milestoneIndex(b.nodeId));

  if (hideZeroPendingPartnerOnList) {
    rows = rows.filter((r) => r.pending > 0);
  }

  return rows;
}

module.exports = {
  buildOrderFamilyIds,
  buildOrderDetailMaterialRows,
  buildOrderDetailOutsourceCards
};