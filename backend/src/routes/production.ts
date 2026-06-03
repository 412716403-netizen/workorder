import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/production.controller.js';
import { validate } from '../middleware/validate.js';
import { requireProductionRead, requireProductionWrite } from '../middleware/tenant.js';

const router = Router();

const createRecordSchema = z.object({
  type: z.string().min(1, '记录类型不能为空'),
}).passthrough();

const createBatchSchema = z.object({
  records: z.array(createRecordSchema).min(1, '至少需要一条记录'),
});

const updateRecordSchema = z.object({}).passthrough();

/**
 * 通用 `/production/records*` 端点：承载报工 / 领退料 / 外协收发 / 返工 / 待入库等所有生产流水。
 * 历史挂 `production:records:*`，但权限树无 `records` 子模块，细粒度生产角色拿不到 → 全部 403。
 * 改为按生产域能力判断（详见 middleware/tenant.ts requireProductionRead / requireProductionWrite）：
 *   读 → 任意 production/process_report 权限；写 → 任意非只读 production 子权限或 process_report；
 *   删 → 任意 production 删除类子权限。前端已按 orders / material / outsource / rework 等细粒度各自 gating。
 */
router.get('/records', requireProductionRead(), ctrl.listRecords);
router.get('/summary', requireProductionRead(), ctrl.summary);
router.get('/records/:id', requireProductionRead(), ctrl.getRecord);
router.post(
  '/records/batch',
  requireProductionWrite('write'),
  validate(createBatchSchema),
  ctrl.createRecordBatch,
);
router.post(
  '/records',
  requireProductionWrite('write'),
  validate(createRecordSchema),
  ctrl.createRecord,
);
router.put(
  '/records/:id',
  requireProductionWrite('write'),
  validate(updateRecordSchema),
  ctrl.updateRecord,
);
router.delete(
  '/records/:id',
  requireProductionWrite('delete'),
  ctrl.deleteRecord,
);

router.get(
  '/defective-rework',
  requireProductionRead(),
  ctrl.getDefectiveRework,
);

export default router;
