const { validateScanUsage, createProductionRecord } = require('../scanApi.js');
const {
  scanSummaryLine,
  buildSessionLog,
  resolveScanIds,
  productIdFromScan,
  failScan,
  successHistory,
  rewriteError,
} = require('../scanCommon.js');
const {
  buildReworkReportPaths,
  findReworkPathForScan,
  collectReworkOrderIdsForProduct,
} = require('../reworkReportPathsLite.js');
const { readOperatorDisplayName } = require('../session.js');

/**
 * @param {object} ctx
 * @param {object} scanRes
 * @param {object} payload
 */
async function handleReworkScan(ctx, scanRes, payload) {
  const { reworkNodeId, reworkNodeName } = ctx;

  if (!reworkNodeId) return failScan(ctx, payload.raw, '请先选择返工工序');
  if (scanRes.status !== 'ACTIVE') {
    return failScan(ctx, payload.raw, scanRes.message || '码不可用');
  }

  const productId = productIdFromScan(scanRes);
  if (!productId) return failScan(ctx, payload.raw, '扫码结果缺少产品信息');

  const paths = buildReworkReportPaths(
    ctx.reworkRecords || [],
    reworkNodeId,
    ctx.globalNodes || [],
    undefined,
  );
  const variantId = scanRes.variantId || '';
  const path = findReworkPathForScan(paths, productId, variantId);
  if (!path) {
    return failScan(ctx, payload.raw, '此码对应该工序下无待返工数量');
  }

  const src = path.records[0];
  if (!src) return failScan(ctx, payload.raw, '未找到返工源记录');

  const { itemCodeId, virtualBatchId } = resolveScanIds(scanRes);
  const orderIds = collectReworkOrderIdsForProduct(paths, productId, src.orderId);

  try {
    const validation = await validateScanUsage({
      purpose: 'REWORK_REPORT',
      scope: { orderIds, nodeId: reworkNodeId },
      itemCodeId,
      virtualBatchId,
      addQty: 1,
    });
    if (validation.code !== 'ALLOWED') {
      return failScan(ctx, payload.raw, validation.message || '校验未通过');
    }

    const orderId = src.orderId || orderIds[0];
    const operator = readOperatorDisplayName();
    await createProductionRecord({
      type: 'REWORK_REPORT',
      orderId,
      productId,
      nodeId: reworkNodeId,
      sourceNodeId: src.sourceNodeId || src.nodeId,
      sourceReworkId: src.id,
      quantity: 1,
      variantId: variantId || undefined,
      itemCodeId: itemCodeId || undefined,
      virtualBatchId: virtualBatchId || undefined,
      operator,
      timestamp: new Date().toISOString(),
    });

    const summary = scanSummaryLine(scanRes);
    successHistory(
      ctx,
      payload,
      summary ? `返工报工 +1 · ${summary}` : '返工报工 +1',
    );
    return {
      ok: true,
      toast: '返工报工成功',
      sessionLog: buildSessionLog(payload.raw, 'success', '返工报工成功', [
        orderId ? `工单：${orderId}` : '',
        `工序：${reworkNodeName || reworkNodeId}`,
        summary,
        '数量：+1',
      ]),
      reloadRework: true,
    };
  } catch (err) {
    return failScan(ctx, payload.raw, rewriteError(payload.raw, err, '返工报工失败'));
  }
}

module.exports = { handleReworkScan };
