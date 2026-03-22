import type { Request, Response, NextFunction } from 'express';
import * as adminUsersService from '../services/adminUsers.service.js';
import { str } from '../utils/request.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await adminUsersService.listAdminUsers());
  } catch (e) {
    next(e);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await adminUsersService.createAdminUser(req.body);
    res.status(201).json(user);
  } catch (e) {
    next(e);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const id = str(req.params.id);
    const user = await adminUsersService.updateAdminUser(req.user!.userId, id, req.body);
    res.json(user);
  } catch (e) {
    next(e);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const id = str(req.params.id);
    await adminUsersService.deleteAdminUser(req.user!.userId, id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}

export async function listTenants(req: Request, res: Response, next: NextFunction) {
  try {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
    const where = statusFilter ? { status: statusFilter } : {};
    const tenants = await prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { memberships: true } },
        memberships: {
          where: { role: 'owner' },
          include: { user: { select: { id: true, username: true, displayName: true, phone: true } } },
          take: 1,
        },
      },
    });
    res.json(tenants.map(t => {
      const owner = t.memberships[0]?.user;
      return {
        id: t.id,
        name: t.name,
        status: t.status,
        expiresAt: t.expiresAt?.toISOString() ?? null,
        memberCount: t._count.memberships,
        owner: owner ? { id: owner.id, username: owner.username, displayName: owner.displayName, phone: owner.phone } : null,
        createdAt: t.createdAt.toISOString(),
      };
    }));
  } catch (e) { next(e); }
}

export async function updateTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const id = str(req.params.id);
    const { expiresAt, status } = req.body;
    const data: { expiresAt?: Date | null; status?: string } = {};

    if (status !== undefined) {
      if (!['active', 'rejected', 'pending'].includes(status)) throw new AppError(400, '无效的状态值');
      data.status = status;
    }

    if (expiresAt === null || expiresAt === '') {
      data.expiresAt = null;
    } else if (typeof expiresAt === 'string') {
      const d = new Date(expiresAt);
      if (Number.isNaN(d.getTime())) throw new AppError(400, '到期时间格式无效');
      data.expiresAt = d;
    }
    const tenant = await prisma.tenant.update({ where: { id }, data });
    res.json({
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
      expiresAt: tenant.expiresAt?.toISOString() ?? null,
    });
  } catch (e) { next(e); }
}
