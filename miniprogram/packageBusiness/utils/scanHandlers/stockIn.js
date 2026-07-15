const { validateScanUsage, createProductionRecord } = require('../../../utils/scanApi.js');
const {
  scanSummaryLine,
  buildSessionLog,
  resolveScanIds,
  failScan,
  successHistory,
  rewriteError,
} = require('../scanCommon.js');
const { resolveStockInOrder } = require('../resolveStockInOrder.js');
const { readOperatorDisplayName } = require('../../../utils/session.js');

const WAREHOUSE_PREF_KEY = 'scanStockInWarehouseId';

/**
 * @param {object} ctx
 * @param {object} scanRes
 * @param {object} payload
 */
async function handleStockInScan(ctx, scanRes, payload) {
  if (scanRes.status !== 'ACTIVE') {
    return failScan(ctx, payload.raw, scanRes.message || '码不可用');
  }

  const orders = ctx.orders || [];
  const matched = resolveStockInOrder(scanRes, orders);
  if (!matched) {
    return failScan(ctx, payload.raw, '无法根据此码匹配到待入库工单');
  }
  if (matched.error === 'MULTIPLE_ORDERS') {
    return failScan(ctx, payload.raw, '匹配到多个工单，请在电脑端入库');
  }

  const orderId = matched.id;
  const orderLabel = matched.orderNumber || matched.productName || orderId;
  const productId = matched.productId;

  let warehouseId = ctx.warehouseId;
  let warehouseName = ctx.warehouseName;
  if (!warehouseId && ctx.defaultWarehouseId) {
    warehouseId = ctx.defaultWarehouseId;
    warehouseName = ctx.defaultWarehouseName || '';
  }
  if (!warehouseId) {
    return failScan(ctx, payload.raw, '未配置默认仓库，请在设置中维护仓库');
  }

  const { itemCodeId, virtualBatchId } = resolveScanIds(scanRes);

  try {
    const validation = await validateScanUsage({
      purpose: 'STOCK_IN',
      scope: { orderId },
      itemCodeId,
      virtualBatchId,
      addQty: 1,
    });
    if (validation.code !== 'ALLOWED') {
      return failScan(ctx, payload.raw, validation.message || '校验未通过');
    }

    const operator = readOperatorDisplayName();
    await createProductionRecord({
      type: 'STOCK_IN',
      orderId,
      productId: productId || scanRes.productId || undefined,
      quantity: 1,
      warehouseId,
      variantId: scanRes.variantId || undefined,
      itemCodeId: itemCodeId || undefined,
      virtualBatchId: virtualBatchId || undefined,
      operator,
      timestamp: new Date().toISOString(),
    });

    if (warehouseId) wx.setStorageSync(WAREHOUSE_PREF_KEY, warehouseId);

    const summary = scanSummaryLine(scanRes);
    successHistory(ctx, payload, summary ? `已入库 +1 · ${summary}` : '已入库 +1');
    return {
      ok: true,
      toast: '入库成功',
      sessionLog: buildSessionLog(payload.raw, 'success', '入库成功', [
        `工单：${orderLabel}`,
        warehouseName ? `仓库：${warehouseName}` : '',
        summary,
        '数量：+1',
      ]),
    };
  } catch (err) {
    return failScan(ctx, payload.raw, rewriteError(payload.raw, err, '入库失败'));
  }
}

module.exports = { handleStockInScan };
