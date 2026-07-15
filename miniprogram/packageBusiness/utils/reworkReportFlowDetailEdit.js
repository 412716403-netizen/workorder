/**
 * 返工报工流水详情编辑/删除
 */

const { editPartsToTimestamp } = require('./reportBatchDetail.js');

function buildReportFlowEditMatrixLayout(product, dictionaries, lineItems) {
  const qtyMap = {};
  (lineItems || []).forEach((item) => {
    const vid = item.variantId || '';
    qtyMap[vid] = String(item.quantity || 0);
  });
  const { buildVariantMatrixUiModel } = require('../../utils/variantQtyMatrix.js');
  const { productHasColorSizeMatrix } = require('../../utils/productionPlans.js');
  if (!product || !productHasColorSizeMatrix(product)) return null;
  return buildVariantMatrixUiModel(product, dictionaries, qtyMap);
}

function validateReportFlowEditSave(lineItems, unitPrice) {
  const total = (lineItems || []).reduce((s, item) => s + (Number(item.quantity) || 0), 0);
  if (total <= 0) return { error: '数量须大于 0' };
  const bad = (lineItems || []).find((item) => (Number(item.quantity) || 0) < 0);
  if (bad) return { error: '数量不能为负' };
  const up = Number(unitPrice);
  if (unitPrice !== '' && unitPrice != null && (!Number.isFinite(up) || up < 0)) {
    return { error: '单价格式无效' };
  }
  return { ok: true };
}

function buildReportFlowEditSavePlan(opts) {
  const {
    records = [],
    lineItems = [],
    editDate,
    editTime,
    operator,
    workerId = '',
    equipmentId = '',
    unitPrice = 0,
    sourceUpdates = [],
  } = opts;

  const validation = validateReportFlowEditSave(lineItems, unitPrice);
  if (validation.error) return validation;

  const timestamp = editPartsToTimestamp(editDate, editTime);
  const byId = new Map((records || []).map((r) => [r.id, r]));
  const updates = [];
  const deletes = [];
  const up = Number(unitPrice) || 0;

  (lineItems || []).forEach((item) => {
    const rec = byId.get(item.id);
    if (!rec) return;
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) {
      deletes.push(rec.id);
      return;
    }
    updates.push({
      id: rec.id,
      quantity: qty,
      operator: operator || rec.operator,
      timestamp,
      workerId: workerId || rec.workerId || undefined,
      equipmentId: equipmentId || rec.equipmentId || undefined,
      unitPrice: up > 0 ? up : rec.unitPrice,
      amount: up > 0 ? qty * up : rec.amount,
    });
  });

  (records || []).forEach((r) => {
    if (!(lineItems || []).find((item) => item.id === r.id)) {
      deletes.push(r.id);
    }
  });

  if (!updates.length && !deletes.length && !(sourceUpdates || []).length) {
    return { error: '无变更' };
  }
  return { updates, deletes, sourceUpdates: sourceUpdates || [] };
}

module.exports = {
  buildReportFlowEditMatrixLayout,
  validateReportFlowEditSave,
  buildReportFlowEditSavePlan,
};
