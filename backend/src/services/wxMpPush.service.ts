import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { isWechatMpConfigured, sendMpTemplateMessage } from '../lib/wechatMp.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  WX_MP_MESSAGE_PAGEPATHS,
  WX_MP_TEMPLATE_KEYS,
  truncateWxTemplateThing,
  type WxMpTemplateKey,
} from '../types/index.js';

const MAX_ATTEMPTS = 5;

/** 未单独配置其它模板时，统一回落到待办提醒模板（当前仅有一条服务号模板） */
function resolveTemplateId(key: WxMpTemplateKey): string | undefined {
  const primary = env.WX_MP_TEMPLATE_TODO_REMIND;
  if (!primary) return undefined;
  switch (key) {
    case WX_MP_TEMPLATE_KEYS.TODO_REMIND:
    case WX_MP_TEMPLATE_KEYS.ANNOUNCEMENT:
    case WX_MP_TEMPLATE_KEYS.EXPIRY_REMINDER:
    case WX_MP_TEMPLATE_KEYS.COLLAB:
      return primary;
    default:
      return primary;
  }
}

export function formatWxTemplateTime(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}年${m}月${day}日 ${hh}:${mm}`;
}

/** 通用消息模板字段：thing1=标题，time3=时间（对齐现有「企业任务待办提醒」） */
export function buildMessageTemplateData(
  title: string,
  at: Date,
): { thing1: { value: string }; time3: { value: string } } {
  return {
    thing1: { value: truncateWxTemplateThing(title) || '新消息' },
    time3: { value: formatWxTemplateTime(at) },
  };
}

export function buildTodoRemindTemplateData(input: {
  note: string;
  sourceTitle?: string | null;
  remindAt: Date;
}): { thing1: { value: string }; time3: { value: string } } {
  const title = input.sourceTitle?.trim() || input.note.trim() || '待办提醒';
  return buildMessageTemplateData(title, input.remindAt);
}

/**
 * 幂等发送服务号模板消息（仅对已绑定用户；调用方应尽量先筛 wxMpOpenId）。
 */
export async function sendTemplateOnce(input: {
  userId: string;
  templateKey: WxMpTemplateKey;
  dedupeKey: string;
  data: Record<string, { value: string }>;
  pagepath?: string;
  /** 为 true 时未绑定不写 skipped 日志（广播场景避免刷表） */
  skipLogIfUnbound?: boolean;
}): Promise<{ status: string; skipped?: boolean }> {
  if (!isWechatMpConfigured()) {
    return { status: 'skipped', skipped: true };
  }

  const templateId = resolveTemplateId(input.templateKey);
  if (!templateId) {
    return { status: 'skipped', skipped: true };
  }

  const existing = await prisma.wxPushLog.findUnique({
    where: { dedupeKey: input.dedupeKey },
  });
  if (existing?.status === 'sent' || existing?.status === 'skipped') {
    return { status: existing.status, skipped: existing.status === 'skipped' };
  }
  if (existing && existing.attempts >= MAX_ATTEMPTS) {
    return { status: existing.status };
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { wxMpOpenId: true },
  });
  if (!user?.wxMpOpenId) {
    if (input.skipLogIfUnbound) {
      return { status: 'skipped', skipped: true };
    }
    await prisma.wxPushLog.upsert({
      where: { dedupeKey: input.dedupeKey },
      create: {
        userId: input.userId,
        templateKey: input.templateKey,
        dedupeKey: input.dedupeKey,
        status: 'skipped',
        errMsg: '未绑定服务号',
        attempts: 1,
      },
      update: {
        status: 'skipped',
        errMsg: '未绑定服务号',
        attempts: { increment: 1 },
      },
    });
    return { status: 'skipped', skipped: true };
  }

  try {
    await sendMpTemplateMessage({
      touser: user.wxMpOpenId,
      templateId,
      data: input.data,
      pagepath: input.pagepath,
    });
    await prisma.wxPushLog.upsert({
      where: { dedupeKey: input.dedupeKey },
      create: {
        userId: input.userId,
        templateKey: input.templateKey,
        dedupeKey: input.dedupeKey,
        status: 'sent',
        attempts: 1,
        sentAt: new Date(),
      },
      update: {
        status: 'sent',
        errCode: null,
        errMsg: null,
        attempts: { increment: 1 },
        sentAt: new Date(),
      },
    });
    return { status: 'sent' };
  } catch (e) {
    const errCode = e instanceof AppError ? e.code ?? String(e.statusCode) : 'SEND_ERROR';
    const errMsg = e instanceof Error ? e.message.slice(0, 500) : '发送失败';
    await prisma.wxPushLog.upsert({
      where: { dedupeKey: input.dedupeKey },
      create: {
        userId: input.userId,
        templateKey: input.templateKey,
        dedupeKey: input.dedupeKey,
        status: 'failed',
        errCode,
        errMsg,
        attempts: 1,
      },
      update: {
        status: 'failed',
        errCode,
        errMsg,
        attempts: { increment: 1 },
      },
    });
    return { status: 'failed' };
  }
}

/** 企业内已绑定服务号的成员 userId */
export async function listBoundMemberUserIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.tenantMembership.findMany({
    where: {
      tenantId,
      user: { wxMpOpenId: { not: null } },
    },
    select: { userId: true },
    take: 500,
  });
  return rows.map(r => r.userId);
}

/** 全平台已绑定服务号的用户（公告广播） */
export async function listAllBoundUserIds(limit = 2000): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { wxMpOpenId: { not: null } },
    select: { id: true },
    take: limit,
  });
  return rows.map(r => r.id);
}

export async function sendTodoRemindPush(input: {
  userId: string;
  todoId: string;
  note: string;
  sourceTitle?: string | null;
  remindAt: Date;
}): Promise<{ status: string }> {
  return sendTemplateOnce({
    userId: input.userId,
    templateKey: WX_MP_TEMPLATE_KEYS.TODO_REMIND,
    dedupeKey: `todo_remind:${input.todoId}`,
    data: buildTodoRemindTemplateData(input),
    pagepath: WX_MP_MESSAGE_PAGEPATHS.todos,
  });
}

export async function sendAnnouncementPush(input: {
  userId: string;
  announcementId: string;
  title: string;
  createdAt: Date;
}): Promise<{ status: string }> {
  return sendTemplateOnce({
    userId: input.userId,
    templateKey: WX_MP_TEMPLATE_KEYS.ANNOUNCEMENT,
    dedupeKey: `announcement:${input.announcementId}:${input.userId}`,
    data: buildMessageTemplateData(`公告 · ${input.title}`, input.createdAt),
    pagepath: WX_MP_MESSAGE_PAGEPATHS.notifications,
    skipLogIfUnbound: true,
  });
}

export async function sendExpiryReminderPush(input: {
  userId: string;
  reminderId: string;
  title: string;
  at: Date;
}): Promise<{ status: string }> {
  return sendTemplateOnce({
    userId: input.userId,
    templateKey: WX_MP_TEMPLATE_KEYS.EXPIRY_REMINDER,
    dedupeKey: `expiry:${input.reminderId}:${input.userId}`,
    data: buildMessageTemplateData(input.title, input.at),
    pagepath: WX_MP_MESSAGE_PAGEPATHS.notifications,
    skipLogIfUnbound: true,
  });
}

export async function sendCollabPush(input: {
  userId: string;
  dedupeKey: string;
  title: string;
  at: Date;
  peerTenantId: string;
}): Promise<{ status: string }> {
  return sendTemplateOnce({
    userId: input.userId,
    templateKey: WX_MP_TEMPLATE_KEYS.COLLAB,
    dedupeKey: input.dedupeKey,
    data: buildMessageTemplateData(input.title, input.at),
    pagepath: WX_MP_MESSAGE_PAGEPATHS.collab(input.peerTenantId),
    skipLogIfUnbound: true,
  });
}

/** 公告发布后异步广播（不阻塞 admin 接口） */
export async function fanoutAnnouncementPush(input: {
  id: string;
  title: string;
  createdAt: Date;
}): Promise<{ sent: number }> {
  if (!isWechatMpConfigured()) return { sent: 0 };
  const userIds = await listAllBoundUserIds();
  let sent = 0;
  for (const userId of userIds) {
    const r = await sendAnnouncementPush({
      userId,
      announcementId: input.id,
      title: input.title,
      createdAt: input.createdAt,
    });
    if (r.status === 'sent') sent += 1;
  }
  return { sent };
}
