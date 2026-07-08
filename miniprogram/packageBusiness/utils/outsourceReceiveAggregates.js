/**
 * 外协待收回聚合（对齐 Web OutsourcePanel.outsourceReceiveAllAggregates）
 */

function outsourceReceiveOrderAggKey(orderId, nodeId, partner) {
  return `O|${orderId}|${nodeId}|${partner}`;
}

function outsourceReceiveProductAggKey(productId, nodeId, partner) {
  return `P|${productId}|${nodeId}|${partner}`;
}

/**
 * @param {Array<object>} outsourceRecords type=OUTSOURCE, !sourceReworkId
 * @param {Map<string, object>} ordersById
 * @param {Map<string, object>} productsById
 * @param {Map<string, object>} nodesById
 */
function buildOutsourceReceiveAggregates(outsourceRecords, ordersById, productsById, nodesById) {
  const byKey = {};

  outsourceRecords.forEach((r) => {var _r$partner;
    if (!r.nodeId || r.sourceReworkId) return;
    const partner = (_r$partner = r.partner) != null ? _r$partner : '';
    if (r.orderId) {
      const k = outsourceReceiveOrderAggKey(r.orderId, r.nodeId, partner);
      if (!byKey[k]) {
        const order = ordersById.get(r.orderId);
        if (!order) return;
        byKey[k] = {
          scope: 'order',
          orderId: r.orderId,
          productId: order.productId,
          nodeId: r.nodeId,
          partner,
          dispatched: 0,
          received: 0
        };
      }
      if (r.status === '加工中') byKey[k].dispatched += Number(r.quantity) || 0;else
      if (r.status === '已收回') byKey[k].received += Number(r.quantity) || 0;
    } else if (r.productId) {
      const k = outsourceReceiveProductAggKey(r.productId, r.nodeId, partner);
      if (!byKey[k]) {
        byKey[k] = {
          scope: 'product',
          productId: r.productId,
          nodeId: r.nodeId,
          partner,
          dispatched: 0,
          received: 0
        };
      }
      if (r.status === '加工中') byKey[k].dispatched += Number(r.quantity) || 0;else
      if (r.status === '已收回') byKey[k].received += Number(r.quantity) || 0;
    }
  });

  const rows = [];
  Object.values(byKey).forEach((v) => {
    const pending = v.dispatched - v.received;
    if (v.scope === 'order' && v.orderId) {var _ref, _product$name, _ms$name;
      const order = ordersById.get(v.orderId);
      if (!order) return;
      const ms = (order.milestones || []).find((m) => m.templateId === v.nodeId);
      const product = productsById.get(order.productId);
      rows.push({
        orderId: v.orderId,
        nodeId: v.nodeId,
        productId: order.productId,
        orderNumber: order.orderNumber,
        productName: (_ref = (_product$name = product == null ? void 0 : product.name) != null ? _product$name : order.productName) != null ? _ref : '—',
        milestoneName: (_ms$name = ms == null ? void 0 : ms.name) != null ? _ms$name : v.nodeId,
        partner: v.partner,
        dispatched: v.dispatched,
        received: v.received,
        pending,
        scope: 'order'
      });
    } else {var _product$name2, _node$name;
      const product = productsById.get(v.productId);
      const node = nodesById.get(v.nodeId);
      rows.push({
        nodeId: v.nodeId,
        productId: v.productId,
        productName: (_product$name2 = product == null ? void 0 : product.name) != null ? _product$name2 : '—',
        milestoneName: (_node$name = node == null ? void 0 : node.name) != null ? _node$name : v.nodeId,
        partner: v.partner,
        dispatched: v.dispatched,
        received: v.received,
        pending,
        scope: 'product'
      });
    }
  });

  return rows;
}

function filterAggregatesByPartner(rows, partnerName) {
  const p = (partnerName || '').trim();
  if (!p) return [];
  return rows.filter((r) => {var _r$partner2;return ((_r$partner2 = r.partner) != null ? _r$partner2 : '') === p;});
}

function findReceiveRowByProduct(pendingRows, productId) {
  return pendingRows.find((r) => r.productId === productId && r.pending > 0);
}

module.exports = {
  buildOutsourceReceiveAggregates,
  filterAggregatesByPartner,
  findReceiveRowByProduct
};