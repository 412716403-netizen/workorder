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
      || tag === 'HR' || tag === 'TABLE'
    ) {
      return el;
    }
    if (tag === 'UL' || tag === 'OL') {
      const firstLi = el.querySelector(':scope > li');
      if (firstLi) return firstLi as HTMLElement;
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function blockElAtClientY(editor: Editor, clientY: number): HTMLElement | null {
  const root = editor.view.dom as HTMLElement;
  const rect = root.getBoundingClientRect();
  const style = getComputedStyle(root);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  // 采样点必须落在正文内容区（越过左侧内边距），否则 posAtCoords 取不到块
  const sampleX = rect.left + padLeft + 6;

  const coords = editor.view.posAtCoords({ left: sampleX, top: clientY });
  if (coords) {
    const dom = editor.view.domAtPos(coords.pos);
    let node: Node | null = dom.node;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (node instanceof HTMLElement) {
      const block = findBlockElement(node, root);
      if (block) return block;
    }
  }

  // 回退：在所有顶层块里找与 clientY 最接近的一行（空段落/行间空白也能命中）
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const r = child.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom) return child;
    const dist = clientY < r.top ? r.top - clientY : clientY - r.bottom;
    if (dist < bestDist) {
      bestDist = dist;
      best = child;
    }
  }
  return bestDist <= 24 ? best : null;
}

function clampPopupTop(anchorTop: number): number {
  const margin = 8;
  let top = anchorTop;
  if (top + POPUP_EST_HEIGHT > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - POPUP_EST_HEIGHT - margin);
  }
  return top;
}

const EditorInsertHandle: React.FC<EditorInsertHandleProps> = ({
  editor,
  editable,
  onPickImage,
  onOpenLinkDialog,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBlockRef = useRef<HTMLElement | null>(null);
  const [handlePos, setHandlePos] = useState<HandlePos | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [popupPos, setPopupPos] = useState<PopupPos | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      setMenuOpen(false);
      setHandlePos(null);
      setPopupPos(null);
      lastBlockRef.current = null;
    }, CLOSE_DELAY_MS);
  };

  const isInPopup = useCallback((node: EventTarget | null) => {
    if (!(node instanceof Node)) return false;
    return popupRef.current?.contains(node) ?? false;
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

  const getShell = useCallback(() => {
    return wrapRef.current?.parentElement as HTMLElement | null;
  }, []);

  const updatePopupPosition = useCallback(() => {
    const btn = plusRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setPopupPos({
      top: clampPopupTop(rect.top),
      left: rect.right + 6,
    });
  }, []);

  const openMenu = useCallback(() => {
    if (!handlePos) return;
    clearCloseTimer();
    focusBlock(handlePos.blockEl);
    setMenuOpen(true);
    requestAnimationFrame(updatePopupPosition);
  }, [handlePos, focusBlock, updatePopupPosition]);

  const syncHandle = useCallback((clientY: number) => {
    if (!editor || !editable) return;
    const shell = getShell();
    if (!shell) return;

    const el = blockElAtClientY(editor, clientY) ?? lastBlockRef.current;
    if (!el) {
      if (!menuOpen) setHandlePos(null);
      return;
    }

    lastBlockRef.current = el;
    const shellRect = shell.getBoundingClientRect();
    const blockRect = el.getBoundingClientRect();
    const left = blockRect.left - shellRect.left + shell.scrollLeft - HANDLE_WIDTH - HANDLE_GAP;
    setHandlePos({
      top: blockRect.top - shellRect.top + shell.scrollTop,
      left: Math.max(0, left),
      height: Math.max(blockRect.height, 28),
      blockEl: el,
    });
  }, [editor, editable, menuOpen, getShell]);

  useEffect(() => {
    if (!editor || !editable) return;
    const shell = getShell();
    if (!shell) return;

    const onMouseMove = (e: MouseEvent) => {
      syncHandle(e.clientY);
    };

    const onMouseLeave = (e: MouseEvent) => {
      const related = e.relatedTarget;
      if (related instanceof Node && shell.contains(related)) return;
      if (isInPopup(related)) return;
      if (!menuOpen) scheduleClose();
    };

    shell.addEventListener('mousemove', onMouseMove);
    shell.addEventListener('mouseleave', onMouseLeave);
    return () => {
      shell.removeEventListener('mousemove', onMouseMove);
      shell.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [editor, editable, menuOpen, syncHandle, getShell, isInPopup]);

  useEffect(() => {
    if (!menuOpen) return;
    updatePopupPosition();
    const shell = getShell();
    const onReposition = () => updatePopupPosition();
    shell?.addEventListener('scroll', onReposition, { passive: true });
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      shell?.removeEventListener('scroll', onReposition);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [menuOpen, updatePopupPosition, getShell]);

  useEffect(() => () => clearCloseTimer(), []);

  const closeMenu = () => {
    setMenuOpen(false);
    setHandlePos(null);
    setPopupPos(null);
    lastBlockRef.current = null;
  };

  if (!editor || !editable) return null;

  return (
    <div ref={wrapRef} className="kb-insert-wrap">
      {handlePos && (
        <div
          className="kb-insert-active-row"
          style={{ top: handlePos.top, left: handlePos.left, height: handlePos.height }}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={e => {
            if (isInPopup(e.relatedTarget)) return;
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
            onClose={closeMenu}
          />
        </div>,
        document.body,
      )}
    </div>
  );
};

export default EditorInsertHandle;
