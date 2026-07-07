/**
 * 外协发出色码矩阵（对齐 Web OutsourceDispatchQuantityModal + outsourceDispatchVariantCaps）
 */

const {
  isProcessSequential,
  findGatingPredecessorIndex,
  buildOutOfSequenceTemplateIds,
} = require('./reportVariantMaxQty.js');
const { productHasColorSizeMatrix } = require('./productionPlans.js');
const { dispatchRowKey } = require('./outsourceReceiveKeys.js');

function variantQuantityKey(baseKey, variantId) {
  return variantId ? `${baseKey}|${variantId}` : baseKey;
}

function sumVariantQtyInOrders(orders, variantId) {
  const vid = variantId || '';
  return (orders || []).reduce(
    (s, o) => s + (o.items || [])
      .filter((i) => (i.variantId || '') === vid)
      .reduce((a, i) => a + (Number(i.quantity) || 0), 0),
    0,
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
      reps.forEach((r) => add(r.variantId ?? row.variantId ?? '', Number(r.quantity) || 0));
    } else {
      add(row.variantId ?? '', Number(row.completedQuantity) || 0);
    }
  });
  (blockOrders || []).forEach((o) => {
    const m = (o.milestones || []).find((x) => x.templateId === templateId);
    if (!m) return;
    const reps = m.reports;
    if (reps && reps.length) {
      reps.forEach((r) => add(r.variantId ?? '', Number(r.quantity) || 0));
    } else {
      const total = Number(m.completedQuantity) || 0;
      if (total <= 0) return;
      const totalQty = (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      if (totalQty <= 0) {
        add('', total);
        return;
      }
      let rem = total;
      (o.items || []).forEach((item, idx) => {
        const part = idx === o.items.length - 1
          ? rem
          : Math.floor((total * (Number(item.quantity) || 0)) / totalQty);
        rem -= part;
        add(item.variantId ?? '', part);
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
        0,
      );
      map.set(`${o.id}|${m.templateId}`, { defective, rework: 0, reworkByVariant: {} });
    });
  });

  const reworkReports = (prodRecords || []).filter((r) => r.type === 'REWORK_REPORT');
  if (!reworkReports.length) return map;

  const recordById = new Map((prodRecords || []).map((r) => [r.id, r]));
  const reworkRecords = (prodRecords || []).filter((r) => r.type === 'REWORK');
  const reworkByOrderSource = new Map();
  reworkRecords.forEach((r) => {
    if (!r.orderId) return;
    const src = r.sourceNodeId ?? r.nodeId ?? '';
    const k = `${r.orderId}|${src}`;
    const arr = reworkByOrderSource.get(k) || [];
    arr.push(r);
    reworkByOrderSource.set(k, arr);
  });

  reworkReports.forEach((rr) => {
    const orderId = rr.orderId;
    const nodeId = rr.nodeId;
    if (!orderId || !nodeId) return;
    const key = `${orderId}|${nodeId}`;
    const entry = map.get(key) || { defective: 0, rework: 0, reworkByVariant: {} };
    entry.rework += Number(rr.quantity) || 0;
    const vid = rr.variantId || '';
    entry.reworkByVariant[vid] = (entry.reworkByVariant[vid] || 0) + (Number(rr.quantity) || 0);
    map.set(key, entry);
  });

  return map;
}

