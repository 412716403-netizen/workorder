import { prisma as basePrisma } from '../lib/prisma.js';
import { getTenantPrisma, type TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { isTenantElevatedRole, hasSubPermission, canViewDocList } from '../types/index.js';
import { loadEffectivePermissions } from '../services/auth.service.js';
import { getMembership } from './tenantMembership.service.js';
import * as settingsService from './settings.service.js';
import * as productionService from './production.service.js';
import {
  DASHBOARD_SETTING_KEYS,
  WORKBENCH_HOME_PAGE_ID,
  WORKBENCH_BUILTIN_DEFAULT,
  WORKBENCH_WIDGET_CATALOG,
  WORKBENCH_TODO_WIDGET_SEEDED_PREF_KEY,
  parseFeaturePlugins,
  isWorkbenchHomePage,
  injectHomeTodoWidget,
  type WorkbenchConfig,
  type WorkbenchPage,
  type FeaturePluginsConfig,
} from '../../../shared/workbench.js';
import {
  DEFAULT_DASHBOARD_SHORTCUT_IDS,
  normalizeShortcutIds,
  resolveShortcutItems,
} from '../../../shared/workbenchShortcuts.js';
import {
  filterWorkbenchByAccess,
  normalizeWorkbenchConfig,
  filterWorkbenchPagesByVisibility,
  hasWorkbenchPageFullAccess,
  hasWorkbenchNavAccess,
  mergeSharedWorkbenchPages,
} from '../../../shared/workbenchValidate.js';
import {
  DEFAULT_DASHBOARD_ORDER_STATS_NODE_COUNT,
  DASHBOARD_OUTSOURCE_STATS_NODES_KEY,
  DASHBOARD_REWORK_STATS_NODES_KEY,
  MAX_DASHBOARD_ORDER_STATS_NODES,
  normalizeOrderStatsNodeIds,
  resolveWorkbenchStatsQuery,
  type WorkbenchCustomRange,
  type WorkbenchOrderStatsPeriod,
  type WorkbenchStatsListQuery,
} from '../../../shared/workbenchOrderStats.js';
import { OrderStatus } from '../../../shared/types.js';
import { computeTemplateReportStats } from './orderReportableStats.service.js';
import { computeOutsourceTemplateStats } from './outsourceDashboardStats.service.js';
import { computeReworkTemplateStats } from './reworkDashboardStats.service.js';

function parseWorkbenchConfig(value: unknown): WorkbenchConfig | null {
  if (value == null) return null;
  return normalizeWorkbenchConfig(value);
}

function readUserWorkbench(preferences: unknown): WorkbenchConfig | null {
  if (!preferences || typeof preferences !== 'object') return null;
  const wb = (preferences as { dashboardWorkbench?: unknown }).dashboardWorkbench;
  return parseWorkbenchConfig(wb);
}

/** 系统内置首页（个人首页缺省值） */
function builtinHomePage(): WorkbenchPage {
  return normalizeWorkbenchConfig(WORKBENCH_BUILTIN_DEFAULT).pages[0];
}

/** 读取当前用户的个人首页（存于 membership.preferences.dashboardWorkbench） */
function readUserHomePage(preferences: unknown): WorkbenchPage {
  const wb = readUserWorkbench(preferences);
  const home = wb?.pages.find(p => isWorkbenchHomePage(p.id));
  return home ?? builtinHomePage();
}

/** 是否已对当前用户做过待办组件种子注入（避免删除后再复活） */
function readTodoWidgetSeeded(preferences: unknown): boolean {
  if (!preferences || typeof preferences !== 'object') return false;
  return (preferences as Record<string, unknown>)[WORKBENCH_TODO_WIDGET_SEEDED_PREF_KEY] === true;
}

/** 读取租户级共享的自定义页面（存于 system_settings.workbenchSharedPages） */
function readSharedWorkbenchPages(config: Record<string, unknown>): WorkbenchPage[] {
  const raw = config[DASHBOARD_SETTING_KEYS.workbenchSharedPages];
  if (!Array.isArray(raw)) return [];
  const normalized = normalizeWorkbenchConfig({
    version: 1,
    activePageId: WORKBENCH_HOME_PAGE_ID,
    pages: raw,
  });
  return normalized.pages.filter(p => !isWorkbenchHomePage(p.id));
}

function assembleWorkbench(homePage: WorkbenchPage, sharedPages: WorkbenchPage[]): WorkbenchConfig {
  return normalizeWorkbenchConfig({
    version: 1,
    activePageId: WORKBENCH_HOME_PAGE_ID,
    pages: [homePage, ...sharedPages],
  });
}

type WidgetAccessOpts = {
  permissions: string[];
  featurePlugins: FeaturePluginsConfig;
  tenantRole?: string;
  /** 当前查看者 userId，用于页面级完整授权判定 */
  userId?: string;
};

/** 对给定页面集合按查看者权限做 widget 级过滤（防篡改 / 隐藏无权组件），返回含首页的归一化页面 */
function applyWidgetAccess(pages: WorkbenchPage[], opts: WidgetAccessOpts): WorkbenchPage[] {
  const filtered = filterWorkbenchByAccess(
    normalizeWorkbenchConfig({ version: 1, activePageId: WORKBENCH_HOME_PAGE_ID, pages }),
    opts,
  );
  return filtered.pages;
}

function readUserShortcutIds(preferences: unknown): string[] {
  if (!preferences || typeof preferences !== 'object') return normalizeShortcutIds(null);
  const raw = (preferences as { dashboardShortcuts?: unknown }).dashboardShortcuts;
  return normalizeShortcutIds(raw);
}

function filterShortcutIdsByAccess(
  ids: string[],
  permissions: string[],
  featurePlugins: FeaturePluginsConfig,
  tenantRole?: string,
): string[] {
  const items = resolveShortcutItems(ids);
  return items
    .filter(item => {
      if (item.pluginId && featurePlugins[item.pluginId] === false) return false;
      if (isTenantElevatedRole(tenantRole)) return true;
      if (!permissions || permissions.length === 0) return false;
      // `:view` 结尾的入口兼容「仅本人可见」：持 `<base>:view_own` 同样可见（数据由列表接口过滤）
      if (item.perm) {
        const ok = item.perm.endsWith(':view')
          ? canViewDocList(permissions, item.perm.slice(0, -':view'.length))
          : hasSubPermission(permissions, item.perm);
        if (!ok) return false;
      }
      if (item.module && !hasSubPermission(permissions, item.module)) {
        if (!permissions.some(p => p.startsWith(`${item.module}:`))) return false;
      }
      return true;
    })
    .map(item => item.id);
}

/**
 * 工作台有效配置：
 * - 首页（HOME）= 当前用户的个人首页（membership.preferences）。
 * - 自定义页面 = 租户级共享池中「当前用户可见」的页面（owner / 成员角色被授予 `workbench:<pageId>`）。
 * 最终再按查看者权限做 widget 级过滤。
 */
export async function getWorkbench(userId: string, tenantId: string, permissions: string[]) {
  const [membership, config] = await Promise.all([
    getMembership(userId, tenantId),
    settingsService.getConfig(tenantId),
  ]);

  const canAccess = hasWorkbenchNavAccess(permissions, membership.role);
  if (!canAccess) {
    return {
      canAccess: false,
      effective: { version: 1 as const, activePageId: '', pages: [] },
    };
  }

  const featurePlugins = parseFeaturePlugins(config[DASHBOARD_SETTING_KEYS.featurePlugins]);

  const homePage = readUserHomePage(membership.preferences);
  const needSeed = featurePlugins.todo_reminder === true
    && !readTodoWidgetSeeded(membership.preferences);
  const home = needSeed ? injectHomeTodoWidget(homePage) : homePage;
  const sharedPages = readSharedWorkbenchPages(config);
  const assembled = assembleWorkbench(home, sharedPages);

  const visible = filterWorkbenchPagesByVisibility(assembled, {
    userId,
    permissions,
    tenantRole: membership.role,
  });
  const effective = filterWorkbenchByAccess(visible, {
    permissions,
    featurePlugins,
    tenantRole: membership.role,
    userId,
  });

  return { canAccess: true, effective };
}

export async function saveUserWorkbench(
  userId: string,
  tenantId: string,
  body: unknown,
  permissions: string[],
) {
  const membership = await getMembership(userId, tenantId);
  if (membership.role !== 'owner') {
    throw new AppError(403, '仅企业创建者可编辑工作台');
  }
  const config = await settingsService.getConfig(tenantId);
  const featurePlugins = parseFeaturePlugins(config[DASHBOARD_SETTING_KEYS.featurePlugins]);
  // 自定义页面管理权限按业务约定＝企业创建者 owner
  const canManage = membership.role === 'owner';
  const accessOpts: WidgetAccessOpts = {
    permissions,
    featurePlugins,
    tenantRole: membership.role,
    userId,
  };

  const submitted = normalizeWorkbenchConfig(body);
  const submittedHome = submitted.pages.find(p => isWorkbenchHomePage(p.id)) ?? builtinHomePage();
  const submittedCustom = submitted.pages.filter(p => !isWorkbenchHomePage(p.id));

  // 1) 个人首页落 membership.preferences（按提交者权限过滤 widget）
  const homePersisted =
    applyWidgetAccess([submittedHome], accessOpts).find(p => isWorkbenchHomePage(p.id))
    ?? builtinHomePage();

  const prefs =
    membership.preferences && typeof membership.preferences === 'object'
      ? { ...(membership.preferences as Record<string, unknown>) }
      : {};

  if (featurePlugins.todo_reminder === true) {
    prefs[WORKBENCH_TODO_WIDGET_SEEDED_PREF_KEY] = true;
  }

  await basePrisma.tenantMembership.update({
    where: { id: membership.id },
    data: {
      preferences: {
        ...prefs,
        dashboardWorkbench: { version: 1, activePageId: WORKBENCH_HOME_PAGE_ID, pages: [homePersisted] },
      } as object,
    },
  });

  // 2) 自定义页面合并进租户共享池（仅创建者本人/提权者的改动会写入；他人页保留）
  const storedShared = readSharedWorkbenchPages(config);
  const submittedCustomFiltered = applyWidgetAccess(submittedCustom, accessOpts)
    .filter(p => !isWorkbenchHomePage(p.id));
  const mergedShared = mergeSharedWorkbenchPages(storedShared, submittedCustomFiltered, { userId, canManage });
  await settingsService.updateConfig(tenantId, DASHBOARD_SETTING_KEYS.workbenchSharedPages, mergedShared);

  // 3) 返回与 GET 一致的、当前用户可见且按权限过滤后的视图
  const assembled = assembleWorkbench(homePersisted, mergedShared);
  const visible = filterWorkbenchPagesByVisibility(assembled, {
    userId,
    permissions,
    tenantRole: membership.role,
  });
  const effective = filterWorkbenchByAccess(visible, accessOpts);
  return {
    canAccess: hasWorkbenchNavAccess(permissions, membership.role),
    effective,
  };
}

export interface WorkbenchPageSummary {
  id: string;
  title: string;
  createdByUserId: string | null;
  creatorName: string | null;
}

/**
 * 角色管理用：列出可按页面授权的工作台页面（首页 + 租户级共享自定义页面），含创建者展示名。
 * 授予某页 `workbench:<pageId>` 后，该角色成员可在工作台「完整查看」该页（含金额等全部内容）。
 */
export async function listWorkbenchPages(tenantId: string): Promise<WorkbenchPageSummary[]> {
  const config = await settingsService.getConfig(tenantId);
  const pages = readSharedWorkbenchPages(config);

  const creatorIds = [...new Set(pages.map(p => p.createdByUserId).filter((v): v is string => !!v))];
  const creators = creatorIds.length
    ? await basePrisma.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, displayName: true, username: true },
      })
    : [];
  const nameById = new Map(creators.map(u => [u.id, u.displayName || u.username]));

  const homeEntry: WorkbenchPageSummary = {
    id: WORKBENCH_HOME_PAGE_ID,
    title: '首页',
    createdByUserId: null,
    creatorName: null,
  };

  return [
    homeEntry,
    ...pages.map(p => ({
      id: p.id,
      title: p.title,
      createdByUserId: p.createdByUserId ?? null,
      creatorName: p.createdByUserId ? nameById.get(p.createdByUserId) ?? null : null,
    })),
  ];
}

