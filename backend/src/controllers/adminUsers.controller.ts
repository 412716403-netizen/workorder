import * as adminUsersService from '../services/adminUsers.service.js';
import { str } from '../utils/request.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listQueryFromRequest, warnListAllFromRequest } from '../utils/listQuery.js';

export const list = asyncHandler(async (req, res) => {
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('adminUsers.list', req);
  res.json(await adminUsersService.listAdminUsers({ all, page, pageSize }));
});

export const create = asyncHandler(async (req, res) => {
  const user = await adminUsersService.createAdminUser(req.body);
  res.status(201).json(user);
});

export const update = asyncHandler(async (req, res) => {
  const id = str(req.params.id);
  const user = await adminUsersService.updateAdminUser(req.user!.userId, id, req.body);
  res.json(user);
});

export const remove = asyncHandler(async (req, res) => {
  const id = str(req.params.id);
  await adminUsersService.deleteAdminUser(req.user!.userId, id);
  res.status(204).send();
});

export const listTenants = asyncHandler(async (req, res) => {
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
  const where = statusFilter ? { status: statusFilter } : {};
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('admin.listTenants', req);
  const orderBy = { createdAt: 'desc' as const };
  const include = {
    _count: { select: { memberships: true } },
    memberships: {
      where: { role: 'owner' as const },
      include: { user: { select: { id: true, username: true, displayName: true, phone: true } } },
      take: 1,
    },
  };

  const toRow = (t: {
    id: string;
    name: string;
    status: string;
    expiresAt: Date | null;
    equipmentModuleEnabled: boolean | null;
    createdAt: Date;
    memberships: Array<{ user: { id: string; username: string; displayName: string | null; phone: string | null } | null }>;
    _count: { memberships: number };
  }) => {
    const owner = t.memberships[0]?.user;
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      equipmentFeaturesEnabled: t.equipmentModuleEnabled !== false,
      memberCount: t._count.memberships,
      owner: owner ? { id: owner.id, username: owner.username, displayName: owner.displayName, phone: owner.phone } : null,
      createdAt: t.createdAt.toISOString(),
    };
  };

  if (all) {
    const tenants = await prisma.tenant.findMany({ where, orderBy, include });
    res.json(tenants.map(toRow));
    return;
  }

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({ where, orderBy, include, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.tenant.count({ where }),
  ]);
  res.json({ data: tenants.map(toRow), total, page, pageSize });
});

export const updateTenant = asyncHandler(async (req, res) => {
  const id = str(req.params.id);
  const { expiresAt, status, equipmentModuleEnabled } = req.body;
  const data: { expiresAt?: Date | null; status?: string; equipmentModuleEnabled?: boolean } = {};

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

  if (equipmentModuleEnabled !== undefined) {
    if (typeof equipmentModuleEnabled !== 'boolean') throw new AppError(400, 'equipmentModuleEnabled 须为布尔值');
    data.equipmentModuleEnabled = equipmentModuleEnabled;
  }

  const tenant = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.update({ where: { id }, data });
    if (data.equipmentModuleEnabled === false) {
      await tx.globalNodeTemplate.updateMany({
        where: { tenantId: id },
        data: {
          enableWorkerAssignment: false,
          enableEquipmentAssignment: false,
          enableEquipmentOnReport: false,
        },
      });
    }
    return t;
  });

  res.json({
    id: tenant.id,
    name: tenant.name,
    status: tenant.status,
    expiresAt: tenant.expiresAt?.toISOString() ?? null,
    equipmentFeaturesEnabled: tenant.equipmentModuleEnabled !== false,
  });
});
