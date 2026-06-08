import { prisma as basePrisma } from '../lib/prisma.js';
import { getTenantPrisma, type TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { isTenantElevatedRole, hasSubPermission } from '../types/index.js';
import { loadEffectivePermissions } from '../services/auth.service.js';
import * as settingsService from './settings.service.js';
import * as productionService from './production.service.js';
import * as financeService from './finance.service.js';
import {
  DASHBOARD_SETTING_KEYS,
  defaultFeaturePlugins,
  type WorkbenchConfig,
  type FeaturePluginsConfig,
} from '../../../shared/workbench.js';
import {
  DEFAULT_DASHBOARD_SHORTCUT_IDS,
  normalizeShortcutIds,
  resolveShortcutItems,
} from '../../../shared/workbenchShortcuts.js';
import {
  DASHBOARD_PLATFORM_PUBLISHER,
  MAX_PLATFORM_ANNOUNCEMENTS,
  publishedMessageToNotification,
  type DashboardPublishedMessage,
} from '../../../shared/dashboardMessages.js';
import {
  buildTenantExpiryReminderContent,
  resolveTenantExpiryReminderDay,
  tenantExpiryReminderId,
  DASHBOARD_SYSTEM_PUBLISHER,
} from '../../../shared/tenantExpiryReminder.js';
import {
  filterWorkbenchByAccess,
  normalizeWorkbenchConfig,
  resolveEffectiveWorkbenchConfig,
} from '../../../shared/workbenchValidate.js';
import { OrderStatus } from '../../../shared/types.js';

function parseWorkbenchConfig(value: unknown): WorkbenchConfig | null {
  if (value == null) return null;
  return normalizeWorkbenchConfig(value);
}

function parseFeaturePlugins(value: unknown): FeaturePluginsConfig {
  const base = defaultFeaturePlugins();
  if (!value || typeof value !== 'object') return base;
  return { ...base, ...(value as FeaturePluginsConfig) };
}

async function getMembership(userId: string, tenantId: string) {
  const m = await basePrisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (!m) throw new AppError(403, '非本企业成员');
  return m;
}

function readUserWorkbench(preferences: unknown): WorkbenchConfig | null {
  if (!preferences || typeof preferences !== 'object') return null;
  const wb = (preferences as { dashboardWorkbench?: unknown }).dashboardWorkbench;
  return parseWorkbenchConfig(wb);
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
      if (!permissions || permissions.length === 0) return true;
      if (item.perm && !hasSubPermission(permissions, item.perm)) return false;
      if (item.module && !hasSubPermission(permissions, item.module)) {
        if (!permissions.some(p => p.startsWith(`${item.module}:`))) return false;
      }
      return true;
    })
    .map(item => item.id);
}

export async function getWorkbench(userId: string, tenantId: string, permissions: string[]) {
  const [membership, config] = await Promise.all([
    getMembership(userId, tenantId),
    settingsService.getConfig(tenantId),
  ]);

  const userOverride = readUserWorkbench(membership.preferences);
  const featurePlugins = parseFeaturePlugins(config[DASHBOARD_SETTING_KEYS.featurePlugins]);
  const accessOpts = { permissions, featurePlugins, tenantRole: membership.role };

  const effectiveRaw = resolveEffectiveWorkbenchConfig(userOverride);
  const effective = filterWorkbenchByAccess(effectiveRaw, accessOpts);

  return { effective };
}