/**
 * 计算当前用户因「工作台页面完整授权」而获得的附加业务模块。
 *
 * 语义：当某工作台页面对用户完整可见（owner / 被授予 `workbench:<pageId>` / 裸 `workbench`）时，
 * 该页所放置 widget 所需的模块（如 psi/production/finance）视为对该用户开放，
 * 以便统计接口为这些 widget 返回完整数据（前端再据页面授权解除金额掩码）。
 * 仅作用于统计数据读取，不影响其它业务接口的权限判定。
 */
export async function resolveWorkbenchAccessModules(
  userId: string,
  tenantId: string,
  permissions: string[],
  tenantRole?: string,
): Promise<string[]> {
  const [membership, config] = await Promise.all([
    getMembership(userId, tenantId),
    settingsService.getConfig(tenantId),
  ]);
  const homePage = readUserHomePage(membership.preferences);
  const sharedPages = readSharedWorkbenchPages(config);
  const assembled = assembleWorkbench(homePage, sharedPages);
  const visible = filterWorkbenchPagesByVisibility(assembled, {
    userId,
    permissions,
    tenantRole: membership.role,
  });

  const modules = new Set<string>();
  for (const page of visible.pages) {
    if (!hasWorkbenchPageFullAccess(page, { userId, permissions, tenantRole: tenantRole ?? membership.role })) {
      continue;
    }
    for (const item of page.layout.items) {
      const def = WORKBENCH_WIDGET_CATALOG.find(w => w.type === item.widgetType);
      if (def?.requiredModule) modules.add(def.requiredModule);
    }
  }
  return [...modules];
}

