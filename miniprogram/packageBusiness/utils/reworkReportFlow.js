/**
 * 返工报工流水列表（对齐 Web ReworkReportFlowListModal）
 */

const { flowRecordsEarliestMs } = require('./flowDocSortLite.js');
const { listProductDisplayFields } = require('./listProductThumb.js');
const {
  buildReworkByIdMap,
  buildReworkReportOperatorColumnLabel,
  recordMatchesOperatorKeyword,
} = require('./reworkReportOperator.js');

function formatReportTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function docGroupKey(r, isProductMode) {
  const doc = r.docNo || '—';
  if (isProductMode) return `${doc}|${r.productId || ''}`;
  return `${doc}|${r.orderId || ''}|${r.productId || ''}`;
}

function buildReworkReportFlowSummaryRows(records, opts) {
  const {
    productionLinkMode = 'order',
    ordersById = new Map(),
    productsById = new Map(),
    nodesById = new Map(),
  } = opts || {};

  const isProductMode = productionLinkMode === 'product';
  const reworkById = opts.reworkById || buildReworkByIdMap(records);
  const list = (records || []).filter((r) => r.type === 'REWORK_REPORT');
  const byKey = new Map();
  list.forEach((r) => {
    const k = docGroupKey(r, isProductMode);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  });

  const rows = [];
  byKey.forEach((recs) => {
    const sorted = [...recs].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    const first = sorted[0];
    const docNo = first.docNo || first.id || '—';
    const ms = flowRecordsEarliestMs(sorted);
    const timeLabel = ms > 0 ? formatReportTime(new Date(ms).toISOString()) : formatReportTime(first.timestamp);
    const totalQuantity = sorted.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const totalAmount = sorted.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const order = first.orderId ? ordersById.get(first.orderId) : null;
    const product = productsById.get(first.productId || (order && order.productId));
    const node = nodesById.get(first.nodeId);
    const productDisplay = listProductDisplayFields(product, {
      name: first.productName || (order && order.productName),
      sku: first.sku || (order && order.sku),
    });
    const milestoneLabel = (node && node.name) || first.nodeId || '—';
    const operatorLabel = buildReworkReportOperatorColumnLabel(sorted, reworkById);
    rows.push({
      batchKey: docNo,
      docNo,
      records: sorted,
      timeLabel,
      timestampMs: ms || new Date(first.timestamp || 0).getTime(),
      totalQuantity,
      totalQtyText: `${totalQuantity} 件`,
      totalAmount,
      showAmount: totalAmount > 0,
      amountText: totalAmount > 0 ? `¥${totalAmount.toFixed(2)}` : '',
      milestoneStr: milestoneLabel,
      nodeId: first.nodeId || '',
      orderNumber: (order && order.orderNumber) || first.orderNumber || '',
      showOrderNumber: !isProductMode && !!((order && order.orderNumber) || first.orderNumber),
      titleLine: isProductMode
        ? productDisplay.productName
        : `${(order && order.orderNumber) || first.orderNumber || '—'} · ${productDisplay.productName}`,
      operator: operatorLabel,
      showOperator: operatorLabel !== '—',
      ...productDisplay,
    });
  });

  return rows.sort((a, b) => {
    if (b.timestampMs !== a.timestampMs) return b.timestampMs - a.timestampMs;
    return String(a.docNo).localeCompare(String(b.docNo));
  });
}

function filterReworkReportFlowRows(rows, opts) {
  const {
    searchKeyword = '',
    orderKeyword = '',
    productKeyword = '',
    milestoneNodeId = '',
    reworkById,
  } = opts || {};

  let out = rows || [];
  const q = String(searchKeyword || '').trim().toLowerCase();
  if (q) {
    out = out.filter((row) => {
      const parts = [row.docNo, row.orderNumber, row.productName, row.productSku, row.milestoneStr, row.operator];
      if (parts.join(' ').toLowerCase().includes(q)) return true;
      return (row.records || []).some((rec) => recordMatchesOperatorKeyword(rec, q, reworkById));
    });
  }
  if (orderKeyword) {
    const ok = String(orderKeyword).trim().toLowerCase();
    out = out.filter((row) => String(row.orderNumber || '').toLowerCase().includes(ok));
  }
  if (productKeyword) {
    const pk = String(productKeyword).trim().toLowerCase();
    out = out.filter((row) => String(row.productName || '').toLowerCase().includes(pk));
  }
  if (milestoneNodeId) {
    out = out.filter((row) => row.nodeId === milestoneNodeId);
  }
  return out;
}

function computeReworkReportFlowStats(rows) {
  const count = (rows || []).length;
  const totalQty = (rows || []).reduce((s, r) => s + (Number(r.totalQuantity) || 0), 0);
  return { footerText: `共 ${count} 单 · ${totalQty} 件` };
}

function buildReportFlowMilestoneOptions(records, nodesById) {
  const ids = new Set();
  (records || []).forEach((r) => {
    if (r.nodeId) ids.add(r.nodeId);
  });
  const options = [{ id: '', name: '全部工序' }];
  [...ids].forEach((id) => {
    options.push({ id, name: (nodesById.get(id) && nodesById.get(id).name) || id });
  });
  return options;
}

module.exports = {
  buildReworkReportFlowSummaryRows,
  filterReworkReportFlowRows,
  computeReworkReportFlowStats,
  buildReportFlowMilestoneOptions,
};
