import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import type { JwtPayload } from '../types/index.js';
import { ALL_PERMISSIONS } from '../types/index.js';
import { prisma } from '../lib/prisma.js';

async function assertTenantActive(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true, expiresAt: true } });
  if (!tenant) throw new AppError(404, '企业不存在');
  if (tenant.status === 'pending') throw new AppError(403, '该企业正在审核中，请等待管理员通过');
  if (tenant.status === 'rejected') throw new AppError(403, '该企业创建申请已被拒绝');
  if (tenant.status !== 'active') throw new AppError(403, '该企业状态异常');
  if (tenant.expiresAt && tenant.expiresAt < new Date()) {
    throw new AppError(403, '该企业账号已到期，请联系管理员续期');
  }
}

function generateTokens(payload: JwtPayload) {
  const accessToken = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions);
  return { accessToken, refreshToken };
}

function parseExpiry(expr: string): Date {
  const match = expr.match(/^(\d+)([smhd])$/);
  if (!match) return new Date(Date.now() + 7 * 86400_000);
  const val = parseInt(match[1]);
  const unit = match[2];
  const ms = { s: 1000, m: 60_000, h: 3600_000, d: 86400_000 }[unit] ?? 86400_000;
  return new Date(Date.now() + val * ms);
}

const CN_PHONE_RE = /^1[3-9]\d{9}$/;

function resolveMemberPermissions(membership: {
  role: string;
  permissions: unknown;
  roleId?: string | null;
  customRole?: { permissions: unknown } | null;
}): string[] {
  if (membership.role === 'owner') return [...ALL_PERMISSIONS];
  if (membership.roleId && membership.customRole) {
    const rolePerms = membership.customRole.permissions;
    return Array.isArray(rolePerms) ? rolePerms as string[] : [];
  }
  return Array.isArray(membership.permissions) ? membership.permissions as string[] : [];
}

async function buildTenantPayload(userId: string, tenantId?: string) {
  const memberships = await prisma.tenantMembership.findMany({
    where: { userId },
    include: {
      tenant: { select: { id: true, name: true, status: true, expiresAt: true } },
      customRole: { select: { permissions: true } },
    },
  });

  if (memberships.length === 0) {
    return { tenantId: undefined, tenantRole: undefined, permissions: undefined, tenants: [] };
  }

  const tenants = memberships.map(m => ({
    id: m.tenant.id,
    name: m.tenant.name,
    role: m.role,
    permissions: resolveMemberPermissions(m),
    status: m.tenant.status,
    expiresAt: m.tenant.expiresAt?.toISOString() ?? null,
  }));

  const activeMemberships = memberships.filter(m => m.tenant.status === 'active');

  let selected = tenantId
    ? memberships.find(m => m.tenantId === tenantId && m.tenant.status === 'active')
    : activeMemberships.length === 1 ? activeMemberships[0] : undefined;

  if (selected) {
    return {
      tenantId: selected.tenantId,
      tenantRole: selected.role,
      permissions: resolveMemberPermissions(selected),
      tenants,
    };
  }

  return { tenantId: undefined, tenantRole: undefined, permissions: undefined, tenants };
}

export async function registerByPhone(phone: string, password: string, displayName?: string) {
  const normalized = phone.trim();
  if (!CN_PHONE_RE.test(normalized)) {
    throw new AppError(400, '请输入正确的11位中国大陆手机号');
  }
  const exists = await prisma.user.findFirst({
    where: { OR: [{ username: normalized }, { phone: normalized }] },
  });
  if (exists) throw new AppError(409, '该手机号已被注册');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username: normalized,
      phone: normalized,
      passwordHash,
      email: null,
      displayName: (displayName?.trim() || normalized) || normalized,
      role: 'user',
      isEnterprise: false,
    },
  });

  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    phone: user.phone ?? undefined,
    role: user.role,
    isEnterprise: false,
  };
  const tokens = generateTokens(payload);

  await prisma.refreshToken.create({
    data: { userId: user.id, token: tokens.refreshToken, expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN) },
  });

  return {
    user: {
      id: user.id,
      username: user.username,
      phone: user.phone,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isEnterprise: false,
      accountExpiresAt: null as string | null,
    },
    isEnterprise: false,
    tenants: [],
    ...tokens,
  };
}

