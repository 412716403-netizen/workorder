import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import type { JwtPayload } from '../types/index.js';
import { ALL_PERMISSIONS } from '../types/index.js';
import { prisma } from '../lib/prisma.js';
import { hashToken } from '../utils/cookies.js';
import {
  getRedis,
  redisDel,
  redisGetJson,
  redisSetJson,
  redisSetNxEx,
  redisTtl,
} from '../lib/redis.js';

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
  if (membership.role === 'owner' || membership.role === 'admin') return [...ALL_PERMISSIONS];
  if (membership.roleId && membership.customRole) {
    const rolePerms = membership.customRole.permissions;
    const fromRole = Array.isArray(rolePerms) ? (rolePerms as string[]) : [];
    if (fromRole.length > 0) return fromRole;
    const fromMembership = Array.isArray(membership.permissions) ? (membership.permissions as string[]) : [];
    return fromMembership.length > 0 ? fromMembership : [];
  }
  return Array.isArray(membership.permissions) ? membership.permissions as string[] : [];
}

type TenantPayloadResult = {
  tenantId: string | undefined;
  tenantRole: string | undefined;
  permissions: string[] | undefined;
  tenants: Array<{
    id: string;
    name: string;
    role: string;
    permissions: string[];
    status: string;
    expiresAt: string | null;
    equipmentFeaturesEnabled: boolean;
  }>;
};

