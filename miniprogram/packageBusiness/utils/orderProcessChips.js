/**
 * 工单工序进度卡计算（对齐 Web OrderListView 列表工序圈：base − 不良 + 返工完成）
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

function sumOrderQty(order) {
  return (order.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
}

function sumDefectiveAtMilestone(ms) {
  return (ms.reports || []).reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);
}

/**
 * 单工单工序卡 UI 模型
 * @param {object} order
 * @param {object} opts
 */
function buildOrderProcessChips(order, opts = {}) {
  const _opts$processSequence =



    opts.processSequenceMode,processSequenceMode = _opts$processSequence === void 0 ? 'sequential' : _opts$processSequence,_opts$outOfSequenceTe = opts.outOfSequenceTemplateIds,outOfSequenceTemplateIds = _opts$outOfSequenceTe === void 0 ? new Set() : _opts$outOfSequenceTe,_opts$canReport = opts.canReport,canReport = _opts$canReport === void 0 ? false : _opts$canReport,_opts$getDefectiveRew = opts.getDefectiveRework,getDefectiveRework = _opts$getDefectiveRew === void 0 ? null : _opts$getDefectiveRew;

  const milestones = order.milestones || [];
  if (!milestones.length) return [];

  const orderTotalQty = sumOrderQty(order);
  const templateIds = milestones.map((m) => m.templateId);

  return milestones.map((ms, idx) => {
    const completed = Math.round(Number(ms.completedQuantity) || 0);
    let baseQty = orderTotalQty;
    if (isProcessSequential(processSequenceMode, ms.templateId, outOfSequenceTemplateIds)) {
      const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
      if (gateIdx >= 0) {
        const prev = milestones[gateIdx];
        baseQty = Number(prev == null ? void 0 : prev.completedQuantity) || 0;
      }
    }
    let defective;
    let rework = 0;
    if (getDefectiveRework) {
      const dr = getDefectiveRework(order.id, ms.templateId) || {};
      defective = Number(dr.defective) || 0;
      rework = Number(dr.rework) || 0;
    } else {
      defective = sumDefectiveAtMilestone(ms);
    }
    const availableQty = Math.max(0, Math.round(baseQty - defective + rework));
    const remaining = availableQty - completed;
    const progress = availableQty > 0 ?
    Math.min(100, Math.round(completed / availableQty * 100)) :
    completed > 0 ? 100 : 0;
    const isCompleted = ms.status === 'COMPLETED' || availableQty > 0 && completed >= availableQty;
    const canReportThis = canReport && remaining > 0 && availableQty > 0;

    return {
      orderId: order.id,
      milestoneId: ms.id,
      templateId: ms.templateId,
      name: ms.name || '工序',
      completed,
      availableQty,
      remaining,
      progress,
      isCompleted,
      canReport: canReportThis,
      disabled: !canReportThis,
      toneIndex: idx % 6
    };
  });
}

/**
 * 工序卡下方「可报上限 / 剩余」与报工详情、可报任务列表一致（扣外协、待审、按规格）。
 */
function applyReportRemainingToChips(order, chips, opts) {
  const {
    prodRecords,
    config,
    globalNodes,
    product,
    category,
  } = opts || {};
  if (!prodRecords || !globalNodes || !globalNodes.length) return chips;

  const { computeOrderReportHints, buildVariantMaxGoodMap } = require('./reportVariantMaxQty.js');
  const { productHasColorSizeMatrix } = require('./productionPlans.js');

  return (chips || []).map((chip) => {
    const ms = (order.milestones || []).find((m) => m.id === chip.milestoneId);
    if (!ms) return chip;

    const hints = computeOrderReportHints(order, ms, globalNodes, config || {}, prodRecords);
    let reportRemaining = Math.max(0, Number(hints.hintRemaining) || 0);
    if (product && productHasColorSizeMatrix(product, category)) {
      const variantMaxGoodMap = buildVariantMaxGoodMap(
        order,
        ms,
        product,
        hints.opts,
        prodRecords,
      );
      const variantSum = Object.values(variantMaxGoodMap).reduce(
        (s, v) => s + (Math.max(0, Number(v) || 0)),
        0,
      );
      reportRemaining = Math.max(0, Math.min(variantSum, reportRemaining));
    }

    const maxReportable = Math.max(0, Number(hints.hintMaxReportable) || chip.availableQty);
    const completed = chip.completed;
    const progress = maxReportable > 0
      ? Math.min(100, Math.round((completed / maxReportable) * 100))
      : (completed > 0 ? 100 : 0);
    const isCompleted = ms.status === 'COMPLETED'
      || (maxReportable > 0 && completed >= maxReportable);
    const canReportThis = chip.canReport && reportRemaining > 0 && maxReportable > 0;

    return {
      ...chip,
      availableQty: maxReportable,
      remaining: reportRemaining,
      progress,
      isCompleted,
      canReport: canReportThis,
      disabled: !canReportThis,
    };
  });
}

module.exports = {
  isProcessSequential,
  findGatingPredecessorIndex,
  buildOutOfSequenceTemplateIds,
  sumOrderQty,
  buildOrderProcessChips,
  applyReportRemainingToChips,
};