export async function saveUserWorkbench(
  userId: string,
  tenantId: string,
  body: unknown,
  permissions: string[],
) {
  const membership = await getMembership(userId, tenantId);
  const config = await settingsService.getConfig(tenantId);
  const featurePlugins = parseFeaturePlugins(config[DASHBOARD_SETTING_KEYS.featurePlugins]);
  const normalized = normalizeWorkbenchConfig(body);
  const filtered = filterWorkbenchByAccess(normalized, {
    permissions,
    featurePlugins,
    tenantRole: membership.role,
  });

  const prefs =
    membership.preferences && typeof membership.preferences === 'object'
      ? { ...(membership.preferences as Record<string, unknown>) }
      : {};

  await basePrisma.tenantMembership.update({
    where: { id: membership.id },
    data: {
      preferences: {
        ...prefs,
        dashboardWorkbench: filtered,
      } as object,
    },
  });

  return filtered;
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

export async function getFeaturePlugins(tenantId: string) {
  const config = await settingsService.getConfig(tenantId);
  return parseFeaturePlugins(config[DASHBOARD_SETTING_KEYS.featurePlugins]);
}

export async function updateFeaturePlugins(tenantId: string, body: unknown) {
  const current = await getFeaturePlugins(tenantId);
  if (!body || typeof body !== 'object') {
    throw new AppError(400, '无效的功能插件配置');
  }
  const next = { ...current, ...(body as FeaturePluginsConfig) };
  await settingsService.updateConfig(tenantId, DASHBOARD_SETTING_KEYS.featurePlugins, next);
  return next;
}

export async function assertCanManageFeaturePlugins(
  tenantRole: string | undefined,
  permissions: string[],
  userRole?: string,
) {
  if (userRole === 'admin') return;
  if (isTenantElevatedRole(tenantRole)) return;
  if (hasSubPermission(permissions, 'settings:config:edit')) return;
  throw new AppError(403, '仅管理员可操作');
}

export async function getStats(
  db: TenantPrismaClient,
  permissions: string[],
  opts: { days?: number } = {},
) {
  const days = Math.min(Math.max(1, opts.days ?? 30), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

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
    const [salesMonth, salesAll, purchaseMonth, stockRows] = await Promise.all([
      db.psiRecord.aggregate({
        where: { type: 'SALES_BILL', timestamp: { gte: monthStart } },
        _sum: { amount: true, quantity: true },
        _count: { _all: true },
      }),
      db.psiRecord.aggregate({
        where: { type: 'SALES_BILL' },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      db.psiRecord.aggregate({
        where: { type: 'PURCHASE_BILL', timestamp: { gte: monthStart } },
        _sum: { amount: true, quantity: true },
        _count: { _all: true },
      }),
      db.psiRecord.groupBy({
        by: ['productId'],
        where: { productId: { not: null } },
        _sum: { quantity: true },
      }),
    ]);

    const lowStockThreshold = 10;
    let lowStockCount = 0;
    for (const row of stockRows) {
      const qty = Number(row._sum.quantity ?? 0);
      if (qty >= 0 && qty < lowStockThreshold) lowStockCount += 1;
    }

    result.sales = {
      monthBillCount: salesMonth._count._all,
      monthAmount: Number(salesMonth._sum.amount ?? 0),
      monthQuantity: Number(salesMonth._sum.quantity ?? 0),
      totalBillCount: salesAll._count._all,
      totalAmount: Number(salesAll._sum.amount ?? 0),
      purchaseMonthCount: purchaseMonth._count._all,
      purchaseMonthAmount: Number(purchaseMonth._sum.amount ?? 0),
      lowStockCount,
      lowStockThreshold,
    };
  }

  if (canFinance) {
    const financeSummary = await financeService.summarize(db, { startDate: since.toISOString() });
    const receipts = await db.financeRecord.aggregate({
      where: { type: 'RECEIPT' },
      _sum: { amount: true },
    });
    const payments = await db.financeRecord.aggregate({
      where: { type: 'PAYMENT' },
      _sum: { amount: true },
    });
    const totalReceipt = Number(receipts._sum.amount ?? 0);
    const totalPayment = Number(payments._sum.amount ?? 0);

    result.finance = {
      totalReceipt,
      totalPayment,
      cashFlow: totalReceipt - totalPayment,
      summary: financeSummary,
    };
  }

  return result;
}

export type DashboardNotification = {
  id: string;
  type: 'system' | 'announcement' | 'expiry_reminder';
  title: string;
  body: string;
  createdAt: string;
  href?: string;
  publisherName?: string;
};

const MAX_PLATFORM_ANNOUNCEMENTS_STORE = MAX_PLATFORM_ANNOUNCEMENTS;

/** 平台公告表需 prisma generate + migrate；旧进程未重启时 delegate 可能为 undefined */
function getPlatformAnnouncementDelegate() {
  type PlatformAnnouncementDelegate = {
    findMany: (args: object) => Promise<Array<{ id: string; title: string; body: string; createdAt: Date }>>;
    findUnique: (args: object) => Promise<{ id: string; title: string; body: string; createdAt: Date } | null>;
    create: (args: object) => Promise<unknown>;
    delete: (args: object) => Promise<unknown>;
    deleteMany: (args: object) => Promise<unknown>;
  };
  const delegate = (basePrisma as unknown as { platformAnnouncement?: PlatformAnnouncementDelegate })
    .platformAnnouncement;
  if (!delegate) {
    throw new AppError(
      503,
      '平台公告功能尚未就绪，请在 backend 目录执行 npx prisma generate && npx prisma migrate deploy，并重启 API 服务',
    );
  }
  return delegate;
}

async function loadPlatformAnnouncements(): Promise<DashboardPublishedMessage[]> {
  const rows = await getPlatformAnnouncementDelegate().findMany({
    orderBy: { createdAt: 'desc' },
    take: MAX_PLATFORM_ANNOUNCEMENTS_STORE,
  });
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    publisherName: DASHBOARD_PLATFORM_PUBLISHER,
  }));
}

