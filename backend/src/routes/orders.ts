import { Router } from 'express';
import * as ctrl from '../controllers/orders.controller.js';

const router = Router();

router.get('/', ctrl.listOrders);

// 产品工序进度（静态路由在参数化路由之前）
router.get('/product-progress', ctrl.listProductProgress);
router.post('/product-progress/report', ctrl.createProductReport);
router.put('/product-progress/report/:reportId', ctrl.updateProductReport);
router.delete('/product-progress/report/:reportId', ctrl.deleteProductReport);

router.get('/:id', ctrl.getOrder);
router.put('/:id', ctrl.updateOrder);
router.delete('/:id', ctrl.deleteOrder);

// 报工
router.post('/:id/milestones/:milestoneId/reports', ctrl.createReport);
router.put('/:id/milestones/:milestoneId/reports/:reportId', ctrl.updateReport);
router.delete('/:id/milestones/:milestoneId/reports/:reportId', ctrl.deleteReport);

// 可报数量
router.get('/:id/reportable', ctrl.getReportable);

export default router;
