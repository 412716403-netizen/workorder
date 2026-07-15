/**
 * 产品模式报工可报上限。
 *
 * 逐字移植 Web 端同名口径，保证小程序报工页与工单中心产品组卡 / 报工弹窗数字一致：
 * - `productGroupMaxReportableSum` / `orderMaxReportableAtTemplateProductAware`
 *   ← shared/orderReportableAggregates.ts
 * - `combinedCompletedByVariantAtTemplate` / `variantMaxGoodProductMode`
 *   ← utils/productReportAggregates.ts
 * - `computeProductReportHints` ← utils/reportRowDerivations.computeReportRowDerivations 产品分支
 *   （表头「可报最多」锚定工单中心产品组卡：用产品下全部工单求 productGroupMaxReportableSum）
 */

const { buildDefectiveReworkByOrderMilestone } = require('./outsourceDispatchMatrix.js');

// ── 顺控与通用小函数 ──

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

function jsonStringArray(value) {
  return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [];
}

/** 与 Web utils/reportQtyOccupies.sumPendingReportQty 一致：仅 PENDING */
function sumPendingReportQty(reports) {
  return (reports || [])
    .filter((r) => r.approvalStatus === 'PENDING')
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
}

/** 与 shared/orderReportableAggregates.reworkMergeBucketOrderId 一致 */
function reworkMergeBucketOrderId(orderId, orders) {
  if (!orders || !orders.length) return orderId;
  const o = orders.find((x) => x.id === orderId);
  return (o && o.parentOrderId) || orderId;
}

function sumBlockOrderQty(blockOrders) {
  return (blockOrders || []).reduce(
    (s, o) => s + (o.items || []).reduce((a, i) => a + (Number(i.quantity) || 0), 0),
    0,
  );
}

function sumVariantQtyInOrders(orders, variantId) {
  const vid = variantId || '';
  return (orders || []).reduce(
    (s, o) =>
      s +
      (o.items || [])
        .filter((i) => (i.variantId || '') === vid)
        .reduce((a, i) => a + (Number(i.quantity) || 0), 0),
    0,
  );
}

function pmpCompletedAtTemplate(pmp, productId, templateId) {
  return (pmp || [])
    .filter((p) => p.productId === productId && p.milestoneTemplateId === templateId)
    .reduce((s, p) => s + (Number(p.completedQuantity) || 0), 0);
}

function pmpDefectiveTotalAtTemplate(pmp, productId, templateId) {
  let sum = 0;
  (pmp || [])
    .filter((p) => p.productId === productId && p.milestoneTemplateId === templateId)
    .forEach((p) => {
      (p.reports || []).forEach((r) => {
        sum += Number(r.defectiveQuantity) || 0;
      });
    });
  return sum;
}

function milestoneCompletedAtTemplate(blockOrders, templateId) {
  return (blockOrders || []).reduce((s, o) => {
    const m = (o.milestones || []).find((x) => x.templateId === templateId);
    return s + (Number(m && m.completedQuantity) || 0);
  }, 0);
}

// ── shared/orderReportableAggregates 移植 ──

