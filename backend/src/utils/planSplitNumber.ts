import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

/** 与前端 PlanOrderListView.getSplitGroupKey 一致：末尾 -1 … -99 为拆分子单 */
export function pickNextSplitPlanNumber(
  sourcePlanNumber: string,
  existingPlanNumbers: string[],
): string {
  const prefix = sourcePlanNumber.trim();
  if (!prefix) throw new AppError(400, '源计划单号无效');
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}-([1-9]\\d?)$`);
  const used = new Set<number>();
  for (const pn of existingPlanNumbers) {
    const m = pn.match(re);
    if (m) used.add(parseInt(m[1]!, 10));
  }
  for (let i = 1; i <= 99; i++) {
    if (!used.has(i)) return `${prefix}-${i}`;
  }
  throw new AppError(400, '拆分序号已用完（1-99）');
}

/** 查询租户下以 `{sourcePlanNumber}-` 开头的单号，分配下一可用拆分子单号 */
export async function resolveNextSplitPlanNumber(
  db: TenantPrismaClient,
  tenantId: string,
  sourcePlanNumber: string,
): Promise<string> {
  const siblings = await db.planOrder.findMany({
    where: {
      tenantId,
      planNumber: { startsWith: `${sourcePlanNumber}-` },
    },
    select: { planNumber: true },
  });
  return pickNextSplitPlanNumber(sourcePlanNumber, siblings.map(s => s.planNumber));
}
