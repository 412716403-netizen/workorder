import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { Plus } from 'lucide-react';
import InsertMenuPopup from './InsertMenuPopup';

interface EditorInsertHandleProps {
  editor: Editor | null;
  editable: boolean;
  onPickImage?: () => void;
  onOpenLinkDialog?: () => void;
  onOpenProductDialog?: () => void;
  onPickFile?: () => void;
  onOpenDocumentDialog?: () => void;
}

interface HandlePos {
  top: number;
  left: number;
  height: number;
  blockEl: HTMLElement;
}

interface PopupPos {
  top: number;
  left: number;
}

/** 按钮宽度 + 与正文间距，用于贴在行首文字左侧 */
const HANDLE_WIDTH = 26;
const HANDLE_GAP = 6;
const CLOSE_DELAY_MS = 320;
const POPUP_EST_HEIGHT = 400;

function findBlockElement(node: HTMLElement, root: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = node;
  while (el && el !== root) {
    const tag = el.tagName;
    if (
      tag === 'P' || tag === 'H1' || tag === 'H2' || tag === 'H3'
      || tag === 'LI' || tag === 'BLOCKQUOTE' || tag === 'PRE'
      || tag === 'HR'
    ) {
      return el;
    }
    if (tag === 'UL' || tag === 'OL') {
      const firstLi = el.querySelector(':scope > li');
      if (firstLi) return firstLi as HTMLElement;
      return el;
    }
    // 表格本身不是插入目标；继续向上，由外层再解析单元格内块
    if (tag === 'TABLE' || el.classList.contains('tableWrapper')) {
      el = el.parentElement;
      continue;
    }
    el = el.parentElement;
  }
  return null;
}

/** 在表格内按坐标找到可插入的块（单元格内段落等） */
function blockInsideTable(
  tableOrWrap: HTMLElement,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  const table = tableOrWrap.tagName === 'TABLE'
    ? tableOrWrap
    : tableOrWrap.querySelector('table');
  if (!(table instanceof HTMLElement)) return null;

  const cells = Array.from(table.querySelectorAll('td, th'));
  let hit: HTMLElement | null = null;
  for (const cell of cells) {
    if (!(cell instanceof HTMLElement)) continue;
    const r = cell.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      hit = cell;
      break;
    }
  }
  // 仅命中行（鼠标在表格左侧 gutter 一带）时，取该行第一个单元格
  if (!hit) {
    for (const cell of cells) {
      if (!(cell instanceof HTMLElement)) continue;
      const r = cell.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        hit = cell;
        break;
      }
    }
  }
  if (!hit) return null;

  const inner = hit.querySelector(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > blockquote, :scope > pre, :scope > ul, :scope > ol');
  if (inner instanceof HTMLElement) {
    if (inner.tagName === 'UL' || inner.tagName === 'OL') {
      return (inner.querySelector(':scope > li') as HTMLElement | null) ?? inner;
    }
    return inner;
  }
  return hit.firstElementChild instanceof HTMLElement ? hit.firstElementChild : null;
}

function blockElAtPoint(editor: Editor, clientX: number, clientY: number): HTMLElement | null {
  const root = editor.view.dom as HTMLElement;
  const rect = root.getBoundingClientRect();
  const style = getComputedStyle(root);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  // 优先用鼠标 X；落在编辑器外时回退到正文左缘
  const sampleX = clientX >= rect.left && clientX <= rect.right
    ? clientX
    : rect.left + padLeft + 6;

  const coords = editor.view.posAtCoords({ left: sampleX, top: clientY });
  if (coords) {
    const dom = editor.view.domAtPos(coords.pos);
    let node: Node | null = dom.node;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (node instanceof HTMLElement) {
      const block = findBlockElement(node, root);
      if (block) return block;
      // 点在表格空隙上时，按坐标落入单元格
      const wrap = node.closest?.('table, .tableWrapper');
      if (wrap instanceof HTMLElement) {
        const inner = blockInsideTable(wrap, clientX, clientY);
        if (inner) return inner;
      }
    }
  }

  // 回退：顶层块；若是表格则深入单元格
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const r = child.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom) {
      if (child.tagName === 'TABLE' || child.classList.contains('tableWrapper')) {
        return blockInsideTable(child, clientX, clientY);
      }
      return child;
    }
    const dist = clientY < r.top ? r.top - clientY : clientY - r.bottom;
    if (dist < bestDist) {
      bestDist = dist;
      best = child;
    }
  }
  if (!best || bestDist > 24) return null;
  if (best.tagName === 'TABLE' || best.classList.contains('tableWrapper')) {
    return blockInsideTable(best, clientX, clientY);
  }
  return best;
}

