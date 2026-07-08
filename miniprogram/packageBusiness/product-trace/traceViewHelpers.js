/**
 * 产品追溯页展示辅助（对齐 Web views/TraceView.tsx）
 * 与 product-trace 同目录，确保分包页面加载时一并打包。
 */

function formatItemCodeSerialLabel(planNumber, serialNo, opts) {
  const batchSequenceNo = opts && opts.batchSequenceNo;
  const batchPieceNo = opts && opts.batchPieceNo;
  if (
    batchSequenceNo != null &&
    batchSequenceNo > 0 &&
    batchPieceNo != null &&
    batchPieceNo > 0
  ) {
    return planNumber + '-' + batchSequenceNo + '-' + batchPieceNo;
  }
  return planNumber + '-' + serialNo;
}

function buildSerialLabel(scan) {
  if (!scan) return '';
  if (scan.serialLabel && String(scan.serialLabel).trim()) {
    return String(scan.serialLabel).trim();
  }
  if (scan.planNumber != null && scan.serialNo != null) {
    return formatItemCodeSerialLabel(scan.planNumber, scan.serialNo, {
      batchSequenceNo: scan.batchSequenceNo,
      batchPieceNo: scan.batchPieceNo,
    });
  }
  return (scan.productName || scan.sku || '').trim() || '—';
}

function relationLabel(r) {
  switch (r) {
    case 'OWNER':
      return '本企业原码';
    case 'DOWNSTREAM':
      return '下游承接';
    case 'UPSTREAM':
      return '上游派发';
    case 'PEER':
      return '同树协作';
    default:
      return r || '';
  }
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function formatTraceTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || '');
  return (
    d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
  );
}

function eventMeta(event) {
  const kind = event && event.kind;
  const subKind = event && event.subKind;
  switch (kind) {
    case 'REPORT':
      return { title: '工序报工', dotClass: 'trace-dot--indigo', bgClass: 'trace-icon--indigo' };
    case 'OUTSOURCE':
      return {
        title: subKind && String(subKind).indexOf('RECEIVE') >= 0 ? '外协收货' : '外协发出',
        dotClass: 'trace-dot--amber',
        bgClass: 'trace-icon--amber',
      };
    case 'REWORK':
      return { title: '返工', dotClass: 'trace-dot--rose', bgClass: 'trace-icon--rose' };
    case 'STOCK':
      return {
        title:
          subKind === 'STOCK_IN'
            ? '生产入库'
            : subKind && String(subKind).indexOf('OUT') >= 0
              ? '出库'
              : '入库',
        dotClass: 'trace-dot--emerald',
        bgClass: 'trace-icon--emerald',
      };
    case 'TRANSFER':
      return { title: '调拨', dotClass: 'trace-dot--sky', bgClass: 'trace-icon--sky' };
    default:
      return {
        title: subKind || '其他',
        dotClass: 'trace-dot--slate',
        bgClass: 'trace-icon--slate',
      };
  }
}

function buildSummaryFields(scan) {
  if (!scan) return [];
  const fields = [
    { label: '产品', value: scan.productName || scan.sku || '-' },
    { label: '规格', value: scan.variantLabel || '（无规格）' },
    { label: '计划单', value: scan.planNumber || '-' },
    { label: '所属企业', value: scan.ownerTenantName || '-' },
  ];
  if (scan.batchSerialLabel) {
    fields.push({ label: '所属批次', value: scan.batchSerialLabel });
  }
  if (Array.isArray(scan.orderNumbers) && scan.orderNumbers.length > 0) {
    fields.push({ label: '所属工单', value: scan.orderNumbers.join('，') });
  }
  return fields;
}

function buildCallerContextText(scan) {
  const ctx = scan && scan.callerContext;
  if (!ctx || !ctx.callerPlanOrderId || ctx.relation === 'OWNER') return '';
  const parts = ['关系 ' + relationLabel(ctx.relation)];
  if (ctx.callerPlanNumber) parts.push('计划 ' + ctx.callerPlanNumber);
  if (Array.isArray(ctx.callerOrderNumbers) && ctx.callerOrderNumbers.length > 0) {
    parts.push('工单 ' + ctx.callerOrderNumbers.join('，'));
  }
  return parts.join(' · ');
}

function buildTraceEventRow(event) {
  const meta = eventMeta(event);
  return {
    key: event.kind + '-' + event.id,
    title: meta.title,
    dotClass: meta.dotClass,
    bgClass: meta.bgClass,
    time: formatTraceTime(event.timestamp),
    tenantName: event.tenantName || '',
    quantity: event.quantity != null ? String(event.quantity) : '',
    orderNumber: event.orderNumber || '',
    nodeName: event.nodeName || '',
    operator: event.operator || '',
    partner: event.partner || '',
    notes: event.notes || '',
  };
}

function buildTraceStatsText(trace) {
  if (!trace) return '';
  const loaded = Array.isArray(trace.events) ? trace.events.length : 0;
  const tenants = Array.isArray(trace.tenants) ? trace.tenants.length : 0;
  let text = '已加载 ' + loaded;
  if (trace.total != null) text += ' / 共 ' + trace.total;
  text += ' 条事件 · ' + tenants + ' 家企业';
  return text;
}

function buildLoadMoreText(trace) {
  if (!trace || !trace.hasMore) return '';
  const loaded = Array.isArray(trace.events) ? trace.events.length : 0;
  if (trace.total != null) {
    const remain = Math.max(0, trace.total - loaded);
    return '加载更多（约 ' + remain + ' 条未显示）';
  }
  return '加载更多';
}

module.exports = {
  buildSerialLabel,
  buildSummaryFields,
  buildCallerContextText,
  buildTraceEventRow,
  buildTraceStatsText,
  buildLoadMoreText,
  relationLabel,
  formatTraceTime,
};
