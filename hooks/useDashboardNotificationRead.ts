import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  markDashboardNotificationReadAndSync,
  readDashboardNotificationIds,
  syncDashboardNotificationReads,
} from '../utils/dashboardNotificationRead';

export function useDashboardNotificationRead() {
  const { tenantCtx, currentUser } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const userId = currentUser?.id != null ? String(currentUser.id) : undefined;

  const [readRevision, setReadRevision] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    void syncDashboardNotificationReads(tenantId, userId).then(() => {
      if (!cancelled) setReadRevision(v => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, userId]);

  const readIds = useMemo(() => {
    void readRevision;
    return readDashboardNotificationIds(tenantId, userId);
  }, [tenantId, userId, readRevision]);

  const isRead = useCallback(
    (messageId: string) => readIds.has(messageId),
    [readIds],
  );

  const markRead = useCallback(
    (messageId: string) => {
      markDashboardNotificationReadAndSync(tenantId, userId, messageId);
      setReadRevision(v => v + 1);
    },
    [tenantId, userId],
  );

  return { isRead, markRead, readIds };
}
