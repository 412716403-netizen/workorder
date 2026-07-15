/**
 * 工单报工批量扫码：预览 + 确认累加到表单（对齐 Web useReportModalState）
 */
const { fetchScanByPayload, validateScanUsage } = require('../../utils/scanApi.js');
const {
  scanItemResultToRowDetail,
  scanVirtualBatchResultToRowDetail,
} = require('./scanBatchRowDetail.js');
const { productHasColorSizeMatrix } = require('../../utils/productionPlans.js');
const { recordReportScanMeta } = require('./reportScanMeta.js');
const { scanFail } = require('./scanFeedback.js');

function createReportScanBatchHandlers(page) {
  const preparedByToken = new Map();

  async function prepareReportScan(payload) {
    if (!payload.token) return null;
    const cached = preparedByToken.get(payload.token);
    if (cached) return cached;

    const order = page._order;
    const milestone = page._milestone;
    const product = page._product;
    const category = page._category;
    if (!order || !milestone) return null;

    const productReportMode = Boolean(page._productReportMode);
    const productId = page._productId || (product && product.id) || order.productId;
    const milestoneTemplateId =
      page._milestoneTemplateId || milestone.templateId || milestone.id;
    const anchorPlanOrderId = order.planOrderId || null;
    if (!productReportMode && !anchorPlanOrderId) {
      scanFail(page, '当前工单未关联计划，无法校验扫码');
      return null;
    }

    const validatePurpose = productReportMode ? 'PRODUCT_REPORT' : 'MILESTONE_REPORT';
    const validateScope = productReportMode
      ? { productId, milestoneTemplateId }
      : { milestoneId: milestone.id };

    try {
      if (payload.kind === 'ITEM') {
        const res = await fetchScanByPayload(payload);
        if (res.status === 'VOIDED') {
          scanFail(page, res.message || '单品码已作废');
          return null;
        }
        if (res.productId !== order.productId && res.productId !== productId) {
          scanFail(page, productReportMode ? '此码产品与当前产品不一致' : '此码产品与当前工单不一致');
          return null;
        }
        const codePlanId = (res.callerContext && res.callerContext.callerPlanOrderId) || res.planOrderId;
        if (!productReportMode && codePlanId && codePlanId !== anchorPlanOrderId) {
          scanFail(page, '此码不属于当前工单所在计划');
          return null;
        }
        const vid = res.variantId || '';
        if (productHasColorSizeMatrix(product, category) && !vid) {
          scanFail(page, '单品码未带规格，无法在按规格模式下累加');
          return null;
        }
        const validation = await validateScanUsage({
          purpose: validatePurpose,
          scope: productReportMode
            ? { ...validateScope, variantId: vid || null }
            : validateScope,
          itemCodeId: res.itemCodeId || null,
          virtualBatchId: res.batchId || null,
          addQty: 1,
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
          vid,
          qty: 1,
          payloadKind: 'ITEM',
          detail: scanItemResultToRowDetail(res),
        };
        preparedByToken.set(payload.token, prepared);
        return prepared;
      }

      if (payload.kind === 'BATCH') {
        const res = await fetchScanByPayload(payload);
        if (res.status === 'VOIDED') {
          scanFail(page, res.message || '批次码已作废');
          return null;
        }
        if (res.productId !== order.productId && res.productId !== productId) {
          scanFail(page, productReportMode ? '此码产品与当前产品不一致' : '此码产品与当前工单不一致');
          return null;
        }
        const codePlanId = (res.callerContext && res.callerContext.callerPlanOrderId) || res.planOrderId;
        if (!productReportMode && codePlanId && codePlanId !== anchorPlanOrderId) {
          scanFail(page, '此码不属于当前工单所在计划');
          return null;
        }
        const qty = Number(res.quantity) || 0;
        if (qty <= 0) {
          scanFail(page, '批次数量无效');
          return null;
        }
        const vid = res.variantId || '';
        if (productHasColorSizeMatrix(product, category) && !vid) {
          scanFail(page, '批次码未带规格，无法在按规格模式下累加');
          return null;
        }
        const validation = await validateScanUsage({
          purpose: validatePurpose,
          scope: productReportMode
            ? { ...validateScope, variantId: vid || null }
            : validateScope,
          itemCodeId: null,
          virtualBatchId: res.batchId || null,
          addQty: qty,
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
          vid,
          qty,
          payloadKind: 'BATCH',
          detail: scanVirtualBatchResultToRowDetail(res),
        };
        preparedByToken.set(payload.token, prepared);
        return prepared;
      }
    } catch (e) {
      scanFail(page, (e && e.message) || '扫码查询失败');
      return null;
    }
    return null;
  }

  async function resolveRowPreview(payload) {
    const prepared = await prepareReportScan(payload);
    return prepared ? prepared.detail : null;
  }

  async function applyPayload(payload) {
    const prepared = await prepareReportScan(payload);
    if (!prepared) return false;
    const { vid, qty } = prepared;
    const formMode = page.data.formMode;

    if (formMode === 'matrix') {
      const key = vid || '';
      const prev = Number(page._quantities[key]) || 0;
      page._quantities[key] = String(prev + qty);
      page.rebuildMatrixLayout(false);
    } else if (formMode === 'multi') {
      const key = vid || page.data.variantId || '';
      const prev = Number(page._quantities[key]) || 0;
      page._quantities[key] = String(prev + qty);
      page.setData({ singleQuantity: page._quantities[key] });
    } else {
      const prev = Number(page.data.singleQuantity) || 0;
      page.setData({ singleQuantity: String(prev + qty) });
    }
    recordReportScanMeta(page, prepared);
    page.refreshCanSubmit();
    return true;
  }

  async function onConfirm(payloads) {
    for (let i = 0; i < payloads.length; i += 1) {
      const ok = await applyPayload(payloads[i]);
      if (!ok) return false;
    }
    wx.showToast({ title: '已累加到本次报工数量', icon: 'success' });
    preparedByToken.clear();
    return true;
  }

  function resetSession() {
    preparedByToken.clear();
  }

  return {
    resolveRowPreview,
    onConfirm,
    resetSession,
  };
}

module.exports = {
  createReportScanBatchHandlers,
};
