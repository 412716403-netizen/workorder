import { Router } from 'express';
import * as ctrl from '../controllers/settings.controller.js';
import { requireSubPermission } from '../middleware/tenant.js';

const router = Router();

// 产品分类
router.get('/categories',      requireSubPermission('settings:categories:view'),   ctrl.listCategories);
router.post('/categories',     requireSubPermission('settings:categories:create'), ctrl.createCategory);
router.put('/categories/:id',  requireSubPermission('settings:categories:edit'),   ctrl.updateCategory);
router.delete('/categories/:id', requireSubPermission('settings:categories:delete'), ctrl.deleteCategory);

// 合作单位分类
router.get('/partner-categories',      requireSubPermission('settings:partner_categories:view'),   ctrl.listPartnerCategories);
router.post('/partner-categories',     requireSubPermission('settings:partner_categories:create'), ctrl.createPartnerCategory);
router.put('/partner-categories/:id',  requireSubPermission('settings:partner_categories:edit'),   ctrl.updatePartnerCategory);
router.delete('/partner-categories/:id', requireSubPermission('settings:partner_categories:delete'), ctrl.deletePartnerCategory);

// 工序节点
router.get('/nodes',      requireSubPermission('settings:nodes:view'),   ctrl.listNodes);
router.post('/nodes',     requireSubPermission('settings:nodes:create'), ctrl.createNode);
router.put('/nodes/:id',  requireSubPermission('settings:nodes:edit'),   ctrl.updateNode);
router.delete('/nodes/:id', requireSubPermission('settings:nodes:delete'), ctrl.deleteNode);

// 仓库
router.get('/warehouses',      requireSubPermission('settings:warehouses:view'),   ctrl.listWarehouses);
router.post('/warehouses',     requireSubPermission('settings:warehouses:create'), ctrl.createWarehouse);
router.put('/warehouses/:id',  requireSubPermission('settings:warehouses:edit'),   ctrl.updateWarehouse);
router.delete('/warehouses/:id', requireSubPermission('settings:warehouses:delete'), ctrl.deleteWarehouse);

// 收付款类型
router.get('/finance-categories',      requireSubPermission('settings:finance_categories:view'),   ctrl.listFinanceCategories);
router.post('/finance-categories',     requireSubPermission('settings:finance_categories:create'), ctrl.createFinanceCategory);
router.put('/finance-categories/:id',  requireSubPermission('settings:finance_categories:edit'),   ctrl.updateFinanceCategory);
router.delete('/finance-categories/:id', requireSubPermission('settings:finance_categories:delete'), ctrl.deleteFinanceCategory);

// 收支账户类型
router.get('/finance-account-types',      requireSubPermission('settings:finance_account_types:view'),   ctrl.listFinanceAccountTypes);
router.post('/finance-account-types',     requireSubPermission('settings:finance_account_types:create'), ctrl.createFinanceAccountType);
router.put('/finance-account-types/:id',  requireSubPermission('settings:finance_account_types:edit'),   ctrl.updateFinanceAccountType);
router.delete('/finance-account-types/:id', requireSubPermission('settings:finance_account_types:delete'), ctrl.deleteFinanceAccountType);

// 系统配置
router.get('/config',      requireSubPermission('settings:config:view'), ctrl.getConfig);
router.put('/config/:key', requireSubPermission('settings:config:edit'), ctrl.updateConfig);

export default router;
