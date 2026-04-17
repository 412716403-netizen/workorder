import { useEffect } from 'react';

/**
 * 打印模版编辑器在新标签页打开：用户保存后返回当前标签时，这里再刷一次，
 * 兜底 BroadcastChannel 异常。supplies `window.focus` + `visibilitychange` 双保险。
 *
 * 原先分散在 PSI 四个 *FormConfigModal 的 `useEffect` 里，现抽成统一 hook。
 */
export function useRefreshPrintTemplatesOnWindowFocus(
  active: boolean,
  onRefresh: (() => void | Promise<void>) | undefined,
): void {
  useEffect(() => {
    if (!active || !onRefresh) return;
    const onFocus = () => void onRefresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void onRefresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, onRefresh]);
}
