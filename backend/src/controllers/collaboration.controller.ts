import type { Request, Response, NextFunction } from 'express';
import { str, optStr } from '../utils/request.js';
import * as collabService from '../services/collaboration.service.js';

export async function createCollaboration(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await collabService.createCollaboration(req.tenantId!, req.user?.userId, req.body.inviteCode);
    res.status(result.id ? 201 : 200).json(result);
  } catch (e) { next(e); }
}

export async function listCollaborations(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.listCollaborations(req.tenantId!)); }
  catch (e) { next(e); }
}

export async function listOutsourceRoutes(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.listOutsourceRoutes(req.tenantId!)); }
  catch (e) { next(e); }
}

export async function createOutsourceRoute(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await collabService.createOutsourceRoute(req.tenantId!, req.body)); }
  catch (e) { next(e); }
}

export async function updateOutsourceRoute(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.updateOutsourceRoute(req.tenantId!, str(req.params.id), req.body)); }
  catch (e) { next(e); }
}

export async function deleteOutsourceRoute(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.deleteOutsourceRoute(req.tenantId!, str(req.params.id))); }
  catch (e) { next(e); }
}

export async function syncDispatch(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await collabService.syncDispatch(req.tenantId!, req.body)); }
  catch (e) { next(e); }
}

export async function listTransfers(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await collabService.listTransfers(req.tenantId!, {
      role: optStr(req.query.role), status: optStr(req.query.status),
    }));
  } catch (e) { next(e); }
}

export async function getTransfer(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.getTransfer(req.tenantId!, str(req.params.id))); }
  catch (e) { next(e); }
}

export async function acceptTransfer(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.acceptTransfer(req.tenantId!, str(req.params.id), req.body)); }
  catch (e) { next(e); }
}

export async function createReturn(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await collabService.createReturn(req.tenantId!, str(req.params.id), req.body)); }
  catch (e) { next(e); }
}

export async function receiveReturn(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.receiveReturn(req.tenantId!, str(req.params.id))); }
  catch (e) { next(e); }
}

export async function forwardTransfer(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await collabService.forwardTransfer(req.tenantId!, str(req.params.id), req.body)); }
  catch (e) { next(e); }
}

export async function confirmForward(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.confirmForward(req.tenantId!, str(req.params.id))); }
  catch (e) { next(e); }
}

export async function listProductMaps(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.listProductMaps(req.tenantId!, optStr(req.query.collaborationId))); }
  catch (e) { next(e); }
}

export async function updateProductMap(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.updateProductMap(req.tenantId!, str(req.params.id), req.body)); }
  catch (e) { next(e); }
}

export async function deleteProductMap(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.deleteProductMap(req.tenantId!, str(req.params.id))); }
  catch (e) { next(e); }
}

export async function withdrawDispatch(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.withdrawDispatch(req.tenantId!, str(req.params.id))); }
  catch (e) { next(e); }
}

export async function withdrawReturn(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.withdrawReturn(req.tenantId!, str(req.params.id))); }
  catch (e) { next(e); }
}

export async function withdrawForward(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.withdrawForward(req.tenantId!, str(req.params.id))); }
  catch (e) { next(e); }
}

export async function deleteDispatch(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.deleteDispatch(req.tenantId!, str(req.params.id))); }
  catch (e) { next(e); }
}

export async function deleteReturn(req: Request, res: Response, next: NextFunction) {
  try { res.json(await collabService.deleteReturn(req.tenantId!, str(req.params.id))); }
  catch (e) { next(e); }
}
