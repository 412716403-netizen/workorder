import { Router } from 'express';
import * as ctrl from '../controllers/finance.controller.js';

const router = Router();

router.get('/records', ctrl.listRecords);
router.get('/records/:id', ctrl.getRecord);
router.post('/records', ctrl.createRecord);
router.put('/records/:id', ctrl.updateRecord);
router.delete('/records/:id', ctrl.deleteRecord);

export default router;
