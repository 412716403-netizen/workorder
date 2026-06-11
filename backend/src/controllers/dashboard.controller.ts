import * as dashboardService from '../services/dashboard.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const getWorkbench = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  res.json(await dashboardService.getWorkbench(userId, tenantId, permissions));
});

export const saveUserWorkbench = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  res.json(await dashboardService.saveUserWorkbench(userId, tenantId, req.body, permissions));
});

export const getShortcuts = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  res.json(await dashboardService.getShortcuts(userId, tenantId, permissions));
});

export const saveShortcuts = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  res.json(await dashboardService.saveShortcuts(userId, tenantId, req.body, permissions));
});

export const getFeaturePlugins = asyncHandler(async (req, res) => {
  res.json(await dashboardService.getFeaturePlugins(req.tenantId!));
});

export const updateFeaturePlugins = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const tenantRole = req.user!.tenantRole;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  await dashboardService.assertCanManageFeaturePlugins(tenantRole, permissions, req.user!.role);
  res.json(await dashboardService.updateFeaturePlugins(tenantId, req.body));
});

export const getStats = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const db = dashboardService.getTenantPrisma(tenantId);
  const days = req.query.days ? Number(req.query.days) : undefined;
  const periodRaw = typeof req.query.period === 'string' ? req.query.period : undefined;
  const period = periodRaw === 'yesterday' || periodRaw === 'month' ? periodRaw : 'today';
  res.json(await dashboardService.getStats(db, permissions, { days, period }));
});

export const getNotifications = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const tenantRole = req.user!.tenantRole;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  res.json(await dashboardService.getNotifications(tenantId, userId, tenantRole, permissions, { limit }));
});

export const listPublishedMessages = asyncHandler(async (req, res) => {
  const messages = await dashboardService.listPlatformAnnouncements(req.user!.role);
  res.json({ messages });
});

export const publishMessage = asyncHandler(async (req, res) => {
  const messages = await dashboardService.publishPlatformAnnouncement(req.body, req.user!.role);
  res.status(201).json({ messages });
});

export const deleteMessage = asyncHandler(async (req, res) => {
  const messages = await dashboardService.deletePlatformAnnouncement(
    String(req.params.id),
    req.user!.role,
  );
  res.json({ messages });
});

export const getOrderStatsSettings = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  res.json(await dashboardService.getOrderStatsSettings(userId, tenantId, permissions));
});

export const saveOrderStatsSettings = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  res.json(await dashboardService.saveOrderStatsSettings(userId, tenantId, req.body, permissions));
});

export const getOrderStats = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const db = dashboardService.getTenantPrisma(tenantId);
  const periodRaw = typeof req.query.period === 'string' ? req.query.period : undefined;
  const period = periodRaw === 'yesterday' || periodRaw === 'month' ? periodRaw : 'today';
  const includeNotStarted = req.query.includeNotStarted === 'true' || req.query.includeNotStarted === '1';
  res.json(await dashboardService.getOrderStats(db, userId, tenantId, permissions, {
    period,
    includeNotStarted,
  }));
});

export const getOutsourceStatsSettings = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  res.json(await dashboardService.getOutsourceStatsSettings(userId, tenantId, permissions));
});

export const saveOutsourceStatsSettings = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  res.json(await dashboardService.saveOutsourceStatsSettings(userId, tenantId, req.body, permissions));
});

export const getOutsourceStats = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const db = dashboardService.getTenantPrisma(tenantId);
  const periodRaw = typeof req.query.period === 'string' ? req.query.period : undefined;
  const period = periodRaw === 'yesterday' || periodRaw === 'month' ? periodRaw : 'today';
  res.json(await dashboardService.getOutsourceStats(db, userId, tenantId, permissions, { period }));
});

export const getReworkStatsSettings = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  res.json(await dashboardService.getReworkStatsSettings(userId, tenantId, permissions));
});

export const saveReworkStatsSettings = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  res.json(await dashboardService.saveReworkStatsSettings(userId, tenantId, req.body, permissions));
});

export const getReworkStats = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const permissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const db = dashboardService.getTenantPrisma(tenantId);
  const periodRaw = typeof req.query.period === 'string' ? req.query.period : undefined;
  const period = periodRaw === 'yesterday' || periodRaw === 'month' ? periodRaw : 'today';
  res.json(await dashboardService.getReworkStats(db, userId, tenantId, permissions, { period }));
});
