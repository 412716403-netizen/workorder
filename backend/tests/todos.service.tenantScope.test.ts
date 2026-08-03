/**
 * 待办的租户隔离回归测试。
 *
 * 历史缺陷：待办读查询只按 userId 过滤，同一用户加入多家企业时，
 * 登录 B 企业会看到 / 能改删在 A 企业创建的待办。
 * 这里用假的 db 捕获 Prisma 参数，断言每条查询都带上 tenantId。
 */
import { describe, it, expect } from 'vitest';
import type { TenantPrismaClient } from '../src/lib/prisma.js';
import { listTodos, updateTodo, deleteTodo } from '../src/services/todos.service.js';

const TENANT_B = 'tenant-B';
const USER = 'user-1';

type Where = Record<string, unknown>;

function makeRow() {
  return {
    id: 'todo-1',
    sourceType: 'standalone',
    sourceId: null,
    sourceDocNo: null,
    sourceTitle: null,
    href: null,
    note: '在 B 企业的待办',
    remindEnabled: false,
    remindAt: null,
    status: 'open',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  };
}

/** 记录各方法收到的 where，findFirst 可配置成「查不到」以模拟跨企业访问 */
function makeDb(opts: { findFirstHit?: boolean } = {}) {
  const calls: { method: string; where: Where }[] = [];
  const row = makeRow();
  const db = {
    todoItem: {
      findMany: async (args: { where: Where }) => {
        calls.push({ method: 'findMany', where: args.where });
        return [row];
      },
      findFirst: async (args: { where: Where }) => {
        calls.push({ method: 'findFirst', where: args.where });
        return opts.findFirstHit === false ? null : row;
      },
      update: async (args: { where: Where }) => {
        calls.push({ method: 'update', where: args.where });
        return row;
      },
      delete: async (args: { where: Where }) => {
        calls.push({ method: 'delete', where: args.where });
        return row;
      },
    },
  } as unknown as TenantPrismaClient;
  return { db, calls };
}

describe('待办查询的租户作用域', () => {
  it('listTodos 同时按 tenantId + userId 过滤', async () => {
    const { db, calls } = makeDb();
    await listTodos(db, TENANT_B, USER);
    expect(calls[0].where).toMatchObject({ tenantId: TENANT_B, userId: USER });
  });

  it('listTodos 带 status 时不丢 tenantId', async () => {
    const { db, calls } = makeDb();
    await listTodos(db, TENANT_B, USER, { status: 'open' });
    expect(calls[0].where).toEqual({ tenantId: TENANT_B, userId: USER, status: 'open' });
  });

  it('updateTodo 的所有权校验带 tenantId', async () => {
    const { db, calls } = makeDb();
    await updateTodo(db, TENANT_B, USER, 'todo-1', { status: 'done' });
    const findFirst = calls.find(c => c.method === 'findFirst');
    expect(findFirst?.where).toEqual({ id: 'todo-1', tenantId: TENANT_B, userId: USER });
  });

  it('deleteTodo 的所有权校验带 tenantId', async () => {
    const { db, calls } = makeDb();
    await deleteTodo(db, TENANT_B, USER, 'todo-1');
    const findFirst = calls.find(c => c.method === 'findFirst');
    expect(findFirst?.where).toEqual({ id: 'todo-1', tenantId: TENANT_B, userId: USER });
  });

  it('跨企业操作他企业待办：查不到 → 404，且不落任何写操作', async () => {
    const { db, calls } = makeDb({ findFirstHit: false });
    await expect(updateTodo(db, TENANT_B, USER, 'todo-in-A', { status: 'done' })).rejects.toThrow(
      '待办不存在',
    );
    await expect(deleteTodo(db, TENANT_B, USER, 'todo-in-A')).rejects.toThrow('待办不存在');
    expect(calls.some(c => c.method === 'update' || c.method === 'delete')).toBe(false);
  });
});
