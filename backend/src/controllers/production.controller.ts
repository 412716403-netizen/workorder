import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as productionService from '../services/production.service.js';

export { applyOutsourceProgress } from '../services/production.service.js';

export async function listRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await productionService.listRecords(db, {
      type: optStr(req.query.type),
      orderId: optStr(req.query.orderId),
      productId: optStr(req.query.productId),
    }));
  } catch (e) { next(e); }
}

export async function getRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const record = await productionService.getRecord(db, str(req.params.id));
    if (!record) { res.status(404).json({ error: '记录不存在' }); return; }
    res.json(record);
  } catch (e) { next(e); }
}

export async function createRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.status(201).json(await productionService.createRecord(db, req.body, req.tenantId));
  } catch (e) { next(e); }
}

export async function updateRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const record = await productionService.updateRecord(db, str(req.params.id), req.body);
    if (!record) { res.status(404).json({ error: '记录不存在' }); return; }
    res.json(record);
  } catch (e) { next(e); }
}

export async function deleteRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const result = await productionService.deleteRecord(db, str(req.params.id));
    if (!result) { res.status(404).json({ error: '记录不存在' }); return; }
    res.json(result);
  } catch (e) { next(e); }
}

export async function getDefectiveRework(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await productionService.getDefectiveRework(db));
  } catch (e) { next(e); }
}
