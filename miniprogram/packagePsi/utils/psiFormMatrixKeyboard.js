/**
 * 进销存/仓库表单页矩阵键盘共用处理（plan-create 模式）
 */

const {
  activateMatrixKeyboardCell,
  applyMatrixKeyboardKey,
  buildMatrixKeyboardPreview,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
} = require('../../utils/matrixQtyKeyboard.js');
const { afterMatrixKeyboardOpen } = require('../../utils/matrixKeyboardLayout.js');

function emptyMatrixKeyboardState() {
  return {
    matrixKeyboardVisible: false,
    matrixInputReplaceAll: false,
    activeMatrixVariantId: '',
    activeLineId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
  };
}

function handleMatrixCellTap(page, e, scrollSelector) {
  const { lineId, variantId } = e.currentTarget.dataset;
  const uiLine = (page.data.lines || []).find((l) => l.id === lineId);
  if (!uiLine || !variantId || !uiLine.matrixLayout) return;
  activateMatrixKeyboardCell(page._matrixKbInput);
  const preview = buildMatrixKeyboardPreview(uiLine.matrixLayout, variantId, uiLine.variantQuantities || {});
  page.setData({
    matrixKeyboardVisible: true,
    matrixInputReplaceAll: true,
    activeLineId: lineId,
    activeMatrixVariantId: variantId,
    matrixKeyboardLabel: preview.label,
    matrixKeyboardValue: preview.value,
  }, () => afterMatrixKeyboardOpen(page, scrollSelector || '.plan-create-scroll'));
}

function moveMatrixCell(page, matrixLayout, rawLine, nextId, scrollSelector) {
  if (!nextId) {
    page.setData(emptyMatrixKeyboardState());
    return;
  }
  activateMatrixKeyboardCell(page._matrixKbInput);
  const preview = buildMatrixKeyboardPreview(matrixLayout, nextId, rawLine.variantQuantities || {});
  page.setData({
    activeMatrixVariantId: nextId,
    matrixInputReplaceAll: true,
    matrixKeyboardLabel: preview.label,
    matrixKeyboardValue: preview.value,
  }, () => afterMatrixKeyboardOpen(page, scrollSelector || '.plan-create-scroll'));
}

function handleMatrixKeyboardAction(page, e, opts) {
  const options = opts || {};
  const scrollSelector = options.scrollSelector || '.plan-create-scroll';
  const onLinesUpdated = options.onLinesUpdated;
  const { action, digit } = e.detail || {};
  if (action === 'confirm') {
    page.setData(emptyMatrixKeyboardState());
    return;
  }
  const lineId = page.data.activeLineId;
  const variantId = page.data.activeMatrixVariantId;
  const rawLine = (page._lines || []).find((l) => l.id === lineId);
  const uiLine = (page.data.lines || []).find((l) => l.id === lineId);
  if (!rawLine || !uiLine || !variantId || !uiLine.matrixLayout) return;
  const matrixLayout = uiLine.matrixLayout;
  if (action === 'enter') {
    moveMatrixCell(page, matrixLayout, rawLine, getNextMatrixVariantIdInRow(matrixLayout, variantId), scrollSelector);
    return;
  }
  if (action === 'next') {
    moveMatrixCell(page, matrixLayout, rawLine, getNextMatrixVariantIdInColumn(matrixLayout, variantId), scrollSelector);
    return;
  }
  const vq = rawLine.variantQuantities || {};
  const { value, replaceConsumed } = applyMatrixKeyboardKey(
    page._matrixKbInput,
    vq[variantId] != null ? String(vq[variantId]) : '',
    action,
    digit,
  );
  const parsed = value === '' || value === '-.' ? 0 : Number(value);
  page._lines = (page._lines || []).map((l) => (
    l.id === lineId ? { ...l, variantQuantities: { ...vq, [variantId]: Number.isFinite(parsed) ? parsed : 0 } } : l
  ));
  page.setData({
    matrixKeyboardValue: value,
    matrixInputReplaceAll: replaceConsumed ? false : page.data.matrixInputReplaceAll,
  });
  if (typeof onLinesUpdated === 'function') onLinesUpdated();
}

module.exports = {
  emptyMatrixKeyboardState,
  handleMatrixCellTap,
  handleMatrixKeyboardAction,
};
