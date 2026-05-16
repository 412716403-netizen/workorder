import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/item-codes.controller.js';
import { requireSubPermission } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.post('/generate', requireSubPermission('production:plans:edit'), ctrl.generate);
router.get('/', requireSubPermission('production:plans:view'), ctrl.list);
router.get('/scan/:token', requireSubPermission('production:plans:view'), ctrl.scan);
router.get('/trace/:token', requireSubPermission('production:plans:view'), ctrl.trace);

/**
 * 扫码二次校验（持久化去重 + 单据上限）。
 * 与「报工 / 入库 / 返工 / 外协收货」共用：前端在扫码成功后、写表/累加数量前调用。
 * 写入路径仍由各 service 调 `assertScanNotAlreadyUsed` 兜底，故权限按最宽的 view 即可。
 */
const validateScanUsageSchema = z.object({
  purpose: z.enum(['MILESTONE_REPORT', 'PRODUCT_REPORT', 'STOCK_IN', 'REWORK_REPORT', 'OUTSOURCE_RECEIVE']),
  scope: z.object({
    milestoneId: z.string().optional(),
    productId: z.string().optional(),
    milestoneTemplateId: z.string().optional(),
    variantId: z.string().nullable().optional(),
    orderId: z.string().optional(),
    orderIds: z.array(z.string()).optional(),
    sourceReworkId: z.string().optional(),
    nodeId: z.string().optional(),
    partner: z.string().optional(),
    docNo: z.string().optional(),
    excludeRecordId: z.string().optional(),
  }),
  itemCodeId: z.string().nullable().optional(),
  virtualBatchId: z.string().nullable().optional(),
  currentQty: z.number().optional(),
  addQty: z.number().optional(),
  maxQty: z.number().optional(),
});

router.post(
  '/scan/validate-usage',
  requireSubPermission('production:plans:view'),
  validate(validateScanUsageSchema),
  ctrl.validateScanUsage,
);

export default router;
