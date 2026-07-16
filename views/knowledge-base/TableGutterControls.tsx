import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { Columns2, Rows2, Trash2 } from 'lucide-react';
import {
  deleteSelectedTableColumn,
  deleteSelectedTableRow,
  findActiveTable,
  insertTableColumnAt,
  insertTableRowAt,
  measureTableGutterLayout,
  selectTableColumn,
  selectTableRow,
  type TableGutterLayout,
} from './tableGutterUtils';
import { CellSelection, columnResizingPluginKey, selectedRect } from '@tiptap/pm/tables';

interface TableGutterControlsProps {
  editor: Editor | null;
  editable: boolean;
}

interface GutterState {
  wrapper: HTMLElement;
  tablePos: number;
  layout: TableGutterLayout;
}

const GUTTER_THICKNESS = 8;
const DOT_HIT = 14;

const preventBlur = (e: React.MouseEvent) => e.preventDefault();

function resolveTableDom(editor: Editor, tablePos: number): { tableEl: HTMLElement; wrapper: HTMLElement } | null {
  const dom = editor.view.nodeDOM(tablePos);
  if (!(dom instanceof HTMLElement)) return null;
  const tableEl = dom.tagName === 'TABLE' ? dom : dom.querySelector('table');
  if (!(tableEl instanceof HTMLElement)) return null;
  const wrapper = tableEl.closest('.tableWrapper');
  if (!(wrapper instanceof HTMLElement)) return null;
  return { tableEl, wrapper };
}

function layoutEquals(a: TableGutterLayout, b: TableGutterLayout): boolean {
  if (
    a.tableLeft !== b.tableLeft
    || a.tableTop !== b.tableTop
    || a.tableWidth !== b.tableWidth
    || a.tableHeight !== b.tableHeight
    || a.cols.length !== b.cols.length
    || a.rows.length !== b.rows.length
  ) {
    return false;
  }
  for (let i = 0; i < a.cols.length; i++) {
    if (a.cols[i].offset !== b.cols[i].offset || a.cols[i].size !== b.cols[i].size) return false;
  }
  for (let i = 0; i < a.rows.length; i++) {
    if (a.rows[i].offset !== b.rows[i].offset || a.rows[i].size !== b.rows[i].size) return false;
  }
  return true;
}

/** 列宽拖拽中：冻结 gutter，避免与 resize handle 抢着重绘导致闪烁 */
function isTableColumnDragging(editor: Editor): boolean {
  const st = columnResizingPluginKey.getState(editor.state);
  return !!st?.dragging;
}