/**
 * 在统计接口读取数据前，按「工作台页面完整授权」为用户补齐附加模块权限。
 * owner 已持全部模块权限，无需补齐。
 */
export async function augmentPermissionsWithWorkbench(
  userId: string,
  tenantId: string,
  permissions: string[],
  tenantRole?: string,
): Promise<string[]> {
  if (tenantRole === 'owner') return permissions;
  const extra = await resolveWorkbenchAccessModules(userId, tenantId, permissions, tenantRole);
  if (extra.length === 0) return permissions;
  return [...new Set([...permissions, ...extra])];
}

const MAX_DASHBOARD_SHORTCUTS = 12;

export async function getShortcuts(userId: string, tenantId: string, permissions: string[]) {
  const [membership, config] = await Promise.all([
    getMembership(userId, tenantId),
    settingsService.getConfig(tenantId),
  ]);
  const featurePlugins = parseFeaturePlugins(config[DASHBOARD_SETTING_KEYS.featurePlugins]);
  const stored = readUserShortcutIds(membership.preferences);
  const selected = filterShortcutIdsByAccess(
    stored,
    permissions,
    featurePlugins,
    membership.role,
  );
  return {
    selected,
    defaults: DEFAULT_DASHBOARD_SHORTCUT_IDS,
    hasCustom: membership.preferences
      && typeof membership.preferences === 'object'
      && Array.isArray((membership.preferences as { dashboardShortcuts?: unknown }).dashboardShortcuts),
  };
}

