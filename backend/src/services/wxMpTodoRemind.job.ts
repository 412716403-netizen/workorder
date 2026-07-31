import { prisma } from '../lib/prisma.js';
import { isWechatMpConfigured } from '../lib/wechatMp.js';
import {
  buildTenantExpiryReminderContent,
  resolveTenantExpiryReminderDay,
  tenantExpiryReminderId,
} from '../../../shared/tenantExpiryReminder.js';
import {
  listBoundMemberUserIds,
  sendAnnouncementPush,
  sendCollabPush,
  sendExpiryReminderPush,
  sendTodoRemindPush,
} from './wxMpPush.service.js';

const POLL_MS = 60_000;
/** 到期超过该窗口且仍未推送成功的，标记 remindedAt 停止重试 */
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
/** 协作 / 公告只扫最近窗口，避免冷启动刷历史 */
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export async function processDueTodoWxReminds(): Promise<{ processed: number }> {
  if (!isWechatMpConfigured()) return { processed: 0 };

  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_MS);

  const rows = await prisma.todoItem.findMany({
    where: {
      remindEnabled: true,
      status: 'open',
      remindedAt: null,
      remindAt: { lte: now, not: null },
    },
    select: {
      id: true,
      userId: true,
      note: true,
      sourceTitle: true,
      remindAt: true,
    },
    orderBy: { remindAt: 'asc' },
    take: 50,
  });

  let processed = 0;
  for (const row of rows) {
    if (!row.remindAt) continue;

    if (row.remindAt.getTime() < staleBefore.getTime()) {
      await prisma.todoItem.update({
        where: { id: row.id },
        data: { remindedAt: now },
      });
      processed += 1;
      continue;
    }

    const result = await sendTodoRemindPush({
      userId: row.userId,
      todoId: row.id,
      note: row.note,
      sourceTitle: row.sourceTitle,
      remindAt: row.remindAt,
    });

    if (result.status === 'sent' || result.status === 'skipped') {
      await prisma.todoItem.update({
        where: { id: row.id },
        data: { remindedAt: now },
      });
      processed += 1;
    }
  }

  return { processed };
}

/** 最近公告 → 已绑定用户（幂等；发布时也会 fanout，此处兜底） */
export async function processAnnouncementWxPushes(): Promise<{ processed: number }> {
  if (!isWechatMpConfigured()) return { processed: 0 };
  const since = new Date(Date.now() - RECENT_MS);
  const announcements = await prisma.platformAnnouncement.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, title: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  if (announcements.length === 0) return { processed: 0 };

  const boundUsers = await prisma.user.findMany({
    where: { wxMpOpenId: { not: null } },
    select: { id: true },
    take: 2000,
  });

  let processed = 0;
  for (const ann of announcements) {
    for (const u of boundUsers) {
      const r = await sendAnnouncementPush({
        userId: u.id,
        announcementId: ann.id,
        title: ann.title,
        createdAt: ann.createdAt,
      });
      if (r.status === 'sent') processed += 1;
    }
  }
  return { processed };
}

/** 租户到期提醒日 → 企业内已绑定成员 */
export async function processExpiryWxPushes(): Promise<{ processed: number }> {
  if (!isWechatMpConfigured()) return { processed: 0 };
  const now = new Date();
  const tenants = await prisma.tenant.findMany({
    where: { expiresAt: { not: null } },
    select: { id: true, expiresAt: true },
    take: 500,
  });

  let processed = 0;
  for (const tenant of tenants) {
    const daysLeft = resolveTenantExpiryReminderDay(now, tenant.expiresAt);
    if (!daysLeft || !tenant.expiresAt) continue;
    const { title } = buildTenantExpiryReminderContent(daysLeft, tenant.expiresAt);
    const reminderId = tenantExpiryReminderId(tenant.id, daysLeft);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const userIds = await listBoundMemberUserIds(tenant.id);
    for (const userId of userIds) {
      const r = await sendExpiryReminderPush({
        userId,
        reminderId,
        title,
        at: dayStart,
      });
      if (r.status === 'sent') processed += 1;
    }
  }
  return { processed };
}

/**
 * 协作待处理（对齐小程序消息 Tab）：
 * - 待接受派发 → 接收方企业成员
 * - 待收回回传 → 发送方企业成员
 * - 待确认转发 → 发起方企业成员
 */
