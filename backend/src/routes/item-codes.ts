import { Router } from 'express';
import * as ctrl from '../controllers/item-codes.controller.js';

const router = Router();

router.post('/generate', ctrl.generate);
router.get('/', ctrl.list);
router.get('/scan/:token', ctrl.scan);
router.get('/trace/:token', ctrl.trace);

export default router;
