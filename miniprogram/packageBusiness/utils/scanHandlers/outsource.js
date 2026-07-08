const _require = require('../scanApi.js'),validateScanUsage = _require.validateScanUsage,createProductionRecord = _require.createProductionRecord;
const _require2 =







  require('../scanCommon.js'),scanSummaryLine = _require2.scanSummaryLine,buildSessionLog = _require2.buildSessionLog,resolveScanIds = _require2.resolveScanIds,productIdFromScan = _require2.productIdFromScan,failScan = _require2.failScan,successHistory = _require2.successHistory,rewriteError = _require2.rewriteError;
const _require3 = require('../outsourceReceiveAggregates.js'),findReceiveRowByProduct = _require3.findReceiveRowByProduct;
const _require4 = require('../../../utils/session.js'),readOperatorDisplayName = _require4.readOperatorDisplayName;

/**
 * @param {object} ctx
 * @param {object} scanRes
 * @param {object} payload
 */
async function handleOutsourceScan(ctx, scanRes, payload) {
  const partnerName = ctx.partnerName,pendingRows = ctx.pendingRows,allAggregates = ctx.allAggregates;

  if (!partnerName) return failScan(ctx, payload.raw, '请先选择加工厂');
  if (scanRes.status !== 'ACTIVE') {
    return failScan(ctx, payload.raw, scanRes.message || '码不可用');
  }

  const productId = productIdFromScan(scanRes);
  if (!productId) return failScan(ctx, payload.raw, '扫码结果缺少产品信息');

  let row = findReceiveRowByProduct(pendingRows, productId);
  if (!row) {
    const pool = (allAggregates || []).filter((r) => {var _r$partner;return ((_r$partner = r.partner) != null ? _r$partner : '') === partnerName;});
    const agg = pool.filter((r) => r.productId === productId);
    if (agg.length === 0) {
      return failScan(
        ctx,
        payload.raw,
        `此码对应产品未外发给「${partnerName}」`
      );
    }
    return failScan(ctx, payload.raw, `产品在「${partnerName}」已全部收回`);
  }

  if (!row.orderId) {
    return failScan(ctx, payload.raw, '产品级外协收回请使用电脑端操作');
  }

  const _resolveScanIds = resolveScanIds(scanRes),itemCodeId = _resolveScanIds.itemCodeId,virtualBatchId = _resolveScanIds.virtualBatchId;

  try {
    const validation = await validateScanUsage({
      purpose: 'OUTSOURCE_RECEIVE',
      scope: {
        orderId: row.orderId,
        productId: row.productId,
        partner: row.partner
      },
      itemCodeId,
      virtualBatchId,
      addQty: 1
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
      timestamp: new Date().toISOString()
    });

    const summary = scanSummaryLine(scanRes);
    successHistory(
      ctx,
      payload,
      summary ? `外协收货 +1 · ${summary}` : '外协收货 +1'
    );
    return {
      ok: true,
      toast: '收货成功',
      sessionLog: buildSessionLog(payload.raw, 'success', '外协收货成功', [
      `加工厂：${partnerName}`,
      `工单：${row.orderNumber || row.orderId}`,
      `工序：${row.milestoneName || row.nodeId}`,
      summary,
      '数量：+1']
      ),
      reloadOutsource: true
    };
  } catch (err) {
    return failScan(ctx, payload.raw, rewriteError(payload.raw, err, '外协收货失败'));
  }
}

module.exports = { handleOutsourceScan };