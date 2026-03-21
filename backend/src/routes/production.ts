import { Router } from 'express';
import * as ctrl from '../controllers/production.controller.js';

const router = Router();

router.get('/records', ctrl.listRecords);
router.get('/records/:id', ctrl.getRecord);
router.post('/records', ctrl.createRecord);
router.put('/records/:id', ctrl.updateRecord);
router.delete('/records/:id', ctrl.deleteRecord);

router.get('/defective-rework', ctrl.getDefectiveRework);

export default router;
