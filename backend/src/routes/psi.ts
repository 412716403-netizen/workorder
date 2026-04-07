import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/psi.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const psiRecordSchema = z.object({
  type: z.string().min(1, '记录类型不能为空'),
  docNumber: z.string().optional(),
}).passthrough();

const createBatchSchema = z.object({
  records: z.array(psiRecordSchema).min(1, '至少需要一条记录'),
});

const replaceSchema = z.object({
  deleteIds: z.array(z.string()).optional(),
  newRecords: z.array(z.object({}).passthrough()).optional(),
});

const deleteBatchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, '至少选择一条记录'),
});

router.get('/records', ctrl.listRecords);
router.post('/records/batch', validate(createBatchSchema), ctrl.createBatchRecords);
router.post('/records', validate(psiRecordSchema), ctrl.createRecord);
router.put('/records/replace', validate(replaceSchema), ctrl.replaceRecords);
router.put('/records/:id', ctrl.updateRecord);
router.delete('/records', validate(deleteBatchSchema), ctrl.deleteBatchRecords);
router.delete('/records/:id', ctrl.deleteRecord);

router.get('/stock', ctrl.getStock);

export default router;
