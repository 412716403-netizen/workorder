import Redis from 'ioredis';

let client: Redis | null | undefined;

function redisUrl(): string | undefined {
  const u = process.env.REDIS_URL?.trim();
  return u || undefined;
}

/** 懒连接；无 REDIS_URL 或未安装 Redis 时返回 null（调用方走 DB / 内存降级）。 */
export function getRedis(): Redis | null {
  if (client === undefined) {
    const url = redisUrl();
    if (!url) {
      client = null;
      return null;
    }
    try {
      const c = new Redis(url, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: true,
      });
      c.on('error', (err) => {
        console.warn('[redis] connection error:', err.message);
      });
      client = c;
    } catch (e) {
      console.warn('[redis] init failed:', e);
      client = null;
    }
  }
  return client;
}

export async function redisGet(key: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch (e) {
    console.warn('[redis] get failed:', key, e);
    return null;
  }
}

export async function redisSetEx(key: string, seconds: number, value: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, value, 'EX', seconds);
  } catch (e) {
    console.warn('[redis] setex failed:', key, e);
  }
}

export async function redisDel(...keys: string[]): Promise<void> {
  const r = getRedis();
  if (!r || keys.length === 0) return;
  try {
    await r.del(...keys);
  } catch (e) {
    console.warn('[redis] del failed:', keys, e);
  }
}

/** JSON 读取；反序列化失败返回 null */
export async function redisGetJson<T>(key: string): Promise<T | null> {
  const raw = await redisGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function redisSetJson(key: string, value: unknown, ttlSec: number): Promise<void> {
  await redisSetEx(key, ttlSec, JSON.stringify(value));
}

/** SET key NX EX — `ok` 首次设置；`exists` 已存在；`unavailable` 无 Redis 或出错 */
export async function redisSetNxEx(
  key: string,
  seconds: number,
  value = '1',
): Promise<'ok' | 'exists' | 'unavailable'> {
  const r = getRedis();
  if (!r) return 'unavailable';
  try {
    const ok = await r.set(key, value, 'EX', seconds, 'NX');
    return ok === 'OK' ? 'ok' : 'exists';
  } catch (e) {
    console.warn('[redis] setnx failed:', key, e);
    return 'unavailable';
  }
}

export async function redisTtl(key: string): Promise<number> {
  const r = getRedis();
  if (!r) return -2;
  try {
    return await r.ttl(key);
  } catch (e) {
    console.warn('[redis] ttl failed:', key, e);
    return -2;
  }
}
