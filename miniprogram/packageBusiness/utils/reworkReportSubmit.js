/**
 * 返工报工提交（对齐 Web ReworkReportSubmitModal）
 */

const { getNextReworkReportDocNo } = require('./reworkDocNo.js');
const {
  buildReworkReportPaths,
  reworkQtyKey,
  parseReworkQtyKey,
} = require('./reworkReportGroupLite.js');
const { reworkRemainingAtNode, buildOutOfSequenceTemplateIds } = require('./reworkPanelLite.js');

const REWORK_REPORT_CUSTOM_DATA_KEY = 'reworkReportCustomData';

function reworkReportCollabFromValues(values) {
  const clean = Object.fromEntries(
    Object.entries(values || {}).filter(([, v]) => v !== '' && v != null && v !== undefined),
  );
  if (!Object.keys(clean).length) return {};
  return { collabData: { [REWORK_REPORT_CUSTOM_DATA_KEY]: clean } };
}

function collectQtyByVariantForPath(quantities, productId, pathKey) {
  const qtyByVariant = {};
  Object.entries(quantities || {}).forEach(([key, rawQty]) => {
    const parsed = parseReworkQtyKey(key);
    if (!parsed || parsed.productId !== productId || parsed.pathKey !== pathKey) return;
    const qty = Number(rawQty) || 0;
    if (qty <= 0) return;
    const vid = parsed.variantId || '';
    qtyByVariant[vid] = (qtyByVariant[vid] || 0) + qty;
  });
  return qtyByVariant;
}

