import { getRedis, redisGet, redisGetJson, redisSetJson } from '../lib/redis.js';

/**
 * 产品经营（列表/明细）结果缓存。
 *
 * key 结构：pe:{kind}:{tenantId}:v{version}:{parts...}
 * - version 为租户级版本号（pe:ver:{tenantId}）；价格规则等写路径 INCR 版本号即整体失效，
 *   无需按前缀扫描删除，旧 key 靠短 TTL 自然过期。
 * - parts 需包含 materialCostMode、period/customRange、权限位（canProduction/canPsi/canFinance），
 *   避免不同权限用户串数据。
 * - 读序：进程内内存 → Redis → 计算；无 REDIS_URL 时内存兜底仍生效（单实例部署语义等效）。
 */
export const PRODUCT_ECONOMICS_CACHE_TTL_S = 60;
const MEMORY_CACHE_MAX_ENTRIES = 200;

type MemoryEntry = { value: unknown; expiresAt: number };

const memoryCache = new Map<string, MemoryEntry>();
/** 租户版本号内存副本：无 Redis 时 invalidate 也能立即切 key */
const memoryVersions = new Map<string, number>();
/** 同 key 计算合并（widget 预热与弹窗打开常并发） */
const inFlight = new Map<string, Promise<unknown>>();

function versionKey(tenantId: string): string {
  return `pe:ver:${tenantId}`;
}

function nowMs(): number {
  return Date.now();
}

function pruneMemoryCache(now: number): void {
  for (const [k, entry] of memoryCache) {
    if (entry.expiresAt <= now) memoryCache.delete(k);
  }
  while (memoryCache.size > MEMORY_CACHE_MAX_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    if (oldest === undefined) break;
    memoryCache.delete(oldest);
  }
}

function memoryGet<T>(key: string): T | null {
  const now = nowMs();
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function memorySet(key: string, value: unknown): void {
  const now = nowMs();
  pruneMemoryCache(now);
  memoryCache.set(key, {
    value,
    expiresAt: now + PRODUCT_ECONOMICS_CACHE_TTL_S * 1000,
  });
}

async function resolveVersion(tenantId: string): Promise<string> {
  const fromRedis = await redisGet(versionKey(tenantId));
  if (fromRedis != null) {
    const n = Number(fromRedis);
    if (Number.isFinite(n)) memoryVersions.set(tenantId, n);
    return fromRedis;
  }
  return String(memoryVersions.get(tenantId) ?? 0);
}

export async function buildProductEconomicsCacheKey(
  tenantId: string,
  kind: 'list' | 'detail',
  parts: string[],
): Promise<string> {
  const version = await resolveVersion(tenantId);
  return `pe:${kind}:${tenantId}:v${version}:${parts.join(':')}`;
}

export async function getProductEconomicsCache<T>(key: string): Promise<T | null> {
  const mem = memoryGet<T>(key);
  if (mem != null) return mem;
  const fromRedis = await redisGetJson<T>(key);
  if (fromRedis != null) {
    memorySet(key, fromRedis);
    return fromRedis;
  }
  return null;
}

export async function setProductEconomicsCache(key: string, value: unknown): Promise<void> {
  memorySet(key, value);
  await redisSetJson(key, value, PRODUCT_ECONOMICS_CACHE_TTL_S);
}

/**
 * 缓存未命中时合并并发计算：同一 cacheKey 只跑一份 factory，其余 await 同一 Promise。
 * factory 返回值会写入内存 + Redis（经 setProductEconomicsCache）。
 */
export async function withProductEconomicsCacheSingleflight<T>(
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const cached = await getProductEconomicsCache<T>(key);
  if (cached != null) return cached;

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const load = (async () => {
    const value = await factory();
    await setProductEconomicsCache(key, value);
    return value;
  })();
  inFlight.set(key, load);
  try {
    return await load;
  } finally {
    inFlight.delete(key);
  }
}

/** 价格规则 / 工序单价 / 物料价覆盖等写路径调用；同时 bump 内存与 Redis 版本 */
export async function invalidateProductEconomicsCache(tenantId: string): Promise<void> {
  const next = (memoryVersions.get(tenantId) ?? 0) + 1;
  memoryVersions.set(tenantId, next);
  // 旧 key 靠 TTL 过期；清掉该租户相关的 in-flight，避免失效后仍吞掉旧 Promise
  for (const key of inFlight.keys()) {
    if (key.includes(`:${tenantId}:`)) inFlight.delete(key);
  }
  const r = getRedis();
  if (!r) return;
  try {
    await r.incr(versionKey(tenantId));
  } catch (e) {
    console.warn('[redis] product economics cache invalidate failed:', tenantId, e);
  }
}
