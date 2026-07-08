/**
 * 工单流水筛选与展示（对齐 views/OrderFlowView.tsx）
 */
const _require = require('./dateYmd.js'),localTodayYmd = _require.localTodayYmd;
const _require2 = require('./listProductThumb.js'),DEFAULT_PRODUCT_PLACEHOLDER_ICON = _require2.DEFAULT_PRODUCT_PLACEHOLDER_ICON;

const YMD_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function pad(n) {
  return String(n).padStart(2, '0');
}

function toLocalDateYmd(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getOrderDateYmd(order) {
  if (order.createdAt) {
    const t = String(order.createdAt).trim();
    if (YMD_ONLY.test(t)) return t;
    return toLocalDateYmd(order.createdAt);
  }
  const m = String(order.id || '').match(/^ord-([^-]+)-/);
  if (m) {
    const ts = parseInt(m[1], 36);
    if (!Number.isNaN(ts)) return toLocalDateYmd(new Date(ts));
  }
  return order.startDate ? toLocalDateYmd(order.startDate) : '';
}

function formatOrderFlowPlacedDisplay(createdAt, orderId) {
  const raw = (createdAt != null ? createdAt : '').trim();
  if (raw) {
    if (YMD_ONLY.test(raw)) return raw;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return toLocalDateYmd(raw) || raw.slice(0, 10);
    if (raw.length <= 10) return raw.slice(0, 10);
    return `${toLocalDateYmd(raw)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  const m = String(orderId || '').match(/^ord-([^-]+)-/);
  if (!m) return '';
  const ts = parseInt(m[1], 36);
  if (Number.isNaN(ts)) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function sumOrderItemsQty(order) {
  return (order.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
}

function filterOrdersForFlow(orders, filters) {
  const _ref =




    filters || {},dateFrom = _ref.dateFrom,dateTo = _ref.dateTo,_ref$orderNumberKeywo = _ref.orderNumberKeyword,orderNumberKeyword = _ref$orderNumberKeywo === void 0 ? '' : _ref$orderNumberKeywo,_ref$productNameKeywo = _ref.productNameKeyword,productNameKeyword = _ref$productNameKeywo === void 0 ? '' : _ref$productNameKeywo;

  let list = [...(orders || [])];

  if (dateFrom) {
    list = list.filter((o) => {
      const d = getOrderDateYmd(o);
      return d && d >= dateFrom;
    });
  }
  if (dateTo) {
    list = list.filter((o) => {
      const d = getOrderDateYmd(o);
      return d && d <= dateTo;
    });
  }
  if (orderNumberKeyword.trim()) {
    const kw = orderNumberKeyword.trim().toLowerCase();
    list = list.filter((o) => (o.orderNumber || '').toLowerCase().includes(kw));
  }
  if (productNameKeyword.trim()) {
    const kw = productNameKeyword.trim().toLowerCase();
    list = list.filter(
      (o) =>
      (o.productName || '').toLowerCase().includes(kw) ||
      (o.sku || '').toLowerCase().includes(kw)
    );
  }

  list.sort((a, b) => {
    const da = getOrderDateYmd(a);
    const db = getOrderDateYmd(b);
    if (da !== db) return db.localeCompare(da);
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ta !== tb) return tb - ta;
    return (b.id || '').localeCompare(a.id || '');
  });

  return list;
}

function computeFlowStats(orders) {
  const count = orders.length;
  const totalQty = orders.reduce((s, o) => s + sumOrderItemsQty(o), 0);
  return { count, totalQty };
}

function mapFlowRow(order, opts) {
  const _ref2 =










    opts || {},_ref2$showDispatch = _ref2.showDispatch,showDispatch = _ref2$showDispatch === void 0 ? true : _ref2$showDispatch,_ref2$showDueDate = _ref2.showDueDate,showDueDate = _ref2$showDueDate === void 0 ? true : _ref2$showDueDate,_ref2$dispatchLabel = _ref2.dispatchLabel,dispatchLabel = _ref2$dispatchLabel === void 0 ? '' : _ref2$dispatchLabel,_ref2$dispatchPillCla = _ref2.dispatchPillClass,dispatchPillClass = _ref2$dispatchPillCla === void 0 ? '' : _ref2$dispatchPillCla,productName = _ref2.productName,productSku = _ref2.productSku,showProductSku = _ref2.showProductSku,_ref2$productImageUrl = _ref2.productImageUrl,productImageUrl = _ref2$productImageUrl === void 0 ? '' : _ref2$productImageUrl,showProductImage = _ref2.showProductImage,_ref2$placeholderIcon = _ref2.placeholderIconSrc,placeholderIconSrc = _ref2$placeholderIcon === void 0 ? DEFAULT_PRODUCT_PLACEHOLDER_ICON : _ref2$placeholderIcon;
  const qty = sumOrderItemsQty(order);
  const sku = productSku != null ? productSku : order.sku || '';
  const imageUrl = productImageUrl || '';
  return {
    id: order.id,
    placedLabel: formatOrderFlowPlacedDisplay(order.createdAt, order.id),
    orderNumber: order.orderNumber || '',
    productName: productName != null ? productName : order.productName || '',
    productSku: sku,
    showProductSku: showProductSku != null ? !!showProductSku : Boolean(sku),
    productImageUrl: imageUrl,
    showProductImage: showProductImage != null ? !!showProductImage : Boolean(String(imageUrl).trim()),
    placeholderIconSrc,
    quantityText: `${qty} 件`,
    showDispatch,
    dispatchLabel,
    dispatchPillClass,
    dueDateLabel: order.dueDate ? String(order.dueDate).slice(0, 10) : '',
    showDueDate: showDueDate && Boolean(order.dueDate)
  };
}

module.exports = {
  localTodayYmd,
  getOrderDateYmd,
  formatOrderFlowPlacedDisplay,
  sumOrderItemsQty,
  filterOrdersForFlow,
  computeFlowStats,
  mapFlowRow
};