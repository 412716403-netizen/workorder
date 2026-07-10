/**
 * 外协发出色码矩阵（对齐 Web OutsourceDispatchQuantityModal + outsourceDispatchVariantCaps）
 */

const _require =



  require('./reportVariantMaxQty.js'),isProcessSequential = _require.isProcessSequential,findGatingPredecessorIndex = _require.findGatingPredecessorIndex,buildOutOfSequenceTemplateIds = _require.buildOutOfSequenceTemplateIds;
const _require2 = require('./productionPlans.js'),productHasColorSizeMatrix = _require2.productHasColorSizeMatrix;
const _require3 = require('./outsourceReceiveKeys.js'),dispatchRowKey = _require3.dispatchRowKey;

function variantQuantityKey(baseKey, variantId) {
  return variantId ? `${baseKey}|${variantId}` : baseKey;
}

function sumVariantQtyInOrders(orders, variantId) {
  const vid = variantId || '';
  return (orders || []).reduce(
    (s, o) => s + (o.items || []).
    filter((i) => (i.variantId || '') === vid).
    reduce((a, i) => a + (Number(i.quantity) || 0), 0),
    0
  );
}

function combinedCompletedByVariantAtTemplate(blockOrders, pmp, productId, templateId) {
  const byVariant = {};
  const add = (vid, q) => {
    if (!(q > 0)) return;
    const key = vid || '';
    byVariant[key] = (byVariant[key] || 0) + q;
  };
  (pmp || []).forEach((row) => {
    if (row.productId !== productId || row.milestoneTemplateId !== templateId) return;
    const reps = row.reports;
    if (reps && reps.length) {
      reps.forEach((r) => {var _ref, _r$variantId;return add((_ref = (_r$variantId = r.variantId) != null ? _r$variantId : row.variantId) != null ? _ref : '', Number(r.quantity) || 0);});
    } else {var _row$variantId;
      add((_row$variantId = row.variantId) != null ? _row$variantId : '', Number(row.completedQuantity) || 0);
    }
  });
  (blockOrders || []).forEach((o) => {
    const m = (o.milestones || []).find((x) => x.templateId === templateId);
    if (!m) return;
    const reps = m.reports;
    if (reps && reps.length) {
      reps.forEach((r) => {var _r$variantId2;return add((_r$variantId2 = r.variantId) != null ? _r$variantId2 : '', Number(r.quantity) || 0);});
    } else {
      const total = Number(m.completedQuantity) || 0;
      if (total <= 0) return;
      const totalQty = (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      if (totalQty <= 0) {
        add('', total);
        return;
      }
      let rem = total;
      (o.items || []).forEach((item, idx) => {var _item$variantId;
        const part = idx === o.items.length - 1 ?
        rem :
        Math.floor(total * (Number(item.quantity) || 0) / totalQty);
        rem -= part;
        add((_item$variantId = item.variantId) != null ? _item$variantId : '', part);
      });
    }
  });
  return byVariant;
}

function combinedCompletedAtTemplateVariant(blockOrders, pmp, productId, templateId, variantId) {
  const byVariant = combinedCompletedByVariantAtTemplate(blockOrders, pmp, productId, templateId);
  return byVariant[variantId || ''] || 0;
}

function buildDefectiveReworkByOrderMilestone(orders, prodRecords) {
  const map = new Map();
  (orders || []).forEach((o) => {
    (o.milestones || []).forEach((m) => {
      const defective = (m.reports || []).reduce(
        (s, r) => s + (Number(r.defectiveQuantity) || 0),
        0
      );
      map.set(`${o.id}|${m.templateId}`, { defective, rework: 0, reworkByVariant: {} });
    });
  });

  const reworkReports = (prodRecords || []).filter((r) => r.type === 'REWORK_REPORT');
  if (!reworkReports.length) return map;

  const ordersById = new Map((orders || []).map((o) => [o.id, o]));
  const recordById = new Map((prodRecords || []).map((r) => [r.id, r]));
  const reworkRecords = (prodRecords || []).filter((r) => r.type === 'REWORK');
  const reworkByOrderSource = new Map();
  const reworkByProductSource = new Map();
  reworkRecords.forEach((r) => {
    const src = r.sourceNodeId != null ? r.sourceNodeId : r.nodeId != null ? r.nodeId : '';
    if (r.orderId) {
      const k = `${r.orderId}|${src}`;
      const arr = reworkByOrderSource.get(k) || [];
      arr.push(r);
      reworkByOrderSource.set(k, arr);
    } else if (r.productId) {
      const k = `${r.productId}|${src}`;
      const arr = reworkByProductSource.get(k) || [];
      arr.push(r);
      reworkByProductSource.set(k, arr);
    }
  });

  const orderIdToParent = new Map();
  (orders || []).forEach((o) => {
    if (o.parentOrderId) orderIdToParent.set(o.id, o.parentOrderId);
  });

  const getParentOrderId = (orderId) => orderIdToParent.get(orderId) || orderId;
  const orderProduct = (oid) => {
    const o = ordersById.get(oid);
    return o && o.productId;
  };
  const getOriginalSourceNodeId = (r) => {
    const pid = orderProduct(r.orderId || '');
    const nodeId = r.nodeId || '';
    const parentOid = orderIdToParent.get(r.orderId || '');
    const candidates = [
      ...(reworkByOrderSource.get(`${r.orderId}|${nodeId}`) || []),
      ...(parentOid ? (reworkByOrderSource.get(`${parentOid}|${nodeId}`) || []) : []),
      ...(pid ? (reworkByProductSource.get(`${pid}|${nodeId}`) || []) : []),
    ];
    const pathIncludes = (x, node) => {
      const path = x.reworkNodeIds && x.reworkNodeIds.length
        ? x.reworkNodeIds
        : x.nodeId ? [x.nodeId] : [];
      return path.includes(node);
    };
    const rework = candidates.find((x) => pathIncludes(x, nodeId));
    return (rework && rework.sourceNodeId) || r.sourceNodeId || r.nodeId || undefined;
  };
  const getReworkNodeIdsForOrder = (orderId, sourceNodeId) => {
    const o = ordersById.get(orderId);
    const byOrder = reworkByOrderSource.get(`${orderId}|${sourceNodeId}`);
    let rw = byOrder && byOrder[0];
    if (!rw && o) {
      rw = (reworkByProductSource.get(`${o.productId}|${sourceNodeId}`) || [])[0];
    }
    if (rw && rw.reworkNodeIds && rw.reworkNodeIds.length) return rw.reworkNodeIds;
    if (rw && rw.nodeId) return [rw.nodeId];
    return [];
  };
  const getReworkNodeIds = (parentOrderId, sourceNodeId, orderIdsInGroup) => {
    const tried = new Set([parentOrderId, ...orderIdsInGroup]);
    for (const oid of tried) {
      const ids = getReworkNodeIdsForOrder(oid, sourceNodeId);
      if (ids.length > 0) return ids;
    }
    return [];
  };

  const bySourceKey = new Map();

  const ensureEntry = (key, oid) => {
    if (!bySourceKey.has(key)) bySourceKey.set(key, { byVariant: {}, orderIds: new Set() });
    const e = bySourceKey.get(key);
    e.orderIds.add(oid);
    return e;
  };

  reworkReports.forEach((r) => {
    const rwCandidate = r.sourceReworkId ? recordById.get(r.sourceReworkId) : undefined;
    const rw = rwCandidate && rwCandidate.type === 'REWORK' ? rwCandidate : undefined;
    let parentOrderId;
    let originalSourceNodeId;
    let reworkNodeIdsFromRw;

    if (rw) {
      parentOrderId = rw.orderId ? getParentOrderId(rw.orderId) : getParentOrderId(r.orderId || '');
      originalSourceNodeId = (rw.sourceNodeId || r.sourceNodeId || r.nodeId) || '';
      const nodes = rw.reworkNodeIds && rw.reworkNodeIds.length
        ? rw.reworkNodeIds
        : rw.nodeId ? [rw.nodeId] : [];
      reworkNodeIdsFromRw = nodes.length > 0 ? nodes : undefined;
    } else {
      originalSourceNodeId = getOriginalSourceNodeId(r) || r.sourceNodeId || r.nodeId || '';
      if (!originalSourceNodeId) return;
      parentOrderId = getParentOrderId(r.orderId || '');
      reworkNodeIdsFromRw = undefined;
    }
    if (!originalSourceNodeId) return;

    const key = `${parentOrderId}|${originalSourceNodeId}`;
    const entry = ensureEntry(key, r.orderId || parentOrderId);
    if (reworkNodeIdsFromRw && reworkNodeIdsFromRw.length
      && (!entry.reworkNodeIds || !entry.reworkNodeIds.length)) {
      entry.reworkNodeIds = reworkNodeIdsFromRw;
    }
    const byVariant = entry.byVariant;
    const vid = r.variantId || '';
    if (!byVariant[vid]) byVariant[vid] = {};
    const nodeId = r.nodeId || '';
    byVariant[vid][nodeId] = (byVariant[vid][nodeId] || 0) + (Number(r.quantity) || 0);
  });

  bySourceKey.forEach((entry, key) => {
    const parts = key.split('|');
    const parentOrderId = parts[0];
    const sourceNodeId = parts[1];
    const reworkNodeIds = entry.reworkNodeIds && entry.reworkNodeIds.length
      ? entry.reworkNodeIds
      : getReworkNodeIds(parentOrderId, sourceNodeId, [...entry.orderIds]);
    const reworkByVariant = {};
    Object.entries(entry.byVariant).forEach(([vid, byNode]) => {
      const contribution = reworkNodeIds.length > 0
        ? Math.min(...reworkNodeIds.map((nid) => byNode[nid] || 0))
        : Object.values(byNode).reduce((s, q) => s + q, 0);
      reworkByVariant[vid] = contribution;
    });
    const rework = Object.values(reworkByVariant).reduce((s, q) => s + q, 0);
    const existing = map.get(`${parentOrderId}|${sourceNodeId}`);
    if (existing) {
      existing.rework = rework;
      existing.reworkByVariant = reworkByVariant;
    } else {
      map.set(`${parentOrderId}|${sourceNodeId}`, { defective: 0, rework, reworkByVariant });
    }
  });

  return map;
}

function netOutsourceDispatchedProductNodeVariant(records, productId, nodeId, variantId) {
  const vid = variantId || '';
  const rows = (records || []).filter(
    (r) => r.type === 'OUTSOURCE' && !r.orderId && r.productId === productId && r.nodeId === nodeId
  );
  const sent = rows.
  filter((r) => r.status === '加工中' && (r.variantId || '') === vid).
  reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const recv = rows.
  filter((r) => r.status === '已收回' && (r.variantId || '') === vid).
  reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  return Math.max(0, sent - recv);
}

function netOutsourceDispatchedOrderNodeVariant(records, orderId, nodeId, variantId) {
  const vid = variantId || '';
  const rows = (records || []).filter(
    (r) => r.type === 'OUTSOURCE' && r.orderId === orderId && r.nodeId === nodeId
  );
  const sent = rows.
  filter((r) => r.status === '加工中' && (r.variantId || '') === vid).
  reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const recv = rows.
  filter((r) => r.status === '已收回' && (r.variantId || '') === vid).
  reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  return Math.max(0, sent - recv);
}

function productOutsourceDispatchUsesAggregateVariantPool(
blockOrders,
pmp,
productId,
nodeId,
product)
{
  const variantIdsInBlock = new Set();
  (blockOrders || []).forEach((o) => {
    (o.items || []).forEach((i) => {
      if ((Number(i.quantity) || 0) > 0 && i.variantId) variantIdsInBlock.add(i.variantId);
    });
  });
  const variantIdsFromProgress = new Set();
  (pmp || []).forEach((row) => {
    if (row.productId !== productId || row.milestoneTemplateId !== nodeId) return;
    if (row.variantId) variantIdsFromProgress.add(row.variantId);
    (row.reports || []).forEach((r) => {
      if (r.variantId) variantIdsFromProgress.add(r.variantId);
    });
  });
  (blockOrders || []).forEach((o) => {
    const ms = (o.milestones || []).find((m) => m.templateId === nodeId);
    ((ms == null ? void 0 : ms.reports) || []).forEach((r) => {
      if (r.variantId) variantIdsFromProgress.add(r.variantId);
    });
  });
  const variants = product && product.variants || [];
  const unionSize = new Set([...variantIdsInBlock, ...variantIdsFromProgress]).size;
  return variants.length > 0 && unionSize === 0;
}

function variantMaxGoodProductMode(
variantId,
templateId,
productId,
blockOrders,
pmp,
processSequenceMode,
milestoneNodeIds,
getDefectiveRework,
outOfSequenceTemplateIds)
{
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
  let defectiveV = (pmp || []).
  filter((p) => {var _p$variantId;return p.productId === productId && p.milestoneTemplateId === tid && ((_p$variantId = p.variantId) != null ? _p$variantId : '') === vid;}).
  flatMap((p) => p.reports || []).
  reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);
  if (defectiveV === 0) {
    (blockOrders || []).forEach((o) => {
      const ms = (o.milestones || []).find((m) => m.templateId === tid);
      defectiveV += ((ms == null ? void 0 : ms.reports) || []).
      filter((r) => (r.variantId || '') === vid).
      reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);
    });
  }
  let reworkV = 0;
  (blockOrders || []).forEach((o) => {
    const dr = getDefectiveRework(o.id, tid);
    reworkV += dr.reworkByVariant && dr.reworkByVariant[vid] || 0;
  });
  const availableV = Math.max(0, baseV - defectiveV + reworkV);
  return Math.max(0, availableV - curDone);
}

