import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/finance.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createRecordSchema = z.object({
  type: z.string().min(1, '记录类型不能为空'),
  amount: z.number({ required_error: '金额不能为空' }),
}).passthrough();

const updateRecordSchema = z.object({}).passthrough();

router.get('/records', ctrl.listRecords);
router.get('/records/:id', ctrl.getRecord);
router.post('/records', validate(createRecordSchema), ctrl.createRecord);
router.put('/records/:id', validate(updateRecordSchema), ctrl.updateRecord);
router.delete('/records/:id', ctrl.deleteRecord);

export default router;
