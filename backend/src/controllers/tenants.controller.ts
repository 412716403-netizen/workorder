import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { ALL_PERMISSIONS } from '../types/index.js';
import * as authService from '../services/auth.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { str } from '../utils/request.js';
import crypto from 'crypto';

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function createTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, logo } = req.body;
    const userId = req.user!.userId;

    const tenant = await prisma.tenant.create({
      data: { name, logo, inviteCode: generateInviteCode(), status: 'pending' },
    });

    await prisma.tenantMembership.create({
      data: {
        userId,
        tenantId: tenant.id,
        role: 'owner',
        permissions: [...ALL_PERMISSIONS],
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { isEnterprise: true },
    });

    res.status(201).json({
      tenant: { id: tenant.id, name: tenant.name, status: 'pending' },
      message: '企业已提交审核，请等待管理员通过',
    });
  } catch (e) { next(e); }
}

export async function listTenants(req: Request, res: Response, next: NextFunction) {
  try {
    const memberships = await prisma.tenantMembership.findMany({
      where: { userId: req.user!.userId },
      include: { tenant: true, customRole: { select: { permissions: true } } },
    });
    res.json(memberships.map(m => {
      let perms: unknown = m.permissions;
      if (m.role === 'owner') {
        perms = [...ALL_PERMISSIONS];
      } else if (m.roleId && m.customRole) {
        perms = Array.isArray(m.customRole.permissions) ? m.customRole.permissions : [];
      }
      return {
        id: m.tenant.id,
        name: m.tenant.name,
        logo: m.tenant.logo,
        inviteCode: m.tenant.inviteCode,
        status: m.tenant.status,
        expiresAt: m.tenant.expiresAt?.toISOString() ?? null,
        role: m.role,
        permissions: perms,
        joinedAt: m.createdAt,
      };
    }));
  } catch (e) { next(e); }
}

export async function selectTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.selectTenant(req.user!.userId, str(req.params.id));
    const { setAuthCookies } = await import('../utils/cookies.js');
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json(result);
  } catch (e) { next(e); }
}

export async function getTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = str(req.params.id);
    const membership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: req.user!.userId, tenantId } },
      include: { tenant: true },
    });
    if (!membership) throw new AppError(403, '您不是该企业的成员');
    res.json({
      id: membership.tenant.id,
      name: membership.tenant.name,
      logo: membership.tenant.logo,
      inviteCode: membership.tenant.inviteCode,
      expiresAt: membership.tenant.expiresAt?.toISOString() ?? null,
      createdAt: membership.tenant.createdAt,
    });
  } catch (e) { next(e); }
}

export async function updateTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = str(req.params.id);
    const membership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: req.user!.userId, tenantId } },
    });
    if (!membership || membership.role !== 'owner') throw new AppError(403, '仅企业创建者可修改企业信息');

    const { name, logo } = req.body;
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { ...(name !== undefined && { name }), ...(logo !== undefined && { logo }) },
    });
    res.json(tenant);
  } catch (e) { next(e); }
}

export async function getMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = str(req.params.id);
    const members = await prisma.tenantMembership.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, username: true, phone: true, displayName: true } },
        customRole: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(members.map(m => ({
      id: m.id,
      userId: m.user.id,
      username: m.user.username,
      phone: m.user.phone,
      displayName: m.user.displayName,
      role: m.role,
      permissions: m.permissions,
      roleId: m.roleId,
      roleName: m.customRole?.name ?? null,
      assignedMilestoneIds: Array.isArray(m.assignedMilestoneIds) ? m.assignedMilestoneIds : [],
      joinedAt: m.createdAt,
    })));
  } catch (e) { next(e); }
}

export async function updateMemberRole(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = str(req.params.id);
    const uid = str(req.params.uid);
    const { role, roleId } = req.body;
    const callerMembership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: req.user!.userId, tenantId } },
    });
    if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
      throw new AppError(403, '无权修改成员角色');
    }

    const targetMembership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: uid, tenantId } },
    });
    if (!targetMembership) throw new AppError(404, '成员不存在');
    if (targetMembership.role === 'owner') throw new AppError(403, '不能修改企业创建者的角色');
    if (role === 'owner') throw new AppError(400, '不能将角色设为 owner');

    const data: Record<string, unknown> = {};
    if (role !== undefined) data.role = role;
    if (roleId !== undefined) {
      if (roleId === null || roleId === '') {
        data.roleId = null;
      } else {
        const roleExists = await prisma.role.findUnique({ where: { id: roleId } });
        if (!roleExists || roleExists.tenantId !== tenantId) {
          throw new AppError(400, '角色不存在');
        }
        data.roleId = roleId;
      }
    }

    const updated = await prisma.tenantMembership.update({
      where: { id: targetMembership.id },
      data,
    });
    res.json(updated);
  } catch (e) { next(e); }
}

export async function updateMemberPermissions(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = str(req.params.id);
    const uid = str(req.params.uid);
    const { permissions } = req.body;
    const callerMembership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: req.user!.userId, tenantId } },
    });
    if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
      throw new AppError(403, '无权修改成员权限');
    }

    const targetMembership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: uid, tenantId } },
    });
    if (!targetMembership) throw new AppError(404, '成员不存在');
    if (targetMembership.role === 'owner') throw new AppError(403, '不能修改企业创建者的权限');

    const updated = await prisma.tenantMembership.update({
      where: { id: targetMembership.id },
      data: { permissions },
    });
    res.json(updated);
  } catch (e) { next(e); }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = str(req.params.id);
    const uid = str(req.params.uid);
    const callerMembership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: req.user!.userId, tenantId } },
    });
    if (!callerMembership || callerMembership.role !== 'owner') {
      throw new AppError(403, '仅企业创建者可移除成员');
    }

    const targetMembership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: uid, tenantId } },
    });
    if (!targetMembership) throw new AppError(404, '成员不存在');
    if (targetMembership.role === 'owner') throw new AppError(403, '不能移除企业创建者');

    await prisma.tenantMembership.delete({ where: { id: targetMembership.id } });

    const remaining = await prisma.tenantMembership.count({ where: { userId: uid } });
    if (remaining === 0) {
      await prisma.user.update({ where: { id: uid }, data: { isEnterprise: false } });
    }

    res.json({ message: '成员已移除' });
  } catch (e) { next(e); }
}