function sumOutsourceableByVariantProductMatrix(
records,
product,
nodeId,
blockOrders,
productMilestoneProgresses,
processSequenceMode,
getDefectiveRework,
outOfSequenceTemplateIds)
{
  const variants = product && product.variants || [];
  if (!variants.length) return Number.POSITIVE_INFINITY;
  const milestoneNodeIds = product.milestoneNodeIds || [];
  let sum = 0;
  variants.forEach((v) => {
    const vid = (v.id || '').trim();
    if (!vid) return;
    const maxGood = variantMaxGoodProductMode(
      vid,
      nodeId,
      product.id,
      blockOrders,
      productMilestoneProgresses || [],
      processSequenceMode,
      milestoneNodeIds,
      getDefectiveRework,
      outOfSequenceTemplateIds
    );
    const dispatched = netOutsourceDispatchedProductNodeVariant(records, product.id, nodeId, vid);
    sum += Math.max(0, maxGood - dispatched);
  });
  return sum;
}

function resolveDispatchRowMatrixContext(row, ctx) {var _product$variants;
  const _ref3 =




    ctx || {},_ref3$productionLinkM = _ref3.productionLinkMode,productionLinkMode = _ref3$productionLinkM === void 0 ? 'order' : _ref3$productionLinkM,_ref3$orders = _ref3.orders,orders = _ref3$orders === void 0 ? [] : _ref3$orders,_ref3$products = _ref3.products,products = _ref3$products === void 0 ? [] : _ref3$products,_ref3$categories = _ref3.categories,categories = _ref3$categories === void 0 ? [] : _ref3$categories;
  const product = products.find((p) => p.id === row.productId);
  const category = categories.find((c) => c.id === (product == null ? void 0 : product.categoryId));
  const hasColorSizeMatrix = productHasColorSizeMatrix(product, category);
  const isProductBlock = productionLinkMode === 'product' && !row.orderId;
  const baseKey = dispatchRowKey(row);

  if (!hasColorSizeMatrix || !(product != null && (_product$variants = product.variants) != null && _product$variants.length)) {
    return { baseKey, hasMatrix: false, variants: [], aggregate: false };
  }

  if (isProductBlock) {
    return {
      baseKey,
      hasMatrix: true,
      variants: [...product.variants],
      aggregate: productOutsourceDispatchUsesAggregateVariantPool(
        orders.filter((o) => o.productId === row.productId),
        ctx.productMilestoneProgresses,
        row.productId,
        row.nodeId,
        product
      ),
      product,
      blockOrders: orders.filter((o) => o.productId === row.productId)
    };
  }

  return {
    baseKey,
    hasMatrix: true,
    variants: [...product.variants],
    aggregate: ((_order$milestones) => {
      const order = orders.find((o) => o.id === row.orderId);
      const variantIdsInOrderItems = new Set(
        ((order == null ? void 0 : order.items) || []).map((i) => i.variantId).filter(Boolean)
      );
      const variantIdsFromOrderMilestone = new Set();
      const msRow = order == null || (_order$milestones = order.milestones) == null ? void 0 : _order$milestones.find((m) => m.templateId === row.nodeId);
      ((msRow == null ? void 0 : msRow.reports) || []).forEach((r) => {
        if (r.variantId) variantIdsFromOrderMilestone.add(r.variantId);
      });
      return variantIdsInOrderItems.size === 0 && variantIdsFromOrderMilestone.size === 0;
    })(),
    product,
    order: orders.find((o) => o.id === row.orderId)
  };
}

