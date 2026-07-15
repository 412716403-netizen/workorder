/**
 * 外协收回色码矩阵（对齐 Web OutsourceReceiveQuantityModal）
 */

const _require = require('../../utils/productionPlans.js'),productHasColorSizeMatrix = _require.productHasColorSizeMatrix;
const _require2 =



  require('./outsourceReceiveKeys.js'),RECEIVE_VARIANT_SEP = _require2.RECEIVE_VARIANT_SEP,outsourceReceiveBaseKey = _require2.outsourceReceiveBaseKey,resolveOutsourceReceiveEntry = _require2.resolveOutsourceReceiveEntry;

function receiveVariantQuantityKey(baseKey, variantId, isProductScope) {
  if (!variantId) return baseKey;
  return isProductScope ?
  `${baseKey}${RECEIVE_VARIANT_SEP}${variantId}` :
  `${baseKey}|${variantId}`;
}

function filterOutsourceRecordsForRow(row, records, status) {var _row$partner;
  const partner = (_row$partner = row.partner) != null ? _row$partner : '';
  return (records || []).filter((r) => {var _r$partner2;
    if (r.type !== 'OUTSOURCE' || r.sourceReworkId) return false;
    if (r.status !== status) return false;
    if (row.orderId == null) {var _r$partner;
      return !r.orderId &&
      r.productId === row.productId &&
      r.nodeId === row.nodeId &&
      ((_r$partner = r.partner) != null ? _r$partner : '') === partner;
    }
    return r.orderId === row.orderId &&
    r.nodeId === row.nodeId &&
    ((_r$partner2 = r.partner) != null ? _r$partner2 : '') === partner;
  });
}

function sumQtyByVariant(records, variantId) {
  const vid = variantId || '';
  return (records || []).
  filter((r) => (r.variantId || '') === vid).
  reduce((s, r) => s + (Number(r.quantity) || 0), 0);
}

function sumOtherVariantQty(baseKey, variantId, quantities, isProductScope) {
  let sum = 0;
  Object.keys(quantities || {}).forEach((k) => {
    if (isProductScope) {
      if (!k.startsWith(`${baseKey}${RECEIVE_VARIANT_SEP}`)) return;
      const vid = k.slice(baseKey.length + RECEIVE_VARIANT_SEP.length);
      if (vid === variantId) return;
    } else {
      if (!k.startsWith(`${baseKey}|`)) return;
      const vid = k.slice(baseKey.length + 1);
      if (vid === variantId) return;
    }
    sum += Number(quantities[k]) || 0;
  });
  return sum;
}

