import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';

export async function listRoles(db: TenantPrismaClient) {
  return db.role.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { members: true } } },
  });
}

export async function createRole(
  db: TenantPrismaClient,
  body: { name?: string; description?: string; permissions?: unknown },
) {
  if (!body.name?.trim()) throw new AppError(400, '角色名称不能为空');
  return db.role.create({
    data: {
      id: genId('role'),
      name: body.name.trim(),
      description: body.description || null,
      permissions: Array.isArray(body.permissions) ? body.permissions : [],
    } as any,
  });
}

export async function updateRole(
  db: TenantPrismaClient,
  id: string,
  body: { name?: string; description?: string; permissions?: unknown },
) {
  const existing = await db.role.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, '角色不存在');

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.description !== undefined) data.description = body.description || null;
  if (body.permissions !== undefined)
    data.permissions = Array.isArray(body.permissions) ? body.permissions : [];

  return db.role.update({ where: { id }, data });
}

export async function deleteRole(db: TenantPrismaClient, id: string) {
  const existing = await db.role.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, '角色不存在');
  if ((existing as any).isSystem) throw new AppError(400, '系统内置角色不可删除');

  const memberCount = await db.role.findUnique({
    where: { id },
    include: { _count: { select: { members: true } } },
  });
  if (memberCount && memberCount._count.members > 0) {
    throw new AppError(
      400,
      `该角色下还有 ${memberCount._count.members} 个成员，请先移除分配后再删除`,
    );
  }

  await db.role.delete({ where: { id } });
  return { message: '角色已删除' };
}
