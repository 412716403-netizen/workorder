/**
 * 工单流水筛选与展示（对齐 views/OrderFlowView.tsx）
 */
const { localTodayYmd } = require('./dateYmd.js');
const { DEFAULT_PRODUCT_PLACEHOLDER_ICON } = require('./listProductThumb.js');

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
  const raw = (createdAt ?? '').trim();
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
  const {
    dateFrom,
    dateTo,
    orderNumberKeyword = '',
    productNameKeyword = '',
  } = filters || {};

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
        (o.sku || '').toLowerCase().includes(kw),
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
  const {
    showDispatch = true,
    showDueDate = true,
    dispatchLabel = '',
    dispatchPillClass = '',
    productName,
    productSku,
    showProductSku,
    productImageUrl = '',
    showProductImage,
    placeholderIconSrc = DEFAULT_PRODUCT_PLACEHOLDER_ICON,
  } = opts || {};
  const qty = sumOrderItemsQty(order);
  const sku = productSku != null ? productSku : (order.sku || '');
  const imageUrl = productImageUrl || '';
  return {
    id: order.id,
    placedLabel: formatOrderFlowPlacedDisplay(order.createdAt, order.id),
    orderNumber: order.orderNumber || '',
    productName: productName != null ? productName : (order.productName || ''),
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
    showDueDate: showDueDate && Boolean(order.dueDate),
  };
}

module.exports = {
  localTodayYmd,
  getOrderDateYmd,
  formatOrderFlowPlacedDisplay,
  sumOrderItemsQty,
  filterOrdersForFlow,
  computeFlowStats,
  mapFlowRow,
};
