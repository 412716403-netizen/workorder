import { request } from './_client';
import type { TodoItemDTO, TodoStatus, TodoSourceType } from '../../types';

export interface TodoCreatePayload {
  sourceType?: TodoSourceType;
  sourceId?: string | null;
  sourceDocNo?: string | null;
  sourceTitle?: string | null;
  href?: string | null;
  note: string;
  remindEnabled?: boolean;
  remindAt?: string | null;
}

export interface TodoUpdatePayload {
  note?: string;
  remindEnabled?: boolean;
  remindAt?: string | null;
  status?: TodoStatus;
}

export const todos = {
  list: (params: { status?: TodoStatus } = {}) => {
    const qs = params.status ? `?status=${params.status}` : '';
    return request<TodoItemDTO[]>(`/todos${qs}`);
  },
  create: (body: TodoCreatePayload) =>
    request<TodoItemDTO>('/todos', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: TodoUpdatePayload) =>
    request<TodoItemDTO>(`/todos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    request<{ id: string }>(`/todos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
