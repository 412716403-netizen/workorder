import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as itemCodeService from '../services/itemCodes.service.js';

export async function generate(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const db = getTenantPrisma(tenantId);
    const result = await itemCodeService.generateItemCodes(
      db,
      tenantId,
      str(req.body.planOrderId),
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const result = await itemCodeService.listItemCodes(db, {
      planOrderId: optStr(req.query.planOrderId),
      variantId: optStr(req.query.variantId),
      batchId: optStr(req.query.batchId),
      status: optStr(req.query.status),
      page: Math.max(1, parseInt(String(req.query.page ?? '1'), 10)),
      pageSize: Math.min(500, Math.max(1, parseInt(String(req.query.pageSize ?? '100'), 10))),
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function voidCode(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const result = await itemCodeService.voidCode(db, str(req.params.id));
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function scan(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await itemCodeService.scanItemCode(req.tenantId!, str(req.params.token));
    res.json(result);
  } catch (e) {
    next(e);
  }
}
