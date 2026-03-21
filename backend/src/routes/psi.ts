import { Router } from 'express';
import * as ctrl from '../controllers/psi.controller.js';

const router = Router();

router.get('/records', ctrl.listRecords);
router.post('/records/batch', ctrl.createBatchRecords);
router.post('/records', ctrl.createRecord);
router.put('/records/replace', ctrl.replaceRecords);
router.put('/records/:id', ctrl.updateRecord);
router.delete('/records', ctrl.deleteBatchRecords);
router.delete('/records/:id', ctrl.deleteRecord);

router.get('/stock', ctrl.getStock);

export default router;
