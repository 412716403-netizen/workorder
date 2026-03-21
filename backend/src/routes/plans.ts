import { Router } from 'express';
import * as ctrl from '../controllers/plans.controller.js';

const router = Router();

router.get('/', ctrl.listPlans);
router.get('/:id', ctrl.getPlan);
router.post('/', ctrl.createPlan);
router.put('/:id', ctrl.updatePlan);
router.delete('/:id', ctrl.deletePlan);

router.post('/:id/split', ctrl.splitPlan);
router.post('/:id/convert', ctrl.convertToOrder);
router.post('/:id/sub-plans', ctrl.createSubPlans);

export default router;
