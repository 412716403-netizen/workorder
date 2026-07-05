/**
 * 加工厂往来数量明细（对齐 utils/outsourcePartnerFlowDetail.ts）
 */

const { flowRecordsEarliestMs, formatLocalDateTimeZh } = require('./flowDocSortLite.js');
const { productHasColorSizeMatrix, variantLabel } = require('./productionPlans.js');
const { sortVariantsByColorThenSize } = require('./variantQtyMatrix.js');

const OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY = 'outsourceDispatchDeliveryDate';

const DOC_TYPE_FILTER_LABELS = ['全部类型', '外协发出', '外协收回'];
const DOC_TYPE_FILTER_VALUES = ['all', 'dispatch', 'receive'];

function deliveryDateDisplayFromDocRecords(recs) {
  const src = (recs || []).find((r) => r.status !== '已收回') || (recs || [])[0];
  const raw = src && src.collabData && src.collabData[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY];
  if (typeof raw !== 'string') return '—';
  const t = raw.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : raw.trim() || '—';
}

function typeLabelFromRecords(recs) {
  const hasDispatch = (recs || []).some((r) => r.status !== '已收回');
  const hasReceive = (recs || []).some((r) => r.status === '已收回');
  if (hasDispatch && hasReceive) return '发出、收回';
  if (hasDispatch) return '外协发出';
  if (hasReceive) return '外协收回';
  return '—';
}

function docGroupKey(r, isProductMode) {
  const doc = r.docNo || '—';
  if (isProductMode) return `${doc}|${r.productId || ''}`;
  return `${doc}|${r.orderId || ''}|${r.productId || ''}`;
}

function aggregateOutsourceQtyByVariant(recs) {
  const m = {};
  (recs || []).forEach((r) => {
    const vid = String(r.variantId || '').trim();
    if (!vid) return;
    const q = Number(r.quantity) || 0;
    m[vid] = (m[vid] || 0) + q;
  });
  return m;
}

function filterPartnerNodeOutsourceRecords(records, opts) {
  const {
    productionLinkMode,
    orderId,
    productId,
    partner,
    nodeId,
  } = opts;
  return (records || []).filter((r) => {
    if (r.type !== 'OUTSOURCE' || r.sourceReworkId) return false;
    if ((r.partner || '') !== (partner || '')) return false;
    if ((r.nodeId || '') !== (nodeId || '')) return false;
    if (productionLinkMode === 'product') {
      return !r.orderId && (r.productId || '') === productId;
    }
    return (r.orderId || '') === (orderId || '') && (r.productId || '') === productId;
  });
}

function buildPartnerFlowDocRows(filtered, isProductMode) {
  const byKey = new Map();
  (filtered || []).forEach((r) => {
    const k = docGroupKey(r, isProductMode);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  });

  return Array.from(byKey.values())
    .map((recs) => {
      const sorted = [...recs].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
      const ms = flowRecordsEarliestMs(sorted);
      const dateDisplay = ms > 0
        ? formatLocalDateTimeZh(new Date(ms))
        : ((sorted[0] && sorted[0].timestamp) || '').trim() || '—';
      const totalQty = sorted.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      const typeLabel = typeLabelFromRecords(sorted);
      return {
        docNo: (sorted[0] && sorted[0].docNo) || '—',
        records: sorted,
        dateDisplay,
        typeLabel,
        deliveryDateDisplay: deliveryDateDisplayFromDocRecords(sorted),
        totalQty,
        variantQty: aggregateOutsourceQtyByVariant(sorted),
        hasDispatch: typeLabel.includes('发出'),
        hasReceive: typeLabel.includes('收回'),
      };
    })
    .sort((a, b) => {
      const ta = flowRecordsEarliestMs(a.records);
      const tb = flowRecordsEarliestMs(b.records);
      if (tb !== ta) return tb - ta;
      return String(a.docNo || '').localeCompare(String(b.docNo || ''));
    });
}

function computeDispatchReceiveRemaining(filtered) {
  let dispatchTotal = 0;
  let receiveTotal = 0;
  const dispatchByVariant = {};
  const receiveByVariant = {};
  (filtered || []).forEach((r) => {
    const q = Number(r.quantity) || 0;
    const vid = String(r.variantId || '').trim();
    if (r.status === '已收回') {
      receiveTotal += q;
      if (vid) receiveByVariant[vid] = (receiveByVariant[vid] || 0) + q;
    } else {
      dispatchTotal += q;
      if (vid) dispatchByVariant[vid] = (dispatchByVariant[vid] || 0) + q;
    }
  });
  const remainingTotal = dispatchTotal - receiveTotal;
  const keys = new Set([
    ...Object.keys(dispatchByVariant),
    ...Object.keys(receiveByVariant),
  ]);
  const remainingByVariant = {};
  keys.forEach((k) => {
    remainingByVariant[k] = (dispatchByVariant[k] || 0) - (receiveByVariant[k] || 0);
  });
  return {
    dispatchTotal,
    receiveTotal,
    remainingTotal,
    dispatchByVariant,
    receiveByVariant,
    remainingByVariant,
  };
}

