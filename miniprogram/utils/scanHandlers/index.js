const { handleReportScan } = require('./report.js');
const { handleQueryScan } = require('./query.js');
const { handleStockInScan } = require('./stockIn.js');
const { handleOutsourceScan } = require('./outsource.js');
const { handleReworkScan } = require('./rework.js');

const HANDLERS = {
  report: handleReportScan,
  query: handleQueryScan,
  stock_in: handleStockInScan,
  outsource: handleOutsourceScan,
  rework: handleReworkScan,
};

/**
 * @param {string} scanType
 * @param {object} ctx
 * @param {object} scanRes
 * @param {object} payload
 */
async function dispatchScanHandler(scanType, ctx, scanRes, payload) {
  const fn = HANDLERS[scanType];
  if (!fn) {
    return { ok: false, message: '未知扫码类型' };
  }
  return fn(ctx, scanRes, payload);
}

module.exports = {
  dispatchScanHandler,
};
