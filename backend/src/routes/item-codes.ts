import { Router } from 'express';
import * as ctrl from '../controllers/item-codes.controller.js';
import { requireSubPermission } from '../middleware/tenant.js';

const router = Router();

router.post('/generate', requireSubPermission('production:plans:edit'), ctrl.generate);
router.get('/', requireSubPermission('production:plans:view'), ctrl.list);
router.get('/scan/:token', requireSubPermission('production:plans:view'), ctrl.scan);
router.get('/trace/:token', requireSubPermission('production:plans:view'), ctrl.trace);

export default router;
