import { getRedis, redisGet, redisGetJson, redisSetJson } from '../lib/redis.js';

/**
 * 产品经营（列表/明细）结果缓存。
 *
 * key 结构：pe:{kind}:{tenantId}:v{version}:{parts...}
 * - version 为租户级版本号（pe:ver:{tenantId}）；价格规则等写路径 INCR 版本号即整体失效，
 *   无需按前缀扫描删除，旧 key 靠短 TTL 自然过期。
 * - parts 需包含 materialCostMode、period/customRange、权限位（canProduction/canPsi/canFinance），
 *   避免不同权限用户串数据。
 */
export const PRODUCT_ECONOMICS_CACHE_TTL_S = 60;

function versionKey(tenantId: string): string {
  return `pe:ver:${tenantId}`;
}

export async function buildProductEconomicsCacheKey(
  tenantId: string,
  kind: 'list' | 'detail',
  parts: string[],
): Promise<string> {
  const version = (await redisGet(versionKey(tenantId))) ?? '0';
  return `pe:${kind}:${tenantId}:v${version}:${parts.join(':')}`;
}

export async function getProductEconomicsCache<T>(key: string): Promise<T | null> {
  return redisGetJson<T>(key);
}

export async function setProductEconomicsCache(key: string, value: unknown): Promise<void> {
  await redisSetJson(key, value, PRODUCT_ECONOMICS_CACHE_TTL_S);
}

/** 价格规则 / 工序单价 / 物料价覆盖等写路径调用；无 Redis 时静默跳过 */
export async function invalidateProductEconomicsCache(tenantId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.incr(versionKey(tenantId));
  } catch (e) {
    console.warn('[redis] product economics cache invalidate failed:', tenantId, e);
  }
}
