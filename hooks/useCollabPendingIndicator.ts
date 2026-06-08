import { useEffect, useRef, useState } from 'react';
import * as api from '../services/api';

/**
 * 侧边栏「协作管理」红点指标：
 * 当且仅当当前用户 *自身* 有待办（需要我点确认/接受/转发/收回）时返回 true，
 * 等待对方操作（例如我已派发等乙方接受）的情况不亮红点。
 *
 * 为避免大文件 polling 过于激进，默认每 60s 轻量刷新一次；仅在用户路由在「协作管理」外时轮询。
 */
export function useCollabPendingIndicator(
  tenantKey: string | null | undefined,
  enabled = true,
): boolean {
  const [hasPending, setHasPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setHasPending(false);
      return;
    }
    let cancelled = false;
    const fetchOnce = async () => {
      if (!tenantKey) { setHasPending(false); return; }
      try {
        const list: any[] = await api.collaboration.listTransfers({});
        if (cancelled) return;
        let pending = false;
        for (const t of list) {
          if (pending) break;
          const iAmReceiver = t.receiverTenantName === '本企业';
          const iAmSender = t.senderTenantName === '本企业';
          if (iAmReceiver && Array.isArray(t.dispatches)) {
            if (t.dispatches.some((d: any) => d.status === 'PENDING')) { pending = true; break; }
          }
          if (iAmSender && Array.isArray(t.returns)) {
            if (t.returns.some((r: any) => r.status === 'PENDING_A_RECEIVE')) { pending = true; break; }
          }
          if (
            iAmSender
            && t.outsourceRouteSnapshot
            && (t.chainStep ?? 0) > 0
            && !t.originConfirmedAt
          ) { pending = true; break; }
        }
        setHasPending(pending);
      } catch {
        // ignore; 下一轮再尝试
      }
    };
    fetchOnce();
    timerRef.current = setInterval(fetchOnce, 60_000);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tenantKey, enabled]);

  return hasPending;
}
