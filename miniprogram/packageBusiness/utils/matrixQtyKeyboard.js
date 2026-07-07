/**
 * 颜色×尺码矩阵数量自定义键盘逻辑
 */

function flattenMatrixVariantIds(matrixLayout) {
  const ids = [];
  (matrixLayout && matrixLayout.colorRows || []).forEach((row) => {
    (row.cells || []).forEach((cell) => {
      if (cell && cell.variantId) ids.push(cell.variantId);
    });
  });
  return ids;
}

function locateMatrixCell(matrixLayout, variantId) {
  const rows = (matrixLayout && matrixLayout.colorRows) || [];
  for (let r = 0; r < rows.length; r += 1) {
    const cells = rows[r].cells || [];
    for (let c = 0; c < cells.length; c += 1) {
      const cell = cells[c];
      if (cell && cell.variantId === variantId) {
        return { rowIndex: r, colIndex: c };
      }
    }
  }
  return null;
}

/** → 下一格：同行下一列，行末则换到下一行首列 */
function getNextMatrixVariantIdInColumn(matrixLayout, currentId) {
  const pos = locateMatrixCell(matrixLayout, currentId);
  if (!pos) return '';
  const rows = matrixLayout.colorRows || [];
  const cells = rows[pos.rowIndex].cells || [];

  for (let c = pos.colIndex + 1; c < cells.length; c += 1) {
    const cell = cells[c];
    if (cell && cell.variantId && !cell.disabled) return cell.variantId;
  }

  for (let r = pos.rowIndex + 1; r < rows.length; r += 1) {
    const rowCells = rows[r].cells || [];
    for (let c = 0; c < rowCells.length; c += 1) {
      const cell = rowCells[c];
      if (cell && cell.variantId && !cell.disabled) return cell.variantId;
    }
  }
  return '';
}

/** ↵ 回车：下一行同列 */
function getNextMatrixVariantIdInRow(matrixLayout, currentId) {
  const pos = locateMatrixCell(matrixLayout, currentId);
  if (!pos) return '';
  const rows = matrixLayout.colorRows || [];
  for (let r = pos.rowIndex + 1; r < rows.length; r += 1) {
    const cell = (rows[r].cells || [])[pos.colIndex];
    if (cell && cell.variantId && !cell.disabled) return cell.variantId;
  }
  return '';
}

function getNextMatrixVariantId(matrixLayout, currentId) {
  return getNextMatrixVariantIdInColumn(matrixLayout, currentId);
}

const MATRIX_KEYBOARD_EDIT_ACTIONS = ['digit', 'dot', 'minus', 'backspace'];

function createMatrixKeyboardInputSession() {
  return { replaceOnNextKey: false };
}

/** 选中矩阵格时调用：下一键输入将整格替换（等同全选后输入） */
function activateMatrixKeyboardCell(session) {
  if (session) session.replaceOnNextKey = true;
}

function applyMatrixKeyPress(raw, action, digit, options) {
  let v = raw == null ? '' : String(raw);
  const replaceAll = options && options.replaceAll === true && v !== '';

  if (action === 'digit') {
    if (replaceAll) return digit;
    if (v === '0' && digit !== '.') return digit;
    if (v === '-0' && digit !== '.') return `-${digit}`;
    return v + digit;
  }
  if (action === 'dot') {
    if (replaceAll) return '0.';
    if (v.includes('.')) return v;
    if (v === '' || v === '-') return `${v}0.`;
    return `${v}.`;
  }
  if (action === 'minus') {
    if (replaceAll) return '-';
    if (v.startsWith('-')) return v.slice(1);
    return `-${v}`;
  }
  if (action === 'backspace') {
    if (replaceAll) return '';
    return v.slice(0, -1);
  }
  return v;
}

/**
 * 带「选中替换」的键盘输入；返回 { value, replaceConsumed }。
 * replaceConsumed 为 true 时页面应 setData({ matrixInputReplaceAll: false })。
 */
function applyMatrixKeyboardKey(session, raw, action, digit) {
  const replaceAll = Boolean(session && session.replaceOnNextKey);
  const value = applyMatrixKeyPress(raw, action, digit, { replaceAll });
  let replaceConsumed = false;
  if (replaceAll && MATRIX_KEYBOARD_EDIT_ACTIONS.includes(action)) {
    session.replaceOnNextKey = false;
    replaceConsumed = true;
  }
  return { value, replaceConsumed };
}

function getMatrixCellLabel(matrixLayout, variantId) {
  const pos = locateMatrixCell(matrixLayout, variantId);
  if (!pos) return '';
  const row = matrixLayout.colorRows[pos.rowIndex];
  const sizeCol = (matrixLayout.sizeColumns || [])[pos.colIndex];
  const colorLabel = (row && row.colorLabel) || '';
  const sizeLabel = (sizeCol && sizeCol.header) || '';
  if (colorLabel && sizeLabel) return `${colorLabel} · ${sizeLabel}`;
  return colorLabel || sizeLabel;
}

function buildMatrixKeyboardPreview(matrixLayout, variantId, qtyMap) {
  if (!variantId) return { label: '', value: '' };
  const label = getMatrixCellLabel(matrixLayout, variantId);
  const raw = qtyMap && qtyMap[variantId];
  const value = raw != null && String(raw) !== '' ? String(raw) : '';
  return { label, value };
}

module.exports = {
  flattenMatrixVariantIds,
  locateMatrixCell,
  getMatrixCellLabel,
  buildMatrixKeyboardPreview,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
  getNextMatrixVariantId,
  createMatrixKeyboardInputSession,
  activateMatrixKeyboardCell,
  applyMatrixKeyPress,
  applyMatrixKeyboardKey,
};