async function loadTenantPayloadFromDb(userId: string, tenantId?: string): Promise<TenantPayloadResult> {
  const memberships = await prisma.tenantMembership.findMany({
    where: { userId },
    include: {
      tenant: { select: { id: true, name: true, status: true, expiresAt: true, equipmentModuleEnabled: true } },
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
    equipmentFeaturesEnabled: m.tenant.equipmentModuleEnabled !== false,
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

/**
 * Phase 3.E follow-up：
 * - TTL 从 30s 收紧到 5s。原 30s 在管理员"立即踢人 / 立即收回权限"场景下窗口太大；
 *   5s 已能保护 99% 的请求避开 DB（typical 用户操作间隔 > 1s），又把权限变更生效
 *   延迟控制在用户体感不到的范围。
 * - 配合 `invalidateAuthTenantCache(userId)`：roles/tenants/admin 等会修改有效权限的
 *   入口在写操作完成后调用，立即让缓存失效，最坏情况是 5s + 当前 in-flight 请求。
 */
const AUTH_TENANT_CACHE_TTL_S = 5;

function tenantCacheKey(userId: string, tenantId?: string): string {
  return `cache:auth:tenant-payload:${userId}:${tenantId ?? '_'}`;
}

async function buildTenantPayload(userId: string, tenantId?: string): Promise<TenantPayloadResult> {
  const cacheKey = tenantCacheKey(userId, tenantId);
  if (getRedis()) {
    const hit = await redisGetJson<TenantPayloadResult>(cacheKey);
    if (hit) return hit;
  }
  const fresh = await loadTenantPayloadFromDb(userId, tenantId);
  if (getRedis()) {
    await redisSetJson(cacheKey, fresh, AUTH_TENANT_CACHE_TTL_S);
  }
  return fresh;
}

/**
 * 主动失效一个用户在指定租户的缓存 payload。
 * - `tenantId` 省略时失效该用户**所有**租户上下文（用 KEYS+DEL 实现，量很小）。
 * - 在 roles/tenants/adminUsers 等会改变用户权限的写入路径里调用，
 *   避免 5s TTL 期内用户拿到旧权限。
 */
export async function invalidateAuthTenantCache(userId: string, tenantId?: string): Promise<void> {
  if (!getRedis()) return;
  if (tenantId) {
    await redisDel(tenantCacheKey(userId, tenantId));
    return;
  }
  // 多租户场景下兜底清掉同 userId 的所有 payload key。
  const r = getRedis();
  if (!r) return;
  try {
    const pattern = `cache:auth:tenant-payload:${userId}:*`;
    const keys = await r.keys(pattern);
    if (keys.length > 0) await redisDel(...keys);
  } catch (e) {
    console.warn('[auth] invalidateAuthTenantCache failed:', e);
  }
}

/**
 * 主动失效"某租户下所有成员"的 payload 缓存。
 * 用于角色权限变更、批量调整成员配置等会影响多个成员的场景。
 *
 * 实现说明：key 结构为 `cache:auth:tenant-payload:<userId>:<tenantId>`，没有反向索引，
 * 这里用 SCAN（cursor-based、非阻塞）扫一遍 `:${tenantId}` 后缀的 key 集中删除。
 * 单租户成员 100~1000 量级时延迟可忽略；无 Redis 时直接返回。
 */
export async function invalidateAuthCacheForTenant(tenantId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const suffix = `:${tenantId}`;
  const matchPattern = `cache:auth:tenant-payload:*${suffix}`;
  try {
    let cursor = '0';
    const toDel: string[] = [];
    do {
      const [next, keys] = (await r.scan(cursor, 'MATCH', matchPattern, 'COUNT', 200)) as [
        string,
        string[],
      ];
      cursor = next;
      for (const k of keys) {
        if (k.endsWith(suffix)) toDel.push(k);
      }
    } while (cursor !== '0');
    if (toDel.length > 0) await redisDel(...toDel);
  } catch (e) {
    console.warn('[auth] invalidateAuthCacheForTenant failed:', e);
  }
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
    data: { userId: user.id, token: hashToken(tokens.refreshToken), expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN) },
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

  console.warn(`[auth:login] user=${user.id} (${user.username}) tenantId=${tenantInfo.tenantId ?? 'none'}`);
  await prisma.refreshToken.create({
    data: { userId: user.id, token: hashToken(tokens.refreshToken), expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN) },
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
      tenant: { select: { id: true, name: true, status: true, expiresAt: true, equipmentModuleEnabled: true } },
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

  const deletedCount = await prisma.refreshToken.deleteMany({ where: { userId } });
  console.warn(`[auth:selectTenant] deleted ${deletedCount.count} refresh tokens for user=${userId} tenant=${tenantId}`);
  const tokens = generateTokens(payload);
  await prisma.refreshToken.create({
    data: { userId: user.id, token: hashToken(tokens.refreshToken), expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN) },
  });

  return {
    tenantId: membership.tenantId,
    tenantName: membership.tenant.name,
    tenantRole: membership.role,
    permissions,
    expiresAt: membership.tenant.expiresAt?.toISOString() ?? null,
    equipmentFeaturesEnabled: membership.tenant.equipmentModuleEnabled !== false,
    ...tokens,
  };
}

export async function refresh(oldRefreshToken: string) {
  const tokenHash = hashToken(oldRefreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });
  if (!stored || stored.expiresAt < new Date()) {
    console.warn('[auth:refresh] FAIL —',
      stored ? `token EXPIRED (exp=${stored.expiresAt.toISOString()}, userId=${stored.userId})` : `token hash NOT found in DB | hash_prefix=${tokenHash.slice(0, 12)}…`,
      `| total_tokens_in_table=${await prisma.refreshToken.count().catch(() => -1)}`);
    if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw new AppError(401, 'Refresh token 无效或已过期');
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) throw new AppError(401, '用户不存在');
  if (user.status !== 'active') throw new AppError(403, '账号已被禁用');

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

  // Only issue a new access token; keep the same refresh token to avoid
  // the race where the client misses the rotation response (browser close,
  // network drop, etc.) and gets permanently locked out.
  const accessToken = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);

  return { accessToken, refreshToken: oldRefreshToken };
}

export async function logout(refreshToken: string) {
  if (!refreshToken) return;
  await prisma.refreshToken.deleteMany({ where: { token: hashToken(refreshToken) } });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, '用户不存在');

  const memberships = await prisma.tenantMembership.findMany({
    where: { userId },
    include: {
      tenant: { select: { id: true, name: true, status: true, expiresAt: true, equipmentModuleEnabled: true } },
      customRole: { select: { permissions: true } },
    },
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
      permissions: resolveMemberPermissions(m),
      status: m.tenant.status,
      expiresAt: m.tenant.expiresAt?.toISOString() ?? null,
      equipmentFeaturesEnabled: m.tenant.equipmentModuleEnabled !== false,
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
      data: { userId: updated.id, token: hashToken(tokens.refreshToken), expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN) },
    });
    return { user: userOut, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  return { user: userOut };
}

