/**
 * 外协流水列表（对齐 Web OutsourceFlowListModal）
 */

const { flowRecordsEarliestMs } = require('./flowDocSortLite.js');
const { listProductThumbFromProduct } = require('./listProductThumb.js');

const TYPE_FILTER_LABELS = ['全部类型', '外协发出', '外协收回'];
const TYPE_FILTER_VALUES = ['', 'dispatch', 'receive'];

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

function typeStrFromRecords(recs) {
  const hasDispatch = (recs || []).some((r) => r.status !== '已收回');
  const hasReceive = (recs || []).some((r) => r.status === '已收回');
  if (hasDispatch && hasReceive) return '发出、收回';
  if (hasDispatch) return '外协发出';
  if (hasReceive) return '外协收回';
  return '—';
}

function buildOutsourceFlowSummaryRows(records, opts) {
  const {
    productionLinkMode = 'order',
    ordersById = new Map(),
    productsById = new Map(),
    nodesById = new Map(),
  } = opts || {};

  const isProductMode = productionLinkMode === 'product';
  const list = (records || []).filter((r) => r.type === 'OUTSOURCE' && !r.sourceReworkId);
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
    const order = first.orderId ? ordersById.get(first.orderId) : null;
    const product = productsById.get(first.productId || (order && order.productId));
    const node = nodesById.get(first.nodeId);
    const typeStr = typeStrFromRecords(sorted);
    const isReceiveOnly = sorted.every((r) => r.status === '已收回');
    const flowType = isReceiveOnly ? 'receive' : 'dispatch';
    const thumb = listProductThumbFromProduct(product);
    const partnerLabel = first.partner || '—';
    const milestoneLabel = (node && node.name) || first.nodeId || '—';
    const milestonePartnerLine = partnerLabel !== '—'
      ? `${milestoneLabel} · ${partnerLabel}`
      : milestoneLabel;

    rows.push({
      batchKey: docNo,
      docNo,
      records: sorted,
      timeLabel,
      timestampMs: ms || new Date(first.timestamp || 0).getTime(),
      totalQuantity,
      totalQtyText: `${totalQuantity} 件`,
      typeStr,
      flowType,
      partner: partnerLabel,
      showPartner: partnerLabel !== '—',
      milestoneStr: milestoneLabel,
      milestonePartnerLine,
      nodeId: first.nodeId || '',
      orderNumber: (order && order.orderNumber) || first.orderNumber || '',
      productName: (product && product.name) || first.productName || '—',
      showOrderNumber: !isProductMode && !!((order && order.orderNumber) || first.orderNumber),
      titleLine: isProductMode
        ? ((product && product.name) || first.productName || '—')
        : `${(order && order.orderNumber) || first.orderNumber || '—'} · ${(product && product.name) || first.productName || '—'}`,
      ...thumb,
    });
  });

  return rows.sort((a, b) => {
    if (b.timestampMs !== a.timestampMs) return b.timestampMs - a.timestampMs;
    return String(a.docNo).localeCompare(String(b.docNo));
  });
}

function filterOutsourceFlowRows(rows, opts) {
  const {
    searchKeyword = '',
    typeFilter = '',
    orderKeyword = '',
    productKeyword = '',
    partnerKeyword = '',
    milestoneNodeId = '',
  } = opts || {};

  let out = rows || [];
  const q = String(searchKeyword || '').trim().toLowerCase();
  if (q) {
    out = out.filter((row) => {
      const parts = [row.docNo, row.orderNumber, row.productName, row.partner, row.milestoneStr, row.typeStr];
      return parts.join(' ').toLowerCase().includes(q);
    });
  }
  if (typeFilter === 'dispatch') {
    out = out.filter((row) => row.flowType === 'dispatch' || row.typeStr.includes('发出'));
  } else if (typeFilter === 'receive') {
    out = out.filter((row) => row.flowType === 'receive' || row.typeStr.includes('收回'));
  }
  const ok = String(orderKeyword || '').trim().toLowerCase();
  if (ok) out = out.filter((row) => String(row.orderNumber || '').toLowerCase().includes(ok));
  const pk = String(productKeyword || '').trim().toLowerCase();
  if (pk) out = out.filter((row) => String(row.productName || '').toLowerCase().includes(pk));
  const pt = String(partnerKeyword || '').trim().toLowerCase();
  if (pt) out = out.filter((row) => String(row.partner || '').toLowerCase().includes(pt));
  if (milestoneNodeId) {
    out = out.filter((row) => (row.records || []).some((r) => r.nodeId === milestoneNodeId));
  }
  return out;
}

function buildFlowMilestoneOptions(summaryRows, nodesById) {
  const nodes = nodesById || new Map();
  const seen = new Set();
  const rest = [];
  (summaryRows || []).forEach((row) => {
    const ids = new Set((row.records || []).map((r) => r.nodeId).filter(Boolean));
    if (row.nodeId) ids.add(row.nodeId);
    ids.forEach((id) => {
      if (seen.has(id)) return;
      seen.add(id);
      const node = nodes.get(id);
      rest.push({
        id,
        name: (node && node.name) || row.milestoneStr || id,
      });
    });
  });
  rest.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return [{ id: '', name: '全部工序' }].concat(rest);
}

function computeOutsourceFlowStats(rows) {
  const batchCount = (rows || []).length;
  const totalQty = (rows || []).reduce((s, r) => s + (Number(r.totalQuantity) || 0), 0);
  return {
    batchCount,
    totalQty,
    footerText: `共 ${batchCount} 单 · ${totalQty} 件`,
  };
}

module.exports = {
  TYPE_FILTER_LABELS,
  TYPE_FILTER_VALUES,
  buildOutsourceFlowSummaryRows,
  buildFlowMilestoneOptions,
  filterOutsourceFlowRows,
  computeOutsourceFlowStats,
};
