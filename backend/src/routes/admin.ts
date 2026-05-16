import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as adminUsersCtrl from '../controllers/adminUsers.controller.js';

const router = Router();

const createSchema = z.object({
  username: z.string().min(2).max(50),
  password: z.string().min(6).max(100),
  displayName: z.string().max(100).optional(),
  email: z.string().email().max(255).optional().nullable(),
  role: z.enum(['admin', 'user']).optional(),
  /** ISO 日期时间；null 表示永不到期 */
  accountExpiresAt: z.union([z.string().min(1), z.null()]).optional(),
});

const updateSchema = z
  .object({
    displayName: z.string().max(100).optional(),
    email: z.union([z.string().email().max(255), z.literal(''), z.null()]).optional(),
    role: z.enum(['admin', 'user']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    password: z.union([z.string().min(6).max(100), z.literal('')]).optional(),
    accountExpiresAt: z.union([z.string().min(1), z.null()]).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: '至少提供一项要修改的字段' });

router.get('/users', adminUsersCtrl.list);
router.post('/users', validate(createSchema), adminUsersCtrl.create);
router.put('/users/:id', validate(updateSchema), adminUsersCtrl.update);
router.delete('/users/:id', adminUsersCtrl.remove);

const tenantUpdateSchema = z
  .object({
    expiresAt: z.union([z.string().min(1), z.null()]).optional(),
    status: z.enum(['active', 'rejected', 'pending']).optional(),
    /** 企业是否启用设备模块（设备档案 + 派工/报工选设备） */
    equipmentModuleEnabled: z.boolean().optional(),
    /** 行业类型：与 `shared/types` 中 `TenantIndustryKind` 一致 */
    industryKind: z.enum(['generic', 'sweater_factory']).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: '至少提供一项要修改的字段' });

router.get('/tenants', adminUsersCtrl.listTenants);
router.put('/tenants/:id', validate(tenantUpdateSchema), adminUsersCtrl.updateTenant);

export default router;
