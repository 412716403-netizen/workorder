import { useEffect } from 'react';

/**
 * 顶层浮层专用：Esc 关闭当前层，并 stopImmediatePropagation，
 * 避免底下弹窗（如新增产品）一并被关掉。
 */
export function useEscapeToClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, onClose]);
}
