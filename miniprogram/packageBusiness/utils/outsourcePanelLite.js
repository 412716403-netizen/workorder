/**
 * 外协主列表聚合（对齐 Web OutsourcePanel.outsourceStatsByOrder / displayOutsourceStats）
 */

const _require = require('../config/productionOrders.js'),OrderDispatchStatus = _require.OrderDispatchStatus;
const _require2 = require('./listProductThumb.js'),DEFAULT_PRODUCT_PLACEHOLDER_ICON = _require2.DEFAULT_PRODUCT_PLACEHOLDER_ICON,listProductNameSkuFields = _require2.listProductNameSkuFields;

function orderCreatedMs(order) {
  if (!order) return 0;
  const raw = order.createdAt || order.created_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function productNewestOrderCreatedMs(productId, orders) {
  let max = 0;
  (orders || []).forEach((o) => {
    if (o.productId !== productId) return;
    max = Math.max(max, orderCreatedMs(o));
  });
  return max;
}

function shouldShowOrderInIncompleteList(order) {
  if (!order) return true;
  return (order.dispatchStatus || OrderDispatchStatus.IN_PROGRESS) !== OrderDispatchStatus.COMPLETED;
}

function buildOutsourceStatsByOrder(params) {
  const _params$productionLin =





    params.productionLinkMode,productionLinkMode = _params$productionLin === void 0 ? 'order' : _params$productionLin,_params$records = params.records,records = _params$records === void 0 ? [] : _params$records,_params$orders = params.orders,orders = _params$orders === void 0 ? [] : _params$orders,_params$products = params.products,products = _params$products === void 0 ? [] : _params$products,_params$nodes = params.nodes,nodes = _params$nodes === void 0 ? [] : _params$nodes;

  const ordersById = new Map((orders || []).map((o) => [o.id, o]));
  const productsById = new Map((products || []).map((p) => [p.id, p]));
  const nodesById = new Map((nodes || []).map((n) => [n.id, n]));
  const outsourceRecs = (records || []).filter(
    (r) => r.type === 'OUTSOURCE' && !r.sourceReworkId && r.partner
  );

  if (productionLinkMode === 'product') {
    const byKey = {};
    outsourceRecs.forEach((r) => {var _r$nodeId;
      if (!r.productId) return;
      const nodeId = (_r$nodeId = r.nodeId) != null ? _r$nodeId : '';
      const key = `${r.productId}|${r.partner}|${nodeId}`;
      if (!byKey[key]) {
        byKey[key] = {
          productId: r.productId,
          partner: r.partner,
          nodeId,
          dispatched: 0,
          received: 0
        };
      }
      if (r.status === '加工中') byKey[key].dispatched += Number(r.quantity) || 0;else
      if (r.status === '已收回') byKey[key].received += Number(r.quantity) || 0;
    });

    const byProduct = new Map();
    Object.values(byKey).forEach((v) => {
      const pending = v.dispatched - v.received;
      const nodeName = nodesById.get(v.nodeId) && nodesById.get(v.nodeId).name || v.nodeId || '—';
      if (!byProduct.has(v.productId)) byProduct.set(v.productId, []);
      byProduct.get(v.productId).push({
        partner: v.partner,
        nodeId: v.nodeId,
        nodeName,
        dispatched: v.dispatched,
        received: v.received,
        pending
      });
    });

    return Array.from(byProduct.entries()).
    map(([productId, partners]) => {
      const product = productsById.get(productId);
      const seq = product && product.milestoneNodeIds || [];
      const nodeOrder = (nodeId) => {
        const i = seq.indexOf(nodeId);
        return i >= 0 ? i : 9999;
      };
      const sortedPartners = [...partners].sort((a, b) => {
        const d = nodeOrder(a.nodeId) - nodeOrder(b.nodeId);
        if (d !== 0) return d;
        return String(a.partner || '').localeCompare(String(b.partner || ''));
      });
      const nameSku = listProductNameSkuFields(product);
      return {
        productId,
        productName: nameSku.productName,
        productImageUrl: product && (product.imageThumb || product.imageUrl) || '',
        productSku: nameSku.productSku,
        showProductSku: nameSku.showProductSku,
        partners: sortedPartners
      };
    }).
    sort((a, b) => {
      const d = productNewestOrderCreatedMs(b.productId, orders) -
      productNewestOrderCreatedMs(a.productId, orders);
      if (d !== 0) return d;
      return String(a.productId).localeCompare(String(b.productId));
    });
  }

  const byKey = {};
  outsourceRecs.filter((r) => r.orderId).forEach((r) => {var _r$nodeId2;
    const nodeId = (_r$nodeId2 = r.nodeId) != null ? _r$nodeId2 : '';
    const key = `${r.orderId}|${r.partner}|${nodeId}`;
    if (!byKey[key]) {
      byKey[key] = {
        orderId: r.orderId,
        partner: r.partner,
        nodeId,
        dispatched: 0,
        received: 0
      };
    }
    if (r.status === '加工中') byKey[key].dispatched += Number(r.quantity) || 0;else
    if (r.status === '已收回') byKey[key].received += Number(r.quantity) || 0;
  });

  const byOrder = new Map();
  Object.values(byKey).forEach((v) => {
    const pending = v.dispatched - v.received;
    const order = ordersById.get(v.orderId);
    const ms = (order && order.milestones || []).find((m) => m.templateId === v.nodeId);
    const nodeName = ms && ms.name ||
    nodesById.get(v.nodeId) && nodesById.get(v.nodeId).name ||
    v.nodeId ||
    '—';
    if (!byOrder.has(v.orderId)) byOrder.set(v.orderId, []);
    byOrder.get(v.orderId).push({
      partner: v.partner,
      nodeId: v.nodeId,
      nodeName,
      dispatched: v.dispatched,
      received: v.received,
      pending
    });
  });

  return Array.from(byOrder.entries()).
  map(([orderId, partners]) => {
    const order = ordersById.get(orderId);
    const product = order ? productsById.get(order.productId) : null;
    const milestoneIndex = (nodeId) => {
      const idx = (order && order.milestones || []).findIndex((m) => m.templateId === nodeId);
      return idx >= 0 ? idx : 9999;
    };
    const sortedPartners = [...partners].sort(
      (a, b) => milestoneIndex(a.nodeId) - milestoneIndex(b.nodeId)
    );
    const nameSku = listProductNameSkuFields(product, {
      name: order && order.productName,
      sku: order && order.sku
    });
    return {
      orderId,
      orderNumber: order && order.orderNumber || orderId,
      productId: order && order.productId,
      productName: nameSku.productName,
      productImageUrl: product && (product.imageThumb || product.imageUrl) || '',
      productSku: nameSku.productSku,
      showProductSku: nameSku.showProductSku,
      customer: order && order.customer || '',
      dueDate: order && order.dueDate ? String(order.dueDate).trim().slice(0, 10) : '',
      orderTotalQty: (order && order.items || []).reduce(
        (s, i) => s + (Number(i.quantity) || 0),
        0
      ),
      partners: sortedPartners
    };
  }).
  sort((a, b) => {
    const oa = ordersById.get(a.orderId);
    const ob = ordersById.get(b.orderId);
    const d = orderCreatedMs(ob) - orderCreatedMs(oa);
    if (d !== 0) return d;
    return String(a.orderNumber || '').localeCompare(String(b.orderNumber || ''));
  });
}

function filterDisplayOutsourceStats(stats, opts) {
  const _ref =





    opts || {},_ref$searchKeyword = _ref.searchKeyword,searchKeyword = _ref$searchKeyword === void 0 ? '' : _ref$searchKeyword,_ref$productionLinkMo = _ref.productionLinkMode,productionLinkMode = _ref$productionLinkMo === void 0 ? 'order' : _ref$productionLinkMo,_ref$hideZeroPendingP = _ref.hideZeroPendingPartnerOnList,hideZeroPendingPartnerOnList = _ref$hideZeroPendingP === void 0 ? false : _ref$hideZeroPendingP,_ref$onlyShowIncomple = _ref.onlyShowIncompleteOrders,onlyShowIncompleteOrders = _ref$onlyShowIncomple === void 0 ? false : _ref$onlyShowIncomple,_ref$ordersById = _ref.ordersById,ordersById = _ref$ordersById === void 0 ? new Map() : _ref$ordersById;

  let base = stats || [];
  if (hideZeroPendingPartnerOnList) {
    base = base.
    map((item) => ({
      ...item,
      partners: (item.partners || []).filter((p) => p.pending > 0)
    })).
    filter((item) => (item.partners || []).length > 0);
  }
  if (onlyShowIncompleteOrders) {
    base = base.filter((item) => {
      if (!item.orderId) return true;
      const order = ordersById.get(item.orderId);
      return order ? shouldShowOrderInIncompleteList(order) : true;
    });
  }
  const q = String(searchKeyword || '').trim().toLowerCase();
  if (!q) return base;

  return base.filter((item) => {
    const parts = [];
    if (productionLinkMode !== 'product' && item.orderNumber) parts.push(item.orderNumber);
    if (item.productName) parts.push(item.productName);
    if (item.productSku) parts.push(item.productSku);
    if (item.customer) parts.push(item.customer);
    (item.partners || []).forEach((p) => {
      if (p.partner) parts.push(p.partner);
      if (p.nodeName) parts.push(p.nodeName);
    });
    return parts.join(' ').toLowerCase().includes(q);
  });
}

function mapOutsourceCardForUi(item, productionLinkMode) {
  const partners = (item.partners || []).map((p) => {
    const dispatched = Number(p.dispatched) || 0;
    const received = Number(p.received) || 0;
    const pending = Number(p.pending) || 0;
    const progress = dispatched > 0 ?
    Math.min(100, Math.round(received / dispatched * 100)) :
    received > 0 ? 100 : 0;
    return {
      ...p,
      isCompleted: pending <= 0 && dispatched > 0,
      progress,
      metaText: `${dispatched} / ${pending}`,
      chipKey: `${p.partner}|${p.nodeId}`
    };
  });
  const productImageUrl = String(item.productImageUrl || '').trim();
  const dueDate = item.dueDate ? String(item.dueDate).trim().slice(0, 10) : '';
  const orderTotalQty = Number(item.orderTotalQty) || 0;
  return {
    cardKey: item.orderId || item.productId,
    orderId: item.orderId || '',
    productId: item.productId || '',
    orderNumber: item.orderNumber || '',
    productName: item.productName || '—',
    productImageUrl,
    productSku: item.productSku || '',
    showProductSku: item.showProductSku != null ?
    !!item.showProductSku :
    Boolean(item.productSku && item.productName && item.productSku !== item.productName),
    customer: item.customer || '',
    dueDate,
    dueDateLabel: dueDate ? `交期 ${dueDate}` : '',
    orderTotalQty,
    orderTotalQtyText: orderTotalQty > 0 ? `${orderTotalQty} 件` : '',
    showProductImage: Boolean(productImageUrl),
    placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
    showOrderNumber: productionLinkMode !== 'product' && !!item.orderNumber,
    showCustomer: productionLinkMode !== 'product' && !!item.customer,
    showDueDate: productionLinkMode !== 'product' && !!dueDate,
    showOrderTotal: productionLinkMode !== 'product' && orderTotalQty > 0,
    uniquePartners: [...new Set(partners.map((p) => p.partner))],
    partners
  };
}

function countPendingReceiveRows(receiveRows) {
  return (receiveRows || []).filter((r) => r.pending > 0).length;
}

module.exports = {
  buildOutsourceStatsByOrder,
  filterDisplayOutsourceStats,
  mapOutsourceCardForUi,
  countPendingReceiveRows,
  shouldShowOrderInIncompleteList
};