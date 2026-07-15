import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * 同步工单 / 产品进度，使网页侧能反映小程序等其它端刚提交的报工。
 * 用于：报工弹窗「待审 N」hint、工单中心待入库清单（末道完成量 − 已入库）。
 * 激活时立即刷一次；窗口重新聚焦时补刷；可选短间隔轮询（仍激活时）。
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
    // 待入库角标 / 清单与 AppData 工单进度一并失效，避免仅刷完成量、已入库仍旧
    void queryClient.invalidateQueries({ queryKey: ['pendingStockPanel.stockIn'] });
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
