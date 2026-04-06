import { prisma } from '../lib/prisma.js';
import { ALL_PERMISSIONS } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import crypto from 'crypto';

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function createTenant(userId: string, body: { name: string; logo?: string }) {
  const tenant = await prisma.tenant.create({
    data: { name: body.name, logo: body.logo, inviteCode: generateInviteCode(), status: 'pending' },
  });
  await prisma.tenantMembership.create({
    data: { userId, tenantId: tenant.id, role: 'owner', permissions: [...ALL_PERMISSIONS] },
  });
  await prisma.user.update({ where: { id: userId }, data: { isEnterprise: true } });
  return {
    tenant: { id: tenant.id, name: tenant.name, status: 'pending' },
    message: '企业已提交审核，请等待管理员通过',
  };
}

export async function listTenants(userId: string) {
  const memberships = await prisma.tenantMembership.findMany({
    where: { userId },
    include: { tenant: true, customRole: { select: { permissions: true } } },
  });
  return memberships.map((m) => {
    let perms: unknown = m.permissions;
    if (m.role === 'owner') { perms = [...ALL_PERMISSIONS]; }
    else if (m.roleId && m.customRole) { perms = Array.isArray(m.customRole.permissions) ? m.customRole.permissions : []; }
    return {
      id: m.tenant.id, name: m.tenant.name, logo: m.tenant.logo,
      inviteCode: m.tenant.inviteCode, status: m.tenant.status,
      expiresAt: m.tenant.expiresAt?.toISOString() ?? null,
      role: m.role, permissions: perms, joinedAt: m.createdAt,
    };
  });
}

export async function getTenant(userId: string, tenantId: string) {
  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    include: { tenant: true },
  });
  if (!membership) throw new AppError(403, '您不是该企业的成员');
  return {
    id: membership.tenant.id, name: membership.tenant.name, logo: membership.tenant.logo,
    inviteCode: membership.tenant.inviteCode,
    expiresAt: membership.tenant.expiresAt?.toISOString() ?? null,
    createdAt: membership.tenant.createdAt,
  };
}

export async function updateTenant(
  userId: string,
  tenantId: string,
  body: { name?: string; logo?: string },
) {
  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (!membership || membership.role !== 'owner')
    throw new AppError(403, '仅企业创建者可修改企业信息');
  return prisma.tenant.update({
    where: { id: tenantId },
    data: { ...(body.name !== undefined && { name: body.name }), ...(body.logo !== undefined && { logo: body.logo }) },
  });
}

export async function getMembers(tenantId: string) {
  const members = await prisma.tenantMembership.findMany({
    where: { tenantId },
    include: {
      user: { select: { id: true, username: true, phone: true, displayName: true } },
      customRole: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return members.map((m) => ({
    id: m.id, userId: m.user.id, username: m.user.username,
    phone: m.user.phone, displayName: m.user.displayName,
    role: m.role, permissions: m.permissions, roleId: m.roleId,
    roleName: m.customRole?.name ?? null,
    assignedMilestoneIds: Array.isArray(m.assignedMilestoneIds) ? m.assignedMilestoneIds : [],
    joinedAt: m.createdAt,
  }));
}

export async function updateMemberRole(
  callerId: string,
  tenantId: string,
  uid: string,
  body: { role?: string; roleId?: string | null },
) {
  const callerMembership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: callerId, tenantId } },
  });
  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role))
    throw new AppError(403, '无权修改成员角色');

  const targetMembership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: uid, tenantId } },
  });
  if (!targetMembership) throw new AppError(404, '成员不存在');
  if (targetMembership.role === 'owner') throw new AppError(403, '不能修改企业创建者的角色');
  if (body.role === 'owner') throw new AppError(400, '不能将角色设为 owner');

  const data: Record<string, unknown> = {};
  if (body.role !== undefined) data.role = body.role;
  if (body.roleId !== undefined) {
    if (body.roleId === null || body.roleId === '') { data.roleId = null; }
    else {
      const roleExists = await prisma.role.findUnique({ where: { id: body.roleId } });
      if (!roleExists || roleExists.tenantId !== tenantId) throw new AppError(400, '角色不存在');
      data.roleId = body.roleId;
    }
  }

  return prisma.tenantMembership.update({ where: { id: targetMembership.id }, data });
}

export async function updateMemberPermissions(
  callerId: string,
  tenantId: string,
  uid: string,
  permissions: unknown,
) {
  const callerMembership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: callerId, tenantId } },
  });
  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role))
    throw new AppError(403, '无权修改成员权限');

  const targetMembership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: uid, tenantId } },
  });
  if (!targetMembership) throw new AppError(404, '成员不存在');
  if (targetMembership.role === 'owner') throw new AppError(403, '不能修改企业创建者的权限');

  return prisma.tenantMembership.update({ where: { id: targetMembership.id }, data: { permissions: permissions as any } });
}