function orderedVariantColumnIds(product, category, order, variantQtyMaps) {
  if (!productHasColorSizeMatrix(product, category)) return [];
  const allProductVariants = (product && product.variants) || [];
  const unionKeys = new Set();
  (variantQtyMaps || []).forEach((m) => {
    Object.keys(m || {}).forEach((k) => {
      if (k) unionKeys.add(k);
    });
  });
  const variantIdsInOrder = new Set(
    ((order && order.items) || []).map((i) => i.variantId).filter(Boolean),
  );

  let variantsForSort;
  if (unionKeys.size > 0) {
    variantsForSort = allProductVariants.filter((v) => unionKeys.has(v.id));
  } else if (variantIdsInOrder.size > 0) {
    variantsForSort = allProductVariants.filter((v) => variantIdsInOrder.has(v.id));
  } else {
    variantsForSort = [...allProductVariants];
  }

  const sorted = sortVariantsByColorThenSize(
    variantsForSort,
    (product && product.colorIds) || [],
    (product && product.sizeIds) || [],
  );
  const ordered = sorted.map((v) => v.id);
  const extra = [...unionKeys].filter((id) => !ordered.includes(id))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  return [...ordered, ...extra];
}

function startOfLocalDayMs(ymd) {
  const p = String(ymd || '').trim().split('-').map(Number);
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return Number.NaN;
  return new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0).getTime();
}

function endOfLocalDayMs(ymd) {
  const p = String(ymd || '').trim().split('-').map(Number);
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return Number.NaN;
  return new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999).getTime();
}

function rowDocTimeMs(row) {
  return flowRecordsEarliestMs(row.records);
}

function rowMatchesDocType(row, docType) {
  if (!docType || docType === 'all') return true;
  const lab = row.typeLabel || '';
  if (docType === 'dispatch') return lab.includes('发出');
  if (docType === 'receive') return lab.includes('收回');
  return true;
}

function filterPartnerFlowDocRows(rows, opts) {
  const {
    searchKeyword,
    docType,
    dateFrom,
    dateTo,
  } = opts || {};
  const q = String(searchKeyword || '').trim().toLowerCase();
  return (rows || []).filter((row) => {
    if (!rowMatchesDocType(row, docType)) return false;
    const fromTrim = String(dateFrom || '').trim();
    if (fromTrim) {
      const s = startOfLocalDayMs(fromTrim);
      const t = rowDocTimeMs(row);
      if (!Number.isNaN(s) && t > 0 && t < s) return false;
    }
    const toTrim = String(dateTo || '').trim();
    if (toTrim) {
      const e = endOfLocalDayMs(toTrim);
      const t = rowDocTimeMs(row);
      if (!Number.isNaN(e) && t > 0 && t > e) return false;
    }
    if (!q) return true;
    const parts = [row.docNo, row.dateDisplay, row.typeLabel, row.deliveryDateDisplay];
    return parts.join(' ').toLowerCase().includes(q);
  });
}

function variantColumnMinWidthRpx(label) {
  const text = String(label || '—');
  let units = 0;
  for (const ch of text) {
    units += ch.charCodeAt(0) > 255 ? 1.1 : 0.55;
  }
  // 表头与数据列同宽；略放宽避免换行后撑破对齐
  return Math.max(140, Math.ceil(units * 30 + 32));
}

function buildVariantColumns(variantIds, product, dictionaries) {
  return (variantIds || []).map((vid) => {
    const variant = ((product && product.variants) || []).find((v) => v.id === vid);
    const label = variant
      ? (variantLabel(variant, dictionaries) || variant.skuSuffix || vid)
      : vid;
    return {
      id: vid,
      label,
      minWidth: variantColumnMinWidthRpx(label),
    };
  });
}

function mapVariantCells(variantQty, variantColumns) {
  return (variantColumns || []).map((col) => {
    const vid = col.id;
    const q = variantQty && variantQty[vid];
    const hasQty = q != null && Number(q) > 0;
    return {
      id: vid,
      qtyText: hasQty ? String(q) : '—',
      isEmpty: !hasQty,
      minWidth: col.minWidth,
    };
  });
}

