/**
 * 处理不良流水列表（对齐 Web DefectTreatmentFlowListModal）
 */

const { flowRecordsEarliestMs } = require('./flowDocSortLite.js');
const { listProductDisplayFields } = require('./listProductThumb.js');

const TYPE_FILTER_LABELS = ['全部类型', '返工', '委外返工', '报损'];
const TYPE_FILTER_VALUES = ['', 'REWORK', 'REWORK_OUTSOURCE', 'SCRAP'];

function isOutsourceReworkRecord(r) {
  if (!r || r.type !== 'REWORK') return false;
  return String(r.partner || '').trim() !== '' || r.status === '委外返工中';
}

function reworkTypeLabel(r) {
  if (!r) return '—';
  if (r.type === 'SCRAP') return '报损';
  if (r.type === 'REWORK') return isOutsourceReworkRecord(r) ? '委外返工' : '返工';
  return '—';
}

function primaryRecordType(recs) {
  const list = recs || [];
  if (list.some((r) => r.type === 'REWORK')) {
    return list.some((r) => isOutsourceReworkRecord(r)) ? 'REWORK_OUTSOURCE' : 'REWORK';
  }
  if (list.some((r) => r.type === 'SCRAP')) return 'SCRAP';
  return '';
}

function collectOutsourcePartners(recs) {
  return [...new Set(
    (recs || [])
      .filter(isOutsourceReworkRecord)
      .map((r) => String(r.partner || '').trim())
      .filter(Boolean),
  )];
}

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
  const labels = new Set();
  (recs || []).forEach((r) => {
    const label = reworkTypeLabel(r);
    if (label !== '—') labels.add(label);
  });
  if (!labels.size) return '—';
  return [...labels].join('、');
}

function buildDefectFlowSummaryRows(records, opts) {
  const {
    productionLinkMode = 'order',
    ordersById = new Map(),
    productsById = new Map(),
    nodesById = new Map(),
  } = opts || {};

  const isProductMode = productionLinkMode === 'product';
  const list = (records || []).filter((r) => r.type === 'REWORK' || r.type === 'SCRAP');
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
    const sourceNodeId = first.type === 'REWORK' ? (first.sourceNodeId || first.nodeId) : first.nodeId;
    const node = nodesById.get(sourceNodeId);
    const typeStr = typeStrFromRecords(sorted);
    const productDisplay = listProductDisplayFields(product, {
      name: first.productName || (order && order.productName),
      sku: first.sku || (order && order.sku),
    });
    const milestoneLabel = (node && node.name) || sourceNodeId || '—';
    const partnerLabels = collectOutsourcePartners(sorted);
    const partnerLabel = partnerLabels.join('、');
    const recordType = primaryRecordType(sorted);
    rows.push({
      batchKey: docNo,
      docNo,
      records: sorted,
      timeLabel,
      timestampMs: ms || new Date(first.timestamp || 0).getTime(),
      totalQuantity,
      totalQtyText: `${totalQuantity} 件`,
      typeStr,
      recordType,
      partner: partnerLabel,
      showPartner: partnerLabels.length > 0,
      milestoneStr: milestoneLabel,
      milestonePartnerLine: partnerLabel ? `${milestoneLabel} · ${partnerLabel}` : milestoneLabel,
      nodeId: sourceNodeId || '',
      orderNumber: (order && order.orderNumber) || first.orderNumber || '',
      showOrderNumber: !isProductMode && !!((order && order.orderNumber) || first.orderNumber),
      titleLine: isProductMode
        ? productDisplay.productName
        : `${(order && order.orderNumber) || first.orderNumber || '—'} · ${productDisplay.productName}`,
      ...productDisplay,
    });
  });

  return rows.sort((a, b) => {
    if (b.timestampMs !== a.timestampMs) return b.timestampMs - a.timestampMs;
    return String(a.docNo).localeCompare(String(b.docNo));
  });
}

function filterDefectFlowRows(rows, opts) {
  const {
    searchKeyword = '',
    typeFilter = '',
    orderKeyword = '',
    productKeyword = '',
    milestoneNodeId = '',
  } = opts || {};

  let out = rows || [];
  const q = String(searchKeyword || '').trim().toLowerCase();
  if (q) {
    out = out.filter((row) => {
      const parts = [row.docNo, row.orderNumber, row.productName, row.productSku, row.partner, row.milestoneStr, row.typeStr];
      return parts.join(' ').toLowerCase().includes(q);
    });
  }
  if (typeFilter) {
    out = out.filter((row) => {
      const recs = row.records || [];
      if (typeFilter === 'REWORK') {
        return recs.some((r) => r.type === 'REWORK' && !isOutsourceReworkRecord(r));
      }
      if (typeFilter === 'REWORK_OUTSOURCE') {
        return recs.some((r) => isOutsourceReworkRecord(r));
      }
      if (typeFilter === 'SCRAP') return recs.some((r) => r.type === 'SCRAP');
      return true;
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

function computeDefectFlowStats(rows) {
  const count = (rows || []).length;
  const totalQty = (rows || []).reduce((s, r) => s + (Number(r.totalQuantity) || 0), 0);
  return { footerText: `共 ${count} 单 · ${totalQty} 件` };
}

function buildFlowMilestoneOptions(records, nodesById) {
  const ids = new Set();
  (records || []).forEach((r) => {
    const nid = r.type === 'REWORK' ? (r.sourceNodeId || r.nodeId) : r.nodeId;
    if (nid) ids.add(nid);
  });
  const options = [{ id: '', name: '全部工序' }];
  [...ids].forEach((id) => {
    options.push({ id, name: (nodesById.get(id) && nodesById.get(id).name) || id });
  });
  return options;
}

module.exports = {
  TYPE_FILTER_LABELS,
  TYPE_FILTER_VALUES,
  isOutsourceReworkRecord,
  reworkTypeLabel,
  collectOutsourcePartners,
  buildDefectFlowSummaryRows,
  filterDefectFlowRows,
  computeDefectFlowStats,
  buildFlowMilestoneOptions,
};
