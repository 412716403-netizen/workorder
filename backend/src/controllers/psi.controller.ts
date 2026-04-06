import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as psiService from '../services/psi.service.js';

export async function listRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await psiService.listRecords(db, {
      type: optStr(req.query.type),
      productId: optStr(req.query.productId),
      docNumber: optStr(req.query.docNumber),
      partnerId: optStr(req.query.partnerId),
    }));
  } catch (e) { next(e); }
}

export async function createRecord(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await psiService.createRecord(getTenantPrisma(req.tenantId!), req.body)); }
  catch (e) { next(e); }
}

export async function createBatchRecords(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await psiService.createBatchRecords(getTenantPrisma(req.tenantId!), req.body.records)); }
  catch (e) { next(e); }
}

export async function updateRecord(req: Request, res: Response, next: NextFunction) {
  try { res.json(await psiService.updateRecord(getTenantPrisma(req.tenantId!), str(req.params.id), req.body)); }
  catch (e) { next(e); }
}

export async function replaceRecords(req: Request, res: Response, next: NextFunction) {
  try { res.json(await psiService.replaceRecords(getTenantPrisma(req.tenantId!), req.body.deleteIds, req.body.newRecords)); }
  catch (e) { next(e); }
}

export async function deleteRecord(req: Request, res: Response, next: NextFunction) {
  try { res.json(await psiService.deleteRecord(getTenantPrisma(req.tenantId!), str(req.params.id))); }
  catch (e) { next(e); }
}

export async function deleteBatchRecords(req: Request, res: Response, next: NextFunction) {
  try { res.json(await psiService.deleteBatchRecords(getTenantPrisma(req.tenantId!), req.body.ids)); }
  catch (e) { next(e); }
}

export async function getStock(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await psiService.getStock(getTenantPrisma(req.tenantId!), {
      productId: optStr(req.query.productId),
      warehouseId: optStr(req.query.warehouseId),
    }));
  } catch (e) { next(e); }
}
