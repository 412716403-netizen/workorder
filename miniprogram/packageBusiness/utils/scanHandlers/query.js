const {
  scanSummaryLine,
  buildSessionLog,
  failScan,
  successHistory,
} = require('../scanCommon.js');

/**
 * @param {object} ctx
 * @param {object} scanRes
 * @param {object} payload
 */
async function handleQueryScan(ctx, scanRes, payload) {
  if (scanRes.kind !== 'ITEM_CODE' && scanRes.kind !== 'VIRTUAL_BATCH') {
    return failScan(ctx, payload.raw, '查询仅支持单品码或批次码');
  }
  if (scanRes.status !== 'ACTIVE') {
    return failScan(ctx, payload.raw, scanRes.message || '码不可用');
  }

  const lines = [
    scanRes.productName || scanRes.sku || '—',
    scanRes.planNumber ? `计划：${scanRes.planNumber}` : '',
    scanRes.serialLabel || scanRes.batchSerialLabel
      ? `编号：${scanRes.serialLabel || scanRes.batchSerialLabel}`
      : '',
    scanRes.variantLabel ? `规格：${scanRes.variantLabel}` : '',
    scanRes.kind === 'VIRTUAL_BATCH' && scanRes.quantity
      ? `批次数量：${scanRes.quantity}`
      : '',
  ].filter(Boolean);

  const summary = scanSummaryLine(scanRes);
  successHistory(ctx, payload, summary);
  return {
    ok: true,
    toast: '查询成功',
    sessionLog: buildSessionLog(payload.raw, 'success', '查询结果', lines),
  };
}

module.exports = { handleQueryScan };
