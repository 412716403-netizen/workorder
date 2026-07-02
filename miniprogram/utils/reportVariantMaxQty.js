/**
 * 报工按规格最大可报数量（对齐 Web useReportModalState.getSeqRemainingForVariant + reportRowDerivations）
 */

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
  const vid = variantId || '';
  return (milestone.reports || [])
    .filter((r) => (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);
}

/**
 * 顺序工序约束下，某规格在本工序的可报余量（已减前序/本序已报，未减不良）
 */
function getSeqRemainingForVariant(order, milestoneTemplateId, variantId, opts) {
  const {
    processSequenceMode = 'sequential',
    outOfSequenceTemplateIds = new Set(),
  } = opts || {};
  const items = order.items || [];
  const milestones = order.milestones || [];
  const item = items.find((i) => (i.variantId || '') === variantId)
    ?? (items.length === 1 ? items[0] : undefined);

  const templateIdPath = milestones.map((m) => m.templateId);
  const tplIndex = milestones.findIndex((m) => m.templateId === milestoneTemplateId);
  const gateIdx = findGatingPredecessorIndex(templateIdPath, tplIndex, outOfSequenceTemplateIds);
  const prevTemplateId = gateIdx >= 0 ? templateIdPath[gateIdx] : undefined;
  const milestone = milestones.find((m) => m.templateId === milestoneTemplateId);
  const seqConstrained = isProcessSequential(
    processSequenceMode,
    milestoneTemplateId,
    outOfSequenceTemplateIds,
  );

  if (!seqConstrained || gateIdx < 0) {
    if (!item) return 0;
    if (items.length === 1 && !item.variantId) {
      const completed = Number(milestone?.completedQuantity) || 0;
      return Math.max(0, (Number(item.quantity) || 0) - completed);
    }
    const completedInMilestone = (milestone?.reports || [])
      .filter((r) => (r.variantId || '') === variantId)
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    return Math.max(0, (Number(item.quantity) || 0) - completedInMilestone);
  }

  let prevQty = 0;
  let curQty = 0;
  const vid = variantId || '';
  const variantItemQty = items
    .filter((i) => (i.variantId ?? '') === vid)
    .reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const orderTotalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  if (prevTemplateId) {
    const prevMs = milestones.find((m) => m.templateId === prevTemplateId);
    if (prevMs) {
      const hasVariantReports = (prevMs.reports || []).some((r) => r.variantId && r.variantId !== '');
      if (hasVariantReports) {
        (prevMs.reports || []).forEach((r) => {
          if ((r.variantId || '') === vid) prevQty += Number(r.quantity) || 0;
        });
      } else if ((prevMs.completedQuantity ?? 0) > 0 && orderTotalQty > 0) {
        prevQty += Math.round(((Number(prevMs.completedQuantity) || 0) * variantItemQty) / orderTotalQty);
      }
    }
  }
  if (milestone) {
    const hasVariantReports = (milestone.reports || []).some((r) => r.variantId && r.variantId !== '');
    if (hasVariantReports) {
      (milestone.reports || []).forEach((r) => {
        if ((r.variantId || '') === vid) curQty += Number(r.quantity) || 0;
      });
    } else if ((milestone.completedQuantity ?? 0) > 0 && orderTotalQty > 0) {
      curQty += Math.round(((Number(milestone.completedQuantity) || 0) * variantItemQty) / orderTotalQty);
    }
  }
  return Math.max(0, prevQty - curQty);
}

/** 某规格良品最多可报（顺序余量 − 本工序该规格不良） */
function getVariantMaxGood(order, milestone, variantId, opts) {
  const seqRemaining = getSeqRemainingForVariant(
    order,
    milestone.templateId,
    variantId,
    opts,
  );
  const defective = sumDefectiveForVariantAtMilestone(milestone, variantId);
  return Math.max(0, seqRemaining - defective);
}

function buildVariantMaxGoodMap(order, milestone, product, opts) {
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
    map[vid] = getVariantMaxGood(order, milestone, vid, opts);
  });
  return map;
}

/**
 * 单工单报工表头数量 hint（对齐 Web computeReportRowDerivations 工单模式）
 */
function computeOrderReportHints(order, milestone, globalNodes, config) {
  const processSequenceMode = (config && config.processSequenceMode) || 'sequential';
  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(globalNodes);
  const opts = { processSequenceMode, outOfSequenceTemplateIds };
  const tid = milestone.templateId;
  const hintTotalQty = (order.items || []).reduce(
    (s, i) => s + (Number(i.quantity) || 0),
    0,
  );

  const idx = (order.milestones || []).findIndex((m) => m.templateId === tid);
  let base = hintTotalQty;
  if (isProcessSequential(processSequenceMode, tid, outOfSequenceTemplateIds)) {
    const templateIds = (order.milestones || []).map((m) => m.templateId);
    const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
    if (gateIdx >= 0) {
      base = Number(order.milestones[gateIdx]?.completedQuantity) || 0;
    }
  }
  const defectiveQtyForHint = (milestone.reports || []).reduce(
    (s, r) => s + (Number(r.defectiveQuantity) || 0),
    0,
  );
  const hintMaxReportable = Math.max(0, Math.round(base - defectiveQtyForHint));
  const hintCompletedDisplay = Math.max(0, Number(milestone.completedQuantity) || 0);
  const totalOutsourcedAtNode = 0;
  const hintRemaining = Math.max(
    0,
    hintMaxReportable - hintCompletedDisplay - totalOutsourcedAtNode,
  );

  return {
    hintTotalQty,
    hintMaxReportable,
    hintCompletedDisplay,
    hintRemaining,
    defectiveQtyForHint,
    totalOutsourcedAtNode,
    totalRework: 0,
    effectiveRemainingForModal: hintRemaining,
    processSequenceMode,
    outOfSequenceTemplateIds,
    opts,
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
  const {
    formMode,
    variantMaxGoodMap = {},
    effectiveRemaining = 0,
    allowExceedMaxReportQty = false,
    quantities = {},
    unitName = '件',
  } = opts || {};

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
        false,
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
    false,
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
  sumMatrixQuantities,
};
