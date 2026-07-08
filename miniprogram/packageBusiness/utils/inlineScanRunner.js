/**
 * @deprecated 已改为 scanBatchController（先扫累计、确认后再写单）。保留文件仅供 scan-session 参考。
 */
const { createScanBatchController } = require('./scanBatchController.js');

module.exports = {
  createInlineScanRunner: createScanBatchController,
  WAREHOUSE_PREF_KEY: 'scanStockInWarehouseId',
};
