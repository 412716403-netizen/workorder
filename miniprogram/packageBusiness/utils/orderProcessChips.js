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

/** 已审核良品（待审/驳回不计入工序卡已报与可报） */
function sumApprovedGoodAtMilestone(ms) {
  const reports = ms.reports || [];
  if (!reports.length) {
    return Math.round(Number(ms.completedQuantity) || 0);
  }
  return reports.reduce((s, r) => {
    const st = r.approvalStatus;
    if (st === 'PENDING' || st === 'REJECTED') return s;
    return s + (Number(r.quantity) || 0);
  }, 0);
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
    const completed = sumApprovedGoodAtMilestone(ms);
    let baseQty = orderTotalQty;
    if (isProcessSequential(processSequenceMode, ms.templateId, outOfSequenceTemplateIds)) {
      const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
      if (gateIdx >= 0) {
        const prev = milestones[gateIdx];
        baseQty = sumApprovedGoodAtMilestone(prev);
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
    // 工序卡可报不扣待审占用（与 Web 工单中心圆下数字一致；待审在报工详情 hint 单独展示）
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

module.exports = {
  isProcessSequential,
  findGatingPredecessorIndex,
  buildOutOfSequenceTemplateIds,
  sumOrderQty,
  buildOrderProcessChips,
};