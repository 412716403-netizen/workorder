import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/finance.controller.js';
import { validate } from '../middleware/validate.js';
import { requireSubPermission } from '../middleware/tenant.js';

const router = Router();

const createRecordSchema = z.object({
  type: z.string().min(1, '记录类型不能为空'),
  amount: z.number({ required_error: '金额不能为空' }),
}).passthrough();

const updateRecordSchema = z.object({}).passthrough();

/**
 * Phase 3.E follow-up：财务路由收紧到细粒度。
 * 持有顶级 `finance` 模块码的用户会通过 `hasSubPermission` 兜底覆盖全部子权限，
 * 无 breaking change；但能让前端按钮级权限真正在后端拦下。
 */
router.get('/records', requireSubPermission('finance:records:view'), ctrl.listRecords);
router.get('/summary', requireSubPermission('finance:reconciliation:allow'), ctrl.summary);
/**
 * Phase 3.D follow-up：销售单打印应收 ledger 窄查；
 * 仅需 PSI 销售单查看权限即可（与打印链路保持一致）。
 */
router.get(
  '/partner-receivable',
  requireSubPermission('psi:sales_bill:view'),
  ctrl.partnerReceivable,
);
/** 合作单位对账「上期余额」窄查；与 partner-receivable 同 controller，权限走对账模块 */
router.get(
  '/reconciliation/partner-opening-balance',
  requireSubPermission('finance:reconciliation:allow'),
  ctrl.partnerReceivable,
);
router.get('/records/:id', requireSubPermission('finance:records:view'), ctrl.getRecord);
router.post(
  '/records',
  requireSubPermission('finance:records:create'),
  validate(createRecordSchema),
  ctrl.createRecord,
);
router.put(
  '/records/:id',
  requireSubPermission('finance:records:edit'),
  validate(updateRecordSchema),
  ctrl.updateRecord,
);
router.delete(
  '/records/:id',
  requireSubPermission('finance:records:delete'),
  ctrl.deleteRecord,
);

export default router;