export async function saveShortcuts(
  userId: string,
  tenantId: string,
  body: unknown,
  permissions: string[],
) {
  const membership = await getMembership(userId, tenantId);
  const config = await settingsService.getConfig(tenantId);
  const featurePlugins = parseFeaturePlugins(config[DASHBOARD_SETTING_KEYS.featurePlugins]);
  const rawIds = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { ids?: unknown }).ids)
      ? (body as { ids: unknown[] }).ids
      : [];
  const normalized = normalizeShortcutIds(rawIds).slice(0, MAX_DASHBOARD_SHORTCUTS);
  const selected = filterShortcutIdsByAccess(
    normalized,
    permissions,
    featurePlugins,
    membership.role,
  );
  if (selected.length === 0) {
    throw new AppError(400, '至少保留一个快捷入口');
  }

  const prefs =
    membership.preferences && typeof membership.preferences === 'object'
      ? { ...(membership.preferences as Record<string, unknown>) }
      : {};

  await basePrisma.tenantMembership.update({
    where: { id: membership.id },
    data: {
      preferences: {
        ...prefs,
        dashboardShortcuts: selected,
      } as object,
    },
  });

  return { selected };
}

function readUserOrderStatsNodeIds(preferences: unknown): string[] {
  if (!preferences || typeof preferences !== 'object') return [];
  const raw = (preferences as { dashboardOrderStatsNodes?: unknown }).dashboardOrderStatsNodes;
  return normalizeOrderStatsNodeIds(raw);
}

function readUserNodeIdsFromPrefs(preferences: unknown, key: string): string[] {
  if (!preferences || typeof preferences !== 'object') return [];
  const raw = (preferences as Record<string, unknown>)[key];
  return normalizeOrderStatsNodeIds(raw);
}

function canAccessProductionStats(permissions: string[]): boolean {
  return permissions.includes('production') || permissions.some(p => p.startsWith('production:'));
}

