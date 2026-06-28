import type { TenantPrismaClient } from '../lib/prisma.js';
import {
  applyPartnerLedgerDelta,
  computePartnerReconFinanceDocDelta,
  computePartnerReconOutsourceReceiveDelta,
  computePartnerReconPsiDocDelta,
  emptyPartnerLedgerBucket,
  resolvePartnerLedgerKey,
  summarizePartnerLedgerBuckets,
  type PartnerReconPartnerStatsResult,
} from '../../../shared/partnerReconPartnerStats.js';
import {
  resolveWorkbenchStatsQuery,
  type WorkbenchStatsListQuery,
} from '../../../shared/workbenchOrderStats.js';

function recordTimeMs(createdAt: Date, timestamp: Date): number {
  const primary = createdAt?.getTime?.();
  if (typeof primary === 'number' && !Number.isNaN(primary)) return primary;
  const fallback = timestamp?.getTime?.();
  return typeof fallback === 'number' && !Number.isNaN(fallback) ? fallback : 0;
}

function getOrCreateBucket(
  buckets: Map<string, ReturnType<typeof emptyPartnerLedgerBucket>>,
  partnerKey: string,
) {
  if (!partnerKey) return null;
  let bucket = buckets.get(partnerKey);
  if (!bucket) {
    bucket = emptyPartnerLedgerBucket();
    buckets.set(partnerKey, bucket);
  }
  return bucket;
}

export async function getFinancePartnerWorkbenchStats(
  db: TenantPrismaClient,
  opts: WorkbenchStatsListQuery = {},
): Promise<PartnerReconPartnerStatsResult | null> {
  const { periodRange } = resolveWorkbenchStatsQuery(opts);
  const periodStartMs = periodRange.start.getTime();
  const periodEndMs = periodRange.end.getTime();

  const [partners, psiRows, finRows, prodRows] = await Promise.all([
    db.partner.findMany({ select: { id: true, name: true } }),
    db.psiRecord.findMany({
      where: {
        type: { in: ['SALES_BILL', 'PURCHASE_BILL'] },
        OR: [{ createdAt: { lte: periodRange.end } }, { timestamp: { lte: periodRange.end } }],
      },
      select: {
        type: true,
        docNumber: true,
        id: true,
        partner: true,
        partnerId: true,
        amount: true,
        createdAt: true,
        timestamp: true,
      },
    }),
    db.financeRecord.findMany({
      where: {
        type: { in: ['RECEIPT', 'PAYMENT'] },
        partner: { not: null },
        timestamp: { lte: periodRange.end },
      },
      select: {
        type: true,
        docNo: true,
        id: true,
        partner: true,
        amount: true,
        timestamp: true,
      },
    }),
    db.productionOpRecord.findMany({
      where: {
        type: 'OUTSOURCE',
        status: '已收回',
        partner: { not: null },
        timestamp: { lte: periodRange.end },
      },
      select: {
        docNo: true,
        id: true,
        partner: true,
        amount: true,
        timestamp: true,
      },
    }),
  ]);

  const partnerNameById = new Map(partners.map(p => [p.id, p.name]));
  const buckets = new Map<string, ReturnType<typeof emptyPartnerLedgerBucket>>();

  const psiByDoc = new Map<
    string,
    { partnerKey: string; type: string; amount: number; timeMs: number }
  >();
  for (const row of psiRows) {
    const partnerKey = resolvePartnerLedgerKey(row.partner, row.partnerId, partnerNameById);
    const bucket = getOrCreateBucket(buckets, partnerKey);
    if (!bucket) continue;
    const timeMs = recordTimeMs(row.createdAt, row.timestamp);
    if (timeMs > periodEndMs) continue;
    const docKey = `${partnerKey}|${row.type}|${row.docNumber || row.id}`;
    const amount = Number(row.amount ?? 0);
    const cur = psiByDoc.get(docKey);
    if (!cur) {
      psiByDoc.set(docKey, { partnerKey, type: row.type, amount, timeMs });
    } else {
      cur.amount += amount;
      cur.timeMs = Math.min(cur.timeMs, timeMs);
    }
  }
  for (const doc of psiByDoc.values()) {
    const bucket = buckets.get(doc.partnerKey);
    if (!bucket) continue;
    const delta = computePartnerReconPsiDocDelta(doc.type, doc.amount);
    applyPartnerLedgerDelta(bucket, delta, doc.timeMs >= periodStartMs && doc.timeMs <= periodEndMs);
  }

  const finByDoc = new Map<
    string,
    { partnerKey: string; type: string; amount: number; timeMs: number }
  >();
  for (const row of finRows) {
    const partnerKey = resolvePartnerLedgerKey(row.partner, null, partnerNameById);
    const bucket = getOrCreateBucket(buckets, partnerKey);
    if (!bucket) continue;
    const timeMs = row.timestamp.getTime();
    if (timeMs > periodEndMs) continue;
    const docKey = `${partnerKey}|${row.type}|${row.docNo || row.id}`;
    const amount = Number(row.amount ?? 0);
    const cur = finByDoc.get(docKey);
    if (!cur) {
      finByDoc.set(docKey, { partnerKey, type: row.type, amount, timeMs });
    } else {
      cur.amount += amount;
      cur.timeMs = Math.min(cur.timeMs, timeMs);
    }
  }
  for (const doc of finByDoc.values()) {
    const bucket = buckets.get(doc.partnerKey);
    if (!bucket) continue;
    const delta = computePartnerReconFinanceDocDelta(doc.type, doc.amount);
    applyPartnerLedgerDelta(bucket, delta, doc.timeMs >= periodStartMs && doc.timeMs <= periodEndMs);
  }

  const prodByDoc = new Map<string, { partnerKey: string; amount: number; timeMs: number }>();
  for (const row of prodRows) {
    const partnerKey = resolvePartnerLedgerKey(row.partner, null, partnerNameById);
    const bucket = getOrCreateBucket(buckets, partnerKey);
    if (!bucket) continue;
    const timeMs = row.timestamp.getTime();
    if (timeMs > periodEndMs) continue;
    const docKey = `${partnerKey}|OUTSOURCE|${row.docNo || row.id}`;
    const amount = Number(row.amount ?? 0);
    const cur = prodByDoc.get(docKey);
    if (!cur) {
      prodByDoc.set(docKey, { partnerKey, amount, timeMs });
    } else {
      cur.amount += amount;
      cur.timeMs = Math.min(cur.timeMs, timeMs);
    }
  }
  for (const doc of prodByDoc.values()) {
    const bucket = buckets.get(doc.partnerKey);
    if (!bucket) continue;
    const delta = computePartnerReconOutsourceReceiveDelta(doc.amount);
    applyPartnerLedgerDelta(bucket, delta, doc.timeMs >= periodStartMs && doc.timeMs <= periodEndMs);
  }

  return summarizePartnerLedgerBuckets(buckets);
}
