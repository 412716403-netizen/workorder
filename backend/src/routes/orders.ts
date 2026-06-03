import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/orders.controller.js';
import { validate } from '../middleware/validate.js';
import { requireSubPermission, requireProductionRead, requireProductionWrite } from '../middleware/tenant.js';

const router = Router();

const updateOrderSchema = z.object({
  items: z.array(z.object({}).passthrough()).optional(),
}).passthrough();

const dispatchStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED']),
});

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
 * 工单 / 报工路由权限：
 * - 历史挂 `production:orders:*`，但权限树无 `orders` 资源（仅 `orders_list`/`orders_detail`…），
 *   细粒度生产角色拿不到 → 连工单列表都 403。
 * - 改为生产域能力判断：view → requireProductionRead；create/edit（含报工）→ requireProductionWrite('write')；
 *   删除工单 → requireProductionWrite('delete')。报工流水查看仍用可达的 `orders_report_records:view`。
 */
router.get('/', requireProductionRead(), ctrl.listOrders);

router.get(
  '/report-history',
  requireSubPermission('production:orders_report_records:view'),
  ctrl.listReportHistory,
);

router.get(
  '/product-progress',
  requireProductionRead(),
  ctrl.listProductProgress,
);
router.post(
  '/product-progress/report',
  requireProductionWrite('write'),
  validate(createProductReportSchema),
  ctrl.createProductReport,
);
router.put(
  '/product-progress/report/:reportId',
  requireProductionWrite('write'),
  validate(updateProductReportSchema),
  ctrl.updateProductReport,
);
router.delete(
  '/product-progress/report/:reportId',
  requireProductionWrite('write'),
  ctrl.deleteProductReport,
);

router.get('/:id', requireProductionRead(), ctrl.getOrder);
router.put(
  '/:id',
  requireProductionWrite('write'),
  validate(updateOrderSchema),
  ctrl.updateOrder,
);
router.delete(
  '/:id',
  requireProductionWrite('delete'),
  ctrl.deleteOrder,
);

/** 手动切换工单派发完成状态（关联工单模式下工单中心徽章使用） */
router.patch(
  '/:id/dispatch-status',
  requireProductionWrite('write'),
  validate(dispatchStatusSchema),
  ctrl.updateDispatchStatus,
);

router.post(
  '/:id/milestones/:milestoneId/reports',
  requireProductionWrite('write'),
  validate(createReportSchema),
  ctrl.createReport,
);
router.put(
  '/:id/milestones/:milestoneId/reports/:reportId',
  requireProductionWrite('write'),
  validate(updateReportSchema),
  ctrl.updateReport,
);
router.delete(
  '/:id/milestones/:milestoneId/reports/:reportId',
  requireProductionWrite('write'),
  ctrl.deleteReport,
);

router.get(
  '/:id/reportable',
  requireProductionRead(),
  ctrl.getReportable,
);

export default router;
