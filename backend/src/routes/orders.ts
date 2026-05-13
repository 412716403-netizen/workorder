import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/orders.controller.js';
import { validate } from '../middleware/validate.js';
import { requireSubPermission } from '../middleware/tenant.js';

const router = Router();

const updateOrderSchema = z.object({
  items: z.array(z.object({}).passthrough()).optional(),
}).passthrough();

const createReportSchema = z.object({
  quantity: z.number({ required_error: '报工数量不能为空' }),
  operator: z.string().optional(),
  defectiveQuantity: z.number().min(0).optional(),
  variantId: z.string().optional(),
  workerId: z.string().optional(),
  equipmentId: z.string().optional(),
  reportBatchId: z.string().optional(),
  reportNo: z.string().optional(),
  customData: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  rate: z.number().optional(),
  timestamp: z.string().optional(),
}).passthrough();

const createProductReportSchema = z.object({
  productId: z.string().min(1, '产品ID不能为空'),
  milestoneTemplateId: z.string().min(1, '工序模板ID不能为空'),
  quantity: z.number({ required_error: '报工数量不能为空' }),
  operator: z.string().optional(),
  defectiveQuantity: z.number().min(0).optional(),
  variantId: z.string().nullable().optional(),
  workerId: z.string().optional(),
  equipmentId: z.string().optional(),
  reportBatchId: z.string().optional(),
  reportNo: z.string().optional(),
  customData: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  rate: z.number().optional(),
  timestamp: z.string().optional(),
}).passthrough();

const updateReportSchema = z.object({
  quantity: z.number().optional(),
  operator: z.string().optional(),
  defectiveQuantity: z.number().min(0).optional(),
  customData: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  rate: z.number().optional(),
  timestamp: z.string().optional(),
}).passthrough();

const updateProductReportSchema = z.object({
  quantity: z.number().optional(),
  operator: z.string().optional(),
  defectiveQuantity: z.number().min(0).optional(),
  customData: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  rate: z.number().optional(),
  timestamp: z.string().optional(),
}).passthrough();

/**
 * Phase 3.E follow-up：工单 / 订单报工路由收紧到细粒度。
 * 持有顶级 `production` 模块码的用户通过 `hasSubPermission` fallback 自动覆盖，
 * 不会引起现有用户被拒。但能让前端按钮级（仅查看 / 可改 / 可删）真正落到后端拦截。
 */
router.get('/', requireSubPermission('production:orders:view'), ctrl.listOrders);

router.get(
  '/report-history',
  requireSubPermission('production:orders_report_records:view'),
  ctrl.listReportHistory,
);

router.get(
  '/product-progress',
  requireSubPermission('production:orders:view'),
  ctrl.listProductProgress,
);
router.post(
  '/product-progress/report',
  requireSubPermission('production:orders:edit'),
  validate(createProductReportSchema),
  ctrl.createProductReport,
);
router.put(
  '/product-progress/report/:reportId',
  requireSubPermission('production:orders:edit'),
  validate(updateProductReportSchema),
  ctrl.updateProductReport,
);
router.delete(
  '/product-progress/report/:reportId',
  requireSubPermission('production:orders:edit'),
  ctrl.deleteProductReport,
);

router.get('/:id', requireSubPermission('production:orders:view'), ctrl.getOrder);
router.put(
  '/:id',
  requireSubPermission('production:orders:edit'),
  validate(updateOrderSchema),
  ctrl.updateOrder,
);
router.delete(
  '/:id',
  requireSubPermission('production:orders:delete'),
  ctrl.deleteOrder,
);

router.post(
  '/:id/milestones/:milestoneId/reports',
  requireSubPermission('production:orders:edit'),
  validate(createReportSchema),
  ctrl.createReport,
);
router.put(
  '/:id/milestones/:milestoneId/reports/:reportId',
  requireSubPermission('production:orders:edit'),
  validate(updateReportSchema),
  ctrl.updateReport,
);
router.delete(
  '/:id/milestones/:milestoneId/reports/:reportId',
  requireSubPermission('production:orders:edit'),
  ctrl.deleteReport,
);

router.get(
  '/:id/reportable',
  requireSubPermission('production:orders:view'),
  ctrl.getReportable,
);

export default router;
