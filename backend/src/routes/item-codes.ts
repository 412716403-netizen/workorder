import { Router } from 'express';
import * as ctrl from '../controllers/item-codes.controller.js';

const router = Router();

router.post('/generate', ctrl.generate);
router.get('/', ctrl.list);
router.patch('/:id/void', ctrl.voidCode);
router.get('/scan/:token', ctrl.scan);

export default router;
