import { getTenantPrisma } from '../lib/prisma.js';
import { str } from '../utils/request.js';
import * as rolesService from '../services/roles.service.js';
import { invalidateAuthCacheForTenant } from '../services/auth.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listQueryFromRequest, warnListAllFromRequest } from '../utils/listQuery.js';

export const listRoles = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('roles.listRoles', req);
  res.json(await rolesService.listRoles(db, { all, page, pageSize }));
});

export const createRole = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const role = await rolesService.createRole(db, req.body);
  res.status(201).json(role);
});

export const updateRole = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const result = await rolesService.updateRole(db, str(req.params.id), req.body);
  // 角色权限/名称变更 → 失效该租户下所有成员的 auth payload 缓存，避免 5s TTL 期内拿旧权限
  await invalidateAuthCacheForTenant(req.tenantId!);
  res.json(result);
});

export const deleteRole = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const result = await rolesService.deleteRole(db, str(req.params.id));
  await invalidateAuthCacheForTenant(req.tenantId!);
  res.json(result);
});