export async function processCollabWxPushes(): Promise<{ processed: number }> {
  if (!isWechatMpConfigured()) return { processed: 0 };
  const since = new Date(Date.now() - RECENT_MS);
  let processed = 0;

  const pendingDispatches = await prisma.subcontractCollaborationDispatch.findMany({
    where: { status: 'PENDING', createdAt: { gte: since } },
    select: {
      id: true,
      createdAt: true,
      transfer: {
        select: {
          senderTenantId: true,
          receiverTenantId: true,
          senderProductName: true,
        },
      },
    },
    take: 40,
    orderBy: { createdAt: 'asc' },
  });

  for (const d of pendingDispatches) {
    const product = d.transfer.senderProductName || '';
    const title = product ? `协作派发待接受 · ${product}` : '协作派发待接受';
    const userIds = await listBoundMemberUserIds(d.transfer.receiverTenantId);
    for (const userId of userIds) {
      const r = await sendCollabPush({
        userId,
        dedupeKey: `collab_dispatch:${d.id}:${userId}`,
        title,
        at: d.createdAt,
        peerTenantId: d.transfer.senderTenantId,
      });
      if (r.status === 'sent') processed += 1;
    }
  }

  const pendingReturns = await prisma.subcontractCollaborationReturn.findMany({
    where: { status: 'PENDING_A_RECEIVE', createdAt: { gte: since } },
    select: {
      id: true,
      createdAt: true,
      transfer: {
        select: {
          senderTenantId: true,
          receiverTenantId: true,
          senderProductName: true,
        },
      },
    },
    take: 40,
    orderBy: { createdAt: 'asc' },
  });

  for (const ret of pendingReturns) {
    const product = ret.transfer.senderProductName || '';
    const title = product ? `协作回传待收回 · ${product}` : '协作回传待收回';
    const userIds = await listBoundMemberUserIds(ret.transfer.senderTenantId);
    for (const userId of userIds) {
      const r = await sendCollabPush({
        userId,
        dedupeKey: `collab_return:${ret.id}:${userId}`,
        title,
        at: ret.createdAt,
        peerTenantId: ret.transfer.receiverTenantId,
      });
      if (r.status === 'sent') processed += 1;
    }
  }

  const pendingForwards = await prisma.interTenantSubcontractTransfer.findMany({
    where: {
      createdAt: { gte: since },
      originConfirmedAt: null,
      chainStep: { gt: 0 },
      originTenantId: { not: null },
    },
    select: {
      id: true,
      createdAt: true,
      originTenantId: true,
      receiverTenantId: true,
      senderProductName: true,
    },
    take: 40,
    orderBy: { createdAt: 'asc' },
  });

  for (const t of pendingForwards) {
    if (!t.originTenantId) continue;
    const product = t.senderProductName || '';
    const title = product ? `协作转发待确认 · ${product}` : '协作转发待确认';
    const userIds = await listBoundMemberUserIds(t.originTenantId);
    for (const userId of userIds) {
      const r = await sendCollabPush({
        userId,
        dedupeKey: `collab_forward:${t.id}:${userId}`,
        title,
        at: t.createdAt,
        peerTenantId: t.receiverTenantId,
      });
      if (r.status === 'sent') processed += 1;
    }
  }

  return { processed };
}

export async function processAllWxMpMessagePushes(): Promise<{
  todos: number;
  announcements: number;
  expiry: number;
  collab: number;
}> {
  // 串行：避免同一轮对微信接口并发打满
  const todos = await processDueTodoWxReminds();
  const announcements = await processAnnouncementWxPushes();
  const expiry = await processExpiryWxPushes();
  const collab = await processCollabWxPushes();
  return {
    todos: todos.processed,
    announcements: announcements.processed,
    expiry: expiry.processed,
    collab: collab.processed,
  };
}

export function startWxMpTodoRemindJob(): void {
  if (timer || !isWechatMpConfigured()) return;
  const tick = () => {
    if (running) return;
    running = true;
    processAllWxMpMessagePushes()
      .then(r => {
        const total = r.todos + r.announcements + r.expiry + r.collab;
        if (total > 0) {
          console.log('[wx-mp] message pushes', r);
        }
      })
      .catch(err => console.warn('[wx-mp] message push job failed:', err))
      .finally(() => {
        running = false;
      });
  };
  setTimeout(tick, 15_000);
  timer = setInterval(tick, POLL_MS);
  console.log('[wx-mp] message push job started (every 60s: todo/announcement/expiry/collab)');
}

export function stopWxMpTodoRemindJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