export async function login(username: string, password: string) {
  const trimmed = username.trim();
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: trimmed }, { phone: trimmed }] },
  });
  if (!user) throw new AppError(401, '账号或密码错误');
  if (user.status !== 'active') throw new AppError(403, '账号已被禁用');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError(401, '账号或密码错误');

  const tenantInfo = await buildTenantPayload(user.id);

  if (tenantInfo.tenantId) {
    await assertTenantActive(tenantInfo.tenantId);
  }

  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    phone: user.phone ?? undefined,
    role: user.role,
    isEnterprise: user.isEnterprise,
    tenantId: tenantInfo.tenantId,
    tenantRole: tenantInfo.tenantRole,
    permissions: tenantInfo.permissions,
  };
  const tokens = generateTokens(payload);

  await prisma.refreshToken.create({
    data: { userId: user.id, token: tokens.refreshToken, expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN) },
  });

  return {
    user: {
      id: user.id,
      username: user.username,
      phone: user.phone,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isEnterprise: user.isEnterprise,
      accountExpiresAt: user.accountExpiresAt?.toISOString() ?? null,
    },
    isEnterprise: user.isEnterprise,
    tenants: tenantInfo.tenants,
    tenantId: tenantInfo.tenantId ?? null,
    ...tokens,
  };
}

export async function selectTenant(userId: string, tenantId: string) {
  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    include: {
      tenant: { select: { id: true, name: true, status: true, expiresAt: true } },
      customRole: { select: { permissions: true } },
    },
  });
  if (!membership) throw new AppError(403, '您不是该企业的成员');
  await assertTenantActive(tenantId);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, '用户不存在');

  const permissions = resolveMemberPermissions(membership);

  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    phone: user.phone ?? undefined,
    role: user.role,
    isEnterprise: user.isEnterprise,
    tenantId: membership.tenantId,
    tenantRole: membership.role,
    permissions,
  };

  await prisma.refreshToken.deleteMany({ where: { userId } });
  const tokens = generateTokens(payload);
  await prisma.refreshToken.create({
    data: { userId: user.id, token: tokens.refreshToken, expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN) },
  });

  return {
    tenantId: membership.tenantId,
    tenantName: membership.tenant.name,
    tenantRole: membership.role,
    permissions,
    expiresAt: membership.tenant.expiresAt?.toISOString() ?? null,
    ...tokens,
  };
}

export async function refresh(oldRefreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({ where: { token: oldRefreshToken } });
  if (!stored || stored.expiresAt < new Date()) {
    if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw new AppError(401, 'Refresh token 无效或已过期');
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) throw new AppError(401, '用户不存在');
  if (user.status !== 'active') throw new AppError(403, '账号已被禁用');

  await prisma.refreshToken.delete({ where: { id: stored.id } });

  let decoded: any;
  try {
    decoded = jwt.verify(oldRefreshToken, env.JWT_REFRESH_SECRET);
  } catch { decoded = {}; }

  if (decoded.tenantId) {
    await assertTenantActive(decoded.tenantId);
  }

  const tenantInfo = decoded.tenantId
    ? await buildTenantPayload(user.id, decoded.tenantId)
    : await buildTenantPayload(user.id);

  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    phone: user.phone ?? undefined,
    role: user.role,
    isEnterprise: user.isEnterprise,
    tenantId: tenantInfo.tenantId,
    tenantRole: tenantInfo.tenantRole,
    permissions: tenantInfo.permissions,
  };
  const tokens = generateTokens(payload);

  await prisma.refreshToken.create({
    data: { userId: user.id, token: tokens.refreshToken, expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN) },
  });

  return { ...tokens };
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, '用户不存在');

  const memberships = await prisma.tenantMembership.findMany({
    where: { userId },
    include: { tenant: { select: { id: true, name: true, status: true, expiresAt: true } } },
  });

  return {
    id: user.id,
    username: user.username,
    phone: user.phone,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    isEnterprise: user.isEnterprise,
    accountExpiresAt: user.accountExpiresAt?.toISOString() ?? null,
    tenants: memberships.map(m => ({
      id: m.tenant.id,
      name: m.tenant.name,
      role: m.role,
      permissions: m.permissions,
      status: m.tenant.status,
      expiresAt: m.tenant.expiresAt?.toISOString() ?? null,
    })),
  };
}

