import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  isTodoSourceType,
  TODO_NOTE_MAX_CHARS,
  type TodoItemDTO,
  type TodoSourceType,
  type TodoStatus,
} from '../types/index.js';

/** Prisma todo_items 行（仅选用字段，避免依赖生成类型） */
interface TodoRow {
  id: string;
  sourceType: string;
  sourceId: string | null;
  sourceDocNo: string | null;
  sourceTitle: string | null;
  href: string | null;
  note: string;
  remindEnabled: boolean;
  remindAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDTO(row: TodoRow): TodoItemDTO {
  return {
    id: row.id,
    sourceType: (isTodoSourceType(row.sourceType) ? row.sourceType : 'standalone') as TodoSourceType,
    sourceId: row.sourceId,
    sourceDocNo: row.sourceDocNo,
    sourceTitle: row.sourceTitle,
    href: row.href,
    note: row.note,
    remindEnabled: row.remindEnabled,
    remindAt: row.remindAt ? row.remindAt.toISOString() : null,
    status: (row.status === 'done' ? 'done' : 'open') as TodoStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const SELECT = {
  id: true,
  sourceType: true,
  sourceId: true,
  sourceDocNo: true,
  sourceTitle: true,
  href: true,
  note: true,
  remindEnabled: true,
  remindAt: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface TodoCreateInput {
  sourceType?: unknown;
  sourceId?: unknown;
  sourceDocNo?: unknown;
  sourceTitle?: unknown;
  href?: unknown;
  note?: unknown;
  remindEnabled?: unknown;
  remindAt?: unknown;
}

export interface TodoUpdateInput {
  note?: unknown;
  remindEnabled?: unknown;
  remindAt?: unknown;
  status?: unknown;
}

function normalizeNote(value: unknown): string {
  const note = typeof value === 'string' ? value.trim() : '';
  if (!note) throw new AppError(400, '待办内容不能为空');
  if (note.length > TODO_NOTE_MAX_CHARS) {
    throw new AppError(400, `待办内容最多 ${TODO_NOTE_MAX_CHARS} 字`);
  }
  return note;
}

function normalizeOptStr(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** 解析提醒：开启时必须给将来的有效时间 */
function normalizeRemind(
  remindEnabled: unknown,
  remindAt: unknown,
): { remindEnabled: boolean; remindAt: Date | null } {
  const enabled = remindEnabled === true || remindEnabled === 'true';
  if (!enabled) return { remindEnabled: false, remindAt: null };
  if (typeof remindAt !== 'string' || !remindAt.trim()) {
    throw new AppError(400, '开启提醒时必须设置提醒时间');
  }
  const at = new Date(remindAt);
  if (Number.isNaN(at.getTime())) {
    throw new AppError(400, '提醒时间格式不正确');
  }
  if (at.getTime() <= Date.now()) {
    throw new AppError(400, '提醒时间必须晚于当前时间');
  }
  return { remindEnabled: true, remindAt: at };
}

export async function listTodos(
  db: TenantPrismaClient,
  userId: string,
  opts: { status?: TodoStatus } = {},
): Promise<TodoItemDTO[]> {
  const rows = (await db.todoItem.findMany({
    where: { userId, ...(opts.status ? { status: opts.status } : {}) },
    select: SELECT,
    // 按建立时间倒序：最新建立的排第一个
    orderBy: { createdAt: 'desc' },
    take: 200,
  })) as TodoRow[];
  return rows.map(toDTO);
}

export async function createTodo(
  db: TenantPrismaClient,
  tenantId: string,
  userId: string,
  input: TodoCreateInput,
): Promise<TodoItemDTO> {
  const note = normalizeNote(input.note);
  const sourceType: TodoSourceType = isTodoSourceType(input.sourceType)
    ? input.sourceType
    : 'standalone';
  const { remindEnabled, remindAt } = normalizeRemind(input.remindEnabled, input.remindAt);

  const row = (await db.todoItem.create({
    data: {
      tenantId,
      userId,
      sourceType,
      sourceId: sourceType === 'standalone' ? null : normalizeOptStr(input.sourceId, 50),
      sourceDocNo: normalizeOptStr(input.sourceDocNo, 100),
      sourceTitle: normalizeOptStr(input.sourceTitle, 200),
      href: typeof input.href === 'string' && input.href.trim() ? input.href.trim() : null,
      note,
      remindEnabled,
      remindAt,
      status: 'open',
    },
    select: SELECT,
  })) as TodoRow;
  return toDTO(row);
}

/** 仅能改自己的待办；不存在或非本人则 404 */
async function findOwn(db: TenantPrismaClient, userId: string, id: string): Promise<TodoRow> {
  const row = (await db.todoItem.findFirst({
    where: { id, userId },
    select: SELECT,
  })) as TodoRow | null;
  if (!row) throw new AppError(404, '待办不存在');
  return row;
}

export async function updateTodo(
  db: TenantPrismaClient,
  userId: string,
  id: string,
  patch: TodoUpdateInput,
): Promise<TodoItemDTO> {
  const existing = await findOwn(db, userId, id);

  const data: Record<string, unknown> = {};

  if (patch.note !== undefined) {
    data.note = normalizeNote(patch.note);
  }

  if (patch.remindEnabled !== undefined || patch.remindAt !== undefined) {
    const enabledInput = patch.remindEnabled !== undefined ? patch.remindEnabled : existing.remindEnabled;
    const remindAtInput =
      patch.remindAt !== undefined
        ? patch.remindAt
        : existing.remindAt
          ? existing.remindAt.toISOString()
          : null;
    const { remindEnabled, remindAt } = normalizeRemind(enabledInput, remindAtInput);
    data.remindEnabled = remindEnabled;
    data.remindAt = remindAt;
    // 重新设置提醒时清空已提醒标记，使其可再次提醒
    data.remindedAt = null;
  }

  if (patch.status !== undefined) {
    const status = patch.status === 'done' ? 'done' : 'open';
    data.status = status;
  }

  const row = (await db.todoItem.update({
    where: { id },
    data,
    select: SELECT,
  })) as TodoRow;
  return toDTO(row);
}

export async function deleteTodo(
  db: TenantPrismaClient,
  userId: string,
  id: string,
): Promise<{ id: string }> {
  await findOwn(db, userId, id);
  await db.todoItem.delete({ where: { id } });
  return { id };
}
