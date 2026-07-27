import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildConversations,
  buildNotificationBubbles,
  buildTodoBubbles,
  isDueReminderTodo,
} = require('./messagesChatBuilder.js');

const HOUR = 3600 * 1000;

function todo(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    note: '核对面料',
    sourceType: 'plan',
    sourceTitle: 'PLN15 · 毛衣1',
    status: 'pending',
    remindEnabled: true,
    remindAt: new Date(Date.now() - HOUR).toISOString(),
    createdAt: new Date(Date.now() - 2 * HOUR).toISOString(),
    updatedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
    ...overrides,
  };
}

describe('messagesChatBuilder 待办提醒到点判定', () => {
  it('只认 remindEnabled 且 remindAt 已到点的待办', () => {
    expect(isDueReminderTodo(todo())).toBe(true);
    expect(isDueReminderTodo(todo({ remindEnabled: false }))).toBe(false);
    expect(isDueReminderTodo(todo({ remindAt: null }))).toBe(false);
    expect(isDueReminderTodo(todo({ remindAt: 'not-a-date' }))).toBe(false);
    expect(
      isDueReminderTodo(todo({ remindAt: new Date(Date.now() + HOUR).toISOString() })),
    ).toBe(false);
  });

  it('已完成但已到点的待办仍保留（仅删除才消失）', () => {
    const rows = buildTodoBubbles([todo({ status: 'done' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].done).toBe(true);
  });

  it('未到点的待办不进入列表', () => {
    const rows = buildTodoBubbles([
      todo({ id: 'due' }),
      todo({ id: 'later', remindAt: new Date(Date.now() + HOUR).toISOString() }),
      todo({ id: 'off', remindEnabled: false }),
    ]);
    expect(rows.map((r: { id: string }) => r.id)).toEqual(['due']);
  });

  it('时间取 remindAt，标题与备注不重复', () => {
    const [row] = buildTodoBubbles([todo({ note: 'PLN15 · 毛衣1' })]);
    expect(row.body).toBe('');
    expect(row.remindText).not.toBe('');
  });
});

describe('messagesChatBuilder 未读判定', () => {
  const notifications = [
    { id: 'n1', type: 'system', title: '公告一', body: '', createdAt: new Date().toISOString() },
    { id: 'n2', type: 'system', title: '公告二', body: '', createdAt: new Date().toISOString() },
  ];

  it('已读集合内的消息不算未读', () => {
    const rows = buildNotificationBubbles(notifications, { readIdSet: new Set(['n1']) });
    expect(rows.map((r: { unread: boolean }) => r.unread)).toEqual([false, true]);
  });

  it('待办类通知不进入消息中心（由待办会话单独承载）', () => {
    const rows = buildNotificationBubbles(
      [...notifications, { id: 'todo-1', type: 'todo', title: '待办提醒', body: '', createdAt: new Date().toISOString() }],
      { excludeTodoType: true, readIdSet: new Set() },
    );
    expect(rows.map((r: { id: string }) => r.id)).toEqual(['n1', 'n2']);
  });
});

describe('messagesChatBuilder 会话列表', () => {
  it('无到点提醒时不出现「待办事项」会话', () => {
    const built = buildConversations({
      notifications: [],
      todos: [todo({ remindAt: new Date(Date.now() + HOUR).toISOString() })],
      transfers: [],
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
    expect(built.conversations.map((c: { id: string }) => c.id)).toEqual(['notifications']);
    expect(built.openTodoCount).toBe(0);
  });

  it('有到点提醒时出现待办会话并计入角标', () => {
    const built = buildConversations({
      notifications: [],
      todos: [todo()],
      transfers: [],
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
    const todos = built.conversations.find((c: { id: string }) => c.id === 'todos');
    expect(todos).toBeTruthy();
    expect(todos.badge).toBe(1);
    expect(built.unreadCount).toBe(1);
  });
});
