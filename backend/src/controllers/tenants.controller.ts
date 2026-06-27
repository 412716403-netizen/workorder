import { str } from '../utils/request.js';
import * as authService from '../services/auth.service.js';
import * as tenantsService from '../services/tenants.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listQueryFromRequest, warnListAllFromRequest } from '../utils/listQuery.js';

export const createTenant = asyncHandler(async (req, res) => {
  const result = await tenantsService.createTenant(req.user!.userId, req.body);
  res.status(201).json(result);
});

export const listTenants = asyncHandler(async (req, res) => {
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('tenants.listTenants', req);
  res.json(await tenantsService.listTenants(req.user!.userId, { all, page, pageSize }));
});

export const selectTenant = asyncHandler(async (req, res) => {
  const result = await authService.selectTenant(req.user!.userId, str(req.params.id));
  const { setAuthCookies } = await import('../utils/cookies.js');
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.json(result);
});

export const getTenant = asyncHandler(async (req, res) => {
  res.json(await tenantsService.getTenant(req.user!.userId, str(req.params.id)));
});

export const updateTenant = asyncHandler(async (req, res) => {
  res.json(await tenantsService.updateTenant(req.user!.userId, str(req.params.id), req.body));
});

export const getMembers = asyncHandler(async (req, res) => {
  res.json(await tenantsService.getMembers(str(req.params.id)));
});

export const updateMemberRole = asyncHandler(async (req, res) => {
  const tenantId = str(req.params.id);
  const uid = str(req.params.uid);
  const result = await tenantsService.updateMemberRole(req.user!.userId, tenantId, uid, req.body);
  // 该成员的有效权限可能因角色变更而变 → 立即失效其 payload 缓存
  await authService.invalidateAuthTenantCache(uid, tenantId);
  res.json(result);
});

export const updateMemberPermissions = asyncHandler(async (req, res) => {
  const tenantId = str(req.params.id);
  const uid = str(req.params.uid);
  const result = await tenantsService.updateMemberPermissions(req.user!.userId, tenantId, uid, req.body.permissions);
  await authService.invalidateAuthTenantCache(uid, tenantId);
  res.json(result);
});

export const removeMember = asyncHandler(async (req, res) => {
  const tenantId = str(req.params.id);
  const uid = str(req.params.uid);
  const result = await tenantsService.removeMember(req.user!.userId, tenantId, uid);
  // 移除后该用户在该租户应立即失去访问 → 失效其所有租户上下文 payload 防止再次进入
  await authService.invalidateAuthTenantCache(uid);
  res.json(result);
});

export const lookupByInviteCode = asyncHandler(async (req, res) => {
  res.json(await tenantsService.lookupByInviteCode((req.query.code as string)?.trim()));
});

export const applyToJoin = asyncHandler(async (req, res) => {
  const app = await tenantsService.applyToJoin(req.user!.userId, str(req.params.id), req.body.message);
  res.status(201).json(app);
});

export const getApplications = asyncHandler(async (req, res) => {
  res.json(await tenantsService.getApplications(req.user!.userId, str(req.params.id)));
});

export const reviewApplication = asyncHandler(async (req, res) => {
  res.json(await tenantsService.reviewApplication(req.user!.userId, str(req.params.id), str(req.params.appId), req.body));
});

export const getMyApplications = asyncHandler(async (req, res) => {
  res.json(await tenantsService.getMyApplications(req.user!.userId));
});

export const getReportableMembers = asyncHandler(async (req, res) => {
  res.json(await tenantsService.getReportableMembers(str(req.params.id)));
});

export const updateMemberMilestones = asyncHandler(async (req, res) => {
  res.json(await tenantsService.updateMemberMilestones(req.user!.userId, str(req.params.id), str(req.params.uid), req.body.assignedMilestoneIds));
});