type CodeEntry = { code: string; exp: number };
/** 无 REDIS_URL 或 Redis 不可用时回退；PM2 多 worker 时须配置 Redis */
const phoneChangeCodes = new Map<string, CodeEntry>();
const phoneChangeSendCooldown = new Map<string, number>();

const PHONE_CHG_COOLDOWN_MS = 60_000;
const PHONE_CHG_CODE_TTL_MS = 300_000;
const PHONE_CODE_REDIS_SEC = Math.ceil(PHONE_CHG_CODE_TTL_MS / 1000);
const PHONE_COOLDOWN_REDIS_SEC = Math.ceil(PHONE_CHG_COOLDOWN_MS / 1000);

function random6(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

function codeRedisKey(logicalKey: string): string {
  return `phone:change:code:${logicalKey}`;
}

function cooldownRedisKey(logicalKey: string): string {
  return `phone:change:cooldown:${logicalKey}`;
}

async function putPhoneChangeCode(logicalKey: string): Promise<string> {
  const code = random6();
  if (getRedis()) {
    await redisSetJson(codeRedisKey(logicalKey), { code }, PHONE_CODE_REDIS_SEC);
    return code;
  }
  phoneChangeCodes.set(logicalKey, { code, exp: Date.now() + PHONE_CHG_CODE_TTL_MS });
  return code;
}

async function consumePhoneChangeCode(logicalKey: string, input: string): Promise<boolean> {
  const trimmed = input.trim();
  if (getRedis()) {
    const rkey = codeRedisKey(logicalKey);
    const v = await redisGetJson<{ code: string }>(rkey);
    if (!v || v.code !== trimmed) return false;
    await redisDel(rkey);
    return true;
  }
  const v = phoneChangeCodes.get(logicalKey);
  if (!v || Date.now() > v.exp) {
    phoneChangeCodes.delete(logicalKey);
    return false;
  }
  if (v.code !== trimmed) return false;
  phoneChangeCodes.delete(logicalKey);
  return true;
}

async function assertSendCooldown(logicalKey: string): Promise<void> {
  const rkey = cooldownRedisKey(logicalKey);
  if (getRedis()) {
    const nx = await redisSetNxEx(rkey, PHONE_COOLDOWN_REDIS_SEC);
    if (nx === 'ok') return;
    if (nx === 'exists') {
      const ttl = await redisTtl(rkey);
      const sec = ttl > 0 ? ttl : 1;
      throw new AppError(429, `请 ${sec} 秒后再获取验证码`);
    }
  }
  const last = phoneChangeSendCooldown.get(logicalKey) ?? 0;
  if (Date.now() - last < PHONE_CHG_COOLDOWN_MS) {
    const sec = Math.ceil((PHONE_CHG_COOLDOWN_MS - (Date.now() - last)) / 1000);
    throw new AppError(429, `请 ${sec} 秒后再获取验证码`);
  }
  phoneChangeSendCooldown.set(logicalKey, Date.now());
}

const isDevSms = () => process.env.NODE_ENV !== 'production';

export async function phoneChangeSendCodeOld(userId: string, oldPhone: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, '用户不存在');
  if (!CN_PHONE_RE.test(user.username)) throw new AppError(400, '当前账号不使用手机号登录');
  const o = oldPhone.trim();
  if (!CN_PHONE_RE.test(o)) throw new AppError(400, '请输入正确的11位原手机号');
  if (user.username !== o) throw new AppError(400, '与原绑定手机号不一致');
  await assertSendCooldown(`send:old:${userId}`);
  const code = await putPhoneChangeCode(`old:${userId}`);
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
  if (!(await consumePhoneChangeCode(`old:${userId}`, code))) {
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
  await assertSendCooldown(`send:new:${userId}:${p}`);
  const code = await putPhoneChangeCode(`new:${userId}:${p}`);
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
  if (!(await consumePhoneChangeCode(`new:${userId}:${p}`, code))) {
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
    data: { userId: updated.id, token: hashToken(tokens.refreshToken), expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN) },
  });
  return { user: userOut, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}