function resolveReceiveRowMatrixContext(row, ctx) {
  const baseKey = outsourceReceiveBaseKey(row);
  const isProductScope = row.orderId == null;
  const products = ctx.products || [];
  const categories = ctx.categories || [];
  const orders = ctx.orders || [];
  const records = ctx.records || [];
  const productMilestoneProgresses = ctx.productMilestoneProgresses || [];

  const product = products.find((p) => p.id === row.productId);
  const category = categories.find((c) => c.id === (product == null ? void 0 : product.categoryId));
  const hasColorSizeMatrix = productHasColorSizeMatrix(product, category);

  if (row.orderId != null) {
    const order = orders.find((o) => o.id === row.orderId);
    const hasColorSizeOrderRecv = hasColorSizeMatrix;
    const variantIdsInOrderItems = new Set(
      ((order == null ? void 0 : order.items) || []).map((i) => i.variantId).filter(Boolean)
    );
    const variantIdsFromOrderMilestone = new Set();
    const ms = ((order == null ? void 0 : order.milestones) || []).find((m) => m.templateId === row.nodeId);
    ((ms == null ? void 0 : ms.reports) || []).forEach((r) => {
      if (r.variantId) variantIdsFromOrderMilestone.add(r.variantId);
    });
    const variantIdsForOrderRecv = new Set([
    ...variantIdsInOrderItems,
    ...variantIdsFromOrderMilestone]
    );
    const orderRecvHasSpecBreakdown = variantIdsForOrderRecv.size > 0;
    const variantsInOrder = hasColorSizeOrderRecv && product != null && product.variants ?
    [...product.variants] :
    [];
    const aggregate = hasColorSizeOrderRecv &&
    variantsInOrder.length > 0 &&
    !orderRecvHasSpecBreakdown;

    const dispatchRecords = filterOutsourceRecordsForRow(row, records, '加工中');
    const receiveRecords = filterOutsourceRecordsForRow(row, records, '已收回');
    const hasVariantDispatch = dispatchRecords.some((r) => !!r.variantId);

    if (!variantsInOrder.length || !hasVariantDispatch && !aggregate) {
      return {
        baseKey,
        isProductScope: false,
        hasMatrix: false,
        variants: [],
        aggregate: false
      };
    }

    return {
      baseKey,
      isProductScope: false,
      hasMatrix: true,
      variants: variantsInOrder,
      aggregate,
      dispatchRecords,
      receiveRecords,
      product
    };
  }

  const blockOrders = orders.filter((o) => o.productId === row.productId);
  const variantIdsInBlock = new Set();
  blockOrders.forEach((o) => {
    (o.items || []).forEach((i) => {var _i$quantity;
      if (((_i$quantity = i.quantity) != null ? _i$quantity : 0) > 0 && i.variantId) variantIdsInBlock.add(i.variantId);
    });
  });
  const variantIdsFromProgress = new Set();
  if (hasColorSizeMatrix) {
    productMilestoneProgresses.forEach((pmp) => {
      if (pmp.productId !== row.productId || pmp.milestoneTemplateId !== row.nodeId) return;
      if (pmp.variantId) variantIdsFromProgress.add(pmp.variantId);
      (pmp.reports || []).forEach((r) => {
        if (r.variantId) variantIdsFromProgress.add(r.variantId);
      });
    });
    blockOrders.forEach((o) => {
      const ms = (o.milestones || []).find((m) => m.templateId === row.nodeId);
      ((ms == null ? void 0 : ms.reports) || []).forEach((r) => {
        if (r.variantId) variantIdsFromProgress.add(r.variantId);
      });
    });
  }
  const variantIdsForProduct = new Set([...variantIdsInBlock, ...variantIdsFromProgress]);
  const variantsInProduct = hasColorSizeMatrix && product != null && product.variants ?
  [...product.variants] :
  [];
  const aggregate = variantsInProduct.length > 0 && variantIdsForProduct.size === 0;

  const dispatchRecords = filterOutsourceRecordsForRow(row, records, '加工中');
  const receiveRecords = filterOutsourceRecordsForRow(row, records, '已收回');
  const hasVariantProductDispatches = dispatchRecords.some((r) => !!r.variantId);

  if (!variantsInProduct.length || !hasVariantProductDispatches && !aggregate) {
    return {
      baseKey,
      isProductScope: true,
      hasMatrix: false,
      variants: [],
      aggregate: false
    };
  }

  return {
    baseKey,
    isProductScope: true,
    hasMatrix: true,
    variants: variantsInProduct,
    aggregate,
    dispatchRecords,
    receiveRecords,
    product
  };
}

function getPendingForVariant(matrixCtx, variantId, quantities) {
  const
    baseKey =





    matrixCtx.baseKey,isProductScope = matrixCtx.isProductScope,aggregate = matrixCtx.aggregate,dispatchRecords = matrixCtx.dispatchRecords,receiveRecords = matrixCtx.receiveRecords,row = matrixCtx.row;

  if (aggregate) {
    const other = sumOtherVariantQty(baseKey, variantId, quantities, isProductScope);
    return Math.max(0, (Number(row.pending) || 0) - other);
  }
  const dispatched = sumQtyByVariant(dispatchRecords, variantId);
  const received = sumQtyByVariant(receiveRecords, variantId);
  return Math.max(0, dispatched - received);
}

function buildReceiveVariantMaxMap(row, ctx, quantities) {
  const matrixCtx = resolveReceiveRowMatrixContext(row, ctx);
  if (!matrixCtx.hasMatrix) return {};
  const map = {};
  (matrixCtx.variants || []).forEach((v) => {
    if (!(v != null && v.id)) return;
    map[v.id] = getPendingForVariant({ ...matrixCtx, row }, v.id, quantities);
  });
  return map;
}

function sumMatrixQuantitiesForRow(baseKey, quantities, isProductScope) {
  return Object.keys(quantities || {}).reduce((s, k) => {
    if (isProductScope) {
      if (!k.startsWith(`${baseKey}${RECEIVE_VARIANT_SEP}`)) return s;
    } else if (!k.startsWith(`${baseKey}|`)) {
      return s;
    }
    return s + (Number(quantities[k]) || 0);
  }, 0);
}