const TableGutterControls: React.FC<TableGutterControlsProps> = ({ editor, editable }) => {
  const [gutter, setGutter] = useState<GutterState | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [hoverColDot, setHoverColDot] = useState<number | null>(null);
  const [hoverRowDot, setHoverRowDot] = useState<number | null>(null);
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const pointerDownInTableRef = useRef(false);

  const syncSelectionHighlight = useCallback((ed: Editor) => {
    const sel = ed.state.selection;
    if (sel instanceof CellSelection && sel.isColSelection()) {
      try {
        const rect = selectedRect(ed.state);
        setSelectedCol(rect.left);
        setSelectedRow(null);
        return;
      } catch {
        /* ignore */
      }
    }
    if (sel instanceof CellSelection && sel.isRowSelection()) {
      try {
        const rect = selectedRect(ed.state);
        setSelectedRow(rect.top);
        setSelectedCol(null);
        return;
      } catch {
        /* ignore */
      }
    }
    setSelectedCol(null);
    setSelectedRow(null);
  }, []);

  const sync = useCallback(() => {
    if (!editor || !editable || editor.isDestroyed) {
      setGutter(null);
      setSelectedCol(null);
      setSelectedRow(null);
      return;
    }
    // 拖拽列宽时只改 DOM col 宽，ResizeObserver 会狂触发；跳过以免操作条闪烁
    if (isTableColumnDragging(editor)) return;

    const selectingText = !editor.state.selection.empty
      && !(editor.state.selection instanceof CellSelection);
    // 拖选单元格内文字 / 按住鼠标：冻结操作条重绘，并关掉命中层
    if (selectingText || pointerDownInTableRef.current) {
      if (editor.isActive('table')) {
        const active = findActiveTable(editor);
        const dom = active ? resolveTableDom(editor, active.pos) : null;
        dom?.wrapper.classList.add('is-text-selecting');
      }
      return;
    }

    if (!editor.isActive('table')) {
      document.querySelectorAll('.kb-editor .tableWrapper.is-text-selecting')
        .forEach(el => el.classList.remove('is-text-selecting'));
      setGutter(null);
      setSelectedCol(null);
      setSelectedRow(null);
      return;
    }
    const active = findActiveTable(editor);
    if (!active) {
      setGutter(null);
      setSelectedCol(null);
      setSelectedRow(null);
      return;
    }
    const dom = resolveTableDom(editor, active.pos);
    if (!dom) {
      setGutter(null);
      return;
    }
    dom.wrapper.classList.remove('is-text-selecting');
    const layout = measureTableGutterLayout(dom.tableEl, dom.wrapper);
    if (!layout) {
      setGutter(null);
      return;
    }
    syncSelectionHighlight(editor);
    setGutter(prev => {
      if (
        prev
        && prev.tablePos === active.pos
        && prev.wrapper === dom.wrapper
        && layoutEquals(prev.layout, layout)
      ) {
        return prev;
      }
      return { wrapper: dom.wrapper, tablePos: active.pos, layout };
    });
  }, [editor, editable, syncSelectionHighlight]);

  useEffect(() => {
    if (!editor || !editable) {
      setGutter(null);
      return;
    }

    sync();
    editor.on('selectionUpdate', sync);
    editor.on('transaction', sync);
    editor.on('focus', sync);

    const shell = editor.view.dom.closest('.kb-editor-shell');
    let roRaf = 0;
    const onScrollOrResize = () => {
      if (isTableColumnDragging(editor)) return;
      sync();
    };
    const onRo = () => {
      if (isTableColumnDragging(editor)) return;
      // 合并同一帧内多次尺寸变化，减少拖拽结束后的抖动
      if (roRaf) cancelAnimationFrame(roRaf);
      roRaf = requestAnimationFrame(() => {
        roRaf = 0;
        sync();
      });
    };

    // 按下即禁用操作条/列宽热区，避免拖选刚开始就被抢走
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !editor.isActive('table')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.kb-table-gutters')) return;
      pointerDownInTableRef.current = true;
      const active = findActiveTable(editor);
      const dom = active ? resolveTableDom(editor, active.pos) : null;
      dom?.wrapper.classList.add('is-text-selecting');
    };
    const onPointerUp = () => {
      pointerDownInTableRef.current = false;
      // 松手后按真实选区决定是否保留 is-text-selecting
      sync();
    };

    shell?.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    editor.view.dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(onRo)
      : null;
    ro?.observe(editor.view.dom);

    return () => {
      editor.off('selectionUpdate', sync);
      editor.off('transaction', sync);
      editor.off('focus', sync);
      shell?.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      editor.view.dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      if (roRaf) cancelAnimationFrame(roRaf);
      ro?.disconnect();
      document.querySelectorAll('.kb-editor .tableWrapper.is-text-selecting')
        .forEach(el => el.classList.remove('is-text-selecting'));
    };
  }, [editor, editable, sync]);

  useEffect(() => {
    if (!gutter) {
      setHoverCol(null);
      setHoverRow(null);
      setHoverColDot(null);
      setHoverRowDot(null);
    }
  }, [gutter]);

  if (!editor || !editable || !gutter) return null;

  const { wrapper, tablePos, layout } = gutter;
  const { cols, rows, tableLeft, tableTop, tableWidth, tableHeight } = layout;

  const activeCol = selectedCol ?? hoverCol;
  const activeRow = selectedRow ?? hoverRow;

  const onSelectCol = (col: number) => {
    selectTableColumn(editor, tablePos, col);
  };

  const onSelectRow = (row: number) => {
    selectTableRow(editor, tablePos, row);
  };

  const onInsertCol = (insertIndex: number) => {
    insertTableColumnAt(editor, tablePos, insertIndex);
  };

  const onInsertRow = (insertIndex: number) => {
    insertTableRowAt(editor, tablePos, insertIndex);
  };

  const onDeleteTable = () => {
    editor.chain().focus().deleteTable().run();
  };

  const colRailTop = tableTop - GUTTER_THICKNESS - 2;
  const rowRailLeft = tableLeft - GUTTER_THICKNESS - 2;

  return createPortal(
    <div className="kb-table-gutters" contentEditable={false}>
      {/* 左上角：删除整表 */}
      <button
        type="button"
        className="kb-table-gutter-delete-table"
        style={{
          left: Math.max(0, rowRailLeft),
          top: Math.max(0, colRailTop),
        }}
        title="删除表格"
        aria-label="删除表格"
        onMouseDown={preventBlur}
        onClick={onDeleteTable}
      >
        <Trash2 className="h-3 w-3" />
      </button>

      {/* 选中列：删除按钮贴在顶条下方 */}
      {selectedCol != null && cols[selectedCol] && (
        <button
          type="button"
          className="kb-table-gutter-action-btn"
          style={{
            left: cols[selectedCol].offset + cols[selectedCol].size / 2,
            top: tableTop + 4,
            transform: 'translateX(-50%)',
          }}
          title="删除列"
          aria-label="删除列"
          onMouseDown={preventBlur}
          onClick={() => deleteSelectedTableColumn(editor)}
        >
          <Columns2 className="h-3.5 w-3.5" />
          <span>删除列</span>
        </button>
      )}

      {/* 选中行：删除按钮贴在侧条右侧 */}
      {selectedRow != null && rows[selectedRow] && (
        <button
          type="button"
          className="kb-table-gutter-action-btn"
          style={{
            left: tableLeft + 4,
            top: rows[selectedRow].offset + rows[selectedRow].size / 2,
            transform: 'translateY(-50%)',
          }}
          title="删除行"
          aria-label="删除行"
          onMouseDown={preventBlur}
          onClick={() => deleteSelectedTableRow(editor)}
        >
          <Rows2 className="h-3.5 w-3.5" />
          <span>删除行</span>
        </button>
      )}

      {/* 列高亮 */}
      {activeCol != null && cols[activeCol] && (
        <div
          className="kb-table-gutter-highlight kb-table-gutter-highlight-col"
          style={{
            left: cols[activeCol].offset,
            top: tableTop,
            width: cols[activeCol].size,
            height: tableHeight,
          }}
        />
      )}
      {/* 行高亮 */}
      {activeRow != null && rows[activeRow] && (
        <div
          className="kb-table-gutter-highlight kb-table-gutter-highlight-row"
          style={{
            left: tableLeft,
            top: rows[activeRow].offset,
            width: tableWidth,
            height: rows[activeRow].size,
          }}
        />
      )}

      {/* 顶栏：选中列 */}
      <div
        className="kb-table-gutter-col-rail"
        style={{
          left: tableLeft,
          top: colRailTop,
          width: tableWidth,
          height: GUTTER_THICKNESS,
        }}
        onMouseLeave={() => setHoverCol(null)}
      >
        {cols.map((col, i) => (
          <button
            key={`col-seg-${i}`}
            type="button"
            className={`kb-table-gutter-seg kb-table-gutter-seg-col ${activeCol === i ? 'is-active' : ''}`}
            style={{ left: col.offset - tableLeft, width: col.size }}
            title="选中列"
            aria-label={`选中第 ${i + 1} 列`}
            onMouseDown={preventBlur}
            onMouseEnter={() => {
              setHoverCol(i);
              setHoverRow(null);
            }}
            onClick={() => onSelectCol(i)}
          />
        ))}
      </div>

      {/* 左栏：选中行 */}
      <div
        className="kb-table-gutter-row-rail"
        style={{
          left: rowRailLeft,
          top: tableTop,
          width: GUTTER_THICKNESS,
          height: tableHeight,
        }}
        onMouseLeave={() => setHoverRow(null)}
      >
        {rows.map((row, i) => (
          <button
            key={`row-seg-${i}`}
            type="button"
            className={`kb-table-gutter-seg kb-table-gutter-seg-row ${activeRow === i ? 'is-active' : ''}`}
            style={{ top: row.offset - tableTop, height: row.size }}
            title="选中行"
            aria-label={`选中第 ${i + 1} 行`}
            onMouseDown={preventBlur}
            onMouseEnter={() => {
              setHoverRow(i);
              setHoverCol(null);
            }}
            onClick={() => onSelectRow(i)}
          />
        ))}
      </div>

      {/* 列间圆点：增列（含首尾） */}
      {Array.from({ length: cols.length + 1 }, (_, i) => {
        const x = i === 0
          ? tableLeft
          : i === cols.length
            ? tableLeft + tableWidth
            : cols[i].offset;
        const active = hoverColDot === i;
        return (
          <button
            key={`col-dot-${i}`}
            type="button"
            className={`kb-table-gutter-dot kb-table-gutter-dot-col ${active ? 'is-active' : ''}`}
            style={{
              left: x - DOT_HIT / 2,
              top: colRailTop + (GUTTER_THICKNESS - DOT_HIT) / 2,
              width: DOT_HIT,
              height: DOT_HIT,
            }}
            title="插入列"
            aria-label={i === 0 ? '在左侧插入列' : i === cols.length ? '在右侧插入列' : `在第 ${i} 列后插入列`}
            onMouseDown={preventBlur}
            onMouseEnter={() => {
              setHoverColDot(i);
              setHoverCol(null);
              setHoverRow(null);
            }}
            onMouseLeave={() => setHoverColDot(null)}
            onClick={() => onInsertCol(i)}
          >
            <span className="kb-table-gutter-dot-inner" />
          </button>
        );
      })}

      {/* 行间圆点：增行（含首尾） */}
      {Array.from({ length: rows.length + 1 }, (_, i) => {
        const y = i === 0
          ? tableTop
          : i === rows.length
            ? tableTop + tableHeight
            : rows[i].offset;
        const active = hoverRowDot === i;
        return (
          <button
            key={`row-dot-${i}`}
            type="button"
            className={`kb-table-gutter-dot kb-table-gutter-dot-row ${active ? 'is-active' : ''}`}
            style={{
              left: rowRailLeft + (GUTTER_THICKNESS - DOT_HIT) / 2,
              top: y - DOT_HIT / 2,
              width: DOT_HIT,
              height: DOT_HIT,
            }}
            title="插入行"
            aria-label={i === 0 ? '在上方插入行' : i === rows.length ? '在下方插入行' : `在第 ${i} 行后插入行`}
            onMouseDown={preventBlur}
            onMouseEnter={() => {
              setHoverRowDot(i);
              setHoverCol(null);
              setHoverRow(null);
            }}
            onMouseLeave={() => setHoverRowDot(null)}
            onClick={() => onInsertRow(i)}
          >
            <span className="kb-table-gutter-dot-inner" />
          </button>
        );
      })}
    </div>,
    wrapper,
  );
};

export default TableGutterControls;
