import { getTenantPrisma } from '../lib/prisma.js';
import { optStr, str } from '../utils/request.js';
import * as svc from '../services/todos.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import type { TodoStatus } from '../types/index.js';

export const listTodos = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const userId = req.user!.userId;
  const statusRaw = optStr(req.query.status);
  const status: TodoStatus | undefined =
    statusRaw === 'open' || statusRaw === 'done' ? statusRaw : undefined;
  res.json(await svc.listTodos(db, userId, { status }));
});

export const createTodo = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const userId = req.user!.userId;
  const record = await svc.createTodo(db, tenantId, userId, req.body);
  res.status(201).json(record);
});

export const updateTodo = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const userId = req.user!.userId;
  res.json(await svc.updateTodo(db, userId, str(req.params.id), req.body));
});

export const deleteTodo = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const userId = req.user!.userId;
  res.json(await svc.deleteTodo(db, userId, str(req.params.id)));
});