function getAvailableForVariantOrder(row, variantId, qtyMap, ctx) {var _order$milestones2, _order$milestones$fin, _order$milestones3, _order$milestones4;
  const _ctx$records = ctx.records,records = _ctx$records === void 0 ? [] : _ctx$records,_ctx$orders = ctx.orders,orders = _ctx$orders === void 0 ? [] : _ctx$orders,defectiveReworkMap = ctx.defectiveReworkMap,processSequenceMode = ctx.processSequenceMode,outOfSequenceTemplateIds = ctx.outOfSequenceTemplateIds;
  const order = orders.find((o) => o.id === row.orderId);
  const baseKey = dispatchRowKey(row);
  const ms = order == null || (_order$milestones2 = order.milestones) == null ? void 0 : _order$milestones2.find((m) => m.templateId === row.nodeId);
  const msIdx = (_order$milestones$fin = order == null || (_order$milestones3 = order.milestones) == null ? void 0 : _order$milestones3.findIndex((m) => m.templateId === row.nodeId)) != null ? _order$milestones$fin : -1;
  const templateIds = ((order == null ? void 0 : order.milestones) || []).map((m) => m.templateId);
  const gateIdx = findGatingPredecessorIndex(templateIds, msIdx, outOfSequenceTemplateIds);
  const prevMs = isProcessSequential(processSequenceMode, row.nodeId, outOfSequenceTemplateIds) && gateIdx >= 0 ?
  order == null || (_order$milestones4 = order.milestones) == null ? void 0 : _order$milestones4[gateIdx] :
  undefined;
  const vid = variantId || '';
  const drForNode = (defectiveReworkMap == null ? void 0 : defectiveReworkMap.get(`${row.orderId}|${row.nodeId}`)) ||
  { defective: 0, rework: 0, reworkByVariant: {} };

  const completedInMs = ((ms == null ? void 0 : ms.reports) || []).
  filter((r) => (r.variantId || '') === vid).
  reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const defectiveForVariant = ((ms == null ? void 0 : ms.reports) || []).
  filter((r) => (r.variantId || '') === vid).
  reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);

  let seqRemaining;
  if (prevMs) {
    const prevCompleted = (prevMs.reports || []).
    filter((r) => (r.variantId || '') === vid).
    reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    seqRemaining = prevCompleted - completedInMs;
  } else {var _order$items;
    const orderItem = order == null || (_order$items = order.items) == null ? void 0 : _order$items.find((i) => (i.variantId || '') === vid);
    seqRemaining = (Number(orderItem == null ? void 0 : orderItem.quantity) || 0) - completedInMs;
  }
  const base = Math.max(0, seqRemaining - defectiveForVariant);
  const reworkForVariant = drForNode.reworkByVariant && drForNode.reworkByVariant[vid] || 0;
  const dispatched = netOutsourceDispatchedOrderNodeVariant(records, row.orderId, row.nodeId, vid);

  const matrixCtx = resolveDispatchRowMatrixContext(row, ctx);
  if (matrixCtx.aggregate) {
    const variants = matrixCtx.variants || [];
    const sumOther = variants.reduce((s, v) =>
    v.id === variantId ? s : s + (Number(qtyMap[variantQuantityKey(baseKey, v.id)]) || 0),
    0);
    return Math.max(0, row.availableQty - sumOther);
  }
  return Math.max(0, base + reworkForVariant - dispatched);
}

