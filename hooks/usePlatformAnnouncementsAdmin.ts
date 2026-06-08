import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dashboard } from '../services/api/dashboard';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';
import { useMemo } from 'react';
import { isPlatformAdmin } from '../utils/isPlatformAdmin';

export function usePlatformAnnouncementsAdmin() {
  const qc = useQueryClient();
  const { tenantCtx, currentUser } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const enabled = isPlatformAdmin(currentUser as Record<string, unknown>);
  const notificationsKey = useMemo(
    () => dashboardQueryKey(tenantId, 'notifications'),
    [tenantId],
  );
  const messagesKey = useMemo(
    () => dashboardQueryKey(tenantId, 'messages', 'platform'),
    [tenantId],
  );

  const listQuery = useQuery({
    queryKey: messagesKey,
    queryFn: () => dashboard.listPublishedMessages(),
    enabled: enabled && !!tenantId,
    staleTime: 15_000,
  });

  const publishMutation = useMutation({
    mutationFn: (body: { title: string; body: string }) => dashboard.publishMessage(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationsKey });
      void qc.invalidateQueries({ queryKey: messagesKey });
      toast.success('消息已发布至全部企业');
    },
    onError: (e: Error) => toast.error(e.message || '发布失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dashboard.deleteMessage(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationsKey });
      void qc.invalidateQueries({ queryKey: messagesKey });
      toast.success('消息已删除');
    },
    onError: (e: Error) => toast.error(e.message || '删除失败'),
  });

  return {
    messages: listQuery.data?.messages ?? [],
    isLoading: listQuery.isLoading,
    publish: publishMutation.mutate,
    isPublishing: publishMutation.isPending,
    deleteMessage: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