function resolveOrderStatsPeriodRange(query: WorkbenchStatsListQuery): {
  start: Date;
  end: Date;
  period: WorkbenchOrderStatsPeriod | null;
  customRange: WorkbenchCustomRange | null;
} {
  const resolved = resolveWorkbenchStatsQuery(query);
  return {
    start: resolved.periodRange.start,
    end: resolved.periodRange.end,
    period: resolved.period,
    customRange: resolved.customRange,
  };
}

async function loadNodeStatsSettingsContext(
  userId: string,
  tenantId: string,
  permissions: string[],
) {
  if (!canAccessProductionStats(permissions)) {
    throw new AppError(403, '无生产模块权限');
  }
  const db = getTenantPrisma(tenantId);
  const [membership, nodes] = await Promise.all([
    getMembership(userId, tenantId),
    db.globalNodeTemplate.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
  ]);
  return { db, membership, nodes };
}

async function saveUserNodeStatsSettings(
  userId: string,
  tenantId: string,
  body: unknown,
  permissions: string[],
  prefKey: string,
) {
  if (!canAccessProductionStats(permissions)) {
    throw new AppError(403, '无生产模块权限');
  }
  const { membership, nodes } = await loadNodeStatsSettingsContext(userId, tenantId, permissions);
  const nodeIds = new Set(nodes.map(n => n.id));
  const rawIds = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { ids?: unknown }).ids)
      ? (body as { ids: unknown[] }).ids
      : [];
  const selected = normalizeOrderStatsNodeIds(rawIds)
    .filter(id => nodeIds.has(id))
    .slice(0, MAX_DASHBOARD_ORDER_STATS_NODES);
  if (selected.length === 0) {
    throw new AppError(400, '至少选择一个工序');
  }

  const prefs =
    membership.preferences && typeof membership.preferences === 'object'
      ? { ...(membership.preferences as Record<string, unknown>) }
      : {};

  await basePrisma.tenantMembership.update({
    where: { id: membership.id },
    data: {
      preferences: {
        ...prefs,
        [prefKey]: selected,
      } as object,
    },
  });

  return { selected };
}

type OrderStatsAgg = {
  goodQty: number;
  defectiveQty: number;
};

function emptyOrderStatsAgg(): OrderStatsAgg {
  return { goodQty: 0, defectiveQty: 0 };
}

export async function getOrderStatsSettings(
  userId: string,
  tenantId: string,
  permissions: string[],
) {
  if (!canAccessProductionStats(permissions)) {
    throw new AppError(403, '无生产模块权限');
  }
  const db = getTenantPrisma(tenantId);
  const [membership, nodes] = await Promise.all([
    getMembership(userId, tenantId),
    db.globalNodeTemplate.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
  ]);
  const nodeIds = new Set(nodes.map(n => n.id));
  const defaults = nodes.slice(0, DEFAULT_DASHBOARD_ORDER_STATS_NODE_COUNT).map(n => n.id);
  const stored = readUserOrderStatsNodeIds(membership.preferences);
  const selected = (stored.length > 0 ? stored : defaults).filter(id => nodeIds.has(id));
  return {
    selected,
    nodes,
    defaults,
    hasCustom: membership.preferences
      && typeof membership.preferences === 'object'
      && Array.isArray((membership.preferences as { dashboardOrderStatsNodes?: unknown }).dashboardOrderStatsNodes),
  };
}

export async function saveOrderStatsSettings(
  userId: string,
  tenantId: string,
  body: unknown,
  permissions: string[],
) {
  if (!canAccessProductionStats(permissions)) {
    throw new AppError(403, '无生产模块权限');
  }
  const db = getTenantPrisma(tenantId);
  const membership = await getMembership(userId, tenantId);
  const nodes = await db.globalNodeTemplate.findMany({ select: { id: true } });
  const nodeIds = new Set(nodes.map(n => n.id));
  const rawIds = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { ids?: unknown }).ids)
      ? (body as { ids: unknown[] }).ids
      : [];
  const selected = normalizeOrderStatsNodeIds(rawIds)
    .filter(id => nodeIds.has(id))
    .slice(0, MAX_DASHBOARD_ORDER_STATS_NODES);
  if (selected.length === 0) {
    throw new AppError(400, '至少选择一个工序');
  }

  const prefs =
    membership.preferences && typeof membership.preferences === 'object'
      ? { ...(membership.preferences as Record<string, unknown>) }
      : {};

  await basePrisma.tenantMembership.update({
    where: { id: membership.id },
    data: {
      preferences: {
        ...prefs,
        dashboardOrderStatsNodes: selected,
      } as object,
    },
  });

  return { selected };
}

