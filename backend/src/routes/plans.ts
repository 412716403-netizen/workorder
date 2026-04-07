import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/plans.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createPlanSchema = z.object({
  productId: z.string().min(1, '产品ID不能为空'),
  items: z.array(z.object({
    quantity: z.number().positive('数量必须大于0'),
  }).passthrough()).optional(),
}).passthrough();

const updatePlanSchema = z.object({
  items: z.array(z.object({
    quantity: z.number().positive('数量必须大于0'),
  }).passthrough()).optional(),
}).passthrough();

const splitPlanSchema = z.object({
  newPlans: z.array(z.object({
    items: z.array(z.object({}).passthrough()).min(1),
  }).passthrough()).optional(),
  splitItems: z.array(z.object({}).passthrough()).optional(),
}).refine(d => (d.newPlans && d.newPlans.length > 0) || (d.splitItems && d.splitItems.length > 0), {
  message: '请提供拆分后的计划数据（newPlans 或 splitItems）',
});

const createSubPlansSchema = z.object({
  subPlans: z.array(z.object({
    productId: z.string().min(1, '产品ID不能为空'),
    bomNodeId: z.string().optional(),
    items: z.array(z.object({}).passthrough()).optional(),
  }).passthrough()).min(1, '至少需要一条子计划'),
});

router.get('/', ctrl.listPlans);
router.get('/:id', ctrl.getPlan);
router.post('/', validate(createPlanSchema), ctrl.createPlan);
router.put('/:id', validate(updatePlanSchema), ctrl.updatePlan);
router.delete('/:id', ctrl.deletePlan);

router.post('/:id/split', validate(splitPlanSchema), ctrl.splitPlan);
router.post('/:id/convert', ctrl.convertToOrder);
router.post('/:id/sub-plans', validate(createSubPlansSchema), ctrl.createSubPlans);

export default router;
