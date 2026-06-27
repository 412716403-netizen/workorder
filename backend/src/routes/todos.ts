import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/todos.controller.js';
import { validate } from '../middleware/validate.js';
import { TODO_NOTE_MAX_CHARS, TODO_SOURCE_TYPES } from '../types/index.js';

/**
 * 待办提醒（todo_reminder 插件）。
 * 个人 / 工作台级功能：与 dashboard 路由一致，仅挂 authMiddleware + requireTenant，
 * 不挂 requireSubPermission —— 待办按 userId 作用域隔离，无需管理员单独授权。
 * 可见性由前端 featurePlugins.todo_reminder 开关控制。
 */
const router = Router();

const createTodoSchema = z.object({
  sourceType: z.enum(TODO_SOURCE_TYPES).optional(),
  sourceId: z.string().max(50).optional().nullable(),
  sourceDocNo: z.string().max(100).optional().nullable(),
  sourceTitle: z.string().max(200).optional().nullable(),
  href: z.string().max(2000).optional().nullable(),
  note: z.string().trim().min(1).max(TODO_NOTE_MAX_CHARS),
  remindEnabled: z.boolean().optional(),
  remindAt: z.string().optional().nullable(),
}).passthrough();

const updateTodoSchema = z.object({
  note: z.string().trim().min(1).max(TODO_NOTE_MAX_CHARS).optional(),
  remindEnabled: z.boolean().optional(),
  remindAt: z.string().optional().nullable(),
  status: z.enum(['open', 'done']).optional(),
}).passthrough();

router.get('/', ctrl.listTodos);
router.post('/', validate(createTodoSchema), ctrl.createTodo);
router.patch('/:id', validate(updateTodoSchema), ctrl.updateTodo);
router.delete('/:id', ctrl.deleteTodo);

export default router;
