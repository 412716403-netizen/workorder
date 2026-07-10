/**
 * 可报任务：按预选工序模板批量扫码，支持跨工单累加，确认后进多工单确认页
 */
const { request } = require('../../utils/request.js');
const { normalizeListBody } = require('../../utils/listResponse.js');
const { fetchScanByPayload, validateScanUsage } = require('./scanApi.js');
const {
  scanItemResultToRowDetail,
  scanVirtualBatchResultToRowDetail,
} = require('./scanBatchRowDetail.js');
const { resolveReportTarget } = require('./resolveReportTarget.js');
const { productHasColorSizeMatrix } = require('./productionPlans.js');
const {
  createReportScanMetaSession,
  recordScanMetaEntry,
} = require('./reportScanMeta.js');
const {
  writeWorkerReportScanPrefill,
  serializeReportScanMeta,
} = require('../../utils/workerReportScanPrefill.js');

function sessionTargetKey(orderId, milestoneId) {
  return `${orderId}:${milestoneId}`;
}

function getOrCreateTargetGroup(page, prepared, order) {
  if (!page._targetGroups) page._targetGroups = new Map();
  const key = prepared.targetKey;
  let group = page._targetGroups.get(key);
  if (!group) {
    group = {
      orderId: prepared.orderId,
      milestoneId: prepared.milestoneId,
      productId: order && order.productId ? order.productId : '',
      orderNumber: (order && order.orderNumber) || prepared.detail.orderLabel || '',
      productName: (order && order.productName) || (prepared.detail && prepared.detail.productName) || '',
      productSku: (order && order.sku) || '',
      quantities: {},
      defectiveQuantities: {},
      scanMeta: createReportScanMetaSession(),
    };
    page._targetGroups.set(key, group);
  }
  return group;
}

function groupsToPrefillLines(targetGroups) {
  const lines = [];
  targetGroups.forEach((group) => {
    lines.push({
      orderId: group.orderId,
      milestoneId: group.milestoneId,
      productId: group.productId,
      orderNumber: group.orderNumber,
      productName: group.productName,
      productSku: group.productSku,
      quantities: { ...group.quantities },
      defectiveQuantities: { ...group.defectiveQuantities },
      scanMeta: serializeReportScanMeta(group.scanMeta),
    });
  });
  return lines;
}

