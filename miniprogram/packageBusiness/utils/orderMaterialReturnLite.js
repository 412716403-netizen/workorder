/**
 * 生产退料列表（对齐 Web OutsourceMaterialReturnModal + MaterialStatsTable）
 */

const { roundQty, formatQtyDisplay } = require('./orderMaterialLite.js');
const { BATCH_NO_UNTAGGED, buildReturnDispatchedBatchesByProduct } = require('./materialStockConfirm.js');

function computeConsumedByPartnerMat(params) {
  const {
    productionLinkMode,
    orderId,
    productId,
    partnerKey,
    orders,
    products,
    boms,
    outsourceRecords,
  } = params;

  const isProductMode = productionLinkMode === 'product';
  const targetProductId = isProductMode
    ? productId
    : ((orders || []).find((o) => o.id === orderId) || {}).productId;
  const targetProduct = (products || []).find((p) => p.id === targetProductId);
  const receivedByNodeVar = new Map();

  const outsourceFilter = (r) => {
    if (isProductMode) {
      return !r.orderId && r.productId === targetProductId;
    }
    return r.orderId === orderId;
  };

  const accum = (r) => {
    const key = r.variantId ? `${r.nodeId}|${r.variantId}` : r.nodeId;
    receivedByNodeVar.set(key, (receivedByNodeVar.get(key) || 0) + (Number(r.quantity) || 0));
  };

  (outsourceRecords || []).filter((r) => (
    r.type === 'OUTSOURCE'
    && r.status === '已收回'
    && r.partner === partnerKey
    && r.nodeId
    && outsourceFilter(r)
  )).forEach(accum);

  if (isProductMode) {
    const relatedOrderIds = new Set(
      (orders || []).filter((o) => o.productId === targetProductId).map((o) => o.id),
    );
    (outsourceRecords || []).filter((r) => (
      r.type === 'OUTSOURCE'
      && r.status === '已收回'
      && r.partner === partnerKey
      && r.nodeId
      && r.orderId
      && relatedOrderIds.has(r.orderId)
    )).forEach(accum);
  }

  const consumedByMat = new Map();
  const variants = (targetProduct && targetProduct.variants) || [];

  receivedByNodeVar.forEach((recvQty, key) => {
    const sepIdx = key.indexOf('|');
    const nodeId = sepIdx >= 0 ? key.slice(0, sepIdx) : key;
    const variantId = sepIdx >= 0 ? key.slice(sepIdx + 1) : undefined;
    let matchedBoms = [];

    if (variantId) {
      const v = variants.find((vx) => vx.id === variantId);
      if (v && v.nodeBoms) {
        const bomId = v.nodeBoms[nodeId];
        if (bomId) {
          const b = (boms || []).find((bx) => bx.id === bomId);
          if (b) matchedBoms = [b];
        }
      }
      if (!matchedBoms.length) {
        matchedBoms = (boms || []).filter(
          (b) => b.parentProductId === targetProductId && b.nodeId === nodeId && b.variantId === variantId,
        );
      }
    }
    if (!matchedBoms.length) {
      matchedBoms = (boms || []).filter(
        (b) => b.parentProductId === targetProductId && b.nodeId === nodeId && !b.variantId,
      );
    }

    matchedBoms.forEach((bom) => {
      (bom.items || []).forEach((bi) => {
        const pid = bi.productId;
        consumedByMat.set(
          pid,
          (consumedByMat.get(pid) || 0) + Number(bi.quantity) * recvQty,
        );
      });
    });
  });

  return consumedByMat;
}

function filterStockRecordForCard(r, productionLinkMode, orderId, targetProductId) {
  if (productionLinkMode === 'product') {
    return r.sourceProductId === targetProductId
      || (!r.orderId && !r.sourceProductId && r.productId === targetProductId);
  }
  return r.orderId === orderId;
}

