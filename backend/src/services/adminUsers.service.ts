import bcrypt from 'bcryptjs';
import { AppError } from '../middleware/errorHandler.js';
import { prisma } from '../lib/prisma.js';

const userPublicSelect = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  role: true,
  status: true,
  accountExpiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function parseAccountExpiresAt(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string') throw new AppError(400, '到期时间格式无效');
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new AppError(400, '到期时间格式无效');
  return d;
}

async function otherAdminCount(excludeUserId: string) {
  return prisma.user.count({
    where: { role: 'admin', id: { not: excludeUserId } },
  });
}

export async function listAdminUsers() {
  const rows = await prisma.user.findMany({
    where: { OR: [{ isEnterprise: true }, { role: 'admin' }] },
    select: userPublicSelect,
    orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map((u) => ({
    ...u,
    accountExpiresAt: u.accountExpiresAt?.toISOString() ?? null,
  }));
}

export async function createAdminUser(data: {
  username: string;
  password: string;
  displayName?: string;
  email?: string | null;
  role?: string;
  accountExpiresAt?: string | null;
}) {
  const username = data.username.trim();
  if (username.length < 2) throw new AppError(400, '用户名至少2个字符');
  if (data.password.length < 6) throw new AppError(400, '密码至少6位');
  const email = data.email?.trim() || null;
  const exists = await prisma.user.findFirst({
    where: { OR: [{ username }, ...(email ? [{ email }] : [])] },
  });
  if (exists) throw new AppError(409, '用户名或邮箱已存在');
  const role = data.role === 'admin' ? 'admin' : 'user';
  const passwordHash = await bcrypt.hash(data.password, 10);
  const exp = parseAccountExpiresAt(data.accountExpiresAt ?? null);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      displayName: (data.displayName?.trim() || username) || username,
      email,
      role,
      status: 'active',
      accountExpiresAt: exp === undefined ? null : exp,
    },
    select: userPublicSelect,
  });
  return {
    ...user,
    accountExpiresAt: user.accountExpiresAt?.toISOString() ?? null,
  };
}

export async function updateAdminUser(
  actorUserId: string,
  id: string,
  data: {
    displayName?: string;
    email?: string | null;
    role?: string;
    status?: string;
    password?: string;
    accountExpiresAt?: string | null;
  },
) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, '用户不存在');

  if (data.role === 'user' && user.role === 'admin') {
    const n = await otherAdminCount(id);
    if (n < 1) throw new AppError(400, '至少需要保留一名管理员账号');
  }
  if (data.status === 'disabled' && user.role === 'admin') {
    const n = await otherAdminCount(id);
    if (n < 1) throw new AppError(400, '不能禁用唯一的管理员账号');
  }

  const updates: {
    displayName?: string;
    email?: string | null;
    role?: string;
    status?: string;
    passwordHash?: string;
    accountExpiresAt?: Date | null;
  } = {};

  if (data.displayName !== undefined) {
    updates.displayName = data.displayName.trim() || user.username;
  }
  if (data.email !== undefined) {
    const em = data.email?.trim() || null;
    if (em) {
      const taken = await prisma.user.findFirst({
        where: { email: em, id: { not: id } },
      });
      if (taken) throw new AppError(409, '该邮箱已被其他用户使用');
    }
    updates.email = em;
  }
  if (data.role !== undefined) {
    if (data.role !== 'admin' && data.role !== 'user') throw new AppError(400, '角色只能是 admin 或 user');
    updates.role = data.role;
  }
  if (data.status !== undefined) {
    if (data.status !== 'active' && data.status !== 'disabled') {
      throw new AppError(400, '状态只能是 active 或 disabled');
    }
    updates.status = data.status;
  }
  if (data.password !== undefined && data.password !== '') {
    if (data.password.length < 6) throw new AppError(400, '密码至少6位');
    updates.passwordHash = await bcrypt.hash(data.password, 10);
    await prisma.refreshToken.deleteMany({ where: { userId: id } });
  }
  if (data.accountExpiresAt !== undefined) {
    const exp = parseAccountExpiresAt(data.accountExpiresAt);
    updates.accountExpiresAt = exp === undefined ? null : exp;
  }

  if (Object.keys(updates).length === 0) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id }, select: userPublicSelect });
    return { ...u, accountExpiresAt: u.accountExpiresAt?.toISOString() ?? null };
  }

  const u = await prisma.user.update({
    where: { id },
    data: updates,
    select: userPublicSelect,
  });
  return { ...u, accountExpiresAt: u.accountExpiresAt?.toISOString() ?? null };
}

export async function deleteAdminUser(actorUserId: string, id: string) {
  if (actorUserId === id) throw new AppError(400, '不能删除当前登录账号');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, '用户不存在');
  if (user.role === 'admin') {
    const n = await otherAdminCount(id);
    if (n < 1) throw new AppError(400, '不能删除唯一的管理员账号');
  }
  await prisma.user.delete({ where: { id } });
}
