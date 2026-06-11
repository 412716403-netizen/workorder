import type { TenantPrismaClient } from '../lib/prisma.js';
import * as settingsService from './settings.service.js';
import {
  computeTemplateReportStatsByTemplate,
  type ReportableOrder,
  type ReportablePmp,
  type ReportableProdRecord,
} from '../../../shared/orderReportableAggregates.js';
import type { ProcessSequenceMode, ProductionLinkMode } from '../types/index.js';
import { OrderStatus } from '../../../shared/types.js';

function mapOrder(row: {
  id: string;
  productId: string;
  parentOrderId: string | null;
  items: { quantity: unknown; variantId: string | null }[];
  milestones: {
    id: string;
    templateId: string;
    completedQuantity: unknown;
    reports: { quantity: unknown; defectiveQuantity: unknown; variantId: string | null }[];
  }[];
}): ReportableOrder {
  return {
    id: row.id,
    productId: row.productId,
    parentOrderId: row.parentOrderId,
    items: row.items.map(i => ({
      quantity: Number(i.quantity ?? 0),
      variantId: i.variantId,
    })),
    milestones: row.milestones.map(m => ({
      id: m.id,
      templateId: m.templateId,
      completedQuantity: Number(m.completedQuantity ?? 0),
      reports: m.reports.map(r => ({
        quantity: Number(r.quantity ?? 0),
        defectiveQuantity: Number(r.defectiveQuantity ?? 0),
        variantId: r.variantId,
      })),
    })),
  };
}

function mapPmp(row: {
  productId: string;
  milestoneTemplateId: string;
  variantId: string | null;
  completedQuantity: unknown;
  reports: { quantity: unknown; defectiveQuantity: unknown; variantId: string | null }[];
}): ReportablePmp {
  return {
    productId: row.productId,
    milestoneTemplateId: row.milestoneTemplateId,
    variantId: row.variantId,
    completedQuantity: Number(row.completedQuantity ?? 0),
    reports: row.reports.map(r => ({
      quantity: Number(r.quantity ?? 0),
      defectiveQuantity: Number(r.defectiveQuantity ?? 0),
      variantId: r.variantId,
    })),
  };
}

function mapProdRecord(row: {
  id: string;
  type: string;
  orderId: string | null;
  productId: string;
  variantId: string | null;
  quantity: unknown;
  nodeId: string | null;
  sourceNodeId: string | null;
  sourceReworkId: string | null;
  reworkNodeIds: unknown;
}): ReportableProdRecord {
  const reworkNodeIds = Array.isArray(row.reworkNodeIds)
    ? row.reworkNodeIds.filter((v): v is string => typeof v === 'string')
    : null;
  return {
    id: row.id,
    type: row.type,
    orderId: row.orderId,
    productId: row.productId,
    variantId: row.variantId,
    quantity: Number(row.quantity ?? 0),
    nodeId: row.nodeId,
    sourceNodeId: row.sourceNodeId,
    sourceReworkId: row.sourceReworkId,
    reworkNodeIds,
  };
}

/** 各工序当前可报 / 已报 / 剩余（与工单中心一致） */
export async function computeTemplateReportStats(
  db: TenantPrismaClient,
  tenantId: string,
  templateIds: string[],
) {
  if (templateIds.length === 0) return new Map();

  const config = await settingsService.getConfig(tenantId);
  const processSequenceMode = (config.processSequenceMode as ProcessSequenceMode | undefined) ?? 'sequential';
  const productionLinkMode = (config.productionLinkMode as ProductionLinkMode | undefined) ?? 'order';

  const [ordersRaw, pmpRaw, prodRecords] = await Promise.all([
    db.productionOrder.findMany({
      where: { status: { not: OrderStatus.SHIPPED } },
      include: {
        items: true,
        milestones: {
          include: { reports: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    db.productMilestoneProgress.findMany({
      include: { reports: true },
    }),
    db.productionOpRecord.findMany({
      where: { type: { in: ['REWORK', 'REWORK_REPORT', 'SCRAP'] } },
      select: {
        id: true,
        type: true,
        orderId: true,
        productId: true,
        variantId: true,
        quantity: true,
        nodeId: true,
        sourceNodeId: true,
        sourceReworkId: true,
        reworkNodeIds: true,
      },
    }),
  ]);

  return computeTemplateReportStatsByTemplate({
    templateIds,
    orders: ordersRaw.map(mapOrder),
    pmp: pmpRaw.map(mapPmp),
    prodRecords: prodRecords.map(mapProdRecord),
    processSequenceMode,
    productionLinkMode,
  });
}