function netOutsourceDispatchedProductNodeVariant(records, productId, nodeId, variantId) {
  const vid = variantId || '';
  const rows = (records || []).filter(
    (r) => r.type === 'OUTSOURCE' && !r.orderId && r.productId === productId && r.nodeId === nodeId,
  );
  const sent = rows
    .filter((r) => r.status === '加工中' && (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const recv = rows
    .filter((r) => r.status === '已收回' && (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  return Math.max(0, sent - recv);
}

function netOutsourceDispatchedOrderNodeVariant(records, orderId, nodeId, variantId) {
  const vid = variantId || '';
  const rows = (records || []).filter(
    (r) => r.type === 'OUTSOURCE' && r.orderId === orderId && r.nodeId === nodeId,
  );
  const sent = rows
    .filter((r) => r.status === '加工中' && (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const recv = rows
    .filter((r) => r.status === '已收回' && (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  return Math.max(0, sent - recv);
}

function productOutsourceDispatchUsesAggregateVariantPool(
  blockOrders,
  pmp,
  productId,
  nodeId,
  product,
) {
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
    (ms?.reports || []).forEach((r) => {
      if (r.variantId) variantIdsFromProgress.add(r.variantId);
    });
  });
  const variants = (product && product.variants) || [];
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
    .filter((p) => p.productId === productId && p.milestoneTemplateId === tid && (p.variantId ?? '') === vid)
    .flatMap((p) => p.reports || [])
    .reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);
  if (defectiveV === 0) {
    (blockOrders || []).forEach((o) => {
      const ms = (o.milestones || []).find((m) => m.templateId === tid);
      defectiveV += (ms?.reports || [])
        .filter((r) => (r.variantId || '') === vid)
        .reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);
    });
  }
  let reworkV = 0;
  (blockOrders || []).forEach((o) => {
    const dr = getDefectiveRework(o.id, tid);
    reworkV += (dr.reworkByVariant && dr.reworkByVariant[vid]) || 0;
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
  outOfSequenceTemplateIds,
) {
  const variants = (product && product.variants) || [];
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
      outOfSequenceTemplateIds,
    );
    const dispatched = netOutsourceDispatchedProductNodeVariant(records, product.id, nodeId, vid);
    sum += Math.max(0, maxGood - dispatched);
  });
  return sum;
}

function resolveDispatchRowMatrixContext(row, ctx) {
  const {
    productionLinkMode = 'order',
    orders = [],
    products = [],
    categories = [],
  } = ctx || {};
  const product = products.find((p) => p.id === row.productId);
  const category = categories.find((c) => c.id === product?.categoryId);
  const hasColorSizeMatrix = productHasColorSizeMatrix(product, category);
  const isProductBlock = productionLinkMode === 'product' && !row.orderId;
  const baseKey = dispatchRowKey(row);

  if (!hasColorSizeMatrix || !product?.variants?.length) {
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
        product,
      ),
      product,
      blockOrders: orders.filter((o) => o.productId === row.productId),
    };
  }

  return {
    baseKey,
    hasMatrix: true,
    variants: [...product.variants],
    aggregate: (() => {
      const order = orders.find((o) => o.id === row.orderId);
      const variantIdsInOrderItems = new Set(
        (order?.items || []).map((i) => i.variantId).filter(Boolean),
      );
      const variantIdsFromOrderMilestone = new Set();
      const msRow = order?.milestones?.find((m) => m.templateId === row.nodeId);
      (msRow?.reports || []).forEach((r) => {
        if (r.variantId) variantIdsFromOrderMilestone.add(r.variantId);
      });
      return variantIdsInOrderItems.size === 0 && variantIdsFromOrderMilestone.size === 0;
    })(),
    product,
    order: orders.find((o) => o.id === row.orderId),
  };
}

function getAvailableForVariantOrder(row, variantId, qtyMap, ctx) {
  const { records = [], orders = [], defectiveReworkMap, processSequenceMode, outOfSequenceTemplateIds } = ctx;
  const order = orders.find((o) => o.id === row.orderId);
  const baseKey = dispatchRowKey(row);
  const ms = order?.milestones?.find((m) => m.templateId === row.nodeId);
  const msIdx = order?.milestones?.findIndex((m) => m.templateId === row.nodeId) ?? -1;
  const templateIds = (order?.milestones || []).map((m) => m.templateId);
  const gateIdx = findGatingPredecessorIndex(templateIds, msIdx, outOfSequenceTemplateIds);
  const prevMs = isProcessSequential(processSequenceMode, row.nodeId, outOfSequenceTemplateIds) && gateIdx >= 0
    ? order?.milestones?.[gateIdx]
    : undefined;
  const vid = variantId || '';
  const drForNode = defectiveReworkMap?.get(`${row.orderId}|${row.nodeId}`)
    || { defective: 0, rework: 0, reworkByVariant: {} };

  const completedInMs = (ms?.reports || [])
    .filter((r) => (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const defectiveForVariant = (ms?.reports || [])
    .filter((r) => (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);

  let seqRemaining;
  if (prevMs) {
    const prevCompleted = (prevMs.reports || [])
      .filter((r) => (r.variantId || '') === vid)
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    seqRemaining = prevCompleted - completedInMs;
  } else {
    const orderItem = order?.items?.find((i) => (i.variantId || '') === vid);
    seqRemaining = (Number(orderItem?.quantity) || 0) - completedInMs;
  }
  const base = Math.max(0, seqRemaining - defectiveForVariant);
  const reworkForVariant = (drForNode.reworkByVariant && drForNode.reworkByVariant[vid]) || 0;
  const dispatched = netOutsourceDispatchedOrderNodeVariant(records, row.orderId, row.nodeId, vid);

  const matrixCtx = resolveDispatchRowMatrixContext(row, ctx);
  if (matrixCtx.aggregate) {
    const variants = matrixCtx.variants || [];
    const sumOther = variants.reduce((s, v) => (
      v.id === variantId ? s : s + (Number(qtyMap[variantQuantityKey(baseKey, v.id)]) || 0)
    ), 0);
    return Math.max(0, row.availableQty - sumOther);
  }
  return Math.max(0, base + reworkForVariant - dispatched);
}

function getAvailableForVariantProduct(row, variantId, qtyMap, ctx) {
  const {
    records = [],
    orders = [],
    productMilestoneProgresses = [],
    processSequenceMode,
    outOfSequenceTemplateIds,
    defectiveReworkMap,
  } = ctx;
  const baseKey = dispatchRowKey(row);
  const product = ctx.products?.find((p) => p.id === row.productId);
  const blockOrders = orders.filter((o) => o.productId === row.productId);
  const matrixCtx = resolveDispatchRowMatrixContext(row, ctx);

  const getDr = (oid, tid) => defectiveReworkMap?.get(`${oid}|${tid}`)
    || { defective: 0, rework: 0, reworkByVariant: {} };

  if (matrixCtx.aggregate) {
    const variants = matrixCtx.variants || [];
    const sumOther = variants.reduce((s, v) => (
      v.id === variantId ? s : s + (Number(qtyMap[variantQuantityKey(baseKey, v.id)]) || 0)
    ), 0);
    return Math.max(0, row.availableQty - sumOther);
  }

  const maxGood = variantMaxGoodProductMode(
    variantId,
    row.nodeId,
    row.productId,
    blockOrders,
    productMilestoneProgresses,
    processSequenceMode,
    product?.milestoneNodeIds || [],
    getDr,
    outOfSequenceTemplateIds,
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
    if (!v?.id) return;
    const isProductBlock = ctx.productionLinkMode === 'product' && !row.orderId;
    map[v.id] = isProductBlock
      ? getAvailableForVariantProduct(row, v.id, qtyMap || {}, ctx)
      : getAvailableForVariantOrder(row, v.id, qtyMap || {}, ctx);
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
      const cap = isProductBlock
        ? getAvailableForVariantProduct(row, v.id, out, ctx)
        : getAvailableForVariantOrder(row, v.id, out, ctx);
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
  const { buildVariantMatrixUiModel } = require('./variantQtyMatrix.js');
  const subsetVariantIds = new Set(Object.keys(maxByVariant || {}));
  const subsetVariants = (product?.variants || []).filter((v) => v?.id && subsetVariantIds.has(v.id));
  if (!subsetVariants.length) return null;

  const subsetProduct = {
    ...product,
    variants: subsetVariants,
    colorIds: product.colorIds,
    sizeIds: product.sizeIds,
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
    cells: row.cells.map((cell) => {
      if (!cell.variantId) return cell;
      const maxQty = maxByVariant[cell.variantId] ?? 0;
      return {
        ...cell,
        maxQtyLabel: maxQty > 0 ? `最多 ${maxQty}` : '',
      };
    }),
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
          quantity: qty,
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
  netOutsourceDispatchedProductNodeVariant,
};
