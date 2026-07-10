/**
 * 返工报工批量扫码：确认后累加到表单数量（对齐 Web ReworkReportSubmitModal + scanHandlers/rework）
 */
const { fetchScanByPayload, validateScanUsage } = require('./scanApi.js');
const {
  scanItemResultToRowDetail,
  scanVirtualBatchResultToRowDetail,
} = require('./scanBatchRowDetail.js');
const {
  buildReworkReportPaths,
  findReworkPathForScan,
  collectReworkOrderIdsForProduct,
  reworkQtyKey,
} = require('./reworkReportGroupLite.js');
const { scanFail } = require('./scanFeedback.js');

function productIdFromScan(scanRes) {
  return scanRes.productId || null;
}

function createReworkReportScanBatchHandlers(page) {
  const preparedByToken = new Map();

  function getPaths() {
    return buildReworkReportPaths({
      records: page._records || [],
      currentNodeId: page.data.nodeId,
      isOutsourceRework: page.data.isOutsourceRework,
      outsourcePartner: page.data.outsourcePartner,
      globalNodes: page._nodes || [],
      anchorProductId: page.data.productId || undefined,
      scopeProductId: page.data.productId || undefined,
      scopeOrderId: page._productionLinkMode === 'order' ? (page.data.orderId || undefined) : undefined,
    });
  }

  async function prepareScan(payload) {
    if (!payload.token) return null;
    const cached = preparedByToken.get(payload.token);
    if (cached) return cached;

    try {
      const res = await fetchScanByPayload(payload);
      if (res.status === 'VOIDED') {
        scanFail(page, res.message || '码不可用');
        return null;
      }
      const productId = productIdFromScan(res);
      if (!productId) {
        scanFail(page, '扫码结果缺少产品信息');
        return null;
      }
      const paths = getPaths();
      const variantId = res.variantId || '';
      const path = findReworkPathForScan(paths, productId, variantId);
      if (!path) {
        scanFail(page, '此码对应该工序下无待返工数量');
        return null;
      }

      let addQty = 1;
      let detail;
      let itemCodeId = null;
      let virtualBatchId = null;
      if (payload.kind === 'BATCH') {
        addQty = Number(res.quantity) || 0;
        if (addQty <= 0) {
          scanFail(page, '批次数量无效');
          return null;
        }
        virtualBatchId = res.batchId || null;
        detail = scanVirtualBatchResultToRowDetail(res);
      } else {
        itemCodeId = res.itemCodeId || null;
        virtualBatchId = res.batchId || null;
        detail = scanItemResultToRowDetail(res);
      }

      const src = path.records[0];
      const orderIds = collectReworkOrderIdsForProduct(paths, productId, src && src.orderId);
      const validation = await validateScanUsage({
        purpose: 'REWORK_REPORT',
        scope: { orderIds, nodeId: page.data.nodeId },
        itemCodeId,
        virtualBatchId,
        addQty,
      }).catch(() => ({ code: 'ALLOWED' }));
      if (validation.code === 'DUPLICATE_SAVED') {
        scanFail(page, validation.message || '该码已被使用');
        return null;
      }
      if (validation.code === 'EXCEEDS_MAX') {
        scanFail(page, validation.message || '超过可报上限');
        return null;
      }

      const prepared = {
        productId,
        pathKey: path.pathKey,
        variantId,
        addQty,
        detail,
      };
      preparedByToken.set(payload.token, prepared);
      return prepared;
    } catch (e) {
      scanFail(page, (e && e.message) || '扫码查询失败');
      return null;
    }
  }

  async function resolveRowPreview(payload) {
    const prepared = await prepareScan(payload);
    return prepared ? prepared.detail : null;
  }

  async function onConfirm(payloads) {
    for (let i = 0; i < payloads.length; i += 1) {
      const prepared = await prepareScan(payloads[i]);
      if (!prepared) return false;
      const key = reworkQtyKey(prepared.productId, prepared.pathKey, prepared.variantId);
      const prev = Number(page._quantities[key]) || 0;
      page._quantities[key] = String(prev + prepared.addQty);
    }
    page.rebuildLines();
    page.refreshCanSubmit();
    wx.showToast({ title: '已累加到本次返工报工数量', icon: 'success' });
    preparedByToken.clear();
    return true;
  }

  return {
    resolveRowPreview,
    onConfirm,
  };
}

module.exports = {
  createReworkReportScanBatchHandlers,
};
