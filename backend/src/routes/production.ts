import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/production.controller.js';
import { validate } from '../middleware/validate.js';
import { requireSubPermission } from '../middleware/tenant.js';

const router = Router();

const createRecordSchema = z.object({
  type: z.string().min(1, '记录类型不能为空'),
}).passthrough();

const createBatchSchema = z.object({
  records: z.array(createRecordSchema).min(1, '至少需要一条记录'),
});

const updateRecordSchema = z.object({}).passthrough();

/**
 * Phase 3.E follow-up：把生产流水路由从「仅入口模块级 production」收紧到细粒度。
 * `hasSubPermission` 对持有顶级模块码（如 `production`）的用户视为持有全部 sub，
 * 因此该改动对现有授权用户无破坏；但能让前端按钮级权限在后端落到实处，
 * 也避免新增 `records/batch` 之类的写端点裸跑。
 */
router.get('/records', requireSubPermission('production:records:view'), ctrl.listRecords);
router.get('/summary', requireSubPermission('production:records:view'), ctrl.summary);
router.get('/records/:id', requireSubPermission('production:records:view'), ctrl.getRecord);
router.post(
  '/records/batch',
  requireSubPermission('production:records:create'),
  validate(createBatchSchema),
  ctrl.createRecordBatch,
);
router.post(
  '/records',
  requireSubPermission('production:records:create'),
  validate(createRecordSchema),
  ctrl.createRecord,
);
router.put(
  '/records/:id',
  requireSubPermission('production:records:edit'),
  validate(updateRecordSchema),
  ctrl.updateRecord,
);
router.delete(
  '/records/:id',
  requireSubPermission('production:records:delete'),
  ctrl.deleteRecord,
);

router.get(
  '/defective-rework',
  requireSubPermission('production:records:view'),
  ctrl.getDefectiveRework,
);

export default router;