function getAvailableForVariantProduct(row, variantId, qtyMap, ctx) {var _ctx$products;
  const _ctx$records2 =






    ctx.records,records = _ctx$records2 === void 0 ? [] : _ctx$records2,_ctx$orders2 = ctx.orders,orders = _ctx$orders2 === void 0 ? [] : _ctx$orders2,_ctx$productMilestone = ctx.productMilestoneProgresses,productMilestoneProgresses = _ctx$productMilestone === void 0 ? [] : _ctx$productMilestone,processSequenceMode = ctx.processSequenceMode,outOfSequenceTemplateIds = ctx.outOfSequenceTemplateIds,defectiveReworkMap = ctx.defectiveReworkMap;
  const baseKey = dispatchRowKey(row);
  const product = (_ctx$products = ctx.products) == null ? void 0 : _ctx$products.find((p) => p.id === row.productId);
  const blockOrders = orders.filter((o) => o.productId === row.productId);
  const matrixCtx = resolveDispatchRowMatrixContext(row, ctx);

  const getDr = (oid, tid) => (defectiveReworkMap == null ? void 0 : defectiveReworkMap.get(`${oid}|${tid}`)) ||
  { defective: 0, rework: 0, reworkByVariant: {} };

  if (matrixCtx.aggregate) {
    const variants = matrixCtx.variants || [];
    const sumOther = variants.reduce((s, v) =>
    v.id === variantId ? s : s + (Number(qtyMap[variantQuantityKey(baseKey, v.id)]) || 0),
    0);
    return Math.max(0, row.availableQty - sumOther);
  }

  const maxGood = variantMaxGoodProductMode(
    variantId,
    row.nodeId,
    row.productId,
    blockOrders,
    productMilestoneProgresses,
    processSequenceMode,
    (product == null ? void 0 : product.milestoneNodeIds) || [],
    getDr,
    outOfSequenceTemplateIds
  );
  const dispatched = netOutsourceDispatchedProductNodeVariant(records, row.productId, row.nodeId, variantId);
  return Math.max(0, maxGood - dispatched);
}

