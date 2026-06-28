import type { TenantPrismaClient } from '../lib/prisma.js';
import * as settingsService from './settings.service.js';
import { computeReworkStatsByTemplate } from '../../../shared/reworkStatsAggregates.js';
import { buildOutOfSequenceTemplateIds } from '../../../shared/processSequence.js';
import type { ProcessSequenceMode, ProductionLinkMode } from '../types/index.js';

function mapReworkRecord(row: {
  type: string;
  orderId: string | null;
  productId: string;
  nodeId: string | null;
  sourceNodeId: string | null;
  quantity: unknown;
  status: string | null;
  reworkNodeIds: unknown;
  completedNodeIds: unknown;
  reworkCompletedQuantityByNode: unknown;
  timestamp: Date;
}) {
  const reworkNodeIds = Array.isArray(row.reworkNodeIds)
    ? row.reworkNodeIds.filter((v): v is string => typeof v === 'string')
    : null;
  const completedNodeIds = Array.isArray(row.completedNodeIds)
    ? row.completedNodeIds.filter((v): v is string => typeof v === 'string')
    : null;
  const reworkCompletedQuantityByNode =
    row.reworkCompletedQuantityByNode
    && typeof row.reworkCompletedQuantityByNode === 'object'
    && !Array.isArray(row.reworkCompletedQuantityByNode)
      ? (row.reworkCompletedQuantityByNode as Record<string, number>)
      : null;

  return {
    type: row.type,
    orderId: row.orderId,
    productId: row.productId,
    nodeId: row.nodeId,
    sourceNodeId: row.sourceNodeId,
    quantity: Number(row.quantity ?? 0),
    status: row.status,
    reworkNodeIds,
    completedNodeIds,
    reworkCompletedQuantityByNode,
    timestamp: row.timestamp,
  };
}

export async function computeReworkTemplateStats(
  db: TenantPrismaClient,
  tenantId: string,
  templateIds: string[],
  periodRange: { start: Date; end: Date },
) {
  if (templateIds.length === 0) return new Map();

  const config = await settingsService.getConfig(tenantId);
  // 工序顺序设置已下线：全局恒「按工序顺序生产」，例外由工序级 allowOutOfSequence 控制。
  const processSequenceMode: ProcessSequenceMode = 'sequential';
  const productionLinkMode = (config.productionLinkMode as ProductionLinkMode | undefined) ?? 'order';
  const { start, end } = periodRange;

  const outOfSequenceNodes = await db.globalNodeTemplate.findMany({
    where: { allowOutOfSequence: true },
    select: { id: true },
  });
  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(
    outOfSequenceNodes.map(n => ({ id: n.id, allowOutOfSequence: true })),
  );

  const [records, orders] = await Promise.all([
    db.productionOpRecord.findMany({
      where: { type: { in: ['REWORK', 'REWORK_REPORT'] } },
      select: {
        type: true,
        orderId: true,
        productId: true,
        nodeId: true,
        sourceNodeId: true,
        quantity: true,
        status: true,
        reworkNodeIds: true,
        completedNodeIds: true,
        reworkCompletedQuantityByNode: true,
        timestamp: true,
      },
    }),
    db.productionOrder.findMany({
      select: { id: true, productId: true, parentOrderId: true },
    }),
  ]);

  return computeReworkStatsByTemplate({
    templateIds,
    records: records.map(mapReworkRecord),
    orders,
    processSequenceMode,
    productionLinkMode,
    periodStart: start,
    periodEnd: end,
    outOfSequenceTemplateIds,
  });
}
