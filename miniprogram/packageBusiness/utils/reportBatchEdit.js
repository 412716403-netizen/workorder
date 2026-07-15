/**
 * 报工批次详情编辑：矩阵数量初始化与保存计划
 */
const { flattenMatrixVariantIds } = require('../../utils/matrixQtyKeyboard.js');
const { parseNonNegativeInt } = require('../../utils/orderReportForm.js');

function initBatchEditQuantities(batch) {
  const quantities = {};
  const defectiveQuantities = {};
  const variantReportMap = {};

  (batch.rows || []).forEach((row) => {
    const r = row.raw;
    const vid = r.variantId;
    if (!vid) return;
    const qty = Number(r.quantity) || 0;
    const def = Number(r.defectiveQuantity) || 0;
    if (qty > 0) quantities[vid] = String(qty);
    if (def > 0) defectiveQuantities[vid] = String(def);
    variantReportMap[vid] = {
      reportId: r.reportId,
      source: row.source,
      orderId: r.orderId || '',
      milestoneId: r.milestoneId || '',
      progressId: r.progressId || '',
    };
  });

  return { quantities, defectiveQuantities, variantReportMap };
}

function collectEditVariantIds(matrixLayout, quantities, defectiveQuantities, variantReportMap) {
  const ids = new Set();
  flattenMatrixVariantIds(matrixLayout).forEach((id) => ids.add(id));
  Object.keys(variantReportMap || {}).forEach((id) => ids.add(id));
  Object.keys(quantities || {}).forEach((id) => ids.add(id));
  Object.keys(defectiveQuantities || {}).forEach((id) => ids.add(id));
  return [...ids];
}

function parseEditRate(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function buildBatchSaveOperations(ctx) {
  const {
    batch,
    detail,
    quantities,
    defectiveQuantities,
    variantReportMap,
    matrixLayout,
    useMatrix,
    timestamp,
    operator,
  } = ctx;

  const first = batch.first;
  const rate = parseEditRate(detail.editRate);
  const reportBatchId = first.reportBatchId || batch.key;
  const reportNo = batch.reportNo || first.reportNo || undefined;
  const workerId = first.workerId || undefined;
  const equipmentId = first.equipmentId || undefined;
  const createMeta = {
    timestamp,
    operator,
    reportBatchId,
    reportNo,
    workerId,
    equipmentId,
    rate,
  };

  const ops = [];

  if (useMatrix && matrixLayout) {
    const variantIds = collectEditVariantIds(
      matrixLayout,
      quantities,
      defectiveQuantities,
      variantReportMap,
    );
    variantIds.forEach((variantId) => {
      const quantity = parseNonNegativeInt(quantities[variantId], 0);
      const defectiveQuantity = parseNonNegativeInt(defectiveQuantities[variantId], 0);
      const existing = variantReportMap[variantId];
      const body = { quantity, defectiveQuantity, timestamp, operator };
      if (rate !== undefined) body.rate = rate;

      if (existing && existing.reportId) {
        if (quantity === 0 && defectiveQuantity === 0) {
          ops.push({
            type: 'delete',
            source: existing.source,
            orderId: existing.orderId,
            milestoneId: existing.milestoneId,
            reportId: existing.reportId,
          });
        } else {
          ops.push({
            type: 'update',
            source: existing.source,
            orderId: existing.orderId,
            milestoneId: existing.milestoneId,
            reportId: existing.reportId,
            body,
          });
        }
      } else if (quantity > 0 || defectiveQuantity > 0) {
        if (batch.source === 'order') {
          ops.push({
            type: 'create',
            source: 'order',
            orderId: first.orderId,
            milestoneId: first.milestoneId,
            body: {
              ...createMeta,
              quantity,
              defectiveQuantity: defectiveQuantity > 0 ? defectiveQuantity : undefined,
              variantId,
            },
          });
        } else {
          ops.push({
            type: 'create',
            source: 'product',
            body: {
              ...createMeta,
              productId: first.productId || detail.productId,
              milestoneTemplateId: first.templateId || detail.templateId,
              quantity,
              defectiveQuantity: defectiveQuantity > 0 ? defectiveQuantity : undefined,
              variantId,
            },
          });
        }
      }
    });
    return ops;
  }

  (detail.lineItems || []).forEach((line) => {
    const quantity = parseNonNegativeInt(line.editGoodQty, 0);
    const defectiveQuantity = parseNonNegativeInt(line.editDefectiveQty, 0);
    const body = { quantity, defectiveQuantity, timestamp, operator };
    if (rate !== undefined) body.rate = rate;
    if (!line.reportId) return;
    if (quantity === 0 && defectiveQuantity === 0) {
      ops.push({
        type: 'delete',
        source: line.source,
        orderId: line.orderId,
        milestoneId: line.milestoneId,
        reportId: line.reportId,
      });
    } else {
      ops.push({
        type: 'update',
        source: line.source,
        orderId: line.orderId,
        milestoneId: line.milestoneId,
        reportId: line.reportId,
        body,
      });
    }
  });

  return ops;
}

module.exports = {
  initBatchEditQuantities,
  collectEditVariantIds,
  parseEditRate,
  buildBatchSaveOperations,
};