function mapSummaryVariantCells(byVariant, variantColumns, warnNegative) {
  return (variantColumns || []).map((col) => {
    const vid = col.id;
    const q = (byVariant && byVariant[vid]) || 0;
    const isNegative = warnNegative && q < 0;
    return {
      id: vid,
      qtyText: q !== 0 ? String(q) : '—',
      isEmpty: q === 0,
      isNegative,
      minWidth: col.minWidth,
    };
  });
}

function mapPartnerFlowDocRowsForUi(rows, variantColumns) {
  return (rows || []).map((row, index) => ({
    ...row,
    rowKey: `${row.docNo || '—'}|${index}`,
    variantCells: mapVariantCells(row.variantQty, variantColumns),
  }));
}

function mapPartnerDetailHeader(seed, totals) {
  const titleParts = [];
  if (seed.orderNumber) titleParts.push(seed.orderNumber);
  if (seed.productName) titleParts.push(seed.productName);
  return {
    titleLine: titleParts.join(' · ') || seed.productName || '—',
    subtitleLine: `${seed.nodeName || seed.nodeId} · ${seed.partner || '—'}`,
    dispatchTotal: totals.dispatchTotal,
    receiveTotal: totals.receiveTotal,
    remainingTotal: totals.remainingTotal,
    remainingNegative: totals.remainingTotal < 0,
  };
}

function buildPartnerDetailViewModel(params) {
  const {
    seed,
    productionLinkMode,
    records,
    product,
    category,
    order,
    dictionaries,
    showDeliveryDateColumn,
    searchKeyword,
    docType,
    dateFrom,
    dateTo,
  } = params;

  const isProductMode = productionLinkMode === 'product';
  const filtered = filterPartnerNodeOutsourceRecords(records, {
    productionLinkMode,
    orderId: isProductMode ? undefined : seed.orderId,
    productId: seed.productId,
    partner: seed.partner,
    nodeId: seed.nodeId,
  });
  const docRowsAll = buildPartnerFlowDocRows(filtered, isProductMode);
  const docRowsFiltered = filterPartnerFlowDocRows(docRowsAll, {
    searchKeyword,
    docType,
    dateFrom,
    dateTo,
  });

  const allAgg = computeDispatchReceiveRemaining(filtered);
  const variantColumnIds = orderedVariantColumnIds(
    product,
    category,
    order,
    [
      ...docRowsAll.map((r) => r.variantQty),
      allAgg.dispatchByVariant,
      allAgg.receiveByVariant,
      allAgg.remainingByVariant,
    ],
  );
  const showVariantCols = variantColumnIds.length > 0;
  const variantColumns = buildVariantColumns(variantColumnIds, product, dictionaries);

  const filteredAgg = computeDispatchReceiveRemaining(
    docRowsFiltered.flatMap((r) => r.records),
  );
  const headerTotals = allAgg;

  return {
    header: mapPartnerDetailHeader({ ...seed, productionLinkMode }, headerTotals),
    rows: mapPartnerFlowDocRowsForUi(docRowsFiltered, variantColumns),
    docCount: docRowsFiltered.length,
    showVariantCols,
    showDeliveryDateColumn: !!showDeliveryDateColumn,
    variantColumns,
    summaryRows: [
      {
        label: '发出',
        total: filteredAgg.dispatchTotal,
        accentClass: 'partner-flow-table__summary--dispatch',
        variantCells: mapSummaryVariantCells(filteredAgg.dispatchByVariant, variantColumns, false),
      },
      {
        label: '收回',
        total: filteredAgg.receiveTotal,
        accentClass: 'partner-flow-table__summary--receive',
        variantCells: mapSummaryVariantCells(filteredAgg.receiveByVariant, variantColumns, false),
      },
      {
        label: '剩余',
        total: filteredAgg.remainingTotal,
        accentClass: 'partner-flow-table__summary--remain',
        isNegative: filteredAgg.remainingTotal < 0,
        variantCells: mapSummaryVariantCells(filteredAgg.remainingByVariant, variantColumns, true),
      },
    ],
    hasAnyRows: docRowsAll.length > 0,
  };
}

module.exports = {
  DOC_TYPE_FILTER_LABELS,
  DOC_TYPE_FILTER_VALUES,
  filterPartnerNodeOutsourceRecords,
  buildPartnerFlowDocRows,
  computeDispatchReceiveRemaining,
  filterPartnerFlowDocRows,
  buildPartnerDetailViewModel,
  mapPartnerDetailHeader,
};
