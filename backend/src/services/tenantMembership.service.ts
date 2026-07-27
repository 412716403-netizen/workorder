import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * 读取当前用户在该租户下的成员记录（含 preferences）。
 * 工作台、快捷入口、消息已读等个人化配置都落在 `tenant_memberships.preferences`。
 */
export async function getMembership(userId: string, tenantId: string) {
  const m = await basePrisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (!m) throw new AppError(403, '非本企业成员');
  return m;
}
