const {
  validateScanUsage,
  createMilestoneReport,
} = require('../../../utils/scanApi.js');
const {
  scanSummaryLine,
  buildSessionLog,
  resolveScanIds,
  failScan,
  successHistory,
  rewriteError,
} = require('../scanCommon.js');
const { resolveReportTarget } = require('../resolveReportTarget.js');
const { readOperatorDisplayName } = require('../../../utils/session.js');

/**
 * @param {object} ctx
 * @param {object} scanRes
 * @param {object} payload
 */
async function handleReportScan(ctx, scanRes, payload) {
  const { nodeId, nodeName } = ctx;

  if (!nodeId) return failScan(ctx, payload.raw, '请先选择工序');
  if (scanRes.status !== 'ACTIVE') {
    return failScan(ctx, payload.raw, scanRes.message || '码不可用');
  }

  const orders = ctx.orders || [];
  const resolved = resolveReportTarget(scanRes, nodeId, orders);
  if (!resolved) {
    return failScan(ctx, payload.raw, '无法根据此码匹配到工单与工序节点');
  }
  if (resolved.error === 'MULTIPLE_ORDERS') {
    return failScan(ctx, payload.raw, '匹配到多个工单，请在电脑端报工');
  }

  const { orderId, milestoneId, orderLabel, milestoneName } = resolved;
  const { itemCodeId, virtualBatchId } = resolveScanIds(scanRes);

  try {
    const validation = await validateScanUsage({
      purpose: 'MILESTONE_REPORT',
      scope: { milestoneId },
      itemCodeId,
      virtualBatchId,
      addQty: 1,
    });
    if (validation.code !== 'ALLOWED') {
      return failScan(ctx, payload.raw, validation.message || '校验未通过');
    }

    await createMilestoneReport(orderId, milestoneId, {
      quantity: 1,
      itemCodeId,
      virtualBatchId,
      variantId: scanRes.variantId || undefined,
      operator: readOperatorDisplayName(),
    });

    const summary = scanSummaryLine(scanRes);
    successHistory(ctx, payload, summary ? `已报工 +1 · ${summary}` : '已报工 +1');
    return {
      ok: true,
      toast: '报工成功',
      sessionLog: buildSessionLog(payload.raw, 'success', '报工成功', [
        `工单：${orderLabel}`,
        `工序：${milestoneName || nodeName}`,
        summary,
        '数量：+1',
      ]),
    };
  } catch (err) {
    return failScan(ctx, payload.raw, rewriteError(payload.raw, err, '报工失败'));
  }
}

module.exports = { handleReportScan };
