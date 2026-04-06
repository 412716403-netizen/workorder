import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../lib/prisma.js';
import { str } from '../utils/request.js';
import * as rolesService from '../services/roles.service.js';

export async function listRoles(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await rolesService.listRoles(db));
  } catch (e) { next(e); }
}

export async function createRole(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const role = await rolesService.createRole(db, req.body);
    res.status(201).json(role);
  } catch (e) { next(e); }
}

export async function updateRole(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await rolesService.updateRole(db, str(req.params.id), req.body));
  } catch (e) { next(e); }
}

export async function deleteRole(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await rolesService.deleteRole(db, str(req.params.id)));
  } catch (e) { next(e); }
}