function assertPlatformAdmin(userRole?: string) {
  if (userRole !== 'admin') throw new AppError(403, '仅平台管理员可操作');
}

async function buildExpiryReminderNotification(
  tenantId: string,
): Promise<DashboardNotification | null> {
  const tenant = await basePrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { expiresAt: true },
  });
  if (!tenant?.expiresAt) return null;
  const now = new Date();
  const daysLeft = resolveTenantExpiryReminderDay(now, tenant.expiresAt);
  if (!daysLeft) return null;
  const { title, body } = buildTenantExpiryReminderContent(daysLeft, tenant.expiresAt);
  return {
    id: tenantExpiryReminderId(tenantId, daysLeft),
    type: 'expiry_reminder',
    title,
    body,
    createdAt: now.toISOString(),
    publisherName: DASHBOARD_SYSTEM_PUBLISHER,
  };
}

function toAnnouncementNotification(msg: DashboardPublishedMessage): DashboardNotification {
  return {
    ...publishedMessageToNotification(msg),
    publisherName: msg.publisherName,
  };
}

/** 工作台消息 feed：全平台公告 + 到期提醒 */
export async function getNotifications(
  tenantId: string,
  _userId: string,
  _tenantRole: string | undefined,
  _permissions: string[],
  opts: { limit?: number } = {},
) {
  const limit = Math.min(Math.max(1, opts.limit ?? 20), 50);
  const [platformMsgs, expiryReminder] = await Promise.all([
    loadPlatformAnnouncements(),
    buildExpiryReminderNotification(tenantId),
  ]);

  const items: DashboardNotification[] = platformMsgs.map(toAnnouncementNotification);
  if (expiryReminder) items.push(expiryReminder);

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (items.length === 0) {
    items.push({
      id: 'system-welcome',
      type: 'system',
      title: '欢迎使用工作台',
      body: '系统通知与到期提醒将在此展示',
      createdAt: new Date().toISOString(),
      publisherName: DASHBOARD_SYSTEM_PUBLISHER,
    });
  }

  return items.slice(0, limit);
}

/** 平台 admin 管理全平台公告列表 */
export async function listPlatformAnnouncements(userRole?: string) {
  assertPlatformAdmin(userRole);
  return loadPlatformAnnouncements();
}

export async function publishPlatformAnnouncement(
  input: { title: string; body: string },
  userRole?: string,
) {
  assertPlatformAdmin(userRole);

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new AppError(400, '标题不能为空');
  if (!body) throw new AppError(400, '内容不能为空');
  if (title.length > 80) throw new AppError(400, '标题最多 80 字');
  if (body.length > 2000) throw new AppError(400, '内容最多 2000 字');

  const platformAnnouncement = getPlatformAnnouncementDelegate();
  await platformAnnouncement.create({
    data: { title, body },
  });
  const all = await platformAnnouncement.findMany({
    orderBy: { createdAt: 'desc' },
  });
  if (all.length > MAX_PLATFORM_ANNOUNCEMENTS_STORE) {
    const toRemove = all.slice(MAX_PLATFORM_ANNOUNCEMENTS_STORE);
    await platformAnnouncement.deleteMany({
      where: { id: { in: toRemove.map(r => r.id) } },
    });
  }
  return loadPlatformAnnouncements();
}

export async function deletePlatformAnnouncement(messageId: string, userRole?: string) {
  assertPlatformAdmin(userRole);

  const platformAnnouncement = getPlatformAnnouncementDelegate();
  const existing = await platformAnnouncement.findUnique({ where: { id: messageId } });
  if (!existing) throw new AppError(404, '消息不存在');
  await platformAnnouncement.delete({ where: { id: messageId } });
  return loadPlatformAnnouncements();
}

export async function resolveUserPermissions(userId: string, tenantId: string) {
  return loadEffectivePermissions(userId, tenantId);
}

export { getTenantPrisma };
