import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/orders.controller.js';
import { validate } from '../middleware/validate.js';

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

router.get('/', ctrl.listOrders);

router.get('/product-progress', ctrl.listProductProgress);
router.post('/product-progress/report', validate(createProductReportSchema), ctrl.createProductReport);
router.put('/product-progress/report/:reportId', ctrl.updateProductReport);
router.delete('/product-progress/report/:reportId', ctrl.deleteProductReport);

router.get('/:id', ctrl.getOrder);
router.put('/:id', validate(updateOrderSchema), ctrl.updateOrder);
router.delete('/:id', ctrl.deleteOrder);

router.post('/:id/milestones/:milestoneId/reports', validate(createReportSchema), ctrl.createReport);
router.put('/:id/milestones/:milestoneId/reports/:reportId', ctrl.updateReport);
router.delete('/:id/milestones/:milestoneId/reports/:reportId', ctrl.deleteReport);

router.get('/:id/reportable', ctrl.getReportable);

export default router;
