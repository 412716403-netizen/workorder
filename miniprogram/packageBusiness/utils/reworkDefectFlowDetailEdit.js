/**
 * 处理不良流水详情编辑/删除
 */

const { editPartsToTimestamp } = require('./reportBatchDetail.js');

function buildDefectFlowEditMatrixLayout(product, dictionaries, lineItems) {
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

function validateDefectFlowEditSave(lineItems) {
  const total = (lineItems || []).reduce((s, item) => s + (Number(item.quantity) || 0), 0);
  if (total <= 0) return { error: '数量须大于 0' };
  const bad = (lineItems || []).find((item) => (Number(item.quantity) || 0) < 0);
  if (bad) return { error: '数量不能为负' };
  return { ok: true };
}

function buildDefectFlowEditSavePlan(opts) {
  const {
    records = [],
    lineItems = [],
    editDate,
    editTime,
    operator,
  } = opts;

  const validation = validateDefectFlowEditSave(lineItems);
  if (validation.error) return validation;

  const timestamp = editPartsToTimestamp(editDate, editTime);
  const byId = new Map((records || []).map((r) => [r.id, r]));
  const updates = [];
  const deletes = [];

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
    });
  });

  (records || []).forEach((r) => {
    if (!(lineItems || []).find((item) => item.id === r.id)) {
      deletes.push(r.id);
    }
  });

  if (!updates.length && !deletes.length) return { error: '无变更' };
  return { updates, deletes };
}

module.exports = {
  buildDefectFlowEditMatrixLayout,
  validateDefectFlowEditSave,
  buildDefectFlowEditSavePlan,
};