function mePayload(user: {
  id: string;
  username: string;
  phone: string | null;
  email: string | null;
  displayName: string | null;
  role: string;
  status: string;
  isEnterprise: boolean;
  accountExpiresAt: Date | null;
}) {
  return {
    id: user.id,
    username: user.username,
    phone: user.phone,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    isEnterprise: user.isEnterprise,
    accountExpiresAt: user.accountExpiresAt?.toISOString() ?? null,
  };
}

export async function updateProfile(
  userId: string,
  data: {
    displayName?: string;
    phone?: string;
    oldPassword?: string;
    newPassword?: string;
  },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, '用户不存在');

  const updates: {
    displayName?: string;
    username?: string;
    passwordHash?: string;
  } = {};

  let reissueTokens = false;

  if (data.displayName !== undefined) {
    updates.displayName = data.displayName.trim() || user.username;
  }

  if (data.newPassword !== undefined && data.newPassword.length > 0) {
    if (!data.oldPassword) throw new AppError(400, '修改密码请填写原密码');
    const ok = await bcrypt.compare(data.oldPassword, user.passwordHash);
    if (!ok) throw new AppError(401, '原密码错误');
    if (data.newPassword.length < 6) throw new AppError(400, '新密码至少6位');
    updates.passwordHash = await bcrypt.hash(data.newPassword, 10);
    reissueTokens = true;
  }

  if (Object.keys(updates).length === 0) {
    return { user: mePayload(user) };
  }

  if (reissueTokens) {
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updates,
  });

  const userOut = mePayload(updated);

  if (reissueTokens) {
    const tenantInfo = await buildTenantPayload(updated.id);
    const payload: JwtPayload = {
      userId: updated.id,
      username: updated.username,
      phone: updated.phone ?? undefined,
      role: updated.role,
      isEnterprise: updated.isEnterprise,
      tenantId: tenantInfo.tenantId,
      tenantRole: tenantInfo.tenantRole,
      permissions: tenantInfo.permissions,
    };
    const tokens = generateTokens(payload);
    await prisma.refreshToken.create({
      data: { userId: updated.id, token: tokens.refreshToken, expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN) },
    });
    return { user: userOut, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  return { user: userOut };
}

type CodeEntry = { code: string; exp: number };
const phoneChangeCodes = new Map<string, CodeEntry>();
const phoneChangeSendCooldown = new Map<string, number>();

const PHONE_CHG_COOLDOWN_MS = 60_000;
const PHONE_CHG_CODE_TTL_MS = 300_000;

function random6(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

function putPhoneChangeCode(key: string): string {
  const code = random6();
  phoneChangeCodes.set(key, { code, exp: Date.now() + PHONE_CHG_CODE_TTL_MS });
  return code;
}

function consumePhoneChangeCode(key: string, input: string): boolean {
  const v = phoneChangeCodes.get(key);
  if (!v || Date.now() > v.exp) {
    phoneChangeCodes.delete(key);
    return false;
  }
  if (v.code !== input.trim()) return false;
  phoneChangeCodes.delete(key);
  return true;
}

function assertSendCooldown(key: string) {
  const last = phoneChangeSendCooldown.get(key) ?? 0;
  if (Date.now() - last < PHONE_CHG_COOLDOWN_MS) {
    const sec = Math.ceil((PHONE_CHG_COOLDOWN_MS - (Date.now() - last)) / 1000);
    throw new AppError(429, `请 ${sec} 秒后再获取验证码`);
  }
  phoneChangeSendCooldown.set(key, Date.now());
}

const isDevSms = () => process.env.NODE_ENV !== 'production';

export async function phoneChangeSendCodeOld(userId: string, oldPhone: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, '用户不存在');
  if (!CN_PHONE_RE.test(user.username)) throw new AppError(400, '当前账号不使用手机号登录');
  const o = oldPhone.trim();
  if (!CN_PHONE_RE.test(o)) throw new AppError(400, '请输入正确的11位原手机号');
  if (user.username !== o) throw new AppError(400, '与原绑定手机号不一致');
  assertSendCooldown(`send:old:${userId}`);
  const code = putPhoneChangeCode(`old:${userId}`);
  const out: { message: string; devCode?: string } = {
    message: '验证码已发送（生产环境将发送至原手机号）',
  };
  if (isDevSms()) out.devCode = code;
  return out;
}

