import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/settings.controller.js';
import { requireSubPermission } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const nameRequiredSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
}).passthrough();

const updateNameSchema = z.object({
  name: z.string().min(1, '名称不能为空').optional(),
}).passthrough();

const updateConfigSchema = z.object({
  value: z.unknown().refine(v => v !== undefined, { message: '配置值不能为空' }),
});

// 产品分类
router.get('/categories',      requireSubPermission('settings:categories:view'),   ctrl.listCategories);
router.post('/categories',     requireSubPermission('settings:categories:create'), validate(nameRequiredSchema), ctrl.createCategory);
router.put('/categories/:id',  requireSubPermission('settings:categories:edit'),   validate(updateNameSchema), ctrl.updateCategory);
router.delete('/categories/:id', requireSubPermission('settings:categories:delete'), ctrl.deleteCategory);

// 合作单位分类
router.get('/partner-categories',      requireSubPermission('settings:partner_categories:view'),   ctrl.listPartnerCategories);
router.post('/partner-categories',     requireSubPermission('settings:partner_categories:create'), validate(nameRequiredSchema), ctrl.createPartnerCategory);
router.put('/partner-categories/:id',  requireSubPermission('settings:partner_categories:edit'),   validate(updateNameSchema), ctrl.updatePartnerCategory);
router.delete('/partner-categories/:id', requireSubPermission('settings:partner_categories:delete'), ctrl.deletePartnerCategory);

// 工序节点
router.get('/nodes',      requireSubPermission('settings:nodes:view'),   ctrl.listNodes);
router.post('/nodes',     requireSubPermission('settings:nodes:create'), validate(nameRequiredSchema), ctrl.createNode);
router.put('/nodes/:id',  requireSubPermission('settings:nodes:edit'),   validate(updateNameSchema), ctrl.updateNode);
router.delete('/nodes/:id', requireSubPermission('settings:nodes:delete'), ctrl.deleteNode);

// 仓库
router.get('/warehouses',      requireSubPermission('settings:warehouses:view'),   ctrl.listWarehouses);
router.post('/warehouses',     requireSubPermission('settings:warehouses:create'), validate(nameRequiredSchema), ctrl.createWarehouse);
router.put('/warehouses/:id',  requireSubPermission('settings:warehouses:edit'),   validate(updateNameSchema), ctrl.updateWarehouse);
router.delete('/warehouses/:id', requireSubPermission('settings:warehouses:delete'), ctrl.deleteWarehouse);

// 收付款类型
router.get('/finance-categories',      requireSubPermission('settings:finance_categories:view'),   ctrl.listFinanceCategories);
router.post('/finance-categories',     requireSubPermission('settings:finance_categories:create'), validate(nameRequiredSchema), ctrl.createFinanceCategory);
router.put('/finance-categories/:id',  requireSubPermission('settings:finance_categories:edit'),   validate(updateNameSchema), ctrl.updateFinanceCategory);
router.delete('/finance-categories/:id', requireSubPermission('settings:finance_categories:delete'), ctrl.deleteFinanceCategory);

// 收支账户类型
router.get('/finance-account-types',      requireSubPermission('settings:finance_account_types:view'),   ctrl.listFinanceAccountTypes);
router.post('/finance-account-types',     requireSubPermission('settings:finance_account_types:create'), validate(nameRequiredSchema), ctrl.createFinanceAccountType);
router.put('/finance-account-types/:id',  requireSubPermission('settings:finance_account_types:edit'),   validate(updateNameSchema), ctrl.updateFinanceAccountType);
router.delete('/finance-account-types/:id', requireSubPermission('settings:finance_account_types:delete'), ctrl.deleteFinanceAccountType);

// 系统配置
router.get('/config',      requireSubPermission('settings:config:view'), ctrl.getConfig);
router.put('/config/:key', requireSubPermission('settings:config:edit'), validate(updateConfigSchema), ctrl.updateConfig);

export default router;
