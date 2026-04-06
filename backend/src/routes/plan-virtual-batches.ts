import { Router } from 'express';
import * as ctrl from '../controllers/plan-virtual-batches.controller.js';

const router = Router();

router.post('/bulk-split-all', ctrl.bulkSplitAllVariants);
router.post('/bulk-split', ctrl.bulkSplit);
router.post('/', ctrl.create);
router.get('/scan/:token', ctrl.scan);
router.get('/', ctrl.list);
router.patch('/:id/void', ctrl.voidBatch);

export default router;