function computeReceiveCellMaxAllowed(maxForVariant, variantId, baseKey, quantities, rowPending, aggregate, isProductScope) {
  const maxGood = Math.max(0, Number(maxForVariant) || 0);
  if (aggregate) {
    const matrixTotal = sumMatrixQuantitiesForRow(baseKey, quantities, isProductScope);
    const key = receiveVariantQuantityKey(baseKey, variantId, isProductScope);
    const current = Number(quantities[key]) || 0;
    return Math.max(0, Math.min(maxGood, rowPending - (matrixTotal - current)));
  }
  return maxGood;
}

function buildOutsourceReceiveMatrixLayout(product, dict, quantities, maxByVariant, baseKey, isProductScope) {
  const _require3 = require('../../utils/variantQtyMatrix.js'),buildVariantMatrixUiModel = _require3.buildVariantMatrixUiModel;
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
    const k = receiveVariantQuantityKey(baseKey, v.id, isProductScope);
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

function collectReceiveQuantityEntries(rows, quantities) {
  const entries = [];
  (rows || []).forEach((row) => {
    const baseKey = outsourceReceiveBaseKey(row);
    const isProductScope = row.orderId == null;
    const variantKeys = Object.keys(quantities || {}).filter((k) => {
      if (isProductScope) return k.startsWith(`${baseKey}${RECEIVE_VARIANT_SEP}`);
      return k.startsWith(`${baseKey}|`);
    });
    if (variantKeys.length) {
      variantKeys.forEach((k) => {
        const qty = Number(quantities[k]) || 0;
        if (qty <= 0) return;
        const variantId = isProductScope ?
        k.slice(baseKey.length + RECEIVE_VARIANT_SEP.length) :
        k.slice(baseKey.length + 1);
        entries.push({ row, baseKey, variantId, quantity: qty });
      });
      return;
    }
    const qty = Number(quantities[baseKey]) || 0;
    if (qty > 0) entries.push({ row, baseKey, variantId: undefined, quantity: qty });
  });
  return entries;
}

function validateReceiveQuantities(rows, quantities, records, allowExceed, matrixCtxInput) {
  const entries = collectReceiveQuantityEntries(rows, quantities);
  if (!entries.length) return '请填写收回数量';

  const ctx = {
    ...(matrixCtxInput || {}),
    records: records || (matrixCtxInput == null ? void 0 : matrixCtxInput.records) || []
  };

  for (const entry of entries) {
    const row = entry.row,variantId = entry.variantId,quantity = entry.quantity;
    if (allowExceed) continue;

    if (variantId) {
      const matrixCtx = resolveReceiveRowMatrixContext(row, ctx);
      matrixCtx.dispatchRecords = filterOutsourceRecordsForRow(row, records, '加工中');
      matrixCtx.receiveRecords = filterOutsourceRecordsForRow(row, records, '已收回');
      matrixCtx.row = row;
      const maxQ = getPendingForVariant(matrixCtx, variantId, quantities);
      if (quantity > maxQ) {
        return `本次收回数量不能大于该规格待收数量（最多${maxQ}）`;
      }
      continue;
    }

    const isProductScope = row.orderId == null;
    if (isProductScope) {
      const dispatchRecords = filterOutsourceRecordsForRow(row, records, '加工中');
      const hasVariantDispatch = dispatchRecords.some((r) => !!r.variantId);
      const dispNoVar = dispatchRecords.filter((r) => !r.variantId).reduce((s, r) => s + r.quantity, 0);
      const recNoVar = filterOutsourceRecordsForRow(row, records, '已收回').
      filter((r) => !r.variantId).
      reduce((s, r) => s + r.quantity, 0);
      const pendingNoVar = Math.max(0, dispNoVar - recNoVar);
      const maxAgg = hasVariantDispatch ? pendingNoVar : row.pending;
      if (quantity > maxAgg) {
        return `本次收回数量不能大于待收数量（最多${maxAgg}）`;
      }
      continue;
    }

    const err = require('./outsourceConfirm.js').validateReceiveQty(quantity, row.pending, allowExceed);
    if (err) return err;
  }
  return '';
}

module.exports = {
  receiveVariantQuantityKey,
  resolveReceiveRowMatrixContext,
  buildReceiveVariantMaxMap,
  computeReceiveCellMaxAllowed,
  buildOutsourceReceiveMatrixLayout,
  collectReceiveQuantityEntries,
  validateReceiveQuantities,
  resolveOutsourceReceiveEntry
};