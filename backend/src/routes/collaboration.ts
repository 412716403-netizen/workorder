import { Router } from 'express';
import * as ctrl from '../controllers/collaboration.controller.js';

const router = Router();

// 租户互信
router.post('/collaborations', ctrl.createCollaboration);
router.get('/collaborations', ctrl.listCollaborations);

// 外协路线
router.get('/outsource-routes', ctrl.listOutsourceRoutes);
router.post('/outsource-routes', ctrl.createOutsourceRoute);
router.put('/outsource-routes/:id', ctrl.updateOutsourceRoute);
router.delete('/outsource-routes/:id', ctrl.deleteOutsourceRoute);

// 协作主单 + Dispatch
router.post('/subcontract-transfers/sync-dispatch', ctrl.syncDispatch);
router.get('/subcontract-transfers', ctrl.listTransfers);
router.get('/subcontract-transfers/:id', ctrl.getTransfer);

// 乙方接受
router.post('/subcontract-transfers/:id/accept', ctrl.acceptTransfer);

// 链式外协：乙方转发到下一站
router.post('/subcontract-transfers/:id/forward', ctrl.forwardTransfer);

// 链式外协：甲方确认转发
router.patch('/subcontract-transfers/:id/confirm-forward', ctrl.confirmForward);

// 乙方回传
router.post('/subcontract-transfers/:id/returns', ctrl.createReturn);

// 甲方确认收回
router.patch('/subcontract-returns/:id/receive', ctrl.receiveReturn);

// 撤回
router.patch('/subcontract-dispatches/:id/withdraw', ctrl.withdrawDispatch);
router.patch('/subcontract-returns/:id/withdraw', ctrl.withdrawReturn);
router.patch('/subcontract-transfers/:id/withdraw-forward', ctrl.withdrawForward);

// 删除已撤回
router.delete('/subcontract-dispatches/:id', ctrl.deleteDispatch);
router.delete('/subcontract-returns/:id', ctrl.deleteReturn);

// 对照表 CRUD
router.get('/collaboration-product-maps', ctrl.listProductMaps);
router.put('/collaboration-product-maps/:id', ctrl.updateProductMap);
router.delete('/collaboration-product-maps/:id', ctrl.deleteProductMap);

export default router;
