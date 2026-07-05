/**
 * 外协 Hub 卡片物料外发/退回行（对齐 Web OutsourceMaterialDispatchModal 简化版）
 */

const {
  buildBomMaterialsForOrder,
  buildBomMaterialsForProductGroup,
} = require('./orderMaterialLite.js');

function partnerMatchRecord(r, partnerKey) {
  const rp = String(r.partner || '').trim();
  const pk = String(partnerKey || '').trim();
  if (!pk) return !!rp;
  return rp === pk;
}

function buildPartnerIssuedMap(records, scope, partnerKey) {
  const issuedMap = new Map();
  (records || []).forEach((r) => {
    if (!partnerMatchRecord(r, partnerKey)) return;
    let inScope = false;
    if (scope.sourceProductId) {
      if (r.sourceProductId === scope.sourceProductId) inScope = true;
      else if (r.orderId && scope.orderIds && scope.orderIds.has(r.orderId)) inScope = true;
    } else if (scope.orderId) {
      if (r.orderId === scope.orderId) inScope = true;
      if (scope.orderIds && scope.orderIds.has(r.orderId)) inScope = true;
    }
    if (!inScope) return;
    const pid = r.productId;
    if (!pid) return;
    if (r.type === 'STOCK_OUT') {
      if (r.reason === '来自于返工') return;
      issuedMap.set(pid, (issuedMap.get(pid) || 0) + (Number(r.quantity) || 0));
    } else if (r.type === 'STOCK_RETURN') {
      issuedMap.set(pid, (issuedMap.get(pid) || 0) - (Number(r.quantity) || 0));
    }
  });
  return issuedMap;
}

function bomRowsToMaterialStats(bomRows, issuedMap) {
  return (bomRows || []).map((row) => {
    const issue = Number(issuedMap.get(row.productId)) || 0;
    return {
      productId: row.productId,
      name: row.name,
      sku: row.sku || '',
      unitNeeded: row.unitNeeded,
      issue,
      returnQty: 0,
      reportCost: 0,
    };
  });
}

function buildOutsourceMaterialPayload(params) {
  const {
    productionLinkMode,
    orderId,
    productId,
    partnerKey,
    partnerLabel,
    orders,
    products,
    boms,
    globalNodes,
    stockRecords,
  } = params;

  let bomRows = [];
  let orderNumber = '';
  let productName = '';
  let sourceProductId = '';
  const orderIds = new Set();

  if (productionLinkMode === 'product' && productId) {
    const groupOrders = (orders || []).filter((o) => o.productId === productId);
    groupOrders.forEach((o) => orderIds.add(o.id));
    bomRows = buildBomMaterialsForProductGroup(groupOrders, productId, products, boms, globalNodes);
    const product = (products || []).find((p) => p.id === productId);
    productName = (product && product.name) || '—';
    sourceProductId = productId;
  } else if (orderId) {
    const order = (orders || []).find((o) => o.id === orderId);
    if (!order) return null;
    orderIds.add(order.id);
    bomRows = buildBomMaterialsForOrder(order, products, boms, globalNodes);
    orderNumber = order.orderNumber || '';
    const product = (products || []).find((p) => p.id === order.productId);
    productName = (product && product.name) || order.productName || '—';
    sourceProductId = order.productId || '';
  } else {
    return null;
  }

  const issuedMap = buildPartnerIssuedMap(stockRecords, {
    orderId,
    sourceProductId,
    orderIds,
  }, partnerKey);

  const materials = bomRowsToMaterialStats(bomRows, issuedMap);
  if (!materials.length) return null;

  return {
    partnerKey: partnerKey || '',
    partnerLabel: partnerLabel || partnerKey || '',
    orderId: orderId || '',
    sourceProductId,
    orderNumber,
    productName,
    materials,
    products: products || [],
    orders: orders || [],
    stockRecords: stockRecords || [],
  };
}

function listOutsourceDispatchPartnersForCard(records, scope, productionLinkMode) {
  const set = new Set();
  (records || []).forEach((r) => {
    if (r.type !== 'STOCK_OUT' || !r.partner) return;
    if (productionLinkMode === 'product') {
      if (r.sourceProductId === scope.productId
        || (!r.sourceProductId && r.productId === scope.productId)) {
        set.add(r.partner);
      }
    } else if (r.orderId === scope.orderId) {
      set.add(r.partner);
    }
  });
  return Array.from(set);
}

module.exports = {
  buildPartnerIssuedMap,
  buildOutsourceMaterialPayload,
  listOutsourceDispatchPartnersForCard,
};
