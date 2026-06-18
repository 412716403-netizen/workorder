import { prisma as basePrisma } from '../lib/prisma.js';

const PRODUCTION_OP_TYPES_WITH_ACTIVITY = [
  'OUTSOURCE',
  'REWORK',
  'REWORK_REPORT',
  'SCRAP',
  'STOCK_IN',
  'STOCK_OUT',
  'STOCK_RETURN',
] as const;

/**
 * 租户是否已有生产业务数据。有则生产关联模式锁定，平台不可再改。
 */
export async function tenantHasProductionActivity(tenantId: string): Promise<boolean> {
  const [pmpReportCount, milestoneReportCount, opCount, milestoneCompletedCount] = await Promise.all([
    basePrisma.productProgressReport.count({
      where: { progress: { tenantId } },
    }),
    basePrisma.milestoneReport.count({
      where: { milestone: { productionOrder: { tenantId } } },
    }),
    basePrisma.productionOpRecord.count({
      where: {
        tenantId,
        type: { in: [...PRODUCTION_OP_TYPES_WITH_ACTIVITY] },
      },
    }),
    basePrisma.milestone.count({
      where: {
        productionOrder: { tenantId },
        completedQuantity: { gt: 0 },
      },
    }),
  ]);
  return pmpReportCount > 0 || milestoneReportCount > 0 || opCount > 0 || milestoneCompletedCount > 0;
}
