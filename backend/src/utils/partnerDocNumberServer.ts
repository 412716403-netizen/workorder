import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { withDocNoAdvisoryLock, withDocNoAdvisoryLockTx } from './docNumberLock.js';

function trimStr(s: string): string {
  return s.trim();
}

type TxClient = Prisma.TransactionClient;

async function resolvePartnerSegment(
  db: TxClient | typeof prisma,
  tenantId: string,
  partnerName: string,
): Promise<string> {
  const t = trimStr(partnerName);
  if (!t) return '0000';
  const partners = await db.partner.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, partnerListNo: true },
  });
  const p = partners.find(x => trimStr(x.name) === t);
  if (!p) return '0000';
  if (p.partnerListNo != null && p.partnerListNo >= 1) {
    return String(p.partnerListNo).padStart(4, '0');
  }
  const idx = partners.findIndex(x => x.id === p.id);
  return String(idx >= 0 ? idx + 1 : 1).padStart(4, '0');
}

export type OutsourceDocKindServer = 'dispatch' | 'receive';

const PREFIX: Record<OutsourceDocKindServer, string> = {
  dispatch: 'WX',
  receive: 'WR',
};

async function readMaxOutsourceSeq(
  db: TxClient | typeof prisma,
  tenantId: string,
  prefix: string,
  seg: string,
  partnerName: string,
): Promise<number> {
  const escaped = seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${prefix}-${escaped}-(\\d+)$`);
  const pt = trimStr(partnerName);
  const rows = await db.productionOpRecord.findMany({
    where: { tenantId, type: 'OUTSOURCE', docNo: { not: null } },
    select: { docNo: true, partner: true },
  });
  let maxSeq = 0;
  for (const r of rows) {
    if (!r.docNo) continue;
    if (trimStr(r.partner || '') !== pt) continue;
    const m = r.docNo.match(re);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return maxSeq;
}

/**
 * 服务端外协单号（与前端 partnerDocNumber 规则一致）。
 *
 * **并发安全**：通过 advisory lock 跨进程串行化同 (tenantId, prefix, partnerSeg)
 * 的取号；若已在外层事务里，请改用 `nextOutsourceDocNoForPartnerTx` 复用 tx，
 * 把锁延伸到 db.create 完成。
 *
 * 历史注：旧实现按 `status` 分 dispatch/receive 过滤 max，会让"仅余已收回"
 * 后 dispatch 的下一单从 001 重新取号，引发重号；现已修复（同合作单位共用
 * (prefix, seg) 序号空间）。
 */
export async function nextOutsourceDocNoForPartner(
  tenantId: string,
  kind: OutsourceDocKindServer,
  partnerName: string,
): Promise<string> {
  const prefix = PREFIX[kind];
  return withDocNoAdvisoryLock(
    tenantId,
    `outsource:${prefix}:${trimStr(partnerName)}`,
    async tx => {
      const seg = await resolvePartnerSegment(tx, tenantId, partnerName);
      const maxSeq = await readMaxOutsourceSeq(tx, tenantId, prefix, seg, partnerName);
      return `${prefix}-${seg}-${String(maxSeq + 1).padStart(3, '0')}`;
    },
  );
}

/** 给在外层事务里的调用方用。 */
export async function nextOutsourceDocNoForPartnerTx(
  tx: TxClient,
  tenantId: string,
  kind: OutsourceDocKindServer,
  partnerName: string,
): Promise<string> {
  const prefix = PREFIX[kind];
  return withDocNoAdvisoryLockTx(
    tx,
    tenantId,
    `outsource:${prefix}:${trimStr(partnerName)}`,
    async () => {
      const seg = await resolvePartnerSegment(tx, tenantId, partnerName);
      const maxSeq = await readMaxOutsourceSeq(tx, tenantId, prefix, seg, partnerName);
      return `${prefix}-${seg}-${String(maxSeq + 1).padStart(3, '0')}`;
    },
  );
}
