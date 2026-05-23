import type React from 'react';

export const VARIANT_QTY_MATRIX_CONTAINER_ATTR = 'data-variant-qty-matrix';
export const MATRIX_INPUT_SELECTOR = 'input[data-matrix-row][data-matrix-col]:not([disabled])';

type MatrixDirection = 'up' | 'down' | 'left' | 'right';

function parseMatrixDirection(key: string): MatrixDirection | null {
  switch (key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}

function getMatrixInputCoord(input: HTMLInputElement): { row: number; col: number } | null {
  const row = input.dataset.matrixRow;
  const col = input.dataset.matrixCol;
  if (row == null || col == null) return null;
  const r = Number(row);
  const c = Number(col);
  if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
  return { row: r, col: c };
}

/** 在同矩阵容器内按 Excel 风格查找下一个可编辑 input（跳过空组合格与 disabled）。 */
export function findNextMatrixInput(
  container: HTMLElement,
  current: HTMLInputElement,
  direction: MatrixDirection,
): HTMLInputElement | null {
  const coords = getMatrixInputCoord(current);
  if (!coords) return null;

  const inputs = Array.from(container.querySelectorAll<HTMLInputElement>(MATRIX_INPUT_SELECTOR));
  const inputByCoord = new Map<string, HTMLInputElement>();
  for (const input of inputs) {
    const c = getMatrixInputCoord(input);
    if (c) inputByCoord.set(`${c.row},${c.col}`, input);
  }

  const { row, col } = coords;

  if (direction === 'up') {
    for (let r = row - 1; r >= 0; r -= 1) {
      const next = inputByCoord.get(`${r},${col}`);
      if (next) return next;
    }
    return null;
  }

  if (direction === 'down') {
    const maxRow = inputs.reduce((max, input) => Math.max(max, getMatrixInputCoord(input)?.row ?? -1), -1);
    for (let r = row + 1; r <= maxRow; r += 1) {
      const next = inputByCoord.get(`${r},${col}`);
      if (next) return next;
    }
    return null;
  }

  if (direction === 'left') {
    for (let c = col - 1; c >= 0; c -= 1) {
      const next = inputByCoord.get(`${row},${c}`);
      if (next) return next;
    }
    return null;
  }

  const maxCol = inputs.reduce((max, input) => Math.max(max, getMatrixInputCoord(input)?.col ?? -1), -1);
  for (let c = col + 1; c <= maxCol; c += 1) {
    const next = inputByCoord.get(`${row},${c}`);
    if (next) return next;
  }
  return null;
}

export function handleVariantQtyMatrixKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
  const direction = parseMatrixDirection(e.key);
  if (!direction) return;

  const container = e.currentTarget.closest(`[${VARIANT_QTY_MATRIX_CONTAINER_ATTR}]`);
  if (!(container instanceof HTMLElement)) return;

  const next = findNextMatrixInput(container, e.currentTarget, direction);
  if (!next) return;

  e.preventDefault();
  next.focus();
  next.select();
}