function createWorkerReportScanHandlers(page) {
  const preparedByToken = new Map();

  async function prepareWorkerScan(payload) {
    if (!payload.token) return null;
    const cached = preparedByToken.get(payload.token);
    if (cached) return cached;

    const templateId = page.data.templateId;
    const orders = page._orders || [];
    if (!templateId || !orders.length) return null;

    try {
      const res = await fetchScanByPayload(payload);
      if (res.status === 'VOIDED') {
        wx.showToast({ title: res.message || '码已作废', icon: 'none' });
        return null;
      }

      const resolved = resolveReportTarget(res, templateId, orders);
      if (!resolved) {
        wx.showToast({ title: '无法根据此码匹配到工单与工序', icon: 'none' });
        return null;
      }
      if (resolved.error === 'MULTIPLE_ORDERS') {
        wx.showToast({ title: '匹配到多个工单，请分开扫码', icon: 'none' });
        return null;
      }

      const { orderId, milestoneId, orderLabel } = resolved;
      const order = orders.find((o) => o.id === orderId);
      const milestone = order && (order.milestones || []).find((m) => m.id === milestoneId);
      if (!order || !milestone) {
        wx.showToast({ title: '工单或工序不存在', icon: 'none' });
        return null;
      }

      const targetKey = sessionTargetKey(orderId, milestoneId);
      const reportableKeys = page._reportableKeys;
      if (!reportableKeys || !reportableKeys.has(targetKey)) {
        wx.showToast({ title: '该工单工序暂不可报', icon: 'none' });
        return null;
      }

      const anchorPlanOrderId = order.planOrderId || null;
      if (!anchorPlanOrderId) {
        wx.showToast({ title: '当前工单未关联计划，无法校验扫码', icon: 'none' });
        return null;
      }

      const product = page._productById && page._productById.get(order.productId);
      const category = product && product.categoryId
        ? (page._categoryById && page._categoryById.get(product.categoryId))
        : null;

      let qty = 0;
      let detail = null;
      let payloadKind = 'ITEM';

      if (payload.kind === 'ITEM') {
        const codePlanId = (res.callerContext && res.callerContext.callerPlanOrderId) || res.planOrderId;
        if (codePlanId && codePlanId !== anchorPlanOrderId) {
          wx.showToast({ title: '此码不属于当前工单所在计划', icon: 'none' });
          return null;
        }
        const vid = res.variantId || '';
        if (productHasColorSizeMatrix(product, category) && !vid) {
          wx.showToast({ title: '单品码未带规格，无法在按规格模式下累加', icon: 'none' });
          return null;
        }
        qty = 1;
        detail = scanItemResultToRowDetail(res);
        payloadKind = 'ITEM';
      } else if (payload.kind === 'BATCH') {
        const codePlanId = (res.callerContext && res.callerContext.callerPlanOrderId) || res.planOrderId;
        if (codePlanId && codePlanId !== anchorPlanOrderId) {
          wx.showToast({ title: '此码不属于当前工单所在计划', icon: 'none' });
          return null;
        }
        qty = Number(res.quantity) || 0;
        if (qty <= 0) {
          wx.showToast({ title: '批次数量无效', icon: 'none' });
          return null;
        }
        const vid = res.variantId || '';
        if (productHasColorSizeMatrix(product, category) && !vid) {
          wx.showToast({ title: '批次码未带规格，无法在按规格模式下累加', icon: 'none' });
          return null;
        }
        detail = scanVirtualBatchResultToRowDetail(res);
        payloadKind = 'BATCH';
      } else {
        return null;
      }

      const validation = await validateScanUsage({
        purpose: 'MILESTONE_REPORT',
        scope: { milestoneId },
        itemCodeId: payload.kind === 'ITEM' ? (res.itemCodeId || null) : null,
        virtualBatchId: res.batchId || null,
        addQty: qty,
      }).catch(() => ({ code: 'ALLOWED' }));

      if (validation.code === 'DUPLICATE_SAVED') {
        wx.showToast({ title: validation.message || '该码已被使用', icon: 'none' });
        return null;
      }
      if (validation.code === 'EXCEEDS_MAX') {
        wx.showToast({ title: validation.message || '超过可报上限', icon: 'none' });
        return null;
      }

      const vid = res.variantId || '';
      const prepared = {
        vid,
        qty,
        payloadKind,
        detail: {
          ...detail,
          orderLabel,
          milestoneName: milestone.name || page.data.templateName,
        },
        orderId,
        milestoneId,
        targetKey,
        order,
      };
      preparedByToken.set(payload.token, prepared);
      return prepared;
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '扫码查询失败', icon: 'none' });
      return null;
    }
  }

  async function resolveRowPreview(payload) {
    const prepared = await prepareWorkerScan(payload);
    return prepared ? prepared.detail : null;
  }

  async function onConfirm(payloads) {
    if (!payloads.length) return false;

    page._targetGroups = new Map();

    for (let i = 0; i < payloads.length; i += 1) {
      const prepared = await prepareWorkerScan(payloads[i]);
      if (!prepared) return false;

      const group = getOrCreateTargetGroup(page, prepared, prepared.order);
      const vid = prepared.vid || '';
      const prev = Number(group.quantities[vid]) || 0;
      group.quantities[vid] = String(prev + prepared.qty);
      recordScanMetaEntry(group.scanMeta, prepared);
    }

    const lines = groupsToPrefillLines(page._targetGroups);
    if (!lines.length) {
      wx.showToast({ title: '未匹配到可报工单', icon: 'none' });
      return false;
    }

    writeWorkerReportScanPrefill({
      version: 2,
      templateId: page.data.templateId,
      templateName: page.data.templateName,
      lines,
    });

    wx.redirectTo({
      url: '/packageBusiness/worker-report-confirm/worker-report-confirm?selfReport=1',
    });
    preparedByToken.clear();
    return true;
  }

  function resetSession() {
    preparedByToken.clear();
    page._targetGroups = new Map();
  }

  return {
    resolveRowPreview,
    onConfirm,
    resetSession,
  };
}

async function loadOrdersForWorkerScan() {
  const orders = await request({
    path: '/orders?all=true&excludeCompleted=true',
    method: 'GET',
  }).catch(() => []);
  return normalizeListBody(orders);
}

function buildReportableKeySet(tasks) {
  const keys = new Set();
  (tasks || []).forEach((task) => {
    if (task.orderId && task.milestoneId) {
      keys.add(sessionTargetKey(task.orderId, task.milestoneId));
    }
  });
  return keys;
}

module.exports = {
  createWorkerReportScanHandlers,
  loadOrdersForWorkerScan,
  buildReportableKeySet,
  sessionTargetKey,
};
