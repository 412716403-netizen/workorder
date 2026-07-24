import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';
import { openFileUrlInNewTab, type OpenFileInTabOptions } from '../utils/openFileUrlInNewTab';

export interface FileContextMenuState {
  x: number;
  y: number;
  url: string;
  opts?: OpenFileInTabOptions;
}

/**
 * 右键菜单：在新标签页打开文件。
 * 用于附件缩略图 / 预览画布等。
 */
export function useFileOpenInTabMenu() {
  const [menu, setMenu] = useState<FileContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setMenu(null), []);

  const onContextMenuFor = useCallback((url: string, opts?: OpenFileInTabOptions) => {
    return (e: React.MouseEvent) => {
      const u = (url ?? '').trim();
      if (!u) return;
      e.preventDefault();
      e.stopPropagation();
      setMenu({ x: e.clientX, y: e.clientY, url: u, opts });
    };
  }, []);

  const openInNewTab = useCallback(
    (url: string, opts?: OpenFileInTabOptions) => {
      openFileUrlInNewTab(url, opts);
      close();
    },
    [close],
  );

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target;
      if (t instanceof Node && menuRef.current?.contains(t)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    const t = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointer, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [menu, close]);

  const menuNode =
    menu && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[2147483646] min-w-[160px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
            style={{
              left: Math.min(menu.x, window.innerWidth - 180),
              top: Math.min(menu.y, window.innerHeight - 56),
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                openInNewTab(menu.url, menu.opts);
              }}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              在新标签页打开
            </button>
          </div>,
          document.body,
        )
      : null;

  return { onContextMenuFor, menuNode, closeMenu: close };
}
