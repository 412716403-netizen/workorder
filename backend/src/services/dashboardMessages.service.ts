/**
 * 工作台消息服务：消息 feed（平台公告 / 到期提醒 / 待办提醒）、个人已读状态、平台公告管理。
 * 从 dashboard.service.ts 拆出，避免单 service 过大。
 */

import { prisma as basePrisma, getTenantPrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { getMembership } from './tenantMembership.service.js';
import { getFeaturePlugins } from './featurePlugins.service.js';
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

export type DashboardNotification = {
  id: string;
  type: 'system' | 'announcement' | 'expiry_reminder' | 'todo';
  title: string;
  body: string;
  createdAt: string;
  href?: string;
  publisherName?: string;
  /** 待办类消息的完成状态（前端用复选框/按钮展示，标题不再追加「已完成」） */
  done?: boolean;
};

/** 个人消息已读 id 列表，存 membership.preferences.dashboardNotificationReadIds */
const NOTIFICATION_READ_PREF_KEY = 'dashboardNotificationReadIds';
const MAX_NOTIFICATION_READ_IDS = 300;

function normalizeNotificationReadIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' && typeof item !== 'number') continue;
    const id = String(item).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_NOTIFICATION_READ_IDS) break;
  }
  return out;
}

function readNotificationReadIdsFromPrefs(preferences: unknown): string[] {
  if (!preferences || typeof preferences !== 'object') return [];
  return normalizeNotificationReadIds(
    (preferences as Record<string, unknown>)[NOTIFICATION_READ_PREF_KEY],
  );
}

export async function getNotificationReads(userId: string, tenantId: string) {
  const membership = await getMembership(userId, tenantId);
  return { ids: readNotificationReadIdsFromPrefs(membership.preferences) };
}

/** 合并标记已读；新 id 优先保留，总量上限 MAX_NOTIFICATION_READ_IDS */
export async function markNotificationsRead(userId: string, tenantId: string, ids: string[]) {
  const membership = await getMembership(userId, tenantId);
  const existing = readNotificationReadIdsFromPrefs(membership.preferences);
  const incoming = normalizeNotificationReadIds(ids);
  const merged = normalizeNotificationReadIds([...incoming, ...existing]);

  // 全部已在已读集合内（客户端重复上报）：跳过写库
  const unchanged =
    merged.length === existing.length && merged.every((id, i) => id === existing[i]);
  if (unchanged) return { ids: existing };

  const prefs =
    membership.preferences && typeof membership.preferences === 'object'
      ? { ...(membership.preferences as Record<string, unknown>) }
      : {};

  await basePrisma.tenantMembership.update({
    where: { id: membership.id },
    data: {
      preferences: {
        ...prefs,
        [NOTIFICATION_READ_PREF_KEY]: merged,
      } as object,
    },
  });

  return { ids: merged };
}

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
    take: MAX_PLATFORM_ANNOUNCEMENTS,
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
  // 当日提醒的「发送时间」取当天 0 点，避免列表时间随每次拉取跳动
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    id: tenantExpiryReminderId(tenantId, daysLeft),
    type: 'expiry_reminder',
    title,
    body,
    createdAt: dayStart.toISOString(),
    publisherName: DASHBOARD_SYSTEM_PUBLISHER,
  };
}

function toAnnouncementNotification(msg: DashboardPublishedMessage): DashboardNotification {
  return {
    ...publishedMessageToNotification(msg),
    publisherName: msg.publisherName,
  };
}

const TODO_REMINDER_PUBLISHER = '待办提醒';

/** todo_reminder 插件：当前用户到点未完成的待办，注入消息流 */
async function buildTodoReminderNotifications(
  tenantId: string,
  userId: string,
): Promise<DashboardNotification[]> {
  const plugins = await getFeaturePlugins(tenantId);
  if (plugins.todo_reminder !== true) return [];

  const db = getTenantPrisma(tenantId);
  const now = new Date();
  // 到点的待办（含已完成）都保留在消息中心：完成后不消失，完成状态用 done 字段返回
  type TodoReminderRow = {
    id: string;
    note: string;
    sourceDocNo: string | null;
    sourceTitle: string | null;
    href: string | null;
    remindAt: Date | null;
    status: string;
  };
  let rows: TodoReminderRow[];
  try {
    rows = (await db.todoItem.findMany({
      where: {
        userId,
        remindEnabled: true,
        remindAt: { lte: now },
      },
      select: { id: true, note: true, sourceDocNo: true, sourceTitle: true, href: true, remindAt: true, status: true },
      orderBy: { remindAt: 'desc' },
      take: 20,
    })) as TodoReminderRow[];
  } catch {
    // 待办表尚未迁移（todo migration 未执行）或查询异常时，降级为空，
    // 避免一个插件特性拖垮整个工作台消息中心接口。
    return [];
  }

  return rows.map(row => {
    const docLabel = [row.sourceDocNo, row.sourceTitle].filter(Boolean).join(' ');
    // 标题只放固定提示 + 关联单据；完成状态由 done 字段驱动，不再追加「已完成」
    const title = docLabel ? `待办提醒 · ${docLabel}` : '待办提醒';
    return {
      id: `todo-${row.id}`,
      type: 'todo' as const,
      title,
      body: row.note,
      createdAt: (row.remindAt ?? now).toISOString(),
      href: row.href ?? undefined,
      publisherName: TODO_REMINDER_PUBLISHER,
      done: row.status === 'done',
    };
  });
}

/** 工作台消息 feed：全平台公告 + 到期提醒 + 待办提醒 */
export async function getNotifications(
  tenantId: string,
  userId: string,
  _tenantRole: string | undefined,
  _permissions: string[],
  opts: { limit?: number } = {},
) {
  const limit = Math.min(Math.max(1, opts.limit ?? 20), 50);
  const [platformMsgs, expiryReminder, todoReminders] = await Promise.all([
    loadPlatformAnnouncements(),
    buildExpiryReminderNotification(tenantId),
    buildTodoReminderNotifications(tenantId, userId),
  ]);

  const items: DashboardNotification[] = platformMsgs.map(toAnnouncementNotification);
  if (expiryReminder) items.push(expiryReminder);
  items.push(...todoReminders);

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (items.length === 0) {
    // 占位欢迎消息：时间取成员加入企业时间（稳定「发送时间」），避免每次拉取都变成当前时刻
    let welcomeAt: Date;
    try {
      welcomeAt = (await getMembership(userId, tenantId)).createdAt;
    } catch {
      welcomeAt = new Date();
    }
    items.push({
      id: 'system-welcome',
      type: 'system',
      title: '欢迎使用工作台',
      body: '系统通知与到期提醒将在此展示',
      createdAt: welcomeAt.toISOString(),
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
  const created = (await platformAnnouncement.create({
    data: { title, body },
  })) as { id: string; title: string; body: string; createdAt: Date };
  const all = await platformAnnouncement.findMany({
    orderBy: { createdAt: 'desc' },
  });
  if (all.length > MAX_PLATFORM_ANNOUNCEMENTS) {
    const toRemove = all.slice(MAX_PLATFORM_ANNOUNCEMENTS);
    await platformAnnouncement.deleteMany({
      where: { id: { in: toRemove.map(r => r.id) } },
    });
  }

  // 异步广播服务号推送，不阻塞发布接口
  void import('./wxMpPush.service.js')
    .then(({ fanoutAnnouncementPush }) =>
      fanoutAnnouncementPush({
        id: created.id,
        title: created.title,
        createdAt: created.createdAt,
      }),
    )
    .catch(err => console.warn('[wx-mp] announcement fanout failed:', err));

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
