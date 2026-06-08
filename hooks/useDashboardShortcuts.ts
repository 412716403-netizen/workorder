import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dashboard } from '../services/api/dashboard';
import {
  resolveShortcutItems,
  WORKBENCH_SHORTCUT_CATALOG,
  DEFAULT_DASHBOARD_SHORTCUT_IDS,
} from '../types';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';

export function useDashboardShortcuts() {
  const qc = useQueryClient();
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const shortcutsKey = useMemo(() => dashboardQueryKey(tenantId, 'shortcuts'), [tenantId]);

  const query = useQuery({
    queryKey: shortcutsKey,
    queryFn: () => dashboard.getShortcuts(),
    staleTime: 30_000,
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: (ids: string[]) => dashboard.saveShortcuts(ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: shortcutsKey });
      toast.success('快捷入口已保存');
    },
    onError: (e: Error) => toast.error(e.message || '保存失败'),
  });

  const selectedIds = query.data?.selected ?? DEFAULT_DASHBOARD_SHORTCUT_IDS;

  return {
    isLoading: query.isLoading,
    selectedIds,
    catalog: WORKBENCH_SHORTCUT_CATALOG,
    items: resolveShortcutItems(selectedIds),
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    refetch: query.refetch,
  };
}