/** 与 shared/orderReportableAggregates.orderMaxReportableAtTemplateProductAware 一致 */
function orderMaxReportableAtTemplateProductAware(order, templateId, args) {
  const {
    processSequenceMode,
    productId,
    pmp,
    blockOrders,
    defective,
    rework,
    outOfSequenceTemplateIds,
  } = args;
  const milestones = order.milestones || [];
  const idx = milestones.findIndex((m) => m.templateId === templateId);
  if (idx < 0) return 0;
  const orderQty = (order.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  let baseQty = orderQty;
  if (isProcessSequential(processSequenceMode, templateId, outOfSequenceTemplateIds)) {
    const templateIds = milestones.map((m) => m.templateId);
    const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
    if (gateIdx >= 0) {
      const prevMs = milestones[gateIdx];
      const prevTid = prevMs.templateId;
      const blockQty = sumBlockOrderQty(blockOrders);
      const pmpPrevTotal = pmpCompletedAtTemplate(pmp, productId, prevTid);
      const fromMilestone = Number(prevMs.completedQuantity) || 0;
      if (fromMilestone > 0) {
        baseQty = Math.min(orderQty, fromMilestone);
      } else if (blockQty > 0) {
        baseQty = (orderQty * pmpPrevTotal) / blockQty;
      } else {
        baseQty = 0;
      }
    }
  }
  return Math.max(0, baseQty - defective + rework);
}

/** 与 shared/orderReportableAggregates.productGroupMaxReportableSum 一致（工单中心「可报最多」口径） */
function productGroupMaxReportableSum(
  blockOrders,
  templateId,
  productId,
  pmp,
  processSequenceMode,
  getDefectiveRework,
  orderForest,
  outOfSequenceTemplateIds,
) {
  const qtyByBucket = new Map();
  if (orderForest && orderForest.length) {
    (blockOrders || []).forEach((o) => {
      const q = (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      const b = reworkMergeBucketOrderId(o.id, orderForest);
      qtyByBucket.set(b, (qtyByBucket.get(b) || 0) + q);
    });
  }
  const sum = (blockOrders || []).reduce((acc, o) => {
    const defective = getDefectiveRework(o.id, templateId).defective;
    let rework = getDefectiveRework(o.id, templateId).rework;
    if (orderForest && orderForest.length) {
      const b = reworkMergeBucketOrderId(o.id, orderForest);
      const bucketRework = getDefectiveRework(b, templateId).rework;
      const tot = qtyByBucket.get(b) || 0;
      const qo = (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      rework = tot > 0 ? (bucketRework * qo) / tot : 0;
    }
    return (
      acc +
      orderMaxReportableAtTemplateProductAware(o, templateId, {
        processSequenceMode,
        productId,
        pmp,
        blockOrders,
        defective,
        rework,
        outOfSequenceTemplateIds,
      })
    );
  }, 0);
  const pmpDef = pmpDefectiveTotalAtTemplate(pmp, productId, templateId);
  const mileDef = (blockOrders || []).reduce(
    (s, o) => s + getDefectiveRework(o.id, templateId).defective,
    0,
  );
  return Math.max(0, Math.round(sum - Math.max(0, pmpDef - mileDef)));
}

// ── utils/productReportAggregates 移植 ──

/**
 * 与 Web combinedCompletedByVariantAtTemplate 一致：
 * PMP 有 reports 时按 reports（不过滤审核状态）；否则用 completedQuantity。
 * 工单里程碑同理；无按规格 reports 时按 items 数量占比分摊，尾差归末行。
 */
function combinedCompletedByVariantAtTemplate(blockOrders, pmp, productId, templateId) {
  const byVariant = {};
  const add = (vid, q) => {
    if (!(q > 0)) return;
    const key = vid || '';
    byVariant[key] = (byVariant[key] || 0) + q;
  };
  (pmp || [])
    .filter((p) => p.productId === productId && p.milestoneTemplateId === templateId)
    .forEach((row) => {
      const reps = row.reports;
      if (reps && reps.length > 0) {
        reps.forEach((r) =>
          add(r.variantId != null ? r.variantId : row.variantId != null ? row.variantId : '', Number(r.quantity) || 0),
        );
      } else {
        add(row.variantId != null ? row.variantId : '', Number(row.completedQuantity) || 0);
      }
    });
  (blockOrders || []).forEach((o) => {
    const m = (o.milestones || []).find((x) => x.templateId === templateId);
    if (!m) return;
    const reps = m.reports;
    if (reps && reps.length > 0) {
      reps.forEach((r) => add(r.variantId != null ? r.variantId : '', Number(r.quantity) || 0));
    } else {
      const total = Number(m.completedQuantity) || 0;
      if (total <= 0) return;
      const items = o.items || [];
      const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      if (totalQty <= 0) {
        add('', total);
        return;
      }
      let rem = total;
      items.forEach((item, idx) => {
        const part =
          idx === items.length - 1
            ? rem
            : Math.floor((total * (Number(item.quantity) || 0)) / totalQty);
        rem -= part;
        add(item.variantId != null ? item.variantId : '', part);
      });
    }
  });
  return byVariant;
}

function combinedCompletedAtTemplate(blockOrders, pmp, productId, templateId) {
  const byVariant = combinedCompletedByVariantAtTemplate(blockOrders, pmp, productId, templateId);
  return Object.keys(byVariant).reduce((s, k) => s + byVariant[k], 0);
}

function combinedCompletedAtTemplateVariant(blockOrders, pmp, productId, templateId, variantId) {
  const byVariant = combinedCompletedByVariantAtTemplate(blockOrders, pmp, productId, templateId);
  return byVariant[variantId || ''] || 0;
}

/** 与 Web variantMaxGoodProductMode 一致：本规格本工序「还可报良品」上限 */
function variantMaxGoodProductMode(
  variantId,
  templateId,
  productId,
  blockOrders,
  pmp,
  processSequenceMode,
  milestoneNodeIds,
  getDefectiveRework,
  orderForest,
  outOfSequenceTemplateIds,
) {
  const tid = templateId;
  const idx = (milestoneNodeIds || []).indexOf(tid);
  const vid = variantId || '';
  const Qv = sumVariantQtyInOrders(blockOrders, vid);
  const curDone = combinedCompletedAtTemplateVariant(blockOrders, pmp, productId, tid, vid);
  let baseV = Qv;
  if (isProcessSequential(processSequenceMode, tid, outOfSequenceTemplateIds)) {
    const gateIdx = findGatingPredecessorIndex(milestoneNodeIds, idx, outOfSequenceTemplateIds);
    if (gateIdx >= 0) {
      const prevTid = milestoneNodeIds[gateIdx];
      baseV = combinedCompletedAtTemplateVariant(blockOrders, pmp, productId, prevTid, vid);
    }
  }
  let defectiveV = (pmp || [])
    .filter(
      (p) =>
        p.productId === productId &&
        p.milestoneTemplateId === tid &&
        (p.variantId != null ? p.variantId : '') === vid,
    )
    .reduce(
      (s, p) => s + (p.reports || []).reduce((a, r) => a + (Number(r.defectiveQuantity) || 0), 0),
      0,
    );
  if (defectiveV === 0) {
    (blockOrders || []).forEach((o) => {
      const ms = (o.milestones || []).find((m) => m.templateId === tid);
      defectiveV += ((ms && ms.reports) || [])
        .filter((r) => (r.variantId || '') === vid)
        .reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);
    });
  }
  let reworkV = 0;
  if (orderForest && orderForest.length) {
    const buckets = new Set((blockOrders || []).map((o) => reworkMergeBucketOrderId(o.id, orderForest)));
    buckets.forEach((bid) => {
      const rw = getDefectiveRework(bid, tid).reworkByVariant || {};
      reworkV += rw[vid] || 0;
    });
  } else {
    (blockOrders || []).forEach((o) => {
      const rw = getDefectiveRework(o.id, tid).reworkByVariant || {};
      reworkV += rw[vid] || 0;
    });
  }
  const availableV = Math.max(0, baseV - defectiveV + reworkV);
  return Math.max(0, availableV - curDone);
}

// ── 外协占用 ──

/**
 * 产品模式（PMP）分支：与 Web computeReportRowDerivations 一致，
 * 仅统计产品级外协（无 orderId 且 productId 匹配）；工单级外协不扣产品维度余量。
 */
function collectOutsourceAtNode(prodRecords, filterFn) {
  const dispatchedByVariant = {};
  const receivedByVariant = {};
  let totalDispatched = 0;
  let totalReceived = 0;
  (prodRecords || []).filter(filterFn).forEach((r) => {
    const vid = r.variantId || '';
    const q = Number(r.quantity) || 0;
    if (r.status === '加工中') {
      totalDispatched += q;
      dispatchedByVariant[vid] = (dispatchedByVariant[vid] || 0) + q;
    } else if (r.status === '已收回') {
      totalReceived += q;
      receivedByVariant[vid] = (receivedByVariant[vid] || 0) + q;
    }
  });
  const totalOutsourcedAtNode = Math.max(0, totalDispatched - totalReceived);
  const outsourcedByVariantId = {};
  new Set([...Object.keys(dispatchedByVariant), ...Object.keys(receivedByVariant)]).forEach(
    (vid) => {
      const net = (dispatchedByVariant[vid] || 0) - (receivedByVariant[vid] || 0);
      if (net > 0) outsourcedByVariantId[vid] = net;
    },
  );
  return { totalOutsourcedAtNode, outsourcedByVariantId };
}

// ── 页面辅助 ──

/** 合并产品下各工单 items（按规格） */
function aggregateProductItems(blockOrders) {
  const byVid = new Map();
  (blockOrders || []).forEach((o) => {
    (o.items || []).forEach((it) => {
      const vid = it.variantId || '';
      byVid.set(vid, (byVid.get(vid) || 0) + (Number(it.quantity) || 0));
    });
  });
  return [...byVid.entries()].map(([variantId, quantity]) => ({
    variantId: variantId || undefined,
    quantity,
  }));
}

function resolveProductRouteIds(product, blockOrders) {
  const fromProduct = jsonStringArray(product && product.milestoneNodeIds);
  if (fromProduct.length) return fromProduct;
  const seen = new Set();
  const ids = [];
  (blockOrders || []).forEach((o) => {
    (o.milestones || []).forEach((m) => {
      if (m && m.templateId && !seen.has(m.templateId)) {
        seen.add(m.templateId);
        ids.push(m.templateId);
      }
    });
  });
  return ids;
}

// ── 主计算（对齐 Web computeReportRowDerivations 产品分支） ──

/**
 * @param {object} opts
 * @param {Array} opts.blockOrders 该产品下全部工单（不排除已发货，与 Web 工单中心一致）
 * @param {Array} opts.pmp 全量 PMP 行（含 reports）
 * @param {Array} opts.prodRecords OUTSOURCE / REWORK / REWORK_REPORT 记录（须含产品级无 orderId 记录）
 * @returns {object} 与 computeOrderReportHints 同形，便于报工页复用 UI
 */
function computeProductReportHints(opts) {
  const {
    blockOrders,
    pmp,
    productId,
    milestoneTemplateId,
    product,
    globalNodes,
    config,
    prodRecords,
  } = opts || {};
  const processSequenceMode = (config && config.processSequenceMode) || 'sequential';
  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(globalNodes);
  const seqOpts = { processSequenceMode, outOfSequenceTemplateIds };
  const tid = milestoneTemplateId;
  const allOrders = blockOrders || [];
  const pmpList = pmp || [];
  const records = prodRecords || [];
  const useProductPmp = pmpList.length > 0;
  const routeIds = resolveProductRouteIds(product, allOrders);
  /** 与 Web resolveOrdersForProductAtTemplate 一致：只统计里程碑含该工序模板的工单 */
  const ordersInModal = allOrders.filter((o) =>
    (o.milestones || []).some((m) => m.templateId === tid),
  );
  const orderIdSet = new Set(ordersInModal.map((o) => o.id));

  const drMap = buildDefectiveReworkByOrderMilestone(allOrders, records);
  const getDefectiveRework = (oid, t) =>
    drMap.get(`${oid}|${t}`) || { defective: 0, rework: 0, reworkByVariant: {} };

  const hintTotalQty = Math.round(sumBlockOrderQty(allOrders));

  // 「可报最多」锚定工单中心产品组卡（OrderListView availableQty）：全部 blockOrders 参与
  let hintMaxRaw;
  if (useProductPmp) {
    hintMaxRaw = productGroupMaxReportableSum(
      allOrders,
      tid,
      productId,
      pmpList,
      processSequenceMode,
      getDefectiveRework,
      allOrders,
      outOfSequenceTemplateIds,
    );
  } else {
    // Web 非 PMP 回退：base(顺控取前序聚合完成量) − 不良 + 返工
    let baseQty = hintTotalQty;
    const idx = routeIds.indexOf(tid);
    if (isProcessSequential(processSequenceMode, tid, outOfSequenceTemplateIds)) {
      const gateIdx = findGatingPredecessorIndex(routeIds, idx, outOfSequenceTemplateIds);
      if (gateIdx >= 0) baseQty = milestoneCompletedAtTemplate(allOrders, routeIds[gateIdx]);
    }
    const defectiveSum = allOrders.reduce((s, o) => s + getDefectiveRework(o.id, tid).defective, 0);
    const reworkSum = allOrders.reduce((s, o) => s + getDefectiveRework(o.id, tid).rework, 0);
    hintMaxRaw = Math.max(0, baseQty - defectiveSum + reworkSum);
  }
  const hintMaxReportable = Math.max(0, Math.round(Number(hintMaxRaw) || 0));

  // 「已报」= PMP completedQuantity + 工单里程碑 completedQuantity（Web 产品组卡 m.completed）
  const hintCompletedDisplay = Math.round(
    (useProductPmp ? pmpCompletedAtTemplate(pmpList, productId, tid) : 0) +
      milestoneCompletedAtTemplate(allOrders, tid),
  );

  // 待审占用：scoped 工单里程碑 PENDING + PMP reports PENDING
  let pendingOccupied = ordersInModal.reduce((s, o) => {
    const m = (o.milestones || []).find((x) => x.templateId === tid);
    return s + sumPendingReportQty(m && m.reports);
  }, 0);
  if (useProductPmp) {
    pendingOccupied += pmpList
      .filter((p) => p.productId === productId && p.milestoneTemplateId === tid)
      .reduce((s, p) => s + sumPendingReportQty(p.reports), 0);
  }

  const outsourceFilter = useProductPmp
    ? (r) =>
        r.type === 'OUTSOURCE' &&
        !r.sourceReworkId &&
        !r.orderId &&
        r.productId === productId &&
        r.nodeId === tid
    : (r) =>
        r.type === 'OUTSOURCE' &&
        !r.sourceReworkId &&
        r.nodeId === tid &&
        orderIdSet.has(r.orderId || '');
  const { totalOutsourcedAtNode, outsourcedByVariantId } = collectOutsourceAtNode(
    records,
    outsourceFilter,
  );

  const hintRemaining = Math.max(
    0,
    hintMaxReportable - hintCompletedDisplay - pendingOccupied - totalOutsourcedAtNode,
  );

  // effectiveRemainingForModal：Web 用 scoped 工单集重新求 totalBase / totalCompleted
  const totalBase = useProductPmp
    ? productGroupMaxReportableSum(
        ordersInModal,
        tid,
        productId,
        pmpList,
        processSequenceMode,
        getDefectiveRework,
        allOrders,
        outOfSequenceTemplateIds,
      )
    : (() => {
        if (isProcessSequential(processSequenceMode, tid, outOfSequenceTemplateIds)) {
          return ordersInModal.reduce((s, o) => {
            const milestones = o.milestones || [];
            const idx = milestones.findIndex((m) => m.templateId === tid);
            const templateIds = milestones.map((m) => m.templateId);
            const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
            if (gateIdx < 0)
              return s + (o.items || []).reduce((a, i) => a + (Number(i.quantity) || 0), 0);
            return s + (Number(milestones[gateIdx] && milestones[gateIdx].completedQuantity) || 0);
          }, 0);
        }
        return sumBlockOrderQty(ordersInModal);
      })();
  const totalCompleted = useProductPmp
    ? combinedCompletedAtTemplate(ordersInModal, pmpList, productId, tid)
    : milestoneCompletedAtTemplate(ordersInModal, tid);
  const totalDefective = ordersInModal.reduce(
    (s, o) => s + getDefectiveRework(o.id, tid).defective,
    0,
  );
  const pmpDefectiveAtNode = useProductPmp
    ? pmpDefectiveTotalAtTemplate(pmpList, productId, tid)
    : 0;
  const defectiveQtyForHint = useProductPmp
    ? Math.max(pmpDefectiveAtNode, totalDefective)
    : totalDefective;
  const totalRework = [
    ...new Set(ordersInModal.map((o) => reworkMergeBucketOrderId(o.id, allOrders))),
  ].reduce((s, bid) => s + getDefectiveRework(bid, tid).rework, 0);
  const effectiveRemainingBase = useProductPmp
    ? Math.max(0, totalBase - totalCompleted - totalOutsourcedAtNode)
    : Math.max(0, totalBase - totalDefective + totalRework - totalCompleted - totalOutsourcedAtNode);
  const effectiveRemainingForModal = Math.max(0, effectiveRemainingBase - pendingOccupied);

  return {
    hintTotalQty,
    hintMaxReportable,
    hintCompletedDisplay,
    hintRemaining,
    defectiveQtyForHint,
    totalOutsourcedAtNode,
    totalRework: Math.round(totalRework),
    pendingApprovalQty: pendingOccupied,
    reworkRemainingQty: Math.max(0, defectiveQtyForHint - totalRework),
    effectiveRemainingForModal,
    outsourcedByVariantId,
    processSequenceMode,
    outOfSequenceTemplateIds,
    opts: seqOpts,
    routeIds,
  };
}

/**
 * 产品模式按规格「最多可报良品」（对齐 Web ReportVariantMatrixInput：
 * variantMaxGoodProductMode − 该规格产品级外协净额）
 */
function buildProductVariantMaxGoodMap(opts) {
  const {
    blockOrders,
    pmp,
    productId,
    milestoneTemplateId,
    product,
    reportHints,
    prodRecords,
  } = opts || {};
  const tid = milestoneTemplateId;
  const allOrders = blockOrders || [];
  const pmpList = pmp || [];
  const routeIds =
    (reportHints && reportHints.routeIds) || resolveProductRouteIds(product, allOrders);
  const processSequenceMode =
    (reportHints && reportHints.processSequenceMode) || 'sequential';
  const outOfSequenceTemplateIds =
    (reportHints && reportHints.outOfSequenceTemplateIds) || new Set();
  const outsourcedByVariantId = (reportHints && reportHints.outsourcedByVariantId) || {};
  const ordersInModal = allOrders.filter((o) =>
    (o.milestones || []).some((m) => m.templateId === tid),
  );

  const drMap = buildDefectiveReworkByOrderMilestone(allOrders, prodRecords || []);
  const getDefectiveRework = (oid, t) =>
    drMap.get(`${oid}|${t}`) || { defective: 0, rework: 0, reworkByVariant: {} };

  const ids = new Set(aggregateProductItems(allOrders).map((i) => i.variantId || ''));
  ((product && product.variants) || []).forEach((v) => ids.add(v.id));

  const map = {};
  ids.forEach((vid) => {
    const raw =
      variantMaxGoodProductMode(
        vid,
        tid,
        productId,
        ordersInModal,
        pmpList,
        processSequenceMode,
        routeIds,
        getDefectiveRework,
        allOrders,
        outOfSequenceTemplateIds,
      ) - (outsourcedByVariantId[vid] || 0);
    map[vid] = Math.max(0, raw);
  });
  return map;
}

async function fetchOrdersPageAll(listOrdersPaginated, filters) {
  const pageSize = 200;
  let page = 1;
  let total = Infinity;
  const all = [];
  while (all.length < total) {
    const result = await listOrdersPaginated({ page, pageSize, ...(filters || {}) });
    const batch = (result && result.data) || [];
    all.push(...batch);
    total = typeof result.total === 'number' ? result.total : all.length;
    if (!batch.length || batch.length < pageSize) break;
    page += 1;
  }
  return all;
}

/** 异步拉取某产品全部工单（分页） */
async function fetchAllOrdersByProductId(listOrdersPaginated, productId) {
  const all = await fetchOrdersPageAll(listOrdersPaginated, { productId });
  return all.filter((o) => o && o.productId === productId);
}

/**
 * 产品模式物料统计用工单集合：本产品工单 + 其工单族子单（子单可能是其它 productId）。
 * 与网页 useOrderMaterialStats.familyOrderIds 对齐，避免「只挂在子工单、无 sourceProductId」的领退料漏计。
 */
async function fetchOrdersForProductMaterialFamily(listOrdersPaginated, productId) {
  if (!productId) return [];
  const byId = new Map();
  const seeds = await fetchAllOrdersByProductId(listOrdersPaginated, productId);
  seeds.forEach((o) => {
    if (o && o.id) byId.set(o.id, o);
  });
  const queue = seeds.map((o) => o.id).filter(Boolean);
  const seenParent = new Set();
  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId || seenParent.has(parentId)) continue;
    seenParent.add(parentId);
    const children = await fetchOrdersPageAll(listOrdersPaginated, { parentOrderId: parentId });
    children.forEach((c) => {
      if (!c || !c.id || byId.has(c.id)) return;
      byId.set(c.id, c);
      queue.push(c.id);
    });
  }
  return Array.from(byId.values());
}

function buildSyntheticMilestone(templateId, name, globalNodes) {
  const node = (globalNodes || []).find((n) => n.id === templateId);
  return {
    id: templateId,
    templateId,
    name: name || (node && node.name) || templateId,
    completedQuantity: 0,
    reports: [],
  };
}

module.exports = {
  aggregateProductItems,
  sumBlockOrderQty,
  resolveProductRouteIds,
  computeProductReportHints,
  buildProductVariantMaxGoodMap,
  fetchAllOrdersByProductId,
  fetchOrdersForProductMaterialFamily,
  buildSyntheticMilestone,
  combinedCompletedAtTemplate,
  combinedCompletedByVariantAtTemplate,
  variantMaxGoodProductMode,
  productGroupMaxReportableSum,
};
