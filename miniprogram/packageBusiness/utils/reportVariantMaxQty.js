/**
 * 报工按规格最大可报数量（对齐 Web useReportModalState.getSeqRemainingForVariant + reportRowDerivations）
 */

function reportQtyOccupies(approvalStatus) {
  return approvalStatus === 'APPROVED' || approvalStatus === 'PENDING' || !approvalStatus;
}

function sumOccupyingReportQty(reports, variantId) {
  const vid = variantId === undefined ? undefined : variantId || '';
  return (reports || [])
    .filter((r) => reportQtyOccupies(r.approvalStatus))
    .filter((r) => vid === undefined || (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
}

function sumOccupyingDefectiveQty(reports, variantId) {
  const vid = variantId === undefined ? undefined : variantId || '';
  return (reports || [])
    .filter((r) => reportQtyOccupies(r.approvalStatus))
    .filter((r) => vid === undefined || (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);
}

function sumPendingReportQty(reports) {
  return (reports || [])
    .filter((r) => r.approvalStatus === 'PENDING')
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
}

function isProcessSequential(processSequenceMode, nodeId, outOfSequenceTemplateIds) {
  if (processSequenceMode !== 'sequential') return false;
  if (nodeId && outOfSequenceTemplateIds && outOfSequenceTemplateIds.has(nodeId)) return false;
  return true;
}

function findGatingPredecessorIndex(templateIds, currentIndex, outOfSequenceTemplateIds) {
  for (let i = currentIndex - 1; i >= 0; i -= 1) {
    const tid = templateIds[i];
    if (!tid) continue;
    if (!outOfSequenceTemplateIds || !outOfSequenceTemplateIds.has(tid)) return i;
  }
  return -1;
}

function buildOutOfSequenceTemplateIds(nodes) {
  const set = new Set();
  (nodes || []).forEach((n) => {
    if (n && n.allowOutOfSequence) set.add(n.id);
  });
  return set;
}

function sumDefectiveForVariantAtMilestone(milestone, variantId) {
  return sumOccupyingDefectiveQty(milestone.reports, variantId || '');
}

/**
 * 顺序工序约束下，某规格在本工序的可报余量（已减前序/本序已报，未减不良）
 */
function getSeqRemainingForVariant(order, milestoneTemplateId, variantId, opts) {var _items$find;
  const _ref =


    opts || {},_ref$processSequenceM = _ref.processSequenceMode,processSequenceMode = _ref$processSequenceM === void 0 ? 'sequential' : _ref$processSequenceM,_ref$outOfSequenceTem = _ref.outOfSequenceTemplateIds,outOfSequenceTemplateIds = _ref$outOfSequenceTem === void 0 ? new Set() : _ref$outOfSequenceTem;
  const items = order.items || [];
  const milestones = order.milestones || [];
  const item = (_items$find = items.find((i) => (i.variantId || '') === variantId)) != null ? _items$find :
  items.length === 1 ? items[0] : undefined;

  const templateIdPath = milestones.map((m) => m.templateId);
  const tplIndex = milestones.findIndex((m) => m.templateId === milestoneTemplateId);
  const gateIdx = findGatingPredecessorIndex(templateIdPath, tplIndex, outOfSequenceTemplateIds);
  const prevTemplateId = gateIdx >= 0 ? templateIdPath[gateIdx] : undefined;
  const milestone = milestones.find((m) => m.templateId === milestoneTemplateId);
  const seqConstrained = isProcessSequential(
    processSequenceMode,
    milestoneTemplateId,
    outOfSequenceTemplateIds
  );

  if (!seqConstrained || gateIdx < 0) {
    if (!item) return 0;
    if (items.length === 1 && !item.variantId) {
      const completed = Number(milestone == null ? void 0 : milestone.completedQuantity) || 0;
      return Math.max(0, (Number(item.quantity) || 0) - completed);
    }
    const completedInMilestone = sumOccupyingReportQty(milestone == null ? void 0 : milestone.reports, variantId);
    return Math.max(0, (Number(item.quantity) || 0) - completedInMilestone);
  }

  let prevQty = 0;
  let curQty = 0;
  const vid = variantId || '';
  const variantItemQty = items.
  filter((i) => {var _i$variantId;return ((_i$variantId = i.variantId) != null ? _i$variantId : '') === vid;}).
  reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const orderTotalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  if (prevTemplateId) {
    const prevMs = milestones.find((m) => m.templateId === prevTemplateId);
    if (prevMs) {var _prevMs$completedQuan;
      const hasVariantReports = (prevMs.reports || []).some(
        (r) => r.variantId && r.variantId !== '' && reportQtyOccupies(r.approvalStatus),
      );
      if (hasVariantReports) {
        prevQty = sumOccupyingReportQty(prevMs.reports, vid);
      } else if (((_prevMs$completedQuan = prevMs.completedQuantity) != null ? _prevMs$completedQuan : 0) > 0 && orderTotalQty > 0) {
        prevQty += Math.round((Number(prevMs.completedQuantity) || 0) * variantItemQty / orderTotalQty);
      }
    }
  }
  if (milestone) {var _milestone$completedQ;
    const hasVariantReports = (milestone.reports || []).some(
      (r) => r.variantId && r.variantId !== '' && reportQtyOccupies(r.approvalStatus),
    );
    if (hasVariantReports) {
      curQty = sumOccupyingReportQty(milestone.reports, vid);
    } else if (((_milestone$completedQ = milestone.completedQuantity) != null ? _milestone$completedQ : 0) > 0 && orderTotalQty > 0) {
      curQty += Math.round((Number(milestone.completedQuantity) || 0) * variantItemQty / orderTotalQty);
    }
  }
  return Math.max(0, prevQty - curQty);
}

/** 本工序各规格外协未收回净量（对齐 Web outsourcedByVariantId） */
function sumOutsourceRemainingByVariant(prodRecords, orderId, templateId) {
  const dispatched = {};
  const received = {};
  (prodRecords || []).forEach((r) => {
    if (r.type !== 'OUTSOURCE' || r.sourceReworkId) return;
    if (r.orderId !== orderId || r.nodeId !== templateId) return;
    const vid = r.variantId || '';
    if (r.status === '加工中') {
      dispatched[vid] = (dispatched[vid] || 0) + (Number(r.quantity) || 0);
    } else if (r.status === '已收回') {
      received[vid] = (received[vid] || 0) + (Number(r.quantity) || 0);
    }
  });
  const result = {};
  const keys = new Set([...Object.keys(dispatched), ...Object.keys(received)]);
  keys.forEach((vid) => {
    const net = (dispatched[vid] || 0) - (received[vid] || 0);
    if (net > 0) result[vid] = net;
  });
  return result;
}

function reworkMergeBucketOrderId(orderId, orders) {
  const o = (orders || []).find((x) => x.id === orderId);
  return o && o.parentOrderId ? o.parentOrderId : orderId;
}

function buildDefectiveReworkMapForOrders(orders, prodRecords) {
  const map = new Map();
  (orders || []).forEach((o) => {
    (o.milestones || []).forEach((m) => {
      const defective = sumOccupyingDefectiveQty(m.reports);
      map.set(`${o.id}|${m.templateId}`, { defective, rework: 0, reworkByVariant: {} });
    });
  });

  (prodRecords || []).filter((r) => r.type === 'REWORK_REPORT').forEach((rr) => {
    const oid = rr.orderId;
    const nodeId = rr.nodeId;
    if (!oid || !nodeId) return;
    const key = `${oid}|${nodeId}`;
    const entry = map.get(key) || { defective: 0, rework: 0, reworkByVariant: {} };
    entry.rework += Number(rr.quantity) || 0;
    const vid = rr.variantId || '';
    entry.reworkByVariant[vid] = (entry.reworkByVariant[vid] || 0) + (Number(rr.quantity) || 0);
    map.set(key, entry);
  });
  return map;
}

function getReworkByVariantForReport(order, templateId, prodRecords) {
  const drMap = buildDefectiveReworkMapForOrders([order], prodRecords);
  const bucketId = reworkMergeBucketOrderId(order.id, [order]);
  const merged = {};
  const mergeEntry = (orderId) => {
    const rw = (drMap.get(`${orderId}|${templateId}`) || {}).reworkByVariant || {};
    Object.entries(rw).forEach(([k, q]) => {
      merged[k] = (merged[k] || 0) + (Number(q) || 0);
    });
  };
  mergeEntry(bucketId);
  if (order.id !== bucketId) mergeEntry(order.id);
  return merged;
}

/**
 * 某规格良品最多可报（对齐 Web ReportVariantMatrixInput variantRemainingBaseMap）
 * = 顺序余量 − 本规格不良 + 返工完成 − 外协剩余
 */
function getVariantMaxGood(order, milestone, variantId, opts, prodRecords) {
  const tid = milestone.templateId;
  const seqRemaining = getSeqRemainingForVariant(order, tid, variantId, opts);
  const defectiveForVariant = sumDefectiveForVariantAtMilestone(milestone, variantId);
  const base = Math.max(0, seqRemaining - defectiveForVariant);
  const reworkByVariant = getReworkByVariantForReport(order, tid, prodRecords);
  const outsourcedByVariant = sumOutsourceRemainingByVariant(prodRecords, order.id, tid);
  const vid = variantId || '';
  const reworkForVariant = reworkByVariant[vid] || 0;
  const outsourcedForVariant = outsourcedByVariant[vid] || 0;
  return Math.max(0, base + reworkForVariant - outsourcedForVariant);
}

function buildVariantMaxGoodMap(order, milestone, product, opts, prodRecords) {
  const map = {};
  const variantIds = new Set();
  if (product && product.variants && product.variants.length) {
    product.variants.forEach((v) => {
      if (v && v.id) variantIds.add(v.id);
    });
  }
  (order.items || []).forEach((it) => {
    variantIds.add(it.variantId || '');
  });
  variantIds.forEach((vid) => {
    map[vid] = getVariantMaxGood(order, milestone, vid, opts, prodRecords);
  });
  return map;
}

function sumOutsourceRemainingAtNode(prodRecords, orderId, templateId) {
  let totalDispatched = 0;
  let totalReceived = 0;
  (prodRecords || []).forEach((r) => {
    if (r.type !== 'OUTSOURCE' || r.sourceReworkId) return;
    if (r.orderId !== orderId || r.nodeId !== templateId) return;
    if (r.status === '加工中') totalDispatched += Number(r.quantity) || 0;else
    if (r.status === '已收回') totalReceived += Number(r.quantity) || 0;
  });
  return Math.max(0, totalDispatched - totalReceived);
}

/**
 * 单工单报工表头数量 hint（对齐 Web computeReportRowDerivations 工单模式）
 */
function computeOrderReportHints(order, milestone, globalNodes, config, prodRecords) {
  const processSequenceMode = config && config.processSequenceMode || 'sequential';
  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(globalNodes);
  const opts = { processSequenceMode, outOfSequenceTemplateIds };
  const tid = milestone.templateId;
  const hintTotalQty = (order.items || []).reduce(
    (s, i) => s + (Number(i.quantity) || 0),
    0
  );

  const idx = (order.milestones || []).findIndex((m) => m.templateId === tid);
  let base = hintTotalQty;
  if (isProcessSequential(processSequenceMode, tid, outOfSequenceTemplateIds)) {
    const templateIds = (order.milestones || []).map((m) => m.templateId);
    const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
    if (gateIdx >= 0) {var _order$milestones$gat;
      base = Number((_order$milestones$gat = order.milestones[gateIdx]) == null ? void 0 : _order$milestones$gat.completedQuantity) || 0;
    }
  }

  const defectiveReworkMap = buildDefectiveReworkMapForOrders([order], prodRecords);
  const getDr = (oid, nodeTemplateId) => defectiveReworkMap.get(`${oid}|${nodeTemplateId}`) ||
  { defective: 0, rework: 0, reworkByVariant: {} };
  const _getDr = getDr(order.id, tid),defective = _getDr.defective,rework = _getDr.rework;
  const defectiveQtyForHint = defective;
  const totalRework = getDr(reworkMergeBucketOrderId(order.id, [order]), tid).rework;
  const hintMaxReportable = Math.max(0, Math.round(base - defective + rework));
  const hintCompletedDisplay = Math.max(0, Number(milestone.completedQuantity) || 0);
  const pendingOccupied = sumPendingReportQty(milestone.reports);
  const totalOutsourcedAtNode = sumOutsourceRemainingAtNode(prodRecords, order.id, tid);
  const hintRemaining = Math.max(
    0,
    hintMaxReportable - hintCompletedDisplay - pendingOccupied - totalOutsourcedAtNode
  );
  const effectiveRemainingForModal = Math.max(
    0,
    base - defective + totalRework - hintCompletedDisplay - pendingOccupied - totalOutsourcedAtNode
  );

  return {
    hintTotalQty,
    hintMaxReportable,
    hintCompletedDisplay,
    hintRemaining,
    defectiveQtyForHint,
    totalOutsourcedAtNode,
    totalRework,
    effectiveRemainingForModal,
    processSequenceMode,
    outOfSequenceTemplateIds,
    opts
  };
}

function sumMatrixQuantities(quantities) {
  return Object.values(quantities || {}).reduce((s, q) => s + (Number(q) || 0), 0);
}

/** 矩阵单格「最多可报」（含表头剩余总量 cap，对齐 Web ReportVariantMatrixInput） */
function computeCellMaxAllowed(variantMaxGood, variantId, quantities, effectiveRemaining, allowExceed) {
  const maxGood = Math.max(0, Number(variantMaxGood) || 0);
  if (allowExceed) return maxGood;
  const matrixTotal = sumMatrixQuantities(quantities);
  const currentCellQty = Number((quantities || {})[variantId]) || 0;
  const otherTotal = matrixTotal - currentCellQty;
  const cap = Number.isFinite(effectiveRemaining) ? effectiveRemaining : maxGood;
  return Math.max(0, Math.min(maxGood, cap - otherTotal));
}

function getSingleMaxQty(variantMaxGoodMap, variantId, effectiveRemaining, allowExceed) {
  const vid = variantId || '';
  const variantMax = Math.max(0, Number((variantMaxGoodMap || {})[vid]) || 0);
  if (allowExceed) return variantMax;
  const cap = Number.isFinite(effectiveRemaining) ? effectiveRemaining : variantMax;
  return Math.max(0, Math.min(variantMax, cap));
}

function validateReportEntries(entries, opts) {
  const _ref2 =






    opts || {},formMode = _ref2.formMode,_ref2$variantMaxGoodM = _ref2.variantMaxGoodMap,variantMaxGoodMap = _ref2$variantMaxGoodM === void 0 ? {} : _ref2$variantMaxGoodM,_ref2$effectiveRemain = _ref2.effectiveRemaining,effectiveRemaining = _ref2$effectiveRemain === void 0 ? 0 : _ref2$effectiveRemain,_ref2$allowExceedMaxR = _ref2.allowExceedMaxReportQty,allowExceedMaxReportQty = _ref2$allowExceedMaxR === void 0 ? false : _ref2$allowExceedMaxR,_ref2$quantities = _ref2.quantities,quantities = _ref2$quantities === void 0 ? {} : _ref2$quantities,_ref2$unitName = _ref2.unitName,unitName = _ref2$unitName === void 0 ? '件' : _ref2$unitName;

  if (allowExceedMaxReportQty) return '';

  if (formMode === 'matrix') {
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (entry.quantity <= 0) continue;
      const vid = entry.variantId || '';
      const maxAllowed = computeCellMaxAllowed(
        variantMaxGoodMap[vid],
        vid,
        quantities,
        effectiveRemaining,
        false
      );
      if (entry.quantity > maxAllowed) {
        return `该规格良品最多可报 ${maxAllowed} ${unitName}`;
      }
    }
    const totalGood = entries.reduce((s, e) => s + (e.quantity || 0), 0);
    if (effectiveRemaining > 0 && totalGood > effectiveRemaining) {
      return `良品合计最多可报 ${effectiveRemaining} ${unitName}`;
    }
    return '';
  }

  if (formMode === 'multi') {
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (entry.quantity <= 0) continue;
      const vid = entry.variantId || '';
      const maxAllowed = Math.max(0, Number(variantMaxGoodMap[vid]) || 0);
      if (entry.quantity > maxAllowed) {
        return `该规格良品最多可报 ${maxAllowed} ${unitName}`;
      }
    }
    return '';
  }

  const entry = entries.find((e) => e.quantity > 0);
  if (!entry) return '';
  const maxAllowed = getSingleMaxQty(
    variantMaxGoodMap,
    entry.variantId,
    effectiveRemaining,
    false
  );
  if (entry.quantity > maxAllowed) {
    return `良品最多可报 ${maxAllowed} ${unitName}`;
  }
  return '';
}

module.exports = {
  isProcessSequential,
  findGatingPredecessorIndex,
  buildOutOfSequenceTemplateIds,
  sumDefectiveForVariantAtMilestone,
  getSeqRemainingForVariant,
  getVariantMaxGood,
  buildVariantMaxGoodMap,
  computeOrderReportHints,
  computeCellMaxAllowed,
  getSingleMaxQty,
  validateReportEntries,
  sumMatrixQuantities
};