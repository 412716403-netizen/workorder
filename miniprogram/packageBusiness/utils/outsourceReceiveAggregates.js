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

  outsourceRecords.forEach((r) => {
    if (!r.nodeId || r.sourceReworkId) return;
    const partner = r.partner ?? '';
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
          received: 0,
        };
      }
      if (r.status === '加工中') byKey[k].dispatched += Number(r.quantity) || 0;
      else if (r.status === '已收回') byKey[k].received += Number(r.quantity) || 0;
    } else if (r.productId) {
      const k = outsourceReceiveProductAggKey(r.productId, r.nodeId, partner);
      if (!byKey[k]) {
        byKey[k] = {
          scope: 'product',
          productId: r.productId,
          nodeId: r.nodeId,
          partner,
          dispatched: 0,
          received: 0,
        };
      }
      if (r.status === '加工中') byKey[k].dispatched += Number(r.quantity) || 0;
      else if (r.status === '已收回') byKey[k].received += Number(r.quantity) || 0;
    }
  });

  const rows = [];
  Object.values(byKey).forEach((v) => {
    const pending = v.dispatched - v.received;
    if (v.scope === 'order' && v.orderId) {
      const order = ordersById.get(v.orderId);
      if (!order) return;
      const ms = (order.milestones || []).find((m) => m.templateId === v.nodeId);
      const product = productsById.get(order.productId);
      rows.push({
        orderId: v.orderId,
        nodeId: v.nodeId,
        productId: order.productId,
        orderNumber: order.orderNumber,
        productName: product?.name ?? order.productName ?? '—',
        milestoneName: ms?.name ?? v.nodeId,
        partner: v.partner,
        dispatched: v.dispatched,
        received: v.received,
        pending,
        scope: 'order',
      });
    } else {
      const product = productsById.get(v.productId);
      const node = nodesById.get(v.nodeId);
      rows.push({
        nodeId: v.nodeId,
        productId: v.productId,
        productName: product?.name ?? '—',
        milestoneName: node?.name ?? v.nodeId,
        partner: v.partner,
        dispatched: v.dispatched,
        received: v.received,
        pending,
        scope: 'product',
      });
    }
  });

  return rows;
}

function filterAggregatesByPartner(rows, partnerName) {
  const p = (partnerName || '').trim();
  if (!p) return [];
  return rows.filter((r) => (r.partner ?? '') === p);
}

function findReceiveRowByProduct(pendingRows, productId) {
  return pendingRows.find((r) => r.productId === productId && r.pending > 0);
}

module.exports = {
  buildOutsourceReceiveAggregates,
  filterAggregatesByPartner,
  findReceiveRowByProduct,
};
