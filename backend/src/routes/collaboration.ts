import { Router } from 'express';
import * as ctrl from '../controllers/collaboration.controller.js';

const router = Router();

// 租户互信
router.post('/collaborations', ctrl.createCollaboration);
router.get('/collaborations', ctrl.listCollaborations);

// 协作主单 + Dispatch
router.post('/subcontract-transfers/sync-dispatch', ctrl.syncDispatch);
router.get('/subcontract-transfers', ctrl.listTransfers);
router.get('/subcontract-transfers/:id', ctrl.getTransfer);

// 乙方接受
router.post('/subcontract-transfers/:id/accept', ctrl.acceptTransfer);

// 乙方回传
router.post('/subcontract-transfers/:id/returns', ctrl.createReturn);

// 甲方确认收回
router.patch('/subcontract-returns/:id/receive', ctrl.receiveReturn);

// 对照表 CRUD
router.get('/collaboration-product-maps', ctrl.listProductMaps);
router.put('/collaboration-product-maps/:id', ctrl.updateProductMap);
router.delete('/collaboration-product-maps/:id', ctrl.deleteProductMap);

export default router;
