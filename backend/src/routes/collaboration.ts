import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/collaboration.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createCollabSchema = z.object({
  inviteCode: z.string().min(1, '邀请码不能为空'),
});

const createOutsourceRouteSchema = z.object({
  name: z.string().min(1, '路线名称不能为空'),
  steps: z.array(z.object({
    receiverTenantId: z.string().min(1, '接收方租户ID不能为空'),
  }).passthrough()).min(1, '至少需要一个步骤'),
}).passthrough();

const updateOutsourceRouteSchema = z.object({
  name: z.string().min(1).optional(),
  steps: z.array(z.object({
    receiverTenantId: z.string().min(1, '接收方租户ID不能为空'),
  }).passthrough()).min(1).optional(),
}).passthrough();

const syncDispatchSchema = z.object({
  recordIds: z.array(z.string().min(1)).min(1, '至少选择一条生产记录'),
  collaborationTenantId: z.string().min(1, '协作租户ID不能为空'),
  outsourceRouteId: z.string().optional(),
}).passthrough();

const createReturnSchema = z.object({
  items: z.array(z.object({
    quantity: z.number().positive('回传数量必须大于0'),
  }).passthrough()).min(1, '至少需要一条回传明细'),
}).passthrough();

const forwardTransferSchema = z.object({
  items: z.array(z.object({
    quantity: z.number().positive('转发数量必须大于0'),
  }).passthrough()).min(1, '至少需要一条转发明细'),
}).passthrough();

// 租户互信
router.post('/collaborations', validate(createCollabSchema), ctrl.createCollaboration);
router.get('/collaborations', ctrl.listCollaborations);

// 外协路线
router.get('/outsource-routes', ctrl.listOutsourceRoutes);
router.post('/outsource-routes', validate(createOutsourceRouteSchema), ctrl.createOutsourceRoute);
router.put('/outsource-routes/:id', validate(updateOutsourceRouteSchema), ctrl.updateOutsourceRoute);
router.delete('/outsource-routes/:id', ctrl.deleteOutsourceRoute);

// 协作主单 + Dispatch
router.post('/subcontract-transfers/sync-dispatch', validate(syncDispatchSchema), ctrl.syncDispatch);
router.get('/subcontract-transfers', ctrl.listTransfers);
router.get('/subcontract-transfers/:id', ctrl.getTransfer);

// 乙方接受
router.post('/subcontract-transfers/:id/accept', ctrl.acceptTransfer);

// 链式外协：乙方转发到下一站
router.post('/subcontract-transfers/:id/forward', validate(forwardTransferSchema), ctrl.forwardTransfer);

// 链式外协：甲方确认转发
router.patch('/subcontract-transfers/:id/confirm-forward', ctrl.confirmForward);

// 乙方回传
router.post('/subcontract-transfers/:id/returns', validate(createReturnSchema), ctrl.createReturn);

// 甲方确认收回
router.patch('/subcontract-returns/:id/receive', ctrl.receiveReturn);

// 撤回
router.patch('/subcontract-dispatches/:id/withdraw', ctrl.withdrawDispatch);
router.patch('/subcontract-returns/:id/withdraw', ctrl.withdrawReturn);
router.patch('/subcontract-transfers/:id/withdraw-forward', ctrl.withdrawForward);

// 删除已撤回
router.delete('/subcontract-dispatches/:id', ctrl.deleteDispatch);
router.delete('/subcontract-returns/:id', ctrl.deleteReturn);

// Dispatch 编辑同步
router.put('/subcontract-dispatches/:id/payload', ctrl.updateDispatchPayload);
router.post('/subcontract-dispatches/:id/amend', ctrl.amendDispatch);
router.patch('/subcontract-dispatches/:id/confirm-amendment', ctrl.confirmDispatchAmendment);
router.patch('/subcontract-dispatches/:id/reject-amendment', ctrl.rejectDispatchAmendment);

// Return 编辑同步
router.put('/subcontract-returns/:id/payload', ctrl.updateReturnPayload);
router.post('/subcontract-returns/:id/amend', ctrl.amendReturn);
router.patch('/subcontract-returns/:id/confirm-amendment', ctrl.confirmReturnAmendment);
router.patch('/subcontract-returns/:id/reject-amendment', ctrl.rejectReturnAmendment);

// 对照表 CRUD
router.get('/collaboration-product-maps', ctrl.listProductMaps);
router.put('/collaboration-product-maps/:id', ctrl.updateProductMap);
router.delete('/collaboration-product-maps/:id', ctrl.deleteProductMap);

export default router;
