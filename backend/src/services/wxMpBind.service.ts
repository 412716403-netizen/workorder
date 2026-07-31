import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { redisDel, redisGet, redisSetEx } from '../lib/redis.js';
import {
  assertWechatMpConfigured,
  createTempQrcode,
  isWechatMpConfigured,
} from '../lib/wechatMp.js';
import { AppError } from '../middleware/errorHandler.js';
import { extractBindScene } from '../utils/wxMpXml.js';

const BIND_TTL_SEC = 600;
const SCENE_PREFIX = 'b';
const REDIS_KEY = (scene: string) => `wxmp:bind:${scene}`;

type MemTicket = { userId: string; expiresAt: number };
const memoryTickets = new Map<string, MemTicket>();

function pruneMemoryTickets(): void {
  const now = Date.now();
  for (const [k, v] of memoryTickets) {
    if (v.expiresAt <= now) memoryTickets.delete(k);
  }
}

async function storeBindTicket(scene: string, userId: string): Promise<void> {
  await redisSetEx(REDIS_KEY(scene), BIND_TTL_SEC, userId);
  memoryTickets.set(scene, { userId, expiresAt: Date.now() + BIND_TTL_SEC * 1000 });
}

async function takeBindTicket(scene: string): Promise<string | null> {
  const fromRedis = await redisGet(REDIS_KEY(scene));
  if (fromRedis) {
    await redisDel(REDIS_KEY(scene));
    memoryTickets.delete(scene);
    return fromRedis;
  }
  pruneMemoryTickets();
  const mem = memoryTickets.get(scene);
  if (!mem) return null;
  memoryTickets.delete(scene);
  if (mem.expiresAt <= Date.now()) return null;
  return mem.userId;
}

export function getWxMpBindStatus(user: { wxMpOpenId: string | null }): {
  configured: boolean;
  bound: boolean;
} {
  return {
    configured: isWechatMpConfigured(),
    bound: Boolean(user.wxMpOpenId),
  };
}

export async function getWxMpStatusForUser(userId: string): Promise<{
  configured: boolean;
  bound: boolean;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wxMpOpenId: true },
  });
  if (!user) throw new AppError(404, '用户不存在');
  return getWxMpBindStatus(user);
}

export async function createBindQrcode(userId: string): Promise<{
  scene: string;
  ticket: string;
  qrcodeUrl: string;
  expireSeconds: number;
}> {
  assertWechatMpConfigured();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError(404, '用户不存在');

  const scene = `${SCENE_PREFIX}${randomBytes(16).toString('hex')}`;
  await storeBindTicket(scene, userId);
  const qr = await createTempQrcode(scene, BIND_TTL_SEC);
  return {
    scene,
    ticket: qr.ticket,
    qrcodeUrl: qr.qrcodeUrl,
    expireSeconds: qr.expireSeconds,
  };
}

export async function unbindWxMp(userId: string): Promise<{ bound: false }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wxMpOpenId: true },
  });
  if (!user) throw new AppError(404, '用户不存在');
  if (!user.wxMpOpenId) {
    return { bound: false };
  }
  await prisma.user.update({
    where: { id: userId },
    data: { wxMpOpenId: null },
  });
  return { bound: false };
}

/** 处理关注 / 扫码事件；返回是否完成绑定（供日志） */
export async function handleMpBindEvent(input: {
  mpOpenId: string;
  event: string;
  eventKey?: string;
}): Promise<{ boundUserId: string | null; action: string }> {
  const event = input.event.toLowerCase();

  if (event === 'unsubscribe') {
    await prisma.user.updateMany({
      where: { wxMpOpenId: input.mpOpenId },
      data: { wxMpOpenId: null },
    });
    return { boundUserId: null, action: 'unsubscribe' };
  }

  if (event !== 'subscribe' && event !== 'scan') {
    return { boundUserId: null, action: 'ignored' };
  }

  const scene = extractBindScene(input.eventKey);
  if (!scene) {
    return { boundUserId: null, action: 'follow_no_scene' };
  }

  const userId = await takeBindTicket(scene);
  if (!userId) {
    return { boundUserId: null, action: 'ticket_expired' };
  }

  const conflict = await prisma.user.findUnique({
    where: { wxMpOpenId: input.mpOpenId },
    select: { id: true },
  });
  if (conflict && conflict.id !== userId) {
    // 释放占用：后扫码者覆盖（同一微信只绑一个账号）
    await prisma.user.update({
      where: { id: conflict.id },
      data: { wxMpOpenId: null },
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { wxMpOpenId: input.mpOpenId },
  });
  return { boundUserId: userId, action: 'bound' };
}
