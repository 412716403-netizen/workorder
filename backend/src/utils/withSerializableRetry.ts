import { Prisma } from '@prisma/client';

/** Prisma：可串行化事务因写冲突/死锁失败（PostgreSQL 等） */
const RETRYABLE_SERIALIZATION_CODES = new Set<string>(['P2034']);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 包裹 `isolationLevel: Serializable` 的 Prisma 事务：冲突时自动有限次重试（指数退避 + 少量抖动）。
 * 幂等安全应由调用方保证（同一业务键重复提交不产生重复副作用）。
 */
export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const baseDelayMs = options?.baseDelayMs ?? 25;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const retryable =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        RETRYABLE_SERIALIZATION_CODES.has(e.code);
      if (!retryable || attempt >= maxAttempts) {
        throw e;
      }
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * 30);
      await sleep(backoff + jitter);
    }
  }

  throw lastErr;
}
