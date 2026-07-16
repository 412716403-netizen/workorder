import { Router } from 'express';
import * as ctrl from '../controllers/plan-virtual-batches.controller.js';
import { requireSubPermission, requireSubPermissionOrProductionRead } from '../middleware/tenant.js';

const router = Router();

router.post('/bulk-split-all', requireSubPermission('production:plans:edit'), ctrl.bulkSplitAllVariants);
router.post('/bulk-split', requireSubPermission('production:plans:edit'), ctrl.bulkSplit);
router.post('/', requireSubPermission('production:plans:edit'), ctrl.create);
router.get('/subtree-allocations', requireSubPermission('production:plans:view'), ctrl.subtreeAllocations);
// 扫码解析/追溯为报工、入库、返工、外协收货共用的只读端点，放宽给生产域用户（含仅「工序报工」的工人）
router.get('/scan/:token', requireSubPermissionOrProductionRead('production:plans:view'), ctrl.scan);
router.get('/trace/:token', requireSubPermissionOrProductionRead('production:plans:view'), ctrl.trace);
router.get('/', requireSubPermission('production:plans:view'), ctrl.list);

export default router;