function computeOutsourceReturnMaterials(params) {
  const {
    productionLinkMode,
    orderId,
    productId,
    partnerKey,
    orders,
    products,
    boms,
    stockRecords,
    outsourceRecords,
  } = params;

  if (!String(partnerKey || '').trim()) return [];

  const isProductMode = productionLinkMode === 'product';
  const targetProductId = isProductMode
    ? productId
    : ((orders || []).find((o) => o.id === orderId) || {}).productId;

  const dispatchedByMat = new Map();
  const returnedByMat = new Map();
  const matInfoMap = new Map();

  const cardFilter = (r) => filterStockRecordForCard(
    r,
    productionLinkMode,
    orderId,
    targetProductId,
  );

  const accumDispatch = (r) => {
    if (r.reason === '来自于返工') return;
    const key = r.productId;
    if (!key) return;
    dispatchedByMat.set(key, (dispatchedByMat.get(key) || 0) + (Number(r.quantity) || 0));
    if (!matInfoMap.has(key)) {
      const mp = (products || []).find((p) => p.id === key);
      matInfoMap.set(key, { name: (mp && mp.name) || '未知物料', sku: (mp && mp.sku) || '' });
    }
  };

  (stockRecords || []).filter((r) => (
    r.type === 'STOCK_OUT'
    && r.partner === partnerKey
    && cardFilter(r)
  )).forEach(accumDispatch);

  if (isProductMode) {
    const relatedOrderIds = new Set(
      (orders || []).filter((o) => o.productId === targetProductId).map((o) => o.id),
    );
    (stockRecords || []).filter((r) => (
      r.type === 'STOCK_OUT'
      && r.partner === partnerKey
      && r.orderId
      && relatedOrderIds.has(r.orderId)
    )).forEach(accumDispatch);
  }

  (stockRecords || []).filter((r) => (
    r.type === 'STOCK_RETURN'
    && r.partner === partnerKey
    && cardFilter(r)
  )).forEach((r) => {
    returnedByMat.set(r.productId, (returnedByMat.get(r.productId) || 0) + (Number(r.quantity) || 0));
  });

  if (isProductMode) {
    const relatedOrderIds = new Set(
      (orders || []).filter((o) => o.productId === targetProductId).map((o) => o.id),
    );
    (stockRecords || []).filter((r) => (
      r.type === 'STOCK_RETURN'
      && r.partner === partnerKey
      && r.orderId
      && relatedOrderIds.has(r.orderId)
    )).forEach((r) => {
      returnedByMat.set(r.productId, (returnedByMat.get(r.productId) || 0) + (Number(r.quantity) || 0));
    });
  }

  const consumedByMat = computeConsumedByPartnerMat({
    productionLinkMode,
    orderId,
    productId,
    partnerKey,
    orders,
    products,
    boms,
    outsourceRecords,
  });

  return Array.from(dispatchedByMat.entries()).map(([pid, dispatchedRaw]) => {
    const dispatched = roundQty(dispatchedRaw);
    const consumed = roundQty(consumedByMat.get(pid) || 0);
    const returned = roundQty(returnedByMat.get(pid) || 0);
    const returnable = Math.max(0, roundQty(dispatched - consumed - returned));
    const info = matInfoMap.get(pid) || { name: '未知物料', sku: '' };
    return {
      productId: pid,
      name: info.name,
      sku: info.sku,
      dispatched,
      consumed,
      returned,
      returnable,
    };
  }).filter((m) => m.dispatched > 0);
}

function buildOutsourceReturnUiRows(materials) {
  return (materials || []).map((m) => ({
    materialProductId: m.productId,
    name: m.name,
    sku: m.sku || '',
    showSku: Boolean(m.sku),
    dispatchedText: formatQtyDisplay(m.dispatched),
    consumedText: formatQtyDisplay(m.consumed),
    returnedText: formatQtyDisplay(m.returned),
    returnableText: formatQtyDisplay(m.returnable),
    returnable: m.returnable,
    maxReturnQty: m.returnable,
    issueQty: '',
  }));
}