function buildDispatchVariantMaxMap(row, ctx, qtyMap) {
  const matrixCtx = resolveDispatchRowMatrixContext(row, ctx);
  if (!matrixCtx.hasMatrix) {
    return { '': row.availableQty };
  }
  const map = {};
  (matrixCtx.variants || []).forEach((v) => {
    if (!(v != null && v.id)) return;
    const isProductBlock = ctx.productionLinkMode === 'product' && !row.orderId;
    map[v.id] = isProductBlock ?
    getAvailableForVariantProduct(row, v.id, qtyMap || {}, ctx) :
    getAvailableForVariantOrder(row, v.id, qtyMap || {}, ctx);
  });
  return map;
}

function buildDefaultDispatchQuantities(rows, ctx) {
  const out = {};
  (rows || []).forEach((row) => {
    const matrixCtx = resolveDispatchRowMatrixContext(row, ctx);
    const baseKey = matrixCtx.baseKey;
    if (!matrixCtx.hasMatrix) {
      out[baseKey] = row.availableQty;
      return;
    }
    const variants = matrixCtx.variants || [];
    const isProductBlock = ctx.productionLinkMode === 'product' && !row.orderId;

    if (matrixCtx.aggregate) {
      const n = variants.length;
      const total = row.availableQty;
      const base = Math.floor(total / n);
      const rem = total - base * n;
      variants.forEach((v, i) => {
        out[variantQuantityKey(baseKey, v.id)] = base + (i < rem ? 1 : 0);
      });
      return;
    }

    let remaining = row.availableQty;
    variants.forEach((v) => {
      const cap = isProductBlock ?
      getAvailableForVariantProduct(row, v.id, out, ctx) :
      getAvailableForVariantOrder(row, v.id, out, ctx);
      const take = Math.min(Math.max(0, cap), remaining);
      out[variantQuantityKey(baseKey, v.id)] = take;
      remaining -= take;
    });
  });
  return out;
}

