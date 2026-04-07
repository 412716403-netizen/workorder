import { str, optStr } from '../utils/request.js';
import * as collabService from '../services/collaboration.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const createCollaboration = asyncHandler(async (req, res) => {
  const result = await collabService.createCollaboration(req.tenantId!, req.user?.userId, req.body.inviteCode);
  res.status(result.id ? 201 : 200).json(result);
});

export const listCollaborations = asyncHandler(async (req, res) => {
  res.json(await collabService.listCollaborations(req.tenantId!));
});

export const listOutsourceRoutes = asyncHandler(async (req, res) => {
  res.json(await collabService.listOutsourceRoutes(req.tenantId!));
});

export const createOutsourceRoute = asyncHandler(async (req, res) => {
  res.status(201).json(await collabService.createOutsourceRoute(req.tenantId!, req.body));
});

export const updateOutsourceRoute = asyncHandler(async (req, res) => {
  res.json(await collabService.updateOutsourceRoute(req.tenantId!, str(req.params.id), req.body));
});

export const deleteOutsourceRoute = asyncHandler(async (req, res) => {
  res.json(await collabService.deleteOutsourceRoute(req.tenantId!, str(req.params.id)));
});

export const syncDispatch = asyncHandler(async (req, res) => {
  res.status(201).json(await collabService.syncDispatch(req.tenantId!, req.body));
});

export const listTransfers = asyncHandler(async (req, res) => {
  res.json(await collabService.listTransfers(req.tenantId!, {
    role: optStr(req.query.role), status: optStr(req.query.status),
  }));
});

export const getTransfer = asyncHandler(async (req, res) => {
  res.json(await collabService.getTransfer(req.tenantId!, str(req.params.id)));
});

export const acceptTransfer = asyncHandler(async (req, res) => {
  res.json(await collabService.acceptTransfer(req.tenantId!, str(req.params.id), req.body));
});

export const createReturn = asyncHandler(async (req, res) => {
  res.status(201).json(await collabService.createReturn(req.tenantId!, str(req.params.id), req.body));
});

export const receiveReturn = asyncHandler(async (req, res) => {
  res.json(await collabService.receiveReturn(req.tenantId!, str(req.params.id)));
});

export const forwardTransfer = asyncHandler(async (req, res) => {
  res.status(201).json(await collabService.forwardTransfer(req.tenantId!, str(req.params.id), req.body));
});

export const confirmForward = asyncHandler(async (req, res) => {
  res.json(await collabService.confirmForward(req.tenantId!, str(req.params.id)));
});

export const listProductMaps = asyncHandler(async (req, res) => {
  res.json(await collabService.listProductMaps(req.tenantId!, optStr(req.query.collaborationId)));
});

export const updateProductMap = asyncHandler(async (req, res) => {
  res.json(await collabService.updateProductMap(req.tenantId!, str(req.params.id), req.body));
});

export const deleteProductMap = asyncHandler(async (req, res) => {
  res.json(await collabService.deleteProductMap(req.tenantId!, str(req.params.id)));
});

export const withdrawDispatch = asyncHandler(async (req, res) => {
  res.json(await collabService.withdrawDispatch(req.tenantId!, str(req.params.id)));
});

export const withdrawReturn = asyncHandler(async (req, res) => {
  res.json(await collabService.withdrawReturn(req.tenantId!, str(req.params.id)));
});

export const withdrawForward = asyncHandler(async (req, res) => {
  res.json(await collabService.withdrawForward(req.tenantId!, str(req.params.id)));
});

export const deleteDispatch = asyncHandler(async (req, res) => {
  res.json(await collabService.deleteDispatch(req.tenantId!, str(req.params.id)));
});

export const deleteReturn = asyncHandler(async (req, res) => {
  res.json(await collabService.deleteReturn(req.tenantId!, str(req.params.id)));
});
