import type { Editor } from '@tiptap/core';
import { findParentNode } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { CellSelection, TableMap } from '@tiptap/pm/tables';

export interface GutterSeg {
  /** 相对 wrapper 的 left（列）或 top（行） */
  offset: number;
  /** width（列）或 height（行） */
  size: number;
}

export interface TableGutterLayout {
  cols: GutterSeg[];
  rows: GutterSeg[];
  tableLeft: number;
  tableTop: number;
  tableWidth: number;
  tableHeight: number;
}

export interface InsertPlan {
  index: number;
  where: 'before' | 'after';
}

/** 在边界 insertIndex（0..count）插入：落在 count 时对最后一格 after，否则对 index 格 before */
export function getInsertPlan(insertIndex: number, count: number): InsertPlan | null {
  if (count <= 0 || insertIndex < 0 || insertIndex > count) return null;
  if (insertIndex >= count) return { index: count - 1, where: 'after' };
  return { index: insertIndex, where: 'before' };
}

export function findActiveTable(editor: Editor): { pos: number; node: ProseMirrorNode } | null {
  const found = findParentNode(node => node.type.name === 'table')(editor.state.selection);
  if (!found) return null;
  return { pos: found.pos, node: found.node };
}

export function getTableCellPos(
  doc: ProseMirrorNode,
  tablePos: number,
  row: number,
  col: number,
): number | null {
  const table = doc.nodeAt(tablePos);
  if (!table || table.type.name !== 'table') return null;
  const map = TableMap.get(table);
  if (row < 0 || col < 0 || row >= map.height || col >= map.width) return null;
  return tablePos + 1 + map.positionAt(row, col, table);
}

export function measureTableGutterLayout(
  tableEl: HTMLElement,
  wrapperEl: HTMLElement,
): TableGutterLayout | null {
  const wrapperRect = wrapperEl.getBoundingClientRect();
  const tableRect = tableEl.getBoundingClientRect();
  const rowEls = Array.from(tableEl.querySelectorAll('tr'));
  if (rowEls.length === 0) return null;

  const firstRowCells = Array.from(rowEls[0].children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && (el.tagName === 'TD' || el.tagName === 'TH'),
  );
  if (firstRowCells.length === 0) return null;

  const cols: GutterSeg[] = firstRowCells.map(cell => {
    const r = cell.getBoundingClientRect();
    return { offset: r.left - wrapperRect.left, size: r.width };
  });

  const rows: GutterSeg[] = rowEls.map(row => {
    const r = row.getBoundingClientRect();
    return { offset: r.top - wrapperRect.top, size: r.height };
  });

  return {
    cols,
    rows,
    tableLeft: tableRect.left - wrapperRect.left,
    tableTop: tableRect.top - wrapperRect.top,
    tableWidth: tableRect.width,
    tableHeight: tableRect.height,
  };
}

export function selectTableColumn(editor: Editor, tablePos: number, col: number): boolean {
  const cellPos = getTableCellPos(editor.state.doc, tablePos, 0, col);
  if (cellPos == null) return false;
  const $cell = editor.state.doc.resolve(cellPos);
  const tr = editor.state.tr.setSelection(CellSelection.colSelection($cell));
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

export function selectTableRow(editor: Editor, tablePos: number, row: number): boolean {
  const cellPos = getTableCellPos(editor.state.doc, tablePos, row, 0);
  if (cellPos == null) return false;
  const $cell = editor.state.doc.resolve(cellPos);
  const tr = editor.state.tr.setSelection(CellSelection.rowSelection($cell));
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

/** 删除当前选中列；仅剩一列时删整表 */
export function deleteSelectedTableColumn(editor: Editor): boolean {
  const table = findActiveTable(editor);
  if (!table) return false;
  const map = TableMap.get(table.node);
  if (map.width <= 1) return editor.chain().focus().deleteTable().run();
  return editor.chain().focus().deleteColumn().run();
}

/** 删除当前选中行；仅剩一行时删整表 */
export function deleteSelectedTableRow(editor: Editor): boolean {
  const table = findActiveTable(editor);
  if (!table) return false;
  const map = TableMap.get(table.node);
  if (map.height <= 1) return editor.chain().focus().deleteTable().run();
  return editor.chain().focus().deleteRow().run();
}

export function deleteTableColumnAt(editor: Editor, tablePos: number, col: number): boolean {
  if (!selectTableColumn(editor, tablePos, col)) return false;
  return deleteSelectedTableColumn(editor);
}

export function deleteTableRowAt(editor: Editor, tablePos: number, row: number): boolean {
  if (!selectTableRow(editor, tablePos, row)) return false;
  return deleteSelectedTableRow(editor);
}

export function insertTableColumnAt(
  editor: Editor,
  tablePos: number,
  insertIndex: number,
): boolean {
  const table = editor.state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== 'table') return false;
  const map = TableMap.get(table);
  const plan = getInsertPlan(insertIndex, map.width);
  if (!plan) return false;
  const cellPos = getTableCellPos(editor.state.doc, tablePos, 0, plan.index);
  if (cellPos == null) return false;
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cellPos)));
  return plan.where === 'before'
    ? editor.chain().focus().addColumnBefore().run()
    : editor.chain().focus().addColumnAfter().run();
}

export function insertTableRowAt(
  editor: Editor,
  tablePos: number,
  insertIndex: number,
): boolean {
  const table = editor.state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== 'table') return false;
  const map = TableMap.get(table);
  const plan = getInsertPlan(insertIndex, map.height);
  if (!plan) return false;
  const cellPos = getTableCellPos(editor.state.doc, tablePos, plan.index, 0);
  if (cellPos == null) return false;
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cellPos)));
  return plan.where === 'before'
    ? editor.chain().focus().addRowBefore().run()
    : editor.chain().focus().addRowAfter().run();
}
