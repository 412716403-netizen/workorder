import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { getNextPlanNumber } from '../utils/docNumber.js';
import { genId } from '../utils/genId.js';
import { sanitizeCreate, sanitizeUpdate, sanitizeItems, normalizeDates } from '../utils/request.js';

// ── simple CRUD ──────────────────────────────────────────────

export async function listPlans(
  db: TenantPrismaClient,
  opts: { status?: string; productId?: string },
) {
  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (opts.productId) where.productId = opts.productId;

  return db.planOrder.findMany({
    where,
    include: { items: true, childPlans: { include: { items: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
}

export async function getPlan(db: TenantPrismaClient, planId: string) {
  const plan = await db.planOrder.findUnique({
    where: { id: planId },
    include: {
      items: true,
      childPlans: { include: { items: true } },
      parentPlan: true,
    },
  });
  if (!plan) throw new AppError(404, '计划单不存在');
  return plan;
}

export async function createPlan(
  db: TenantPrismaClient,
  tenantId: string,
  body: Record<string, unknown>,
) {
  const { items, childPlans, parentPlan, productionOrders, ...rest } = body;
  const data = sanitizeCreate(rest);

  if (!data.id) data.id = genId('plan');
  data.planNumber = await getNextPlanNumber(tenantId);
  normalizeDates(data);

  const cleanItems = items ? sanitizeItems(items as Record<string, unknown>[]) : undefined;
  return db.planOrder.create({
    data: { ...data, items: cleanItems ? { create: cleanItems } : undefined },
    include: { items: true },
  });
}

export async function updatePlan(
  db: TenantPrismaClient,
  planId: string,
  body: Record<string, unknown>,
) {
  const existing = await db.planOrder.findUnique({ where: { id: planId } });
  if (!existing) throw new AppError(404, '计划单不存在');

  const { items, childPlans, parentPlan, productionOrders, ...rest } = body;
  const data = sanitizeUpdate(rest);
  normalizeDates(data);

  await basePrisma.$transaction(async (tx) => {
    await tx.planOrder.update({ where: { id: planId }, data });
    if (items) {
      await tx.planItem.deleteMany({ where: { planOrderId: planId } });
      const cleanItems = sanitizeItems(items as Record<string, unknown>[]).map(
        (i) => ({ ...i, planOrderId: planId }),
      );
      await tx.planItem.createMany({ data: cleanItems });
    }
  });

  return basePrisma.planOrder.findUnique({
    where: { id: planId },
    include: { items: true },
  });
}

export async function deletePlan(db: TenantPrismaClient, planId: string) {
  const existing = await db.planOrder.findUnique({ where: { id: planId } });
  if (!existing) throw new AppError(404, '计划单不存在');

  const childCount = await db.planOrder.count({
    where: { parentPlanId: planId },
  });
  if (childCount > 0) {
    throw new AppError(
      400,
      `该计划存在 ${childCount} 条子计划，请先删除子计划`,
    );
  }

  await db.planOrder.delete({ where: { id: planId } });
  return { message: '已删除' };
}
