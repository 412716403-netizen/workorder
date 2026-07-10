/**
 * 外协待收回批量扫码：确认后跳转收货录入并预填数量（对齐 Web OutsourceReceiveListModal.handleScanApply）
 */
const { fetchScanByPayload, validateScanUsage } = require('./scanApi.js');
const {
  scanItemResultToRowDetail,
  scanVirtualBatchResultToRowDetail,
} = require('./scanBatchRowDetail.js');
const { findReceiveRowByProduct } = require('./outsourceReceiveAggregates.js');
const { outsourceReceiveBaseKey } = require('./outsourceReceiveKeys.js');
const { receiveVariantQuantityKey } = require('./outsourceReceiveMatrix.js');
const { scanFail } = require('./scanFeedback.js');

function createOutsourceReceiveScanBatchHandlers(page) {
  const preparedByToken = new Map();

  function pendingRows() {
    const partner = page.data.scanPartnerName || '';
    return (page._allRows || []).filter(
      (r) => (r.partner || '') === partner && r.pending > 0,
    );
  }

  async function prepareScan(payload) {
    if (!payload.token) return null;
    const cacheKey = `${payload.kind}:${payload.token}`;
    if (preparedByToken.has(cacheKey)) return preparedByToken.get(cacheKey);

    const partnerName = page.data.scanPartnerName || '';
    if (!partnerName) {
      scanFail(page, '请先选择加工厂');
      return null;
    }

    try {
      const res = await fetchScanByPayload(payload);
      if (res.status === 'VOIDED') {
        scanFail(page, res.message || '码不可用');
        return null;
      }
      const productId = res.productId;
      if (!productId) {
        scanFail(page, '扫码结果缺少产品信息');
        return null;
      }

      const rows = pendingRows();
      let row = findReceiveRowByProduct(rows, productId);
      if (!row) {
        scanFail(page, `此码对应产品未外发给「${partnerName}」或已全部收回`);
        return null;
      }
      if (!row.orderId) {
        scanFail(page, '产品级外协收回请使用电脑端操作');
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

      const validation = await validateScanUsage({
        purpose: 'OUTSOURCE_RECEIVE',
        scope: {
          orderId: row.orderId,
          productId: row.productId,
          partner: row.partner,
        },
        itemCodeId,
        virtualBatchId,
        addQty,
      }).catch(() => ({ code: 'ALLOWED' }));
      if (validation.code === 'DUPLICATE_SAVED') {
        scanFail(page, validation.message || '该码已被使用');
        return null;
      }
      if (validation.code === 'EXCEEDS_MAX') {
        scanFail(page, validation.message || '超过可收上限');
        return null;
      }

      const prepared = {
        row,
        addQty,
        variantId: res.variantId || '',
        detail,
        baseKey: outsourceReceiveBaseKey(row),
        isProductScope: false,
      };
      preparedByToken.set(cacheKey, prepared);
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
    if (!page.data.scanPartnerName) {
      scanFail(page, '请先选择加工厂');
      return false;
    }

    const quantities = {};
    const rowMap = new Map();
    let lockedNodeId = null;

    for (let i = 0; i < payloads.length; i += 1) {
      const prepared = await prepareScan(payloads[i]);
      if (!prepared) return false;

      if (lockedNodeId == null) lockedNodeId = prepared.row.nodeId;
      else if (prepared.row.nodeId !== lockedNodeId) {
        scanFail(page, '本次扫码命中多个工序，请分批收货');
        return false;
      }

      const qtyKey = receiveVariantQuantityKey(
        prepared.baseKey,
        prepared.variantId,
        prepared.isProductScope,
      );
      quantities[qtyKey] = (quantities[qtyKey] || 0) + prepared.addQty;
      rowMap.set(prepared.baseKey, prepared.row);
    }

    const selectedRows = [...rowMap.values()];
    if (!selectedRows.length) {
      scanFail(page, '没有命中的扫码明细');
      return false;
    }

    const app = getApp();
    if (app.globalData) {
      app.globalData.outsourceReceiveConfirm = {
        rows: selectedRows,
        records: page._records || [],
        orders: page._orders || [],
        products: page._products || [],
        categories: page._categories || [],
        productMilestoneProgresses: page._pmp || [],
        productionLinkMode: page._productionLinkMode,
      };
      app.globalData.outsourceReceiveScanQuantities = quantities;
    }

    wx.navigateTo({
      url: '/packageBusiness/production-outsource-receive-confirm/production-outsource-receive-confirm',
    });
    preparedByToken.clear();
    return true;
  }

  return {
    resolveRowPreview,
    onConfirm,
  };
}

module.exports = {
  createOutsourceReceiveScanBatchHandlers,
};
