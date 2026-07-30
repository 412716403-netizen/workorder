/**
 * 库存快照客户端索引（对齐 hooks/useStockSnapshot.ts）
 * 主包共享：packageBusiness / packagePsi 均可 require，避免跨分包互引。
 */

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildStockSnapshotIndex(data) {
  const whMap = new Map();
  const varMap = new Map();
  const batchMap = new Map();

  asArray(data && data.byWarehouse).forEach((b) => {
    if (!b || !b.productId || !b.warehouseId) return;
    whMap.set(`${b.productId}::${b.warehouseId}`, b);
  });
  asArray(data && data.byVariant).forEach((b) => {
    if (!b || !b.productId || !b.warehouseId) return;
    const variantId = b.variantId != null ? b.variantId : '';
    varMap.set(`${b.productId}::${b.warehouseId}::${variantId}`, b);
  });
  asArray(data && data.byBatch).forEach((b) => {
    if (!b || !b.productId || !b.warehouseId) return;
    const batchNo = b.batchNo != null ? b.batchNo : '';
    batchMap.set(`${b.productId}::${b.warehouseId}::${batchNo}`, b);
  });

  function netFromBucket(b) {
    if (!b) return 0;
    return num(b.psiIn) + num(b.transferIn) + num(b.prodIn)
      - num(b.psiOut) - num(b.transferOut) - num(b.prodOut);
  }

  function getStock(pId, whId) {
    if (!whId) return 0;
    const b = whMap.get(`${pId}::${whId}`);
    if (!b) return 0;
    return netFromBucket(b) + (b.stocktakeAdj || 0);
  }

  function getStockVariant(pId, whId, variantId) {
    if (!whId) return 0;
    const vb = varMap.get(`${pId}::${whId}::${variantId}`);
    return netFromBucket(vb);
  }

  function getVariantDisplayQty(pId, whId, variantId) {
    const vb = varMap.get(`${pId}::${whId}::${variantId}`);
    if (!vb) return 0;
    if (typeof vb.displayQty === 'number') return vb.displayQty;
    return netFromBucket(vb);
  }

  function getNullVariantProdStock(pId, whId) {
    if (!whId) return 0;
    const vb = varMap.get(`${pId}::${whId}::`);
    if (!vb) return 0;
    return Math.max(0, num(vb.prodIn) - num(vb.prodOut));
  }

  function getBatchStock(pId, whId, batchNo) {
    if (!whId || !batchNo) return 0;
    const b = batchMap.get(`${pId}::${whId}::${batchNo}`);
    if (!b) return 0;
    return Math.max(0, netFromBucket(b) + (b.stocktakeAdj || 0));
  }

  function listAvailableBatches(pId, whId) {
    if (!whId) return [];
    const rows = [];
    batchMap.forEach((b) => {
      if (b.productId !== pId || b.warehouseId !== whId) return;
      const batchNo = b.batchNo != null && b.batchNo !== '' ? b.batchNo : '';
      if (!batchNo) return;
      const stock = Math.max(0, netFromBucket(b) + (b.stocktakeAdj || 0));
      if (stock > 0) rows.push({ batchNo, stock });
    });
    rows.sort((a, b) => a.batchNo.localeCompare(b.batchNo, 'zh-CN'));
    return rows;
  }

  return {
    whMap,
    varMap,
    batchMap,
    getStock,
    getStockVariant,
    getVariantDisplayQty,
    getNullVariantProdStock,
    getBatchStock,
    listAvailableBatches,
  };
}

function formatStockQty(q) {
  const n = Number(q);
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}

module.exports = {
  buildStockSnapshotIndex,
  formatStockQty,
};
