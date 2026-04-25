import { Router } from 'express';
import * as ctrl from '../controllers/plan-virtual-batches.controller.js';
import { requireSubPermission } from '../middleware/tenant.js';

const router = Router();

router.post('/bulk-split-all', requireSubPermission('production:plans:edit'), ctrl.bulkSplitAllVariants);
router.post('/bulk-split', requireSubPermission('production:plans:edit'), ctrl.bulkSplit);
router.post('/', requireSubPermission('production:plans:edit'), ctrl.create);
router.get('/subtree-allocations', requireSubPermission('production:plans:view'), ctrl.subtreeAllocations);
router.get('/scan/:token', requireSubPermission('production:plans:view'), ctrl.scan);
router.get('/trace/:token', requireSubPermission('production:plans:view'), ctrl.trace);
router.get('/', requireSubPermission('production:plans:view'), ctrl.list);

export default router;
