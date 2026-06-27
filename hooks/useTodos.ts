import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { todos, type TodoCreatePayload, type TodoUpdatePayload } from '../services/api/todos';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';
import { useMemo } from 'react';
import type { TodoStatus } from '../types';
import type { DashboardNotification } from '../services/api/dashboard';

export function useTodos(opts: { status?: TodoStatus; enabled?: boolean } = {}) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const qc = useQueryClient();

  const queryKey = useMemo(
    () => dashboardQueryKey(tenantId, 'todos', opts.status ?? 'all'),
    [tenantId, opts.status],
  );

  const query = useQuery({
    queryKey,
    queryFn: () => todos.list({ status: opts.status }),
    staleTime: 30_000,
    enabled: !!tenantId && opts.enabled !== false,
  });

  /** 增删改后刷新所有待办列表分页 + 消息中心（提醒来自同一数据源） */
  function invalidateAll() {
    void qc.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'todos') });
    void qc.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'notifications') });
  }

  /** 删除待办时把其到点提醒从消息中心缓存中移除（完成不移除，仅删除移除） */
  function dropTodoNotification(todoId: string) {
    qc.setQueryData<DashboardNotification[]>(
      dashboardQueryKey(tenantId, 'notifications'),
      (old) => old?.filter(n => n.id !== `todo-${todoId}`),
    );
  }

  const createMutation = useMutation({
    mutationFn: (body: TodoCreatePayload) => todos.create(body),
    onSuccess: invalidateAll,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TodoUpdatePayload }) => todos.update(id, body),
    onSuccess: invalidateAll,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => todos.remove(id),
    onSuccess: (_data, id) => {
      // 待办被删除才从消息中心移除；完成的待办仍保留显示
      dropTodoNotification(id);
      invalidateAll();
    },
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
    createTodo: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateTodo: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    removeTodo: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  };
}
