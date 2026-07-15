/**
 * 领退料流水详情编辑（对齐入库流水详情 material STOCK_OUT / STOCK_RETURN）
 */
const { parseNonNegativeInt } = require('../../utils/orderReportForm.js');

function initMaterialFlowEditState(rows) {
  const list = rows || [];
  const first = list[0] || {};
  return {
    editWarehouseId: first.warehouseId || '',
    lineItems: list.map((r) => ({
      id: r.id,
      editQty: String(Number(r.quantity) || 0),
    })),
  };
}

function validateMaterialFlowEditSave(ctx) {
  const { warehouseId, lineItems } = ctx;
  if (!warehouseId) return '请选择仓库';
  const ok = (lineItems || []).some((line) => parseNonNegativeInt(line.editQty, 0) > 0);
  if (!ok) return '请填写数量';
  return '';
}

function buildMaterialFlowEditSaveOperations(rows, editState) {
  const { editWarehouseId, lineItems } = editState;
  const ops = [];
  (lineItems || []).forEach((line, index) => {
    const row = (rows || [])[index];
    if (!row || !row.id) return;
    ops.push({
      type: 'update',
      id: row.id,
      body: {
        quantity: parseNonNegativeInt(line.editQty, 0),
        warehouseId: editWarehouseId || undefined,
      },
    });
  });
  return ops;
}

module.exports = {
  initMaterialFlowEditState,
  validateMaterialFlowEditSave,
  buildMaterialFlowEditSaveOperations,
};