export async function removeMember(callerId: string, tenantId: string, uid: string) {
  const callerMembership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: callerId, tenantId } },
  });
  if (!callerMembership || callerMembership.role !== 'owner')
    throw new AppError(403, '仅企业创建者可移除成员');

  const targetMembership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: uid, tenantId } },
  });
  if (!targetMembership) throw new AppError(404, '成员不存在');
  if (targetMembership.role === 'owner') throw new AppError(403, '不能移除企业创建者');

  await prisma.tenantMembership.delete({ where: { id: targetMembership.id } });
  const remaining = await prisma.tenantMembership.count({ where: { userId: uid } });
  if (remaining === 0) await prisma.user.update({ where: { id: uid }, data: { isEnterprise: false } });
  return { message: '成员已移除' };
}

export async function lookupByInviteCode(code: string) {
  if (!code) throw new AppError(400, '请提供企业邀请码');
  const tenant = await prisma.tenant.findUnique({ where: { inviteCode: code } });
  if (!tenant) throw new AppError(404, '未找到该企业，请确认邀请码');
  const memberCount = await prisma.tenantMembership.count({ where: { tenantId: tenant.id } });
  return { id: tenant.id, name: tenant.name, logo: tenant.logo, memberCount };
}

export async function applyToJoin(userId: string, tenantId: string, message?: string) {
  const existing = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (existing) throw new AppError(409, '您已是该企业的成员');
  const pendingApp = await prisma.joinApplication.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (pendingApp && pendingApp.status === 'PENDING') throw new AppError(409, '您已提交过加入申请，请等待审核');

  return prisma.joinApplication.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: { status: 'PENDING', message: message || null, reviewedBy: null, reviewedAt: null },
    create: { userId, tenantId, message: message || null },
  });
}

export async function getApplications(tenantId: string) {
  return prisma.joinApplication.findMany({
    where: { tenantId },
    include: { user: { select: { id: true, username: true, phone: true, displayName: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function reviewApplication(
  reviewerId: string,
  tenantId: string,
  appId: string,
  body: { action: string; role?: string; permissions?: unknown },
) {
  const app = await prisma.joinApplication.findUnique({ where: { id: appId } });
  if (!app) throw new AppError(404, '申请不存在');
  if (app.tenantId !== tenantId) throw new AppError(400, '申请与企业不匹配');
  if (app.status !== 'PENDING') throw new AppError(400, '该申请已处理');

  if (body.action === 'APPROVED') {
    await prisma.joinApplication.update({
      where: { id: app.id },
      data: { status: 'APPROVED', reviewedBy: reviewerId, reviewedAt: new Date() },
    });
    await prisma.tenantMembership.create({
      data: { userId: app.userId, tenantId: app.tenantId, role: body.role || 'worker', permissions: (body.permissions as any) || [] },
    });
    await prisma.user.update({ where: { id: app.userId }, data: { isEnterprise: true } });
    return { message: '已通过申请' };
  } else if (body.action === 'REJECTED') {
    await prisma.joinApplication.update({
      where: { id: app.id },
      data: { status: 'REJECTED', reviewedBy: reviewerId, reviewedAt: new Date() },
    });
    return { message: '已拒绝申请' };
  } else {
    throw new AppError(400, 'action 必须为 APPROVED 或 REJECTED');
  }
}

export async function getMyApplications(userId: string) {
  return prisma.joinApplication.findMany({
    where: { userId },
    include: { tenant: { select: { id: true, name: true, logo: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

function resolveMemberPerms(m: {
  role: string; permissions: unknown; roleId?: string | null;
  customRole?: { permissions: unknown } | null;
}): string[] {
  if (m.role === 'owner') return [...ALL_PERMISSIONS];
  if (m.roleId && m.customRole) {
    const rp = m.customRole.permissions;
    return Array.isArray(rp) ? rp as string[] : [];
  }
  return Array.isArray(m.permissions) ? m.permissions as string[] : [];
}

export async function getReportableMembers(tenantId: string) {
  const members = await prisma.tenantMembership.findMany({
    where: { tenantId },
    include: {
      user: { select: { id: true, username: true, displayName: true } },
      customRole: { select: { permissions: true, name: true } },
    },
  });
  return members
    .filter((m) => m.role !== 'owner' && resolveMemberPerms(m).includes('process_report'))
    .map((m) => ({
      id: m.userId, name: m.user.displayName || m.user.username,
      groupName: m.customRole?.name || '', role: m.role,
      status: 'ACTIVE' as const, skills: [] as string[],
      assignedMilestoneIds: Array.isArray(m.assignedMilestoneIds) ? m.assignedMilestoneIds : [],
    }));
}

export async function updateMemberMilestones(
  callerId: string,
  tenantId: string,
  uid: string,
  assignedMilestoneIds: unknown,
) {
  const callerMembership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: callerId, tenantId } },
  });
  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role))
    throw new AppError(403, '无权修改成员工序权限');
  const targetMembership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: uid, tenantId } },
  });
  if (!targetMembership) throw new AppError(404, '成员不存在');
  return prisma.tenantMembership.update({
    where: { id: targetMembership.id },
    data: { assignedMilestoneIds: Array.isArray(assignedMilestoneIds) ? assignedMilestoneIds : [] },
  });
}