function sumMatrixQuantitiesForRow(baseKey, quantities) {
  return Object.keys(quantities || {}).reduce((s, k) => {
    if (!k.startsWith(`${baseKey}|`)) return s;
    return s + (Number(quantities[k]) || 0);
  }, 0);
}

function computeOutsourceCellMaxAllowed(maxForVariant, variantId, baseKey, quantities, rowAvailable, aggregate) {
  const maxGood = Math.max(0, Number(maxForVariant) || 0);
  if (aggregate) {
    const matrixTotal = sumMatrixQuantitiesForRow(baseKey, quantities);
    const current = Number(quantities[variantQuantityKey(baseKey, variantId)]) || 0;
    return Math.max(0, Math.min(maxGood, rowAvailable - (matrixTotal - current)));
  }
  return maxGood;
}

function buildOutsourceDispatchMatrixLayout(product, dict, quantities, maxByVariant, baseKey) {
  const _require4 = require('./variantQtyMatrix.js'),buildVariantMatrixUiModel = _require4.buildVariantMatrixUiModel;
  const subsetVariantIds = new Set(Object.keys(maxByVariant || {}));
  const subsetVariants = ((product == null ? void 0 : product.variants) || []).filter((v) => (v == null ? void 0 : v.id) && subsetVariantIds.has(v.id));
  if (!subsetVariants.length) return null;

  const subsetProduct = {
    ...product,
    variants: subsetVariants,
    colorIds: product.colorIds,
    sizeIds: product.sizeIds
  };
  const qtyMap = {};
  subsetVariants.forEach((v) => {
    const k = variantQuantityKey(baseKey, v.id);
    if (quantities[k] != null) qtyMap[v.id] = quantities[k];
  });
  const matrix = buildVariantMatrixUiModel(subsetProduct, dict, qtyMap);
  if (!matrix) return null;

  matrix.colorRows = matrix.colorRows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => {var _maxByVariant$cell$va;
      if (!cell.variantId) return cell;
      const maxQty = (_maxByVariant$cell$va = maxByVariant[cell.variantId]) != null ? _maxByVariant$cell$va : 0;
      return {
        ...cell,
        maxQtyLabel: maxQty > 0 ? `最多 ${maxQty}` : ''
      };
    })
  }));
  return matrix;
}

