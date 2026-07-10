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
      toneIndex: idx % 6,
      outsourceRemaining: 0,
      metaText: `${availableQty} / ${remaining}`,
    };
  });
}

function buildOutsourceNetByOrderTemplate(prodRecords) {
  const m = new Map();
  (prodRecords || []).forEach((r) => {
    if (r.type !== 'OUTSOURCE' || r.sourceReworkId || !r.orderId || !r.nodeId) return;
    const k = `${r.orderId}|${r.nodeId}`;
    const cur = m.get(k) || 0;
    const q = Number(r.quantity) || 0;
    if (r.status === '加工中') m.set(k, cur + q);
    else if (r.status === '已收回') m.set(k, cur - q);
  });
  m.forEach((v, k) => {
    m.set(k, Math.max(0, Math.round(v)));
  });
  return m;
}

function buildOutsourceNetByProductTemplate(prodRecords) {
  const m = new Map();
  (prodRecords || []).forEach((r) => {
    if (r.type !== 'OUTSOURCE' || r.sourceReworkId || r.orderId || !r.productId || !r.nodeId) return;
    const k = `${r.productId}|${r.nodeId}`;
    const cur = m.get(k) || 0;
    const q = Number(r.quantity) || 0;
    if (r.status === '加工中') m.set(k, cur + q);
    else if (r.status === '已收回') m.set(k, cur - q);
  });
  m.forEach((v, k) => {
    m.set(k, Math.max(0, Math.round(v)));
  });
  return m;
}

function buildProductOrdersTotalQtyMap(orders) {
  const m = new Map();
  (orders || []).forEach((o) => {
    const q = sumOrderQty(o);
    m.set(o.productId, (m.get(o.productId) || 0) + q);
  });
  return m;
}

function formatOrderCenterChipMeta(availableQty, remaining, outsourceRemaining) {
  const base = `${availableQty} / ${remaining}`;
  if (outsourceRemaining > 0) return `${base} · 外协${outsourceRemaining}`;
  return base;
}

/**
 * 工单中心工序卡下方数字对齐 Web：可报上限/剩余不扣外协、不扣待审；
 * 外协剩余单独追加展示（Web 为 hover tooltip，小程序写在标签上）。
 */
function applyOrderCenterChipOutsource(order, chips, opts) {
  const {
    prodRecords,
    productionLinkMode,
    productOrdersTotalQtyByPid,
  } = opts || {};
  if (!prodRecords) return chips;

  const byOrder = buildOutsourceNetByOrderTemplate(prodRecords);
  const byProduct = buildOutsourceNetByProductTemplate(prodRecords);
  const orderQty = sumOrderQty(order);
  const productTotal = (productOrdersTotalQtyByPid && productOrdersTotalQtyByPid.get(order.productId)) || orderQty;
  const shareRatio = productTotal > 0 ? orderQty / productTotal : 1;

  return (chips || []).map((chip) => {
    const tid = chip.templateId;
    const outsourceRaw =
      (byOrder.get(`${order.id}|${tid}`) || 0) +
      (productionLinkMode === 'product'
        ? (byProduct.get(`${order.productId}|${tid}`) || 0) * shareRatio
        : 0);
    const outsourceRemaining = Math.max(0, Math.round(outsourceRaw));
    return {
      ...chip,
      outsourceRemaining,
      metaText: formatOrderCenterChipMeta(chip.availableQty, chip.remaining, outsourceRemaining),
    };
  });
}

module.exports = {
  isProcessSequential,
  findGatingPredecessorIndex,
  buildOutOfSequenceTemplateIds,
  sumOrderQty,
  buildOrderProcessChips,
  buildOutsourceNetByOrderTemplate,
  buildOutsourceNetByProductTemplate,
  buildProductOrdersTotalQtyMap,
  applyOrderCenterChipOutsource,
};