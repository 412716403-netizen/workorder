import { getTenantPrisma } from '../lib/prisma.js';
import { str } from '../utils/request.js';
import * as rolesService from '../services/roles.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const listRoles = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await rolesService.listRoles(db));
});

export const createRole = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const role = await rolesService.createRole(db, req.body);
  res.status(201).json(role);
});

export const updateRole = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await rolesService.updateRole(db, str(req.params.id), req.body));
});

export const deleteRole = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await rolesService.deleteRole(db, str(req.params.id)));
});
