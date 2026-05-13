import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * 单号生成跨进程串行化 —— PM2 cluster / 多副本部署的关键。
 *
 * 背景：
 * - `generateDocNo` / `nextOutsourceDocNoForPartner` 是「SELECT max → +1」模式，
 *   无锁、无事务，两条并发请求拿到相同 max+1 就会**重号**。
 * - 业务 N:1 模型（一个 docNo 可能对应多条明细）使得我们**不能**直接对
 *   `(tenantId, doc_no)` 加 unique 约束兜底，必须从源头串行化。
 *
 * 方案：PostgreSQL advisory lock。
 * - `pg_advisory_xact_lock(key bigint)` 取事务级排他锁，事务结束自动释放；
 * - key 由 `(tenantId, scope)` 字符串 SHA-256 取前 8 字节并视为 signed int64
 *   得到，碰撞概率可忽略；
 * - 同一个 key 上的所有取号会按 PG 锁队列顺序处理；不同 key 之间互不阻塞，
 *   不影响其他业务并发；
 * - 配合短事务 + 取号内调用方自己的 insert，整体延迟仍在毫秒级。
 *
 * 用法（典型）：
 * ```
 * const docNo = await withDocNoAdvisoryLock(tenantId, 'production:RK', async () =>
 *   generateDocNo('RK', 'production_op_records', 'doc_no', tenantId),
 * );
 * ```
 * 或在更大的事务里调 `withDocNoAdvisoryLockTx(tx, ...)` 复用已有事务。
 */

/** 把任意字符串映射成 PG bigint key（取 SHA-256 前 8 字节，big-endian，signed） */
export function advisoryKeyFromScope(tenantId: string | undefined, scope: string): bigint {
  const raw = `${tenantId ?? ''}|${scope}`;
  const buf = createHash('sha256').update(raw).digest();
  // PG bigint 是 signed int64；读前 8 字节作为 big-endian signed。
  return buf.readBigInt64BE(0);
}

type TxClient = Prisma.TransactionClient;

/**
 * 在一个**新**事务内持 advisory lock 执行 `fn`。
 * 适合"只取号、立刻 return"的场景；如果调用方还要继续走自己的事务，
 * 用 `withDocNoAdvisoryLockTx` 在外层事务里复用同一个 tx。
 */
export async function withDocNoAdvisoryLock<T>(
  tenantId: string | undefined,
  scope: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  const key = advisoryKeyFromScope(tenantId, scope);
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${key.toString()})`);
    return fn(tx);
  });
}

/** 已经在外层事务里时，在同一个 tx 上加 advisory lock 后执行 `fn`。 */
export async function withDocNoAdvisoryLockTx<T>(
  tx: TxClient,
  tenantId: string | undefined,
  scope: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = advisoryKeyFromScope(tenantId, scope);
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${key.toString()})`);
  return fn();
}
