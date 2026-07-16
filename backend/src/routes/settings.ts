import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/settings.controller.js';
import {
  requireSubPermission,
  requireSubPermissionOrProductionRead,
  requireSubPermissionOrFinanceRead,
  requireSubPermissionOrProductionOrFinanceRead,
  requireTenantConfigEdit,
  requireTenantConfigRead,
} from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const nameRequiredSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
}).passthrough();

const updateNameSchema = z.object({
  name: z.string().min(1, '名称不能为空').optional(),
}).passthrough();

const reorderNodesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

// 收支账户类型：除 name 外还携带期初余额等主数据字段
const financeAccountTypeFields = {
  initialBalance: z.number().finite('期初余额必须为数字').optional(),
  openingDate: z.string().optional().nullable(),
  accountKind: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
};

const financeAccountTypeCreateSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  ...financeAccountTypeFields,
}).passthrough();

const financeAccountTypeUpdateSchema = z.object({
  name: z.string().min(1, '名称不能为空').optional(),
  ...financeAccountTypeFields,
}).passthrough();

const updateConfigSchema = z.object({
  value: z.unknown().refine(v => v !== undefined, { message: '配置值不能为空' }),
});

// 产品分类（列表读放宽给生产域 / 财务域：报工色码矩阵与收付款「关联产品」选择器均依赖）
router.get('/categories',      requireSubPermissionOrProductionOrFinanceRead('settings:categories:view'),   ctrl.listCategories);
router.get('/categories/usage', requireSubPermission('settings:categories:view'),  ctrl.getCategoryUsage);
router.post('/categories',     requireSubPermission('settings:categories:create'), validate(nameRequiredSchema), ctrl.createCategory);
router.put('/categories/:id',  requireSubPermission('settings:categories:edit'),   validate(updateNameSchema), ctrl.updateCategory);
router.delete('/categories/:id', requireSubPermission('settings:categories:delete'), ctrl.deleteCategory);

// 合作单位分类（财务收付款「关联合作单位」选择器 Tab）
router.get('/partner-categories',      requireSubPermissionOrFinanceRead('settings:partner_categories:view'),   ctrl.listPartnerCategories);
router.get('/partner-categories/usage', requireSubPermission('settings:partner_categories:view'),  ctrl.getPartnerCategoryUsage);
router.post('/partner-categories',     requireSubPermission('settings:partner_categories:create'), validate(nameRequiredSchema), ctrl.createPartnerCategory);
router.put('/partner-categories/:id',  requireSubPermission('settings:partner_categories:edit'),   validate(updateNameSchema), ctrl.updatePartnerCategory);
router.delete('/partner-categories/:id', requireSubPermission('settings:partner_categories:delete'), ctrl.deletePartnerCategory);

// 工序节点（列表读放宽给生产域用户：报工页工序名称 / 报工模板 / 设备与称重开关依赖节点库）
router.get('/nodes',      requireSubPermissionOrProductionRead('settings:nodes:view'),   ctrl.listNodes);
router.post('/nodes',     requireSubPermission('settings:nodes:create'), validate(nameRequiredSchema), ctrl.createNode);
router.put('/nodes/reorder', requireSubPermission('settings:nodes:edit'), validate(reorderNodesSchema), ctrl.reorderNodes);
router.put('/nodes/:id',  requireSubPermission('settings:nodes:edit'),   validate(updateNameSchema), ctrl.updateNode);
router.delete('/nodes/:id', requireSubPermission('settings:nodes:delete'), ctrl.deleteNode);

// 仓库
router.get('/warehouses',      requireSubPermission('settings:warehouses:view'),   ctrl.listWarehouses);
router.get('/warehouses/usage', requireSubPermission('settings:warehouses:view'),  ctrl.getWarehouseUsage);
router.post('/warehouses',     requireSubPermission('settings:warehouses:create'), validate(nameRequiredSchema), ctrl.createWarehouse);
router.put('/warehouses/:id',  requireSubPermission('settings:warehouses:edit'),   validate(updateNameSchema), ctrl.updateWarehouse);
router.delete('/warehouses/:id', requireSubPermission('settings:warehouses:delete'), ctrl.deleteWarehouse);

// 收付款类型（列表读放宽给财务域：登记页靠分类上的 linkProduct/linkPartner 等开关控制表单项）
router.get('/finance-categories',      requireSubPermissionOrFinanceRead('settings:finance_categories:view'),   ctrl.listFinanceCategories);
router.get('/finance-categories/usage', requireSubPermission('settings:finance_categories:view'),  ctrl.getFinanceCategoryUsage);
router.post('/finance-categories',     requireSubPermission('settings:finance_categories:create'), validate(nameRequiredSchema), ctrl.createFinanceCategory);
router.put('/finance-categories/:id',  requireSubPermission('settings:finance_categories:edit'),   validate(updateNameSchema), ctrl.updateFinanceCategory);
router.delete('/finance-categories/:id', requireSubPermission('settings:finance_categories:delete'), ctrl.deleteFinanceCategory);

// 收支账户类型（资金账户插件开启时收付款登记必选）
router.get('/finance-account-types',      requireSubPermissionOrFinanceRead('settings:finance_account_types:view'),   ctrl.listFinanceAccountTypes);
router.post('/finance-account-types',     requireSubPermission('settings:finance_account_types:create'), validate(financeAccountTypeCreateSchema), ctrl.createFinanceAccountType);
router.put('/finance-account-types/:id',  requireSubPermission('settings:finance_account_types:edit'),   validate(financeAccountTypeUpdateSchema), ctrl.updateFinanceAccountType);
router.delete('/finance-account-types/:id', requireSubPermission('settings:finance_account_types:delete'), ctrl.deleteFinanceAccountType);

// 系统配置
router.get('/config',      requireTenantConfigRead(), ctrl.getConfig);
router.put('/config/:key', requireTenantConfigEdit(), validate(updateConfigSchema), ctrl.updateConfig);

export default router;
