/**
 * 采购入库批次本地合并（对齐 Web useStockSnapshot.listAvailableBatches）
 */

const { PSI_TYPE } = require('../config/purchaseBills.js');
const {
  normalizeBatchNoFromApi,
  mergeWarehouseBatchOptions,
} = require('./materialIssueBatch.js');

function aggregateBatchStockFromRecords(records, productId, warehouseId) {
  const map = new Map();
  (records || []).forEach((r) => {
    if (r.productId !== productId || r.warehouseId !== warehouseId) return;
    const batchNo = normalizeBatchNoFromApi(r.batchNo || r.batch);
    if (!batchNo) return;
    const qty = Number(r.quantity) || 0;
    const type = r.type;
    let delta = 0;
    if (type === 'PURCHASE_BILL' || type === 'STOCK_IN') {
      delta = qty;
    } else if (type === 'SALES_BILL' || type === 'STOCK_OUT' || type === 'STOCK_RETURN') {
      delta = -Math.abs(qty);
    } else if (type === 'TRANSFER') {
      delta = qty;
    } else if (type === 'STOCKTAKE') {
      delta = qty;
    }
    if (delta === 0) return;
    map.set(batchNo, (map.get(batchNo) || 0) + delta);
  });
  return [...map.entries()]
    .map(([batchNo, stock]) => ({ batchNo, stock: Math.max(0, stock) }))
    .filter((o) => o.stock > 0)
    .sort((a, b) => a.batchNo.localeCompare(b.batchNo, 'zh-CN'));
}

function listLocalAvailableBatches(records, productId, warehouseId) {
  return aggregateBatchStockFromRecords(records, productId, warehouseId);
}

function attachMergeBatchesToLine(line, records, warehouseId) {
  if (!line || !line.productId || !line.showBatch) {
    return { ...line, mergeBatches: [] };
  }
  const whId = warehouseId || '';
  if (!whId) return { ...line, mergeBatches: [] };
  return {
    ...line,
    mergeBatches: listLocalAvailableBatches(records, line.productId, whId),
  };
}

module.exports = {
  aggregateBatchStockFromRecords,
  listLocalAvailableBatches,
  attachMergeBatchesToLine,
  mergeWarehouseBatchOptions,
};
