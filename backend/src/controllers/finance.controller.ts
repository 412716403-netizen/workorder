import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as financeService from '../services/finance.service.js';

export async function listRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await financeService.listRecords(db, {
      type: optStr(req.query.type),
      status: optStr(req.query.status),
      categoryId: optStr(req.query.categoryId),
    }));
  } catch (e) { next(e); }
}

export async function getRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const record = await financeService.getRecord(db, str(req.params.id));
    if (!record) { res.status(404).json({ error: '记录不存在' }); return; }
    res.json(record);
  } catch (e) { next(e); }
}

export async function createRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const record = await financeService.createRecord(db, req.body, req.tenantId);
    res.status(201).json(record);
  } catch (e) { next(e); }
}

export async function updateRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await financeService.updateRecord(db, str(req.params.id), req.body));
  } catch (e) { next(e); }
}

export async function deleteRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await financeService.deleteRecord(db, str(req.params.id)));
  } catch (e) { next(e); }
}