export async function lookupByInviteCode(req: Request, res: Response, next: NextFunction) {
  try {
    const code = (req.query.code as string)?.trim();
    if (!code) throw new AppError(400, '请提供企业邀请码');

    const tenant = await prisma.tenant.findUnique({ where: { inviteCode: code } });
    if (!tenant) throw new AppError(404, '未找到该企业，请确认邀请码');

    const memberCount = await prisma.tenantMembership.count({ where: { tenantId: tenant.id } });

    res.json({ id: tenant.id, name: tenant.name, logo: tenant.logo, memberCount });
  } catch (e) { next(e); }
}

export async function applyToJoin(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const tenantId = str(req.params.id);
    const { message } = req.body;

    const existing = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (existing) throw new AppError(409, '您已是该企业的成员');

    const pendingApp = await prisma.joinApplication.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (pendingApp && pendingApp.status === 'PENDING') {
      throw new AppError(409, '您已提交过加入申请，请等待审核');
    }

    const app = await prisma.joinApplication.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      update: { status: 'PENDING', message: message || null, reviewedBy: null, reviewedAt: null },
      create: { userId, tenantId, message: message || null },
    });

    res.status(201).json(app);
  } catch (e) { next(e); }
}

export async function getApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = str(req.params.id);
    const apps = await prisma.joinApplication.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, username: true, phone: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(apps);
  } catch (e) { next(e); }
}

export async function reviewApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = str(req.params.id);
    const appId = str(req.params.appId);
    const { action, role, permissions } = req.body;
    const app = await prisma.joinApplication.findUnique({ where: { id: appId } });
    if (!app) throw new AppError(404, '申请不存在');
    if (app.tenantId !== tenantId) throw new AppError(400, '申请与企业不匹配');
    if (app.status !== 'PENDING') throw new AppError(400, '该申请已处理');

    if (action === 'APPROVED') {
      await prisma.joinApplication.update({
        where: { id: app.id },
        data: { status: 'APPROVED', reviewedBy: req.user!.userId, reviewedAt: new Date() },
      });

      await prisma.tenantMembership.create({
        data: {
          userId: app.userId,
          tenantId: app.tenantId,
          role: role || 'worker',
          permissions: permissions || [],
        },
      });

      await prisma.user.update({
        where: { id: app.userId },
        data: { isEnterprise: true },
      });

      res.json({ message: '已通过申请' });
    } else if (action === 'REJECTED') {
      await prisma.joinApplication.update({
        where: { id: app.id },
        data: { status: 'REJECTED', reviewedBy: req.user!.userId, reviewedAt: new Date() },
      });
      res.json({ message: '已拒绝申请' });
    } else {
      throw new AppError(400, 'action 必须为 APPROVED 或 REJECTED');
    }
  } catch (e) { next(e); }
}

export async function getMyApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const apps = await prisma.joinApplication.findMany({
      where: { userId: req.user!.userId },
      include: { tenant: { select: { id: true, name: true, logo: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(apps);
  } catch (e) { next(e); }
}

function resolveMemberPerms(m: {
  role: string;
  permissions: unknown;
  roleId?: string | null;
  customRole?: { permissions: unknown } | null;
}): string[] {
  if (m.role === 'owner') return [...ALL_PERMISSIONS];
  if (m.roleId && m.customRole) {
    const rp = m.customRole.permissions;
    return Array.isArray(rp) ? rp as string[] : [];
  }
  return Array.isArray(m.permissions) ? m.permissions as string[] : [];
}

function hasReportPermission(perms: string[]): boolean {
  if (perms.includes('process_report')) return true;
  return false;
}

export async function getReportableMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = str(req.params.id);
    const members = await prisma.tenantMembership.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
        customRole: { select: { permissions: true, name: true } },
      },
    });
    const result = members
      .filter(m => m.role !== 'owner' && hasReportPermission(resolveMemberPerms(m)))
      .map(m => ({
        id: m.userId,
        name: m.user.displayName || m.user.username,
        groupName: m.customRole?.name || '',
        role: m.role,
        status: 'ACTIVE' as const,
        skills: [] as string[],
        assignedMilestoneIds: Array.isArray(m.assignedMilestoneIds) ? m.assignedMilestoneIds : [],
      }));
    res.json(result);
  } catch (e) { next(e); }
}

export async function updateMemberMilestones(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = str(req.params.id);
    const uid = str(req.params.uid);
    const { assignedMilestoneIds } = req.body;
    const callerMembership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: req.user!.userId, tenantId } },
    });
    if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
      throw new AppError(403, '无权修改成员工序权限');
    }
    const targetMembership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: uid, tenantId } },
    });
    if (!targetMembership) throw new AppError(404, '成员不存在');

    const updated = await prisma.tenantMembership.update({
      where: { id: targetMembership.id },
      data: { assignedMilestoneIds: Array.isArray(assignedMilestoneIds) ? assignedMilestoneIds : [] },
    });
    res.json(updated);
  } catch (e) { next(e); }
}
