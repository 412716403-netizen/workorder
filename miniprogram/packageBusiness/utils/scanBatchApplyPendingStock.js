/**
 * 待入库清单批量扫码：确认后跳转入库确认页并预填数量（对齐 Web usePendingStockState.confirmPendingListScan）
 */
const { fetchScanByPayload, validateScanUsage } = require('../../utils/scanApi.js');
const {
  scanItemResultToRowDetail,
  scanVirtualBatchResultToRowDetail,
} = require('./scanBatchRowDetail.js');
const { productHasColorSizeMatrix } = require('../../utils/productionPlans.js');
const { expandPendingByVariantForMatrix } = require('./stockInForm.js');
const { scanFail } = require('./scanFeedback.js');

function tryAddQty(formSlice, opts) {
  const {
    hasColorSize,
    pendingTotal,
    pendingByVariant,
    variantId,
    addQty,
    allowExceed,
  } = opts;
  const vid = variantId || '';
  if (hasColorSize) {
    const prev = Number((formSlice.variantQuantities || {})[vid]) || 0;
    const cap = Number((pendingByVariant || {})[vid]);
    const max = Number.isFinite(cap) && cap > 0 ? cap : pendingTotal;
    if (!allowExceed && prev + addQty > max) {
      return { ok: false, message: '本次扫入数量超过待入库上限' };
    }
    return {
      ok: true,
      form: {
        ...formSlice,
        variantQuantities: {
          ...(formSlice.variantQuantities || {}),
          [vid]: prev + addQty,
        },
      },
    };
  }
  const prev = Number(formSlice.singleQuantity) || 0;
  if (!allowExceed && prev + addQty > pendingTotal) {
    return { ok: false, message: '本次扫入数量超过待入库上限' };
  }
  return {
    ok: true,
    form: {
      ...formSlice,
      singleQuantity: prev + addQty,
    },
  };
}

function createPendingStockScanBatchHandlers(page) {
  const preparedByToken = new Map();

  function findRowForScan(scanRes) {
    const productId = scanRes.productId;
    if (!productId) return null;
    const rows = page._rawRows || [];
    let candidates = rows.filter((r) => r.productId === productId);
    if (!candidates.length) return null;

    const planOrderId = scanRes.planOrderId || null;
    if (planOrderId) {
      const byPlan = candidates.filter((r) => (r.ordersInRow || []).some((o) => o.planOrderId === planOrderId)
        || (r.order && r.order.planOrderId === planOrderId));
      if (byPlan.length === 1) return byPlan[0];
      if (byPlan.length > 0) candidates = byPlan;
    }

    if (candidates.length === 1) return candidates[0];
    return candidates.length > 1 ? { error: 'MULTIPLE_ORDERS' } : null;
  }

  async function prepareScan(payload) {
    if (!payload.token) return null;
    const cacheKey = `${payload.kind}:${payload.token}`;
    if (preparedByToken.has(cacheKey)) return preparedByToken.get(cacheKey);

    try {
      const res = await fetchScanByPayload(payload);
      if (res.status === 'VOIDED') {
        scanFail(page, res.message || '码不可用');
        return null;
      }
      const row = findRowForScan(res);
      if (!row) {
        scanFail(page, '扫码未匹配到待入库清单');
        return null;
      }
      if (row.error === 'MULTIPLE_ORDERS') {
        scanFail(page, '匹配到多个工单，请分开扫码');
        return null;
      }

      const product = page._productMap && page._productMap.get(row.productId);
      const category = page._categoryMap && product && product.categoryId
        ? page._categoryMap.get(product.categoryId)
        : null;
      const hasColorSize = productHasColorSizeMatrix(product, category);
      const vid = res.variantId || '';
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

      if (hasColorSize && !vid) {
        scanFail(page, '产品按规格管理，码未带规格');
        return null;
      }

      const orderId = row.orderId || (row.order && row.order.id);
      const validation = await validateScanUsage({
        purpose: 'STOCK_IN',
        scope: { orderId },
        itemCodeId,
        virtualBatchId,
        addQty,
      }).catch(() => ({ code: 'ALLOWED' }));
      if (validation.code === 'DUPLICATE_SAVED') {
        scanFail(page, validation.message || '该码已入库');
        return null;
      }
      if (validation.code === 'EXCEEDS_MAX') {
        scanFail(page, validation.message || '超过待入库上限');
        return null;
      }

      const prepared = {
        row,
        variantId: vid,
        addQty,
        hasColorSize,
        detail,
        itemCodeId,
        virtualBatchId,
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
    if (!payloads.length) {
      scanFail(page, '请先扫码');
      return false;
    }

    let targetRow = null;
    let formSlice = { variantQuantities: {}, singleQuantity: 0 };
    const scanLink = { itemCodeIdsByVid: {}, hadBatchScan: false };
    const seen = new Set();

    for (let i = 0; i < payloads.length; i += 1) {
      const payload = payloads[i];
      if (!payload.token) continue;
      const key = `${payload.kind}:${payload.token}`;
      if (seen.has(key)) {
        scanFail(page, '列表中存在重复扫码');
        return false;
      }
      seen.add(key);

      const prepared = await prepareScan(payload);
      if (!prepared) return false;

      if (!targetRow) {
        targetRow = prepared.row;
      } else if (targetRow.rowKey !== prepared.row.rowKey) {
        scanFail(page, '本次扫码对应多个不同待入库工单，请分开扫码');
        return false;
      }

      const product = page._productMap && page._productMap.get(prepared.row.productId);
      const category = page._categoryMap && product && product.categoryId
        ? page._categoryMap.get(product.categoryId)
        : null;
      const pendingByVariant = expandPendingByVariantForMatrix(prepared.row, product, category);

      const tryResult = tryAddQty(formSlice, {
        hasColorSize: prepared.hasColorSize,
        pendingTotal: prepared.row.pendingTotal,
        pendingByVariant,
        variantId: prepared.variantId,
        addQty: prepared.addQty,
        allowExceed: page._allowExceedMaxStockInQty === true,
      });
      if (!tryResult.ok) {
        scanFail(page, tryResult.message || '超过待入库上限');
        return false;
      }
      formSlice = tryResult.form;

      if (prepared.virtualBatchId) scanLink.virtualBatchId = prepared.virtualBatchId;
      if (prepared.itemCodeId) {
        const vid = prepared.variantId || '';
        const arr = scanLink.itemCodeIdsByVid[vid] || [];
        if (!arr.includes(prepared.itemCodeId)) arr.push(prepared.itemCodeId);
        scanLink.itemCodeIdsByVid[vid] = arr;
      } else if (prepared.virtualBatchId) {
        scanLink.hadBatchScan = true;
      }
    }

    if (!targetRow) {
      scanFail(page, '扫码未匹配到待入库清单');
      return false;
    }

    const app = getApp();
    if (app.globalData) {
      app.globalData.pendingStockScanPrefill = {
        variantQuantities: formSlice.variantQuantities,
        singleQuantity: formSlice.singleQuantity,
        scanLink,
      };
    }

    const encoded = encodeURIComponent(targetRow.rowKey);
    wx.showToast({ title: '已进入确认入库，请核对后提交', icon: 'none' });
    wx.navigateTo({
      url: `/packageBusiness/production-order-stock-in-confirm/production-order-stock-in-confirm?mode=single&rowKeys=${encoded}`,
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
  createPendingStockScanBatchHandlers,
};