/**
 * 计算插入菜单在滚动壳内的 content 绝对 top。
 * 先在可视区内相对按钮夹紧，再加回 scrollTop，避免滚到文末时弹窗被夹到页面顶部。
 */
export function resolveInsertPopupContentTop(
  btnRelTop: number,
  shellClientHeight: number,
  scrollTop: number,
  popupEstHeight = POPUP_EST_HEIGHT,
): number {
  const margin = 8;
  const viewH = Math.max(0, shellClientHeight);
  let relTop = btnRelTop;
  if (relTop + popupEstHeight > viewH - margin) {
    relTop = Math.max(margin, viewH - popupEstHeight - margin);
  }
  if (relTop < margin) relTop = margin;
  return relTop + scrollTop;
}

function isInsideTableCell(el: HTMLElement): boolean {
  return !!el.closest('td, th');
}

/** 当前输入光标所在的可插入块；无焦点时返回 null */
function getCaretBlockEl(editor: Editor): HTMLElement | null {
  if (!editor.isFocused) return null;
  const root = editor.view.dom as HTMLElement;
  try {
    const dom = editor.view.domAtPos(editor.state.selection.from);
    let node: Node | null = dom.node;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (node instanceof HTMLElement) {
      return findBlockElement(node, root);
    }
  } catch {
    /* ignore */
  }
  return null;
}

