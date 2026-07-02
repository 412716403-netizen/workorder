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
const { findReceiveRowByProduct } = require('../outsourceReceiveAggregates.js');
const { readOperatorDisplayName } = require('../session.js');

/**
 * @param {object} ctx
 * @param {object} scanRes
 * @param {object} payload
 */
async function handleOutsourceScan(ctx, scanRes, payload) {
  const { partnerName, pendingRows, allAggregates } = ctx;

  if (!partnerName) return failScan(ctx, payload.raw, '请先选择加工厂');
  if (scanRes.status !== 'ACTIVE') {
    return failScan(ctx, payload.raw, scanRes.message || '码不可用');
  }

  const productId = productIdFromScan(scanRes);
  if (!productId) return failScan(ctx, payload.raw, '扫码结果缺少产品信息');

  let row = findReceiveRowByProduct(pendingRows, productId);
  if (!row) {
    const pool = (allAggregates || []).filter((r) => (r.partner ?? '') === partnerName);
    const agg = pool.filter((r) => r.productId === productId);
    if (agg.length === 0) {
      return failScan(
        ctx,
        payload.raw,
        `此码对应产品未外发给「${partnerName}」`,
      );
    }
    return failScan(ctx, payload.raw, `产品在「${partnerName}」已全部收回`);
  }

  if (!row.orderId) {
    return failScan(ctx, payload.raw, '产品级外协收回请使用电脑端操作');
  }

  const { itemCodeId, virtualBatchId } = resolveScanIds(scanRes);

  try {
    const validation = await validateScanUsage({
      purpose: 'OUTSOURCE_RECEIVE',
      scope: {
        orderId: row.orderId,
        productId: row.productId,
        partner: row.partner,
      },
      itemCodeId,
      virtualBatchId,
      addQty: 1,
    });
    if (validation.code !== 'ALLOWED') {
      return failScan(ctx, payload.raw, validation.message || '校验未通过');
    }

    const operator = readOperatorDisplayName();
    await createProductionRecord({
      type: 'OUTSOURCE',
      status: '已收回',
      orderId: row.orderId,
      productId: row.productId,
      nodeId: row.nodeId,
      partner: row.partner,
      quantity: 1,
      variantId: scanRes.variantId || undefined,
      itemCodeId: itemCodeId || undefined,
      virtualBatchId: virtualBatchId || undefined,
      operator,
      timestamp: new Date().toISOString(),
    });

    const summary = scanSummaryLine(scanRes);
    successHistory(
      ctx,
      payload,
      summary ? `外协收货 +1 · ${summary}` : '外协收货 +1',
    );
    return {
      ok: true,
      toast: '收货成功',
      sessionLog: buildSessionLog(payload.raw, 'success', '外协收货成功', [
        `加工厂：${partnerName}`,
        `工单：${row.orderNumber || row.orderId}`,
        `工序：${row.milestoneName || row.nodeId}`,
        summary,
        '数量：+1',
      ]),
      reloadOutsource: true,
    };
  } catch (err) {
    return failScan(ctx, payload.raw, rewriteError(payload.raw, err, '外协收货失败'));
  }
}

module.exports = { handleOutsourceScan };
