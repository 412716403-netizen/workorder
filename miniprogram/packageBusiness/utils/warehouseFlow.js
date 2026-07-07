/**
 * 仓库流水聚合（对齐 views/psi-ops/warehouseFlowHelpers.ts）
 */

const WAREHOUSE_FLOW_TYPES = [
  'PURCHASE_BILL',
  'SALES_BILL',
  'TRANSFER',
  'STOCKTAKE',
  'STOCK_IN',
  'STOCK_RETURN',
  'STOCK_OUT',
];

const warehouseFlowTypeLabel = {
  PURCHASE_BILL: '采购入库',
  PURCHASE_RETURN: '采购退货',
  SALES_BILL: '销售出库',
  SALES_RETURN: '销售退货',
  TRANSFER: '调拨',
  STOCKTAKE: '盘点',
  STOCK_IN: '生产入库',
  STOCK_RETURN: '生产退料',
  STOCK_OUT: '领料发出',
};

function formatFlowDateTime(ts) {
  if (!ts || !String(ts).trim()) return '—';
  const d = new Date(String(ts));
  if (Number.isNaN(d.getTime())) return String(ts);
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0
    || (String(ts).length > 10 && /[T\s]/.test(String(ts)));
  if (hasTime) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toFlowDateStr(ts) {
  if (!ts || !String(ts).trim()) return '';
  const d = new Date(String(ts));
  if (Number.isNaN(d.getTime())) return String(ts).slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseRecordTime(r) {
  const candidate = (r && (r.createdAt || r.timestamp)) || '';
  if (!candidate) return 0;
  const t = new Date(candidate).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function computeWarehouseFlowRows(input) {
  const {
    recordsList,
    prodRecords,
    productMap,
    warehouseMap,
    ordersList,
  } = input;

  const list = (recordsList || []).filter((r) => WAREHOUSE_FLOW_TYPES.includes(r.type));
  const psiRows = list.map((r) => {
    const product = productMap.get(r.productId);
    const dateStr = toFlowDateStr(r.createdAt || r.timestamp || '') || String(r.createdAt || r.timestamp || '').slice(0, 10);
    const displayDateTime = formatFlowDateTime(r.timestamp || r.createdAt || '');
    const inboundWarehouseId = r.type === 'TRANSFER' ? r.toWarehouseId : r.warehouseId;
    let warehouseName = '—';
    if (r.type === 'SALES_BILL') {
      warehouseName = (warehouseMap.get(r.warehouseId) || {}).name || '—';
    } else if (r.type === 'TRANSFER') {
      warehouseName = r.toWarehouseId ? ((warehouseMap.get(r.toWarehouseId) || {}).name || '—') : '—';
    } else {
      warehouseName = (warehouseMap.get(r.warehouseId) || {}).name || '—';
    }
    const qty = r.quantity ?? 0;
    const isSalesReturn = r.type === 'SALES_BILL' && qty < 0;
    const isPurchaseReturn = r.type === 'PURCHASE_BILL' && qty < 0;
    return {
      id: r.id,
      type: r.type,
      typeLabel: isSalesReturn ? '销售退货' : isPurchaseReturn ? '采购退货' : warehouseFlowTypeLabel[r.type] || r.type,
      docNumber: r.docNumber || '—',
      dateStr,
      displayDateTime,
      productId: r.productId,
      productName: (product && product.name) || '—',
      productSku: (product && product.sku) || '—',
      quantity: qty,
      warehouseId: inboundWarehouseId || r.warehouseId,
      warehouseName,
      isOutbound: r.type === 'SALES_BILL' || isPurchaseReturn,
      partner: r.partner || '—',
      record: r,
    };
  });

  function buildProdRow(type, typeLabel, fallbackDocPrefix, isOutbound) {
    return (prodRecords || []).filter((r) => r.type === type).map((r) => {
      const product = productMap.get(r.productId);
      const order = (ordersList || []).find((o) => o.id === r.orderId);
      const dateStr = toFlowDateStr(r.timestamp || '') || String(r.timestamp || '').slice(0, 10);
      const docNumber = r.docNo
        || (order && order.orderNumber ? `${fallbackDocPrefix}-${order.orderNumber}` : `${fallbackDocPrefix.slice(0, 2)}-${r.id}`);
      return {
        id: r.id,
        type,
        typeLabel,
        docNumber,
        dateStr,
        displayDateTime: formatFlowDateTime(r.timestamp || ''),
        productId: r.productId,
        productName: (product && product.name) || '—',
        productSku: (product && product.sku) || '—',
        quantity: r.quantity ?? 0,
        warehouseId: r.warehouseId,
        warehouseName: (warehouseMap.get(r.warehouseId) || {}).name || '—',
        isOutbound,
        partner: '—',
        record: r,
      };
    });
  }

  const allRows = [
    ...psiRows,
    ...buildProdRow('STOCK_IN', '生产入库', '工单入库', false),
    ...buildProdRow('STOCK_RETURN', '生产退料', '退料', false),
    ...buildProdRow('STOCK_OUT', '领料发出', '领料', true),
  ];

  const groups = new Map();
  allRows.forEach((r) => {
    const key = `${r.type}|${r.docNumber}|${r.productId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  return Array.from(groups.entries())
    .map(([key, rows]) => {
      const tsList = rows.map((r) => parseRecordTime(r.record)).filter((t) => !Number.isNaN(t) && t > 0);
      const minTs = tsList.length ? Math.min(...tsList) : 0;
      const displayRow = rows.reduce((best, cur) => {
        const tb = parseRecordTime(best.record);
        const tc = parseRecordTime(cur.record);
        if (Number.isNaN(tc) || tc <= 0) return best;
        if (Number.isNaN(tb) || tb <= 0) return cur;
        return tc < tb ? cur : best;
      }, rows[0]);
      const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
      return { ...displayRow, id: key, quantity: totalQty, _sortTs: minTs };
    })
    .sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0) || String(a.id).localeCompare(String(b.id)));
}

function formatWarehouseFlowQty(n) {
  const rounded = Math.round(Number(n) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}

function computeWarehouseFlowTotals(rows) {
  let inboundTotal = 0;
  let outboundTotal = 0;
  (rows || []).forEach((row) => {
    const qty = Number(row.quantity) || 0;
    switch (row.type) {
      case 'PURCHASE_BILL':
        if (qty >= 0) inboundTotal += qty;
        else outboundTotal += Math.abs(qty);
        break;
      case 'STOCK_IN':
      case 'STOCK_RETURN':
      case 'TRANSFER':
        inboundTotal += Math.abs(qty);
        break;
      case 'STOCK_OUT':
        outboundTotal += Math.abs(qty);
        break;
      case 'SALES_BILL':
        if (qty >= 0) outboundTotal += qty;
        else inboundTotal += Math.abs(qty);
        break;
      case 'STOCKTAKE': {
        const rec = row.record || {};
        const diff = Number(rec.diffQuantity ?? rec.diff_quantity ?? 0);
        if (diff > 0) inboundTotal += diff;
        else if (diff < 0) outboundTotal += Math.abs(diff);
        break;
      }
      default:
        break;
    }
  });
  return { inboundTotal, outboundTotal, netChange: inboundTotal - outboundTotal };
}

function filterWarehouseFlowRows(rows, filters) {
  const {
    searchKeyword,
    dateFrom,
    dateTo,
    typeFilter,
    warehouseId,
    docNumber,
  } = filters || {};

  let result = rows || [];

  if (dateFrom) {
    result = result.filter((r) => r.dateStr >= dateFrom);
  }
  if (dateTo) {
    result = result.filter((r) => r.dateStr <= dateTo);
  }
  if (warehouseId) {
    result = result.filter((r) => r.warehouseId === warehouseId || (r.record && r.record.fromWarehouseId === warehouseId));
  }
  if (docNumber) {
    const dn = String(docNumber).trim().toLowerCase();
    result = result.filter((r) => String(r.docNumber || '').toLowerCase().includes(dn));
  }
  if (typeFilter) {
    if (typeFilter === 'PURCHASE_RETURN') {
      result = result.filter((r) => r.type === 'PURCHASE_BILL' && r.quantity < 0);
    } else if (typeFilter === 'SALES_RETURN') {
      result = result.filter((r) => r.type === 'SALES_BILL' && r.quantity < 0);
    } else {
      result = result.filter((r) => r.type === typeFilter && !(typeFilter === 'PURCHASE_BILL' && r.quantity < 0) && !(typeFilter === 'SALES_BILL' && r.quantity < 0));
    }
  }
  const term = String(searchKeyword || '').trim().toLowerCase();
  if (term) {
    result = result.filter((r) =>
      String(r.productName || '').toLowerCase().includes(term)
      || String(r.productSku || '').toLowerCase().includes(term)
      || String(r.docNumber || '').toLowerCase().includes(term)
      || String(r.partner || '').toLowerCase().includes(term));
  }
  return result;
}

function filterProductFlowRows(rows, productId, warehouseId) {
  let result = rows || [];
  if (productId) result = result.filter((r) => r.productId === productId);
  if (warehouseId) {
    result = result.filter((r) =>
      r.warehouseId === warehouseId
      || (r.record && (r.record.warehouseId === warehouseId || r.record.fromWarehouseId === warehouseId || r.record.toWarehouseId === warehouseId)));
  }
  return result;
}

function buildFlowDetailUrl(row) {
  const doc = encodeURIComponent(row.docNumber || '');
  switch (row.type) {
    case 'PURCHASE_BILL':
      return `/packageBusiness/psi-purchase-bill-detail/psi-purchase-bill-detail?docNumber=${doc}`;
    case 'SALES_BILL':
      return `/packageBusiness/psi-sales-bill-detail/psi-sales-bill-detail?docNumber=${doc}`;
    case 'TRANSFER':
      return `/packageBusiness/psi-warehouse-transfer-detail/psi-warehouse-transfer-detail?docNumber=${doc}`;
    case 'STOCKTAKE':
      return `/packageBusiness/psi-warehouse-stocktake-detail/psi-warehouse-stocktake-detail?docNumber=${doc}`;
    case 'STOCK_IN': {
      const rec = row.record || {};
      const docNo = rec.docNo || row.docNumber || '';
      const q = [`docNo=${encodeURIComponent(docNo)}`];
      if (row.productId) q.push(`productId=${encodeURIComponent(row.productId)}`);
      if (rec.orderId) q.push(`orderId=${encodeURIComponent(rec.orderId)}`);
      return `/packageBusiness/production-order-stock-in-detail/production-order-stock-in-detail?${q.join('&')}`;
    }
    case 'STOCK_OUT':
    case 'STOCK_RETURN': {
      const rec = row.record || {};
      const docNo = rec.docNo || row.docNumber || '';
      return `/packageBusiness/production-stock-out-detail/production-stock-out-detail?docNo=${encodeURIComponent(docNo)}`;
    }
    default:
      return '';
  }
}

module.exports = {
  WAREHOUSE_FLOW_TYPES,
  warehouseFlowTypeLabel,
  formatFlowDateTime,
  toFlowDateStr,
  parseRecordTime,
  computeWarehouseFlowRows,
  formatWarehouseFlowQty,
  computeWarehouseFlowTotals,
  filterWarehouseFlowRows,
  filterProductFlowRows,
  buildFlowDetailUrl,
};