export async function getOrderStats(
  db: TenantPrismaClient,
  userId: string,
  tenantId: string,
  permissions: string[],
  opts: WorkbenchStatsListQuery & { includeNotStarted?: boolean } = {},
) {
  if (!canAccessProductionStats(permissions)) {
    return null;
  }
  const { start, end, period, customRange } = resolveOrderStatsPeriodRange(opts);
  const includeNotStarted = opts.includeNotStarted === true;
  const settings = await getOrderStatsSettings(userId, tenantId, permissions);
  const templateIds = settings.selected;
  if (templateIds.length === 0) {
    return { period, customRange, includeNotStarted, rows: [] as Array<{
      templateId: string;
      name: string;
      taskCount: number;
      maxReportableQty: number;
      reportedQty: number;
      remainingQty: number;
      goodQty: number;
      defectiveQty: number;
      progress: number;
    }> };
  }

  const rowMap = new Map<string, OrderStatsAgg>();
  for (const tid of templateIds) rowMap.set(tid, emptyOrderStatsAgg());

  const templateStats = await computeTemplateReportStats(db, tenantId, templateIds);

  const msReports = await db.milestoneReport.findMany({
    where: {
      timestamp: { gte: start, lte: end },
      milestone: { templateId: { in: templateIds } },
    },
    select: {
      quantity: true,
      defectiveQuantity: true,
      milestone: {
        select: {
          templateId: true,
          productionOrderId: true,
        },
      },
    },
  });

  for (const report of msReports) {
    const tid = report.milestone.templateId;
    const agg = rowMap.get(tid);
    if (!agg) continue;
    agg.goodQty += Number(report.quantity ?? 0);
    agg.defectiveQty += Number(report.defectiveQuantity ?? 0);
  }

  const pmpReports = await db.productProgressReport.findMany({
    where: {
      timestamp: { gte: start, lte: end },
      progress: { milestoneTemplateId: { in: templateIds } },
    },
    select: {
      quantity: true,
      defectiveQuantity: true,
      progress: { select: { milestoneTemplateId: true, productId: true } },
    },
  });

  for (const report of pmpReports) {
    const tid = report.progress.milestoneTemplateId;
    const agg = rowMap.get(tid);
    if (!agg) continue;
    agg.goodQty += Number(report.quantity ?? 0);
    agg.defectiveQty += Number(report.defectiveQuantity ?? 0);
  }

  const nodeRows = await db.globalNodeTemplate.findMany({
    where: { id: { in: templateIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(nodeRows.map(n => [n.id, n.name]));

  const rows = templateIds.map(tid => {
    const agg = rowMap.get(tid) ?? emptyOrderStatsAgg();
    const snap = templateStats.get(tid);
    const maxReportableQty = snap?.maxReportableQty ?? 0;
    const reportedQty = snap?.reportedQty ?? 0;
    const remainingQty = snap?.remainingQty ?? 0;
    const progress = snap?.progress ?? 0;
    return {
      templateId: tid,
      name: nameById.get(tid) ?? tid,
      taskCount: snap?.taskCount ?? 0,
      maxReportableQty,
      reportedQty,
      remainingQty,
      goodQty: agg.goodQty,
      defectiveQty: agg.defectiveQty,
      progress,
    };
  });

  return { period, customRange, includeNotStarted, rows };
}

async function getNodeStatsSettings(
  userId: string,
  tenantId: string,
  permissions: string[],
  prefKey: string,
) {
  const { membership, nodes } = await loadNodeStatsSettingsContext(userId, tenantId, permissions);
  const nodeIds = new Set(nodes.map(n => n.id));
  const defaults = nodes.slice(0, DEFAULT_DASHBOARD_ORDER_STATS_NODE_COUNT).map(n => n.id);
  const stored = readUserNodeIdsFromPrefs(membership.preferences, prefKey);
  const selected = (stored.length > 0 ? stored : defaults).filter(id => nodeIds.has(id));
  return {
    selected,
    nodes,
    defaults,
    hasCustom: membership.preferences
      && typeof membership.preferences === 'object'
      && Array.isArray((membership.preferences as Record<string, unknown>)[prefKey]),
  };
}

export async function getOutsourceStatsSettings(
  userId: string,
  tenantId: string,
  permissions: string[],
) {
  return getNodeStatsSettings(userId, tenantId, permissions, DASHBOARD_OUTSOURCE_STATS_NODES_KEY);
}

export async function saveOutsourceStatsSettings(
  userId: string,
  tenantId: string,
  body: unknown,
  permissions: string[],
) {
  return saveUserNodeStatsSettings(userId, tenantId, body, permissions, DASHBOARD_OUTSOURCE_STATS_NODES_KEY);
}

export async function getOutsourceStats(
  db: TenantPrismaClient,
  userId: string,
  tenantId: string,
  permissions: string[],
  opts: WorkbenchStatsListQuery = {},
) {
  if (!canAccessProductionStats(permissions)) return null;
  const { periodRange, period, customRange } = resolveWorkbenchStatsQuery(opts);
  const settings = await getOutsourceStatsSettings(userId, tenantId, permissions);
  const templateIds = settings.selected;
  if (templateIds.length === 0) {
    return { period, customRange, rows: [] };
  }

  const stats = await computeOutsourceTemplateStats(db, templateIds, periodRange);
  const nodeRows = await db.globalNodeTemplate.findMany({
    where: { id: { in: templateIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(nodeRows.map(n => [n.id, n.name]));

  const rows = templateIds.map(tid => {
    const snap = stats.get(tid);
    return {
      templateId: tid,
      name: nameById.get(tid) ?? tid,
      taskCount: snap?.taskCount ?? 0,
      pendingQty: snap?.pendingQty ?? 0,
      receivedQty: snap?.periodReceivedQty ?? 0,
      dispatchedQty: snap?.periodDispatchedQty ?? 0,
      progress: snap?.progress ?? 0,
    };
  });

  return { period, customRange, rows };
}

export async function getReworkStatsSettings(
  userId: string,
  tenantId: string,
  permissions: string[],
) {
  return getNodeStatsSettings(userId, tenantId, permissions, DASHBOARD_REWORK_STATS_NODES_KEY);
}

export async function saveReworkStatsSettings(
  userId: string,
  tenantId: string,
  body: unknown,
  permissions: string[],
) {
  return saveUserNodeStatsSettings(userId, tenantId, body, permissions, DASHBOARD_REWORK_STATS_NODES_KEY);
}

export async function getReworkStats(
  db: TenantPrismaClient,
  userId: string,
  tenantId: string,
  permissions: string[],
  opts: WorkbenchStatsListQuery = {},
) {
  if (!canAccessProductionStats(permissions)) return null;
  const { periodRange, period, customRange } = resolveWorkbenchStatsQuery(opts);
  const settings = await getReworkStatsSettings(userId, tenantId, permissions);
  const templateIds = settings.selected;
  if (templateIds.length === 0) {
    return { period, customRange, rows: [] };
  }

  const stats = await computeReworkTemplateStats(db, tenantId, templateIds, periodRange);
  const nodeRows = await db.globalNodeTemplate.findMany({
    where: { id: { in: templateIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(nodeRows.map(n => [n.id, n.name]));

  const rows = templateIds.map(tid => {
    const snap = stats.get(tid);
    return {
      templateId: tid,
      name: nameById.get(tid) ?? tid,
      taskCount: snap?.taskCount ?? 0,
      pendingQty: snap?.pendingQty ?? 0,
      completedQty: snap?.periodCompletedQty ?? 0,
      newReworkQty: snap?.periodNewReworkQty ?? 0,
      progress: snap?.progress ?? 0,
    };
  });

  return { period, customRange, rows };
}

export async function getStats(
  db: TenantPrismaClient,
  permissions: string[],
  opts: WorkbenchStatsListQuery & { days?: number } = {},
) {
  const days = Math.min(Math.max(1, opts.days ?? 30), 90);
  const { periodRange, period, customRange } = resolveWorkbenchStatsQuery(opts);
  const periodTs = { gte: periodRange.start, lte: periodRange.end };

  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const canProduction = permissions.includes('production') || permissions.some(p => p.startsWith('production:'));
  const canPsi = permissions.includes('psi') || permissions.some(p => p.startsWith('psi:'));
  const canFinance = permissions.includes('finance') || permissions.some(p => p.startsWith('finance:'));

  const result: Record<string, unknown> = {};

  if (canProduction) {
    const [activeOrders, milestones, prodSummary, recentOps] = await Promise.all([
      db.productionOrder.count({ where: { status: { not: OrderStatus.SHIPPED } } }),
      db.milestone.findMany({
        select: { status: true },
      }),
      productionService.summarize(db, { startDate: since.toISOString() }),
      db.productionOpRecord.findMany({
        where: { timestamp: { gte: since } },
        select: { timestamp: true, quantity: true },
        take: 5000,
        orderBy: { timestamp: 'asc' },
      }),
    ]);

    const totalMs = milestones.length;
    const completedMs = milestones.filter(m => m.status === 'COMPLETED').length;
    const completionRate = totalMs > 0 ? Math.round((completedMs / totalMs) * 100) : 0;

    const trendMap = new Map<string, { quantity: number; count: number }>();
    for (const row of recentOps) {
      const d = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp);
      const key = d.toISOString().slice(0, 10);
      const prev = trendMap.get(key) ?? { quantity: 0, count: 0 };
      trendMap.set(key, {
        quantity: prev.quantity + Number(row.quantity ?? 0),
        count: prev.count + 1,
      });
    }
    const trend = [...trendMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    result.production = {
      activeOrders,
      totalMilestones: totalMs,
      completedMilestones: completedMs,
      completionRate,
      summary: prodSummary,
      trend,
    };
  }

  if (canPsi) {
    const [salesPeriod, salesReturnPeriod, salesOrderPeriod, salesOrderReducePeriod, salesOrderDocs] =
      await Promise.all([
      db.psiRecord.aggregate({
        where: { type: 'SALES_BILL', timestamp: periodTs, quantity: { gt: 0 } },
        _sum: { amount: true, quantity: true },
        _count: { _all: true },
      }),
      db.psiRecord.aggregate({
        where: { type: 'SALES_BILL', timestamp: periodTs, quantity: { lt: 0 } },
        _sum: { quantity: true },
      }),
      db.psiRecord.aggregate({
        where: { type: 'SALES_ORDER', timestamp: periodTs, quantity: { gt: 0 } },
        _sum: { amount: true, quantity: true },
      }),
      db.psiRecord.aggregate({
        where: { type: 'SALES_ORDER', timestamp: periodTs, quantity: { lt: 0 } },
        _sum: { quantity: true },
      }),
      db.psiRecord.groupBy({
        by: ['docNumber'],
        where: {
          type: 'SALES_ORDER',
          timestamp: periodTs,
          quantity: { gt: 0 },
          docNumber: { not: null },
        },
      }),
    ]);

    const salesReturnQtyRaw = Number(salesReturnPeriod._sum.quantity ?? 0);
    const salesOrderReduceQtyRaw = Number(salesOrderReducePeriod._sum.quantity ?? 0);

    result.sales = {
      period,
      customRange,
      salesBillCount: salesPeriod._count._all,
      salesAmount: Number(salesPeriod._sum.amount ?? 0),
      salesQuantity: Number(salesPeriod._sum.quantity ?? 0),
      salesReturnQuantity: salesReturnQtyRaw < 0 ? -salesReturnQtyRaw : salesReturnQtyRaw,
    };

    result.salesOrder = {
      period,
      customRange,
      salesOrderCount: salesOrderDocs.length,
      salesOrderAmount: Number(salesOrderPeriod._sum.amount ?? 0),
      salesOrderQuantity: Number(salesOrderPeriod._sum.quantity ?? 0),
      salesOrderReduceQuantity:
        salesOrderReduceQtyRaw < 0 ? -salesOrderReduceQtyRaw : salesOrderReduceQtyRaw,
    };
  }

  if (canFinance) {
    const [receipts, payments] = await Promise.all([
      db.financeRecord.aggregate({
        where: { type: 'RECEIPT', timestamp: periodTs },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      db.financeRecord.aggregate({
        where: { type: 'PAYMENT', timestamp: periodTs },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    const receiptAmount = Number(receipts._sum.amount ?? 0);
    const paymentAmount = Number(payments._sum.amount ?? 0);

    result.finance = {
      period,
      customRange,
      receiptAmount,
      paymentAmount,
      cashFlow: receiptAmount - paymentAmount,
      receiptCount: receipts._count._all,
      paymentCount: payments._count._all,
    };
  }

  return result;
}

export async function resolveUserPermissions(userId: string, tenantId: string) {
  return loadEffectivePermissions(userId, tenantId);
}

export { getTenantPrisma };
