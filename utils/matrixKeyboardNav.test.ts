// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  VARIANT_QTY_MATRIX_CONTAINER_ATTR,
  findNextMatrixInput,
} from './matrixKeyboardNav';

function makeInput(row: number, col: number, opts?: { disabled?: boolean }): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.dataset.matrixRow = String(row);
  input.dataset.matrixCol = String(col);
  if (opts?.disabled) input.disabled = true;
  return input;
}

function buildMatrix(container: HTMLElement, cells: Array<{ row: number; col: number; disabled?: boolean } | null>) {
  for (const cell of cells) {
    if (cell == null) continue;
    container.appendChild(makeInput(cell.row, cell.col, { disabled: cell.disabled }));
  }
}

describe('findNextMatrixInput', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.setAttribute(VARIANT_QTY_MATRIX_CONTAINER_ATTR, '');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('moves right to adjacent column in same row', () => {
    buildMatrix(container, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ]);
    const current = container.querySelector<HTMLInputElement>('input[data-matrix-row="0"][data-matrix-col="0"]')!;
    const next = findNextMatrixInput(container, current, 'right');
    expect(next?.dataset.matrixRow).toBe('0');
    expect(next?.dataset.matrixCol).toBe('1');
  });

  it('moves down skipping missing cells in column', () => {
    buildMatrix(container, [
      { row: 0, col: 1 },
      { row: 2, col: 1 },
    ]);
    const current = container.querySelector<HTMLInputElement>('input[data-matrix-row="0"][data-matrix-col="1"]')!;
    const next = findNextMatrixInput(container, current, 'down');
    expect(next?.dataset.matrixRow).toBe('2');
    expect(next?.dataset.matrixCol).toBe('1');
  });

  it('does not move past matrix boundary', () => {
    buildMatrix(container, [{ row: 0, col: 0 }]);
    const current = container.querySelector<HTMLInputElement>('input[data-matrix-row="0"][data-matrix-col="0"]')!;
    expect(findNextMatrixInput(container, current, 'left')).toBeNull();
    expect(findNextMatrixInput(container, current, 'up')).toBeNull();
    expect(findNextMatrixInput(container, current, 'right')).toBeNull();
    expect(findNextMatrixInput(container, current, 'down')).toBeNull();
  });

  it('skips disabled inputs', () => {
    buildMatrix(container, [
      { row: 0, col: 0 },
      { row: 0, col: 1, disabled: true },
      { row: 0, col: 2 },
    ]);
    const current = container.querySelector<HTMLInputElement>('input[data-matrix-row="0"][data-matrix-col="0"]')!;
    const next = findNextMatrixInput(container, current, 'right');
    expect(next?.dataset.matrixCol).toBe('2');
  });

  it('moves left across columns', () => {
    buildMatrix(container, [
      { row: 1, col: 0 },
      { row: 1, col: 2 },
    ]);
    const current = container.querySelector<HTMLInputElement>('input[data-matrix-row="1"][data-matrix-col="2"]')!;
    const next = findNextMatrixInput(container, current, 'left');
    expect(next?.dataset.matrixCol).toBe('0');
  });
});
