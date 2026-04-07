import { str } from '../utils/request.js';
import * as authService from '../services/auth.service.js';
import * as tenantsService from '../services/tenants.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const createTenant = asyncHandler(async (req, res) => {
  const result = await tenantsService.createTenant(req.user!.userId, req.body);
  res.status(201).json(result);
});

export const listTenants = asyncHandler(async (req, res) => {
  res.json(await tenantsService.listTenants(req.user!.userId));
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
  res.json(await tenantsService.updateMemberRole(req.user!.userId, str(req.params.id), str(req.params.uid), req.body));
});

export const updateMemberPermissions = asyncHandler(async (req, res) => {
  res.json(await tenantsService.updateMemberPermissions(req.user!.userId, str(req.params.id), str(req.params.uid), req.body.permissions));
});

export const removeMember = asyncHandler(async (req, res) => {
  res.json(await tenantsService.removeMember(req.user!.userId, str(req.params.id), str(req.params.uid)));
});

export const lookupByInviteCode = asyncHandler(async (req, res) => {
  res.json(await tenantsService.lookupByInviteCode((req.query.code as string)?.trim()));
});

export const applyToJoin = asyncHandler(async (req, res) => {
  const app = await tenantsService.applyToJoin(req.user!.userId, str(req.params.id), req.body.message);
  res.status(201).json(app);
});

export const getApplications = asyncHandler(async (req, res) => {
  res.json(await tenantsService.getApplications(str(req.params.id)));
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
