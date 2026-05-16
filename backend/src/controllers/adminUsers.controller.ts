import * as adminUsersService from '../services/adminUsers.service.js';
import * as adminTenantsService from '../services/adminTenants.service.js';
import { str } from '../utils/request.js';
import { prisma } from '../lib/prisma.js';
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
    industryKind: string;
    industryPresetAppliedAt: Date | null;
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
      industryKind: t.industryKind,
      industryPresetAppliedAt: t.industryPresetAppliedAt?.toISOString() ?? null,
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
  const result = await adminTenantsService.updatePlatformTenant(id, req.body);
  res.json(result);
});
