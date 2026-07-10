import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';
import { hasWorkbenchNavAccess } from '../types';

/**
 * 侧栏「工作台」入口：以服务端 GET /dashboard/workbench 的 canAccess 为准，
 * 避免 localStorage 残留权限导致取消授权后仍显示入口。
 */
export function useWorkbenchAccess(): boolean {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const localAllowed = hasWorkbenchNavAccess(tenantCtx?.permissions, tenantCtx?.tenantRole);
  const permKey = useMemo(() => {
    const perms = tenantCtx?.permissions ?? [];
    return perms
      .filter(p => p === 'workbench' || p.startsWith('workbench:'))
      .sort()
      .join('|');
  }, [tenantCtx?.permissions]);

  const query = useQuery({
    queryKey: dashboardQueryKey(tenantId, 'workbench', permKey),
    queryFn: () => dashboard.getWorkbench(),
    staleTime: 0,
    enabled: !!tenantId,
  });

  if (query.data && typeof query.data.canAccess === 'boolean') {
    return query.data.canAccess;
  }
  // 请求中或失败时回落本地预判（owner 仍可进）
  return localAllowed;
}