function collectDispatchQuantityEntries(rows, quantities) {
  const entries = [];
  (rows || []).forEach((row) => {
    const baseKey = dispatchRowKey(row);
    const variantKeys = Object.keys(quantities || {}).filter((k) => k.startsWith(`${baseKey}|`));
    if (variantKeys.length) {
      variantKeys.forEach((k) => {
        const qty = Number(quantities[k]) || 0;
        if (qty <= 0) return;
        entries.push({
          row,
          baseKey,
          variantId: k.slice(baseKey.length + 1),
          quantity: qty
        });
      });
      return;
    }
    const qty = Number(quantities[baseKey]) || 0;
    if (qty > 0) {
      entries.push({ row, baseKey, variantId: '', quantity: qty });
    }
  });
  return entries;
}

module.exports = {
  variantQuantityKey,
  buildDefectiveReworkByOrderMilestone,
  productOutsourceDispatchUsesAggregateVariantPool,
  sumOutsourceableByVariantProductMatrix,
  resolveDispatchRowMatrixContext,
  buildDispatchVariantMaxMap,
  buildDefaultDispatchQuantities,
  computeOutsourceCellMaxAllowed,
  buildOutsourceDispatchMatrixLayout,
  collectDispatchQuantityEntries,
  sumMatrixQuantitiesForRow,
  netOutsourceDispatchedOrderNodeVariant,
  netOutsourceDispatchedProductNodeVariant
};