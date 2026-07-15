/**
 * 产品模式工单中心：产品组卡工序 chips（对齐 Web OrderListView productGroup）
 */

const {
  productGroupMaxReportableSum,
  resolveProductRouteIds,
} = require('./productReportHints.js');
const {
  isProcessSequential,
  findGatingPredecessorIndex,
} = require('./orderProcessChips.js');

function pmpCompletedAtTemplate(pmp, productId, templateId) {
  return (pmp || [])
    .filter((p) => p.productId === productId && p.milestoneTemplateId === templateId)
    .reduce((s, p) => s + (Number(p.completedQuantity) || 0), 0);
}

function milestoneCompletedAtTemplate(blockOrders, templateId) {
  return (blockOrders || []).reduce((s, o) => {
    const m = (o.milestones || []).find((x) => x.templateId === templateId);
    return s + (Number(m && m.completedQuantity) || 0);
  }, 0);
}

function nodeNameById(nodes, templateId, fallback) {
  const node = (nodes || []).find((n) => n && n.id === templateId);
  return (node && node.name) || fallback || '工序';
}

/**
 * @param {object} opts
 * @param {object} opts.block productGroup block（含 productId / orders）
 * @param {object|null} opts.product
 * @param {Array} opts.pmp
 * @param {Array} opts.nodes
 * @param {string} opts.processSequenceMode
 * @param {Set} opts.outOfSequenceTemplateIds
 * @param {function} opts.getDefectiveRework
 * @param {Array} [opts.orderForest] 返工合并用全量工单森林；默认 block.orders
 * @param {boolean} [opts.canReport]
 * @param {boolean} [opts.allowExceedMaxReportQty]
 * @returns {Array}
 */
function buildProductGroupProcessChips(opts) {
  const {
    block,
    product,
    pmp,
    nodes,
    processSequenceMode,
    outOfSequenceTemplateIds,
    getDefectiveRework,
    orderForest,
    canReport,
    allowExceedMaxReportQty,
  } = opts || {};

  const productId = block && block.productId;
  const blockOrders = (block && block.orders) || [];
  if (!productId || !blockOrders.length) return [];

  const pmpList = pmp || [];
  const usePmp = pmpList.length > 0;
  const forest = orderForest && orderForest.length ? orderForest : blockOrders;
  const seqMode = processSequenceMode || 'sequential';
  const outSeq = outOfSequenceTemplateIds || new Set();

  // 与 Web byTemplate 一致：按路线模板聚合已报（PMP.completedQuantity + 里程碑 completedQuantity）
  const byTemplate = new Map();
  if (usePmp) {
    pmpList
      .filter((row) => row.productId === productId)
      .forEach((row) => {
        const tid = row.milestoneTemplateId;
        if (!tid) return;
        const cur = byTemplate.get(tid) || { name: '', completed: 0 };
        byTemplate.set(tid, {
          name: cur.name || nodeNameById(nodes, tid, ''),
          completed: cur.completed + (Number(row.completedQuantity) || 0),
        });
      });
    blockOrders.forEach((o) => {
      (o.milestones || []).forEach((m) => {
        if (!m || !m.templateId) return;
        const cur = byTemplate.get(m.templateId) || { name: '', completed: 0 };
        byTemplate.set(m.templateId, {
          name: cur.name || m.name || nodeNameById(nodes, m.templateId, ''),
          completed: cur.completed + (Number(m.completedQuantity) || 0),
        });
      });
    });
  }
  if (byTemplate.size === 0) {
    blockOrders.forEach((o) => {
      (o.milestones || []).forEach((m) => {
        if (!m || !m.templateId) return;
        const cur = byTemplate.get(m.templateId) || { name: '', completed: 0 };
        byTemplate.set(m.templateId, {
          name: cur.name || m.name || nodeNameById(nodes, m.templateId, ''),
          completed: cur.completed + (Number(m.completedQuantity) || 0),
        });
      });
    });
  }

  // 路线排序：优先产品 milestoneNodeIds
  const routeIds = resolveProductRouteIds(product, blockOrders);
  const templateEntries = Array.from(byTemplate.entries()).sort(([aId], [bId]) => {
    const ia = routeIds.indexOf(aId);
    const ib = routeIds.indexOf(bId);
    if (ia === -1 && ib === -1) return String(aId).localeCompare(String(bId));
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const templateIds = templateEntries.map(([tid]) => tid);
  const totalQty = blockOrders.reduce(
    (s, o) => s + (o.items || []).reduce((a, i) => a + (Number(i.quantity) || 0), 0),
    0,
  );

  return templateEntries.map(([tid, info], idx) => {
    const gateIdx = findGatingPredecessorIndex(templateIds, idx, outSeq);
    let availableQty;
    if (usePmp) {
      availableQty = productGroupMaxReportableSum(
        blockOrders,
        tid,
        productId,
        pmpList,
        seqMode,
        getDefectiveRework,
        forest,
        outSeq,
      );
    } else {
      let baseQty = totalQty;
      if (isProcessSequential(seqMode, tid, outSeq) && gateIdx >= 0) {
        baseQty = templateEntries[gateIdx][1].completed;
      }
      const defectiveSum = blockOrders.reduce(
        (s, o) => s + (getDefectiveRework(o.id, tid).defective || 0),
        0,
      );
      const reworkSum = blockOrders.reduce(
        (s, o) => s + (getDefectiveRework(o.id, tid).rework || 0),
        0,
      );
      availableQty = Math.max(0, baseQty - defectiveSum + reworkSum);
    }

    const availDisplay = Math.max(0, Math.round(Number(availableQty) || 0));
    const completed = Math.round(Number(info.completed) || 0);
    const remainingRaw = Math.round((Number(availableQty) || 0) - completed);
    const remaining = allowExceedMaxReportQty ? remainingRaw : Math.max(0, remainingRaw);
    const progress =
      availDisplay > 0
        ? Math.min(100, Math.round((completed / availDisplay) * 100))
        : completed > 0
          ? 100
          : 0;
    const isCompleted = remaining <= 0 && completed > 0;
    const seqOk =
      !isProcessSequential(seqMode, tid, outSeq) ||
      gateIdx < 0 ||
      templateEntries[gateIdx][1].completed > 0;
    const canReportThis = !!canReport && seqOk && remaining > 0 && availDisplay > 0;

    return {
      orderId: '',
      milestoneId: tid,
      templateId: tid,
      productId,
      name: info.name || nodeNameById(nodes, tid, '工序'),
      completed,
      availableQty: availDisplay,
      remaining,
      progress,
      isCompleted,
      canReport: canReportThis,
      disabled: !canReportThis,
      toneIndex: idx % 6,
    };
  });
}

/** 待配工序：产品未绑工序，或旗下有 PENDING_PROCESS 工单 */
function productGroupNeedsConfigureProcess(product, blockOrders) {
  const hasRoute = Array.isArray(product && product.milestoneNodeIds) && product.milestoneNodeIds.length > 0;
  if (product != null && !hasRoute) return true;
  return (blockOrders || []).some((o) => o && o.status === 'PENDING_PROCESS');
}

module.exports = {
  buildProductGroupProcessChips,
  productGroupNeedsConfigureProcess,
  pmpCompletedAtTemplate,
  milestoneCompletedAtTemplate,
};
