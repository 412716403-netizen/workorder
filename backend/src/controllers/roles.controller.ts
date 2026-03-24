import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';
import { str } from '../utils/request.js';

export async function listRoles(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const roles = await db.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    res.json(roles);
  } catch (e) { next(e); }
}

export async function createRole(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const { name, description, permissions } = req.body;
    if (!name?.trim()) throw new AppError(400, '角色名称不能为空');
    const role = await db.role.create({
      data: {
        id: genId('role'),
        name: name.trim(),
        description: description || null,
        permissions: Array.isArray(permissions) ? permissions : [],
      } as any,
    });
    res.status(201).json(role);
  } catch (e) { next(e); }
}

export async function updateRole(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const id = str(req.params.id);
    const existing = await db.role.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, '角色不存在');

    const { name, description, permissions } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined) data.description = description || null;
    if (permissions !== undefined) data.permissions = Array.isArray(permissions) ? permissions : [];

    const updated = await db.role.update({ where: { id }, data });
    res.json(updated);
  } catch (e) { next(e); }
}

export async function deleteRole(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const id = str(req.params.id);
    const existing = await db.role.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, '角色不存在');
    if (existing.isSystem) throw new AppError(400, '系统内置角色不可删除');

    const memberCount = await db.role.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });
    if (memberCount && memberCount._count.members > 0) {
      throw new AppError(400, `该角色下还有 ${memberCount._count.members} 个成员，请先移除分配后再删除`);
    }

    await db.role.delete({ where: { id } });
    res.json({ message: '角色已删除' });
  } catch (e) { next(e); }
}
