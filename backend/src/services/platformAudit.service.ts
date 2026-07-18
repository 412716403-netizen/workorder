import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export type PlatformAuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'tenant.update';

export async function writePlatformAudit(opts: {
  actorUserId: string;
  action: PlatformAuditAction;
  targetType: 'user' | 'tenant';
  targetId: string;
  detail?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.platformAuditLog.create({
    data: {
      actorUserId: opts.actorUserId,
      action: opts.action,
      targetType: opts.targetType,
      targetId: opts.targetId,
      detail: opts.detail ?? {},
    },
  });
}

export async function listPlatformAuditLogs(opts: { limit?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = await prisma.platformAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  const actorIds = [...new Set(rows.map((r) => r.actorUserId))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, username: true, displayName: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a]));
  return rows.map((r) => {
    const actor = actorMap.get(r.actorUserId);
    return {
      id: r.id,
      actorUserId: r.actorUserId,
      actorUsername: actor?.username ?? null,
      actorDisplayName: actor?.displayName ?? null,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    };
  });
}
