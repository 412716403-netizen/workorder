import * as dashboardService from '../services/dashboard.service.js';
import * as productEconomicsService from '../services/productEconomicsStats.service.js';
import { isProductMaterialCostMode } from '../../../shared/types.js';
import { isWorkbenchOrderStatsPeriod } from '../../../shared/workbenchOrderStats.js';
import type { WorkbenchStatsListQuery } from '../../../shared/workbenchOrderStats.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

function parseWorkbenchStatsQuery(req: {
  query: Record<string, unknown>;
}): WorkbenchStatsListQuery {
  const periodRaw = typeof req.query.period === 'string' ? req.query.period : undefined;
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
  const period = isWorkbenchOrderStatsPeriod(periodRaw) ? periodRaw : undefined;
  const modeRaw = typeof req.query.materialCostMode === 'string' ? req.query.materialCostMode : undefined;
  const materialCostMode = isProductMaterialCostMode(modeRaw) ? modeRaw : undefined;
  return { period, startDate, endDate, materialCostMode };
}

function parseProductEconomicsDetailQuery(req: {
  query: Record<string, unknown>;
}): { materialCostMode?: 'consumable' | 'document_linked' } {
  const modeRaw = typeof req.query.materialCostMode === 'string' ? req.query.materialCostMode : undefined;
  const materialCostMode = isProductMaterialCostMode(modeRaw) ? modeRaw : undefined;
  return { materialCostMode };
}

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

export const getWorkbenchPages = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  res.json({ pages: await dashboardService.listWorkbenchPages(tenantId) });
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
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
  const db = dashboardService.getTenantPrisma(tenantId);
  const days = req.query.days ? Number(req.query.days) : undefined;
  res.json(await dashboardService.getStats(db, permissions, { ...parseWorkbenchStatsQuery(req), days }));
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
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
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
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
  const db = dashboardService.getTenantPrisma(tenantId);
  const includeNotStarted = req.query.includeNotStarted === 'true' || req.query.includeNotStarted === '1';
  res.json(await dashboardService.getOrderStats(db, userId, tenantId, permissions, {
    ...parseWorkbenchStatsQuery(req),
    includeNotStarted,
  }));
});

export const getOutsourceStatsSettings = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
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
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
  const db = dashboardService.getTenantPrisma(tenantId);
  res.json(await dashboardService.getOutsourceStats(db, userId, tenantId, permissions, parseWorkbenchStatsQuery(req)));
});

export const getReworkStatsSettings = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
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
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
  const db = dashboardService.getTenantPrisma(tenantId);
  res.json(await dashboardService.getReworkStats(db, userId, tenantId, permissions, parseWorkbenchStatsQuery(req)));
});

export const getProductEconomics = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
  const db = dashboardService.getTenantPrisma(tenantId);
  res.json(await productEconomicsService.computeProductEconomicsList(db, tenantId, permissions, parseWorkbenchStatsQuery(req)));
});

export const getProductEconomicsDetail = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
  const db = dashboardService.getTenantPrisma(tenantId);
  const productId = String(req.params.productId);
  res.json(
    await productEconomicsService.computeProductEconomicsDetail(
      db,
      tenantId,
      permissions,
      productId,
      parseProductEconomicsDetailQuery(req).materialCostMode,
    ),
  );
});