function buildInternalReturnUiRows(materialRows, selectedProductIds) {
  const idSet = selectedProductIds
    ? new Set(Array.isArray(selectedProductIds) ? selectedProductIds : [...selectedProductIds])
    : null;

  return (materialRows || [])
    .filter((m) => !idSet || idSet.has(m.productId))
    .filter((m) => (Number(m.surplus) || 0) > 0 || (Number(m.issue) || 0) > 0)
    .map((m) => {
      const surplus = roundQty(Number(m.surplus) || 0);
      return {
        materialProductId: m.productId,
        name: m.name || m.productId,
        sku: m.sku || '',
        showSku: Boolean(m.sku),
        issueText: m.issueText != null ? m.issueText : formatQtyDisplay(m.issue),
        returnText: m.returnText != null ? m.returnText : formatQtyDisplay(m.returnQty),
        netText: m.netText != null ? m.netText : formatQtyDisplay(m.net),
        reportCostText: m.reportCostText != null ? m.reportCostText : formatQtyDisplay(m.reportCost),
        surplusText: m.surplusText != null ? m.surplusText : formatQtyDisplay(surplus),
        maxReturnQty: surplus,
        issueQty: '',
      };
    })
    .filter((m) => m.maxReturnQty > 0);
}

function pickPreferredReturnWarehouse(params) {
  const {
    stockRecords,
    productionLinkMode,
    orderId,
    productId,
    partnerKey,
    orders,
    warehouses,
  } = params;

  const isProductMode = productionLinkMode === 'product';
  const targetProductId = isProductMode
    ? productId
    : ((orders || []).find((o) => o.id === orderId) || {}).productId;

  const tally = new Map();
  const cardFilter = (r) => filterStockRecordForCard(
    r,
    productionLinkMode,
    orderId,
    targetProductId,
  );

  (stockRecords || []).filter((r) => (
    r.type === 'STOCK_OUT'
    && r.partner === partnerKey
    && cardFilter(r)
    && r.warehouseId
  )).forEach((r) => {
    tally.set(r.warehouseId, (tally.get(r.warehouseId) || 0) + 1);
  });

  if (isProductMode) {
    const relatedOrderIds = new Set(
      (orders || []).filter((o) => o.productId === targetProductId).map((o) => o.id),
    );
    (stockRecords || []).filter((r) => (
      r.type === 'STOCK_OUT'
      && r.partner === partnerKey
      && r.orderId
      && relatedOrderIds.has(r.orderId)
      && r.warehouseId
    )).forEach((r) => {
      tally.set(r.warehouseId, (tally.get(r.warehouseId) || 0) + 1);
    });
  }

  const validIds = new Set((warehouses || []).map((w) => w.id));
  let bestId = '';
  let bestCount = -1;
  tally.forEach((count, id) => {
    if (validIds.has(id) && count > bestCount) {
      bestId = id;
      bestCount = count;
    }
  });
  if (bestId) {
    const idx = (warehouses || []).findIndex((w) => w.id === bestId);
    return idx >= 0 ? idx : 0;
  }
  return 0;
}

function validateReturnRows(rows, opts) {
  const { isOutsource } = opts || {};
  const errors = [];
  (rows || []).forEach((row) => {
    const qty = Number(row.issueQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const max = isOutsource ? row.returnable : row.maxReturnQty;
    if (max !== undefined && qty > max + 1e-9) {
      errors.push(`「${row.name}」退回数量不能超过可退 ${formatQtyDisplay(max)}`);
    }
  });
  return errors;
}

function buildReturnDispatchedBatchesMap(params) {
  return buildReturnDispatchedBatchesByProduct(params);
}

module.exports = {
  BATCH_NO_UNTAGGED,
  computeOutsourceReturnMaterials,
  buildOutsourceReturnUiRows,
  buildInternalReturnUiRows,
  pickPreferredReturnWarehouse,
  validateReturnRows,
  buildReturnDispatchedBatchesMap,
};