export async function phoneChangeVerifyOldCode(userId: string, oldPhone: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, '用户不存在');
  const o = oldPhone.trim();
  if (!CN_PHONE_RE.test(o) || user.username !== o) throw new AppError(400, '原手机号不正确');
  if (!consumePhoneChangeCode(`old:${userId}`, code)) {
    throw new AppError(400, '验证码错误或已过期，请重新获取');
  }
  const phaseToken = jwt.sign(
    { uid: userId, st: 'chg_new' },
    env.JWT_SECRET,
    { expiresIn: '15m' } as jwt.SignOptions,
  );
  return { phaseToken };
}

function decodePhaseToken(userId: string, phaseToken: string) {
  let decoded: jwt.JwtPayload & { uid?: string; st?: string };
  try {
    decoded = jwt.verify(phaseToken, env.JWT_SECRET) as jwt.JwtPayload & { uid?: string; st?: string };
  } catch {
    throw new AppError(401, '操作已过期，请从验证原手机重新开始');
  }
  if (decoded.uid !== userId || decoded.st !== 'chg_new') throw new AppError(401, '无效的操作凭证');
}

export async function phoneChangeSendCodeNew(userId: string, phaseToken: string, newPhone: string) {
  decodePhaseToken(userId, phaseToken);
  const p = newPhone.trim();
  if (!CN_PHONE_RE.test(p)) throw new AppError(400, '请输入正确的新手机号');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, '用户不存在');
  if (p === user.username) throw new AppError(400, '新手机号与当前相同');
  const taken = await prisma.user.findUnique({ where: { username: p } });
  if (taken) throw new AppError(409, '该手机号已被使用');
  assertSendCooldown(`send:new:${userId}:${p}`);
  const code = putPhoneChangeCode(`new:${userId}:${p}`);
  const out: { message: string; devCode?: string } = {
    message: '验证码已发送（生产环境将发送至新手机号）',
  };
  if (isDevSms()) out.devCode = code;
  return out;
}

export async function phoneChangeComplete(
  userId: string,
  phaseToken: string,
  newPhone: string,
  code: string,
) {
  decodePhaseToken(userId, phaseToken);
  const p = newPhone.trim();
  if (!CN_PHONE_RE.test(p)) throw new AppError(400, '请输入正确的新手机号');
  if (!consumePhoneChangeCode(`new:${userId}:${p}`, code)) {
    throw new AppError(400, '验证码错误或已过期，请重新获取');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, '用户不存在');
  if (p === user.username) throw new AppError(400, '新手机号与当前相同');
  const taken = await prisma.user.findUnique({ where: { username: p } });
  if (taken) throw new AppError(409, '该手机号已被使用');

  await prisma.refreshToken.deleteMany({ where: { userId } });
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { username: p, phone: p },
  });
  const userOut = mePayload(updated);

  const tenantInfo = await buildTenantPayload(updated.id);
  const payload: JwtPayload = {
    userId: updated.id,
    username: updated.username,
    phone: updated.phone ?? undefined,
    role: updated.role,
    isEnterprise: updated.isEnterprise,
    tenantId: tenantInfo.tenantId,
    tenantRole: tenantInfo.tenantRole,
    permissions: tenantInfo.permissions,
  };
  const tokens = generateTokens(payload);
  await prisma.refreshToken.create({
    data: { userId: updated.id, token: tokens.refreshToken, expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN) },
  });
  return { user: userOut, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}
