import * as dashboardService from '../services/dashboard.service.js';
import * as productEconomicsService from '../services/productEconomicsStats.service.js';
import * as materialPurchasePriceService from '../services/materialPurchasePrice.service.js';
import * as processEconomicsPriceService from '../services/processEconomicsPrice.service.js';
import * as financePartnerWorkbenchStatsService from '../services/financePartnerWorkbenchStats.service.js';
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

function canAccessProduction(permissions: string[]): boolean {
  return permissions.includes('production') || permissions.some(p => p.startsWith('production:'));
}

export const getMaterialPriceSettings = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
  if (!canAccessProduction(permissions)) {
    res.json({
      materialPriceRule: { mode: 'all_time' },
      canEditGlobal: false,
      canEditProduct: false,
    });
    return;
  }
  res.json(
    await materialPurchasePriceService.getMaterialPriceSettings(
      tenantId,
      permissions,
      req.user!.tenantRole,
    ),
  );
});

export const putMaterialPriceSettings = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  res.json({
    materialPriceRule: await materialPurchasePriceService.updateMaterialPriceSettings(
      tenantId,
      req.body.materialPriceRule,
    ),
  });
});

export const listMaterialPriceParentProducts = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
  if (!canAccessProduction(permissions)) {
    res.json({ rows: [] });
    return;
  }
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const db = dashboardService.getTenantPrisma(tenantId);
  const rows = await materialPurchasePriceService.listMaterialPriceParentProducts(db, tenantId, { search });
  res.json({ rows });
});

export const listMaterialPriceBomMaterials = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
  if (!canAccessProduction(permissions)) {
    res.json({ rows: [], parentDefaultRule: null, tenantGlobalRule: { mode: 'all_time' } });
    return;
  }
  const parentId = String(req.params.parentId);
  const db = dashboardService.getTenantPrisma(tenantId);
  const result = await materialPurchasePriceService.listMaterialPriceBomMaterials(db, tenantId, parentId);
  res.json(result);
});

export const patchParentMaterialPriceDefaultRule = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = dashboardService.getTenantPrisma(tenantId);
  const parentId = String(req.params.parentId);
  res.json(
    await materialPurchasePriceService.updateParentMaterialPriceDefaultRule(
      db,
      parentId,
      req.body.defaultRule,
    ),
  );
});

export const patchBomMaterialPriceOverride = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = dashboardService.getTenantPrisma(tenantId);
  const parentId = String(req.params.parentId);
  const materialId = String(req.params.materialId);
  res.json(
    await materialPurchasePriceService.updateBomMaterialPriceOverride(
      db,
      tenantId,
      parentId,
      materialId,
      req.body.rule,
    ),
  );
});

async function listProcessPriceParentProductsHandler(
  req: Parameters<typeof listMaterialPriceParentProducts>[0],
  res: Parameters<typeof listMaterialPriceParentProducts>[1],
  listFn: typeof processEconomicsPriceService.listReportPriceParentProducts,
) {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
  if (!canAccessProduction(permissions)) {
    res.json({ rows: [] });
    return;
  }
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const db = dashboardService.getTenantPrisma(tenantId);
  const rows = await listFn(db, { search });
  res.json({ rows });
}

async function listProcessPriceNodesHandler(
  req: Parameters<typeof listMaterialPriceBomMaterials>[0],
  res: Parameters<typeof listMaterialPriceBomMaterials>[1],
  listFn: (db: ReturnType<typeof dashboardService.getTenantPrisma>, parentId: string) => Promise<unknown>,
) {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
  if (!canAccessProduction(permissions)) {
    res.json({ rows: [], parentDefaultRule: null });
    return;
  }
  const parentId = String(req.params.parentId);
  const db = dashboardService.getTenantPrisma(tenantId);
  res.json(await listFn(db, parentId));
}

export const listReportPriceParentProducts = asyncHandler(async (req, res) => {
  await listProcessPriceParentProductsHandler(
    req,
    res,
    processEconomicsPriceService.listReportPriceParentProducts,
  );
});

export const listOutsourcePriceParentProducts = asyncHandler(async (req, res) => {
  await listProcessPriceParentProductsHandler(
    req,
    res,
    processEconomicsPriceService.listOutsourcePriceParentProducts,
  );
});

export const listReportPriceNodes = asyncHandler(async (req, res) => {
  await listProcessPriceNodesHandler(req, res, processEconomicsPriceService.listReportPriceNodes);
});

export const listOutsourcePriceNodes = asyncHandler(async (req, res) => {
  await listProcessPriceNodesHandler(req, res, processEconomicsPriceService.listOutsourcePriceNodes);
});

export const patchParentReportPriceDefaultRule = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = dashboardService.getTenantPrisma(tenantId);
  const parentId = String(req.params.parentId);
  res.json(
    await processEconomicsPriceService.updateParentReportPriceDefaultRule(
      db,
      parentId,
      req.body.defaultRule,
    ),
  );
});

export const patchParentOutsourcePriceDefaultRule = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = dashboardService.getTenantPrisma(tenantId);
  const parentId = String(req.params.parentId);
  res.json(
    await processEconomicsPriceService.updateParentOutsourcePriceDefaultRule(
      db,
      parentId,
      req.body.defaultRule,
    ),
  );
});

export const patchReportPriceNodeOverride = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = dashboardService.getTenantPrisma(tenantId);
  const parentId = String(req.params.parentId);
  const nodeId = String(req.params.nodeId);
  res.json(
    await processEconomicsPriceService.updateReportPriceNodeOverride(
      db,
      parentId,
      nodeId,
      req.body.rule,
    ),
  );
});

export const patchOutsourcePriceNodeOverride = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = dashboardService.getTenantPrisma(tenantId);
  const parentId = String(req.params.parentId);
  const nodeId = String(req.params.nodeId);
  res.json(
    await processEconomicsPriceService.updateOutsourcePriceNodeOverride(
      db,
      parentId,
      nodeId,
      req.body.rule,
    ),
  );
});

export const getFinancePartnerStats = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const tenantId = req.tenantId!;
  const basePermissions = await dashboardService.resolveUserPermissions(userId, tenantId);
  const permissions = await dashboardService.augmentPermissionsWithWorkbench(
    userId,
    tenantId,
    basePermissions,
    req.user!.tenantRole,
  );
  const canFinance =
    permissions.includes('finance') || permissions.some(p => p.startsWith('finance:'));
  if (!canFinance) {
    res.json(null);
    return;
  }
  const db = dashboardService.getTenantPrisma(tenantId);
  res.json(await financePartnerWorkbenchStatsService.getFinancePartnerWorkbenchStats(
    db,
    parseWorkbenchStatsQuery(req),
  ));
});
