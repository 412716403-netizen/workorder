import type { ProductionLinkMode } from '../../../shared/types.js';
import { normalizeProductionLinkMode } from '../../../shared/types.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import {
  PROCESS_LOCK_ORDER_STATUS_EXEMPT,
  milestoneNodeIdsEqual,
} from '../../../shared/productProcessLock.js';

export { milestoneNodeIdsEqual } from '../../../shared/productProcessLock.js';

export async function getProductionLinkMode(tenantId: string): Promise<ProductionLinkMode> {
  const tenant = await basePrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { productionLinkMode: true },
  });
  if (tenant) {
    return normalizeProductionLinkMode(tenant.productionLinkMode);
  }
  const setting = await basePrisma.systemSetting.findUnique({
    where: { tenantId_key: { tenantId, key: 'productionLinkMode' } },
  });
  const raw = setting?.value;
  if (raw === 'product') return 'product';
  return 'order';
}

export function productionOrderWhereCountsForProcessLock() {
  return { NOT: { status: PROCESS_LOCK_ORDER_STATUS_EXEMPT } };
}
