import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * 报工弹窗打开期间同步工单 / 产品进度，使「待审 N」等 hint 能反映手机端新提交的 PENDING 报工。
 * 打开时立即刷一次；窗口重新聚焦时补刷；可选短间隔轮询（弹窗仍开着时）。
 */
export function useRefreshReportScopeWhileActive(
  active: boolean,
  options: {
    productionLinkMode: 'order' | 'product';
    refreshOrders: () => Promise<void>;
    refreshPMP: () => Promise<void>;
    pollIntervalMs?: number;
  },
): void {
  const {
    productionLinkMode,
    refreshOrders,
    refreshPMP,
    pollIntervalMs = 15_000,
  } = options;
  const queryClient = useQueryClient();

  const sync = useCallback(async () => {
    await Promise.allSettled([
      refreshOrders(),
      productionLinkMode === 'product' ? refreshPMP() : Promise.resolve(),
    ]);
    void queryClient.invalidateQueries({ queryKey: ['flow.reportPendingApproval'] });
  }, [productionLinkMode, refreshOrders, refreshPMP, queryClient]);

  useEffect(() => {
    if (!active) return;
    void sync();
    const onFocus = () => { void sync(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = pollIntervalMs > 0
      ? window.setInterval(() => { void sync(); }, pollIntervalMs)
      : undefined;
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer != null) window.clearInterval(timer);
    };
  }, [active, sync, pollIntervalMs]);
}
