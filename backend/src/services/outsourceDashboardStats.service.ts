import type { TenantPrismaClient } from '../lib/prisma.js';
import { computeOutsourceStatsByTemplate } from '../../../shared/outsourceStatsAggregates.js';

function mapOutsourceRecord(row: {
  type: string;
  orderId: string | null;
  productId: string;
  nodeId: string | null;
  partner: string | null;
  quantity: unknown;
  status: string | null;
  sourceReworkId: string | null;
  timestamp: Date;
}) {
  return {
    type: row.type,
    orderId: row.orderId,
    productId: row.productId,
    nodeId: row.nodeId,
    partner: row.partner,
    quantity: Number(row.quantity ?? 0),
    status: row.status,
    sourceReworkId: row.sourceReworkId,
    timestamp: row.timestamp,
  };
}

export async function computeOutsourceTemplateStats(
  db: TenantPrismaClient,
  templateIds: string[],
  periodRange: { start: Date; end: Date },
) {
  if (templateIds.length === 0) return new Map();

  const { start, end } = periodRange;
  const records = await db.productionOpRecord.findMany({
    where: { type: 'OUTSOURCE' },
    select: {
      type: true,
      orderId: true,
      productId: true,
      nodeId: true,
      partner: true,
      quantity: true,
      status: true,
      sourceReworkId: true,
      timestamp: true,
    },
  });

  return computeOutsourceStatsByTemplate({
    templateIds,
    records: records.map(mapOutsourceRecord),
    periodStart: start,
    periodEnd: end,
  });
}