function buildReworkReportSubmitPlan(opts) {
  const {
    records = [],
    quantities = {},
    globalNodes = [],
    currentNodeId,
    isOutsourceRework = false,
    outsourcePartner = '',
    scopeOrderId,
    scopeProductId,
    operator = '',
    timestamp,
    workerId = '',
    equipmentId = '',
    unitPrice = 0,
    customData = {},
    existingDocNo,
  } = opts;

  const paths = buildReworkReportPaths({
    records,
    currentNodeId,
    isOutsourceRework,
    outsourcePartner,
    globalNodes,
    scopeOrderId,
    scopeProductId,
  });

  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(globalNodes);
  const docNo = existingDocNo || getNextReworkReportDocNo(records);
  const collab = reworkReportCollabFromValues(customData);
  const ts = timestamp || new Date().toISOString();
  const reportRecords = [];
  const outsourceReceiveRecords = [];
  /** @type {Map<string, { reworkCompletedQuantityByNode: Record<string, number>, status?: string }>} */
  const srcProgressById = new Map();

  function getSrcView(src) {
    const extra = src.id ? srcProgressById.get(String(src.id)) : null;
    if (!extra) return src;
    return {
      ...src,
      reworkCompletedQuantityByNode: {
        ...(src.reworkCompletedQuantityByNode || {}),
        ...(extra.reworkCompletedQuantityByNode || {}),
      },
      status: extra.status !== undefined ? extra.status : src.status,
    };
  }

  function reworkRemainingForSrc(src) {
    return reworkRemainingAtNode(getSrcView(src), currentNodeId, outOfSequenceTemplateIds);
  }

  function applySourceProgress(src, newDone) {
    const srcView = getSrcView(src);
    const pathNodes = src.reworkNodeIds && src.reworkNodeIds.length > 0
      ? src.reworkNodeIds
      : (src.nodeId ? [src.nodeId] : []);
    const allDone = pathNodes.every((nid) => {
      const done = nid === currentNodeId
        ? newDone
        : ((srcView.reworkCompletedQuantityByNode && srcView.reworkCompletedQuantityByNode[nid]) || 0);
      return done >= (Number(src.quantity) || 0);
    });
    const reworkCompletedQuantityByNode = {
      ...(srcView.reworkCompletedQuantityByNode || {}),
      [currentNodeId]: newDone,
    };
    const status = allDone ? '已完成' : src.status;
    if (src.id) {
      srcProgressById.set(String(src.id), { reworkCompletedQuantityByNode, status });
    }
    return { reworkCompletedQuantityByNode, status };
  }

  function pushReport(take, variantId, src) {
    if (take <= 0) return;
    const reportOperator = isOutsourceRework ? '' : operator;
    const partnerName = (src.partner || outsourcePartner || '').trim();
    reportRecords.push({
      type: 'REWORK_REPORT',
      orderId: src.orderId || undefined,
      productId: src.productId,
      variantId: variantId || src.variantId || undefined,
      quantity: take,
      nodeId: currentNodeId,
      sourceNodeId: src.sourceNodeId || src.nodeId,
      sourceReworkId: src.id,
      operator: reportOperator,
      timestamp: ts,
      docNo,
      workerId: isOutsourceRework ? undefined : (workerId || undefined),
      equipmentId: isOutsourceRework ? undefined : (equipmentId || undefined),
      unitPrice: unitPrice > 0 ? unitPrice : undefined,
      amount: unitPrice > 0 ? take * unitPrice : undefined,
      ...(isOutsourceRework && partnerName ? { partner: partnerName } : {}),
      ...collab,
    });

    if (isOutsourceRework && (src.partner || outsourcePartner)) {
      outsourceReceiveRecords.push({
        type: 'OUTSOURCE',
        orderId: src.orderId || undefined,
        productId: src.productId,
        variantId: variantId || src.variantId || undefined,
        quantity: take,
        nodeId: currentNodeId,
        partner: (src.partner || outsourcePartner || '').trim(),
        status: '已收回',
        sourceReworkId: src.id,
        operator,
        timestamp: ts,
        docNo,
      });
    }
  }

  paths.forEach((path) => {
    const {
      productId,
      pathKey,
      records: pathRecords = [],
      pendingByVariant = {},
    } = path;
    const qtyByVariant = collectQtyByVariantForPath(quantities, productId, pathKey);
    const pendingUndiff = pendingByVariant[''] || 0;
    const hasVariantPending = Object.keys(pendingByVariant).some(
      (k) => k !== '' && (pendingByVariant[k] || 0) > 0,
    );
    const onlyUndiffPending = pendingUndiff > 0 && !hasVariantPending;
    const sortedRecs = [...pathRecords].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));

    if (onlyUndiffPending) {
      const userTotal = Object.values(qtyByVariant).reduce((s, q) => s + q, 0);
      const totalToApply = Math.min(userTotal, pendingUndiff);
      let remaining = totalToApply;
      sortedRecs.forEach((src) => {
        if (remaining <= 0) return;
        const srcView = getSrcView(src);
        const done = (srcView.reworkCompletedQuantityByNode && srcView.reworkCompletedQuantityByNode[currentNodeId]) || 0;
        const room = (Number(src.quantity) || 0) - done;
        const add = Math.min(room, remaining);
        if (add <= 0) return;
        remaining -= add;
        applySourceProgress(src, done + add);
        pushReport(add, undefined, src);
      });
      return;
    }

    if (hasVariantPending) {
      const byVariant = {};
      if (pendingUndiff > 0) {
        byVariant[''] = Math.min(qtyByVariant[''] || 0, pendingUndiff);
      }
      Object.keys(pendingByVariant).forEach((vid) => {
        if (!vid) return;
        byVariant[vid] = Math.min(qtyByVariant[vid] || 0, pendingByVariant[vid] || 0);
      });
      const remainingByVariant = { ...byVariant };
      sortedRecs.forEach((src) => {
        const vid = src.variantId || '';
        const need = Math.min(reworkRemainingForSrc(src), remainingByVariant[vid] || 0);
        if (need <= 0) return;
        remainingByVariant[vid] = (remainingByVariant[vid] || 0) - need;
        const srcView = getSrcView(src);
        const done = (srcView.reworkCompletedQuantityByNode && srcView.reworkCompletedQuantityByNode[currentNodeId]) || 0;
        applySourceProgress(src, done + need);
        pushReport(need, vid || undefined, src);
      });
      return;
    }

    const totalToApply = Math.min(
      qtyByVariant[''] || 0,
      sortedRecs.reduce((s, src) => s + reworkRemainingForSrc(src), 0),
    );
    let remaining = totalToApply;
    sortedRecs.forEach((src) => {
      if (remaining <= 0) return;
      const add = Math.min(reworkRemainingForSrc(src), remaining);
      if (add <= 0) return;
      remaining -= add;
      const srcView = getSrcView(src);
      const done = (srcView.reworkCompletedQuantityByNode && srcView.reworkCompletedQuantityByNode[currentNodeId]) || 0;
      applySourceProgress(src, done + add);
      pushReport(add, src.variantId || undefined, src);
    });
  });

  const sourceUpdates = [];
  srcProgressById.forEach((patch, id) => {
    sourceUpdates.push({ id, ...patch });
  });

  if (!reportRecords.length) return { error: '请填写返工数量' };
  return {
    reportRecords,
    sourceUpdates,
    outsourceReceiveRecords,
    docNo,
  };
}

function buildMatrixMaxMap(paths) {
  const maxMap = {};
  (paths || []).forEach((p) => {
    Object.entries(p.pendingByVariant || {}).forEach(([vid, q]) => {
      if (q > 0) maxMap[reworkQtyKey(p.productId, p.pathKey, vid)] = q;
    });
    if (p.totalPending > 0 && !Object.keys(p.pendingByVariant || {}).length) {
      maxMap[reworkQtyKey(p.productId, p.pathKey, '')] = p.totalPending;
    }
  });
  return maxMap;
}

module.exports = {
  REWORK_REPORT_CUSTOM_DATA_KEY,
  buildReworkReportSubmitPlan,
  buildMatrixMaxMap,
  reworkReportCollabFromValues,
};
