import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../lib/prisma.js';
import * as dashboardService from '../services/dashboard.service.js';

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await dashboardService.getStats(db));
  } catch (e) { next(e); }
}