const EditorInsertHandle: React.FC<EditorInsertHandleProps> = ({
  editor,
  editable,
  onPickImage,
  onOpenLinkDialog,
  onOpenProductDialog,
  onPickFile,
  onOpenDocumentDialog,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBlockRef = useRef<HTMLElement | null>(null);
  /** 表格内光标锁定的块：mousemove 蹭格线时不重算/不清除 */
  const tableCaretLockRef = useRef<HTMLElement | null>(null);
  const handlePosRef = useRef<HandlePos | null>(null);
  const menuOpenRef = useRef(false);
  const pointerDownRef = useRef(false);
  const [handlePos, setHandlePos] = useState<HandlePos | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [popupPos, setPopupPos] = useState<PopupPos | null>(null);

  menuOpenRef.current = menuOpen;

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const getShell = useCallback(() => {
    return wrapRef.current?.parentElement as HTMLElement | null;
  }, []);

  const placeHandle = useCallback((el: HTMLElement) => {
    const shell = getShell();
    if (!shell) return;
    lastBlockRef.current = el;
    const shellRect = shell.getBoundingClientRect();
    const blockRect = el.getBoundingClientRect();
    const next: HandlePos = {
      top: blockRect.top - shellRect.top + shell.scrollTop,
      left: Math.max(0, blockRect.left - shellRect.left + shell.scrollLeft - HANDLE_WIDTH - HANDLE_GAP),
      height: Math.max(blockRect.height, 28),
      blockEl: el,
    };
    const prev = handlePosRef.current;
    if (
      prev
      && prev.blockEl === next.blockEl
      && Math.abs(prev.top - next.top) < 1
      && Math.abs(prev.left - next.left) < 1
      && Math.abs(prev.height - next.height) < 1
    ) {
      return;
    }
    handlePosRef.current = next;
    setHandlePos(next);
  }, [getShell]);

  const hideHandleOnly = useCallback(() => {
    // 保留 tableCaretLock，仅隐藏 DOM，避免拖选文字时碰到 +
    if (menuOpenRef.current) {
      setMenuOpen(false);
      setPopupPos(null);
    }
    if (handlePosRef.current) {
      handlePosRef.current = null;
      setHandlePos(null);
    }
  }, []);

  const clearHandle = useCallback(() => {
    tableCaretLockRef.current = null;
    handlePosRef.current = null;
    lastBlockRef.current = null;
    setHandlePos(null);
  }, []);

  const keepTableCaretHandle = useCallback((): boolean => {
    if (!editor || !editable) return false;
    if (pointerDownRef.current || !editor.state.selection.empty) return false;
    const locked = tableCaretLockRef.current;
    if (locked && editor.isActive('table')) {
      if (!handlePosRef.current) placeHandle(locked);
      return true;
    }
    const caretBlock = getCaretBlockEl(editor);
    if (caretBlock && isInsideTableCell(caretBlock)) {
      tableCaretLockRef.current = caretBlock;
      placeHandle(caretBlock);
      return true;
    }
    return false;
  }, [editor, editable, placeHandle]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      setMenuOpen(false);
      setPopupPos(null);
      if (keepTableCaretHandle()) return;
      clearHandle();
    }, CLOSE_DELAY_MS);
  }, [keepTableCaretHandle, clearHandle]);

  const isInPopup = useCallback((node: EventTarget | null) => {
    if (!(node instanceof Node)) return false;
    if (popupRef.current?.contains(node)) return true;
    // 表格尺寸二级菜单也在 portal 里
    if (node instanceof Element && node.closest('.kb-insert-table-picker-portal')) return true;
    return false;
  }, []);

  const focusBlock = useCallback((blockEl: HTMLElement) => {
    if (!editor) return;
    try {
      const pos = editor.view.posAtDOM(blockEl, 0);
      editor.chain().focus().setTextSelection(pos + 1).run();
    } catch {
      editor.chain().focus().run();
    }
  }, [editor]);

  const updatePopupPosition = useCallback(() => {
    const btn = plusRef.current;
    const shell = getShell();
    if (!btn || !shell) return;
    const btnRect = btn.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const top = resolveInsertPopupContentTop(
      btnRect.top - shellRect.top,
      shell.clientHeight,
      shell.scrollTop,
    );
    const left = btnRect.right - shellRect.left + shell.scrollLeft + 6;
    setPopupPos({ top, left });
  }, [getShell]);

  const openMenu = useCallback(() => {
    if (!handlePos || !editor) return;
    clearCloseTimer();
    // 光标已在当前块内时不要拽回块首，否则表格/段内「关联产品」会插错位置或看起来像另起一行
    const caretBlock = getCaretBlockEl(editor);
    if (caretBlock !== handlePos.blockEl) {
      focusBlock(handlePos.blockEl);
    } else {
      editor.chain().focus().run();
    }
    setMenuOpen(true);
    requestAnimationFrame(updatePopupPosition);
  }, [handlePos, editor, focusBlock, updatePopupPosition]);

  /** 表格：跟光标锁定；正文：可跟鼠标悬停 */
  const syncHandle = useCallback((clientX: number, clientY: number) => {
    if (!editor || !editable) return;
    const shell = getShell();
    if (!shell) return;

    // 拖选文字 / 按住鼠标时隐藏 +，避免挡住选区
    if (pointerDownRef.current || !editor.state.selection.empty) {
      hideHandleOnly();
      return;
    }

    // 表格光标锁定中：mousemove（含蹭格线）完全不改 + 位置
    if (tableCaretLockRef.current && editor.isActive('table')) {
      return;
    }

    const caretBlock = getCaretBlockEl(editor);
    if (caretBlock && isInsideTableCell(caretBlock)) {
      tableCaretLockRef.current = caretBlock;
      placeHandle(caretBlock);
      return;
    }

    const el = blockElAtPoint(editor, clientX, clientY) ?? lastBlockRef.current;
    if (!el) {
      if (!menuOpenRef.current) clearHandle();
      return;
    }
    // 表格单元格：无输入光标时不因悬停显示 +
    if (isInsideTableCell(el)) {
      if (!menuOpenRef.current) clearHandle();
      return;
    }

    tableCaretLockRef.current = null;
    placeHandle(el);
  }, [editor, editable, getShell, placeHandle, clearHandle, hideHandleOnly]);

  const syncFromSelection = useCallback(() => {
    if (!editor || !editable || editor.isDestroyed) return;
    // 有文字选区时隐藏插入键，防止拖选过程中被 + 抢走鼠标
    if (!editor.state.selection.empty || pointerDownRef.current) {
      hideHandleOnly();
      if (!editor.state.selection.empty && editor.isActive('table')) {
        const caretBlock = getCaretBlockEl(editor);
        if (caretBlock && isInsideTableCell(caretBlock)) {
          tableCaretLockRef.current = caretBlock;
        }
      }
      return;
    }
    const caretBlock = getCaretBlockEl(editor);
    if (caretBlock && isInsideTableCell(caretBlock)) {
      tableCaretLockRef.current = caretBlock;
      placeHandle(caretBlock);
      return;
    }
    // 光标确实离开表格后，解除锁定
    if (tableCaretLockRef.current || (lastBlockRef.current && isInsideTableCell(lastBlockRef.current))) {
      if (!menuOpenRef.current) clearHandle();
    }
  }, [editor, editable, placeHandle, clearHandle, hideHandleOnly]);

  useEffect(() => {
    if (!editor || !editable) return;
    const shell = getShell();
    if (!shell) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // 点在插入键/菜单上时不进入「拖选隐藏」
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.kb-insert-plus, .kb-insert-active-row, .kb-insert-popup-portal, .kb-insert-table-picker-portal')) {
        return;
      }
      pointerDownRef.current = true;
      // 点到别处：立刻收起插入菜单（避免悬停打开后残留）
      if (menuOpenRef.current) {
        clearCloseTimer();
        setMenuOpen(false);
        setPopupPos(null);
      }
      if (editor.isActive('table')) hideHandleOnly();
    };
    const onPointerUp = () => {
      if (!pointerDownRef.current) return;
      pointerDownRef.current = false;
      syncFromSelection();
    };

    const onMouseMove = (e: MouseEvent) => {
      syncHandle(e.clientX, e.clientY);
    };

    const onMouseLeave = (e: MouseEvent) => {
      const related = e.relatedTarget;
      if (related instanceof Node && shell.contains(related)) return;
      if (isInPopup(related)) return;
      // 菜单打开时离开编辑区也要关闭
      if (menuOpenRef.current) {
        scheduleClose();
        return;
      }
      if (keepTableCaretHandle()) return;
      scheduleClose();
    };

    shell.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    shell.addEventListener('mousemove', onMouseMove);
    shell.addEventListener('mouseleave', onMouseLeave);
    return () => {
      shell.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      shell.removeEventListener('mousemove', onMouseMove);
      shell.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [editor, editable, syncHandle, getShell, isInPopup, scheduleClose, keepTableCaretHandle, hideHandleOnly, syncFromSelection]);

  useEffect(() => {
    if (!editor || !editable) return;
    syncFromSelection();
    editor.on('selectionUpdate', syncFromSelection);
    editor.on('focus', syncFromSelection);
    const onBlur = () => {
      if (menuOpenRef.current) return;
      // 点击 + 时 mousedown preventDefault，一般不会 blur；真 blur 再清
      if (tableCaretLockRef.current || (lastBlockRef.current && isInsideTableCell(lastBlockRef.current))) {
        // 延迟判断，避免点 + / 菜单时误清
        window.setTimeout(() => {
          if (menuOpenRef.current) return;
          if (editor.isDestroyed) return;
          if (getCaretBlockEl(editor) && editor.isActive('table')) return;
          if (!editor.isFocused) clearHandle();
        }, 0);
      }
    };
    editor.on('blur', onBlur);
    return () => {
      editor.off('selectionUpdate', syncFromSelection);
      editor.off('focus', syncFromSelection);
      editor.off('blur', onBlur);
    };
  }, [editor, editable, syncFromSelection, clearHandle]);

  useEffect(() => {
    if (!menuOpen) return;
    updatePopupPosition();
    const shell = getShell();
    const onReposition = () => updatePopupPosition();
    // 点在菜单外任意处关闭（含表格 gutter、正文等）
    const onDocPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.kb-insert-plus, .kb-insert-active-row, .kb-insert-popup-portal, .kb-insert-table-picker-portal')) {
        return;
      }
      clearCloseTimer();
      setMenuOpen(false);
      setPopupPos(null);
    };
    shell?.addEventListener('scroll', onReposition, { passive: true });
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => {
      shell?.removeEventListener('scroll', onReposition);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      document.removeEventListener('pointerdown', onDocPointerDown, true);
    };
  }, [menuOpen, updatePopupPosition, getShell]);

  useEffect(() => () => clearCloseTimer(), []);

  const closeMenu = () => {
    setMenuOpen(false);
    setPopupPos(null);
    if (keepTableCaretHandle()) return;
    clearHandle();
  };

  if (!editor || !editable) return null;

  const inTableLock = !!tableCaretLockRef.current;

  return (
    <div ref={wrapRef} className="kb-insert-wrap">
      {handlePos && (
        <div
          className={`kb-insert-active-row${inTableLock ? ' is-table-cell' : ''}`}
          style={{ top: handlePos.top, left: handlePos.left, height: handlePos.height }}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={e => {
            if (isInPopup(e.relatedTarget)) return;
            // 离开 + 区域且未进入菜单：关闭菜单（表格锁定只保留 +，不保留菜单）
            scheduleClose();
          }}
        >
          <button
            ref={plusRef}
            type="button"
            className={`kb-insert-plus ${menuOpen ? 'is-open' : ''}`}
            aria-label="插入内容"
            onMouseEnter={openMenu}
            onMouseDown={e => e.preventDefault()}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {menuOpen && popupPos && createPortal(
        <div
          ref={popupRef}
          className="kb-insert-popup-portal"
          style={{ top: popupPos.top, left: popupPos.left }}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        >
          <InsertMenuPopup
            editor={editor}
            onPickImage={onPickImage}
            onOpenLinkDialog={onOpenLinkDialog}
            onOpenProductDialog={onOpenProductDialog}
            onPickFile={onPickFile}
            onOpenDocumentDialog={onOpenDocumentDialog}
            onClose={closeMenu}
          />
        </div>,
        // 挂到编辑器壳，避免 fixed 层挂 body 后盖住应用侧栏
        (wrapRef.current?.parentElement as HTMLElement | null) ?? document.body,
      )}
    </div>
  );
};

export default EditorInsertHandle;
