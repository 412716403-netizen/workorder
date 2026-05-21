import type { PlanItem, PlanOrder, Prisma } from '@prisma/client';
import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { getNextPlanNumber } from '../utils/docNumber.js';
import { genId } from '../utils/genId.js';
import { sanitizeCreate, sanitizeUpdate, sanitizeItems, normalizeDates } from '../utils/request.js';
import { deleteItemCodesAndVirtualBatchesForPlan } from './itemCodes.service.js';
import { PlanDispatchStatus } from '../types/index.js';

type PlanWithItems = PlanOrder & { items: PlanItem[] };

const MAX_PLAN_DEPTH = 10;

async function getAllDescendantPlans(planId: string, tenantId: string, depth = 0): Promise<PlanWithItems[]> {
  if (depth >= MAX_PLAN_DEPTH) return [];
  const children = await basePrisma.planOrder.findMany({
    where: { parentPlanId: planId, tenantId },
    include: { items: true },
  });
  const result: PlanWithItems[] = [...children];
  for (const child of children) {
    const descendants = await getAllDescendantPlans(child.id, tenantId, depth + 1);
    result.push(...descendants);
  }
  return result;
}

// ── simple CRUD ──────────────────────────────────────────────

/**
 * 计算计划单派发完成派生状态（响应字段，不落库）。
 *
 * 仅在「关联工单模式 productionLinkMode='order'」的前端列表展示徽章；
 * 后端无论模式都会在 listPlans/getPlan 返回中附带 `derivedStatus`，避免切换模式数据丢失。
 *
 * 规则：基于该计划下直接关联工单 `productionOrders WHERE planOrderId = plan.id` 的 `dispatchStatus` 聚合：
 * - 无工单 → `NOT_DISPATCHED`
 * - 全部 `COMPLETED` → `COMPLETED`
 * - 其他 → `IN_PROGRESS`
 *
 * 父子计划在列表里各自是独立 PlanOrder 行，互不影响。
 */
function computePlanDispatchStatus(plan: {
  productionOrders?: { dispatchStatus: string }[] | null;
}): PlanDispatchStatus {
  const linked = plan.productionOrders ?? [];
  if (linked.length === 0) return PlanDispatchStatus.NOT_DISPATCHED;
  const allCompleted = linked.every(o => o.dispatchStatus === PlanDispatchStatus.COMPLETED);
  return allCompleted ? PlanDispatchStatus.COMPLETED : PlanDispatchStatus.IN_PROGRESS;
}

/** 给 plan 注入 derivedStatus 并剥离 productionOrders 子集，避免响应膨胀。 */
function attachPlanDerivedStatus<T extends { productionOrders?: { dispatchStatus: string }[] | null }>(
  plan: T,
): Omit<T, 'productionOrders'> & { derivedStatus: PlanDispatchStatus } {
  const derivedStatus = computePlanDispatchStatus(plan);
  const { productionOrders: _omit, ...rest } = plan as T & {
    productionOrders?: { dispatchStatus: string }[] | null;
  };
  return { ...(rest as Omit<T, 'productionOrders'>), derivedStatus };
}

/** 计划单列表 where：search 匹配计划单号、客户，以及关联产品的名称 / SKU。 */
async function buildPlanListWhere(
  db: TenantPrismaClient,
  opts: { status?: string; productId?: string; search?: string },
): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (opts.productId) where.productId = opts.productId;
  if (opts.search) {
    const term = opts.search;
    const productMatches = await db.product.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    const orClauses: Record<string, unknown>[] = [
      { planNumber: { contains: term, mode: 'insensitive' } },
      { customer: { contains: term, mode: 'insensitive' } },
    ];
    if (productMatches.length > 0) {
      orClauses.push({ productId: { in: productMatches.map(p => p.id) } });
    }
    where.OR = orClauses;
  }
  return where;
}

function postFilterPlansByDerivedStatus<T extends { derivedStatus: PlanDispatchStatus }>(
  rows: T[],
  opts: { dispatchStatus?: PlanDispatchStatus; excludeCompleted?: boolean },
): T[] {
  let out = rows;
  if (opts.excludeCompleted) {
    out = out.filter(r => r.derivedStatus !== PlanDispatchStatus.COMPLETED);
  }
  if (opts.dispatchStatus) {
    out = out.filter(r => r.derivedStatus === opts.dispatchStatus);
  }
  return out;
}

export async function listPlans(
  db: TenantPrismaClient,
  opts: {
    status?: string;
    productId?: string;
    search?: string;
    /** 派生状态过滤（仅工单模式列表使用）：传入时退化为全量过滤 + 内存分页 */
    dispatchStatus?: PlanDispatchStatus;
    /** 列表仅显示未下单/未完成（隐藏已完成） */
    excludeCompleted?: boolean;
    all?: boolean;
    page?: number;
    pageSize?: number;
  },
) {
  const where = await buildPlanListWhere(db, opts);

  // 派生状态需要 productionOrders 关联：只 select 计算所需字段，控制响应体积。
  const include = {
    items: true,
    childPlans: { include: { items: true } },
    productionOrders: { select: { id: true, dispatchStatus: true } },
  } satisfies Prisma.PlanOrderInclude;
  const orderBy: any = [{ createdAt: 'desc' }, { id: 'asc' }];

  if (opts.all) {
    const rows = await db.planOrder.findMany({ where, include, orderBy });
    return rows.map(attachPlanDerivedStatus);
  }

  // 派生状态 / 隐藏已完成：难以用 SQL 表达，退化为全量 where 命中 → 内存过滤 → 切片分页。
  const needsMemoryPaging = !!(opts.dispatchStatus || opts.excludeCompleted);
  if (needsMemoryPaging) {
    const allRows = await db.planOrder.findMany({ where, include, orderBy });
    const enriched = allRows.map(attachPlanDerivedStatus);
    const filtered = postFilterPlansByDerivedStatus(enriched, opts);
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
    const start = (page - 1) * pageSize;
    return {
      data: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.planOrder.findMany({ where, include, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.planOrder.count({ where }),
  ]);
  return { data: data.map(attachPlanDerivedStatus), total, page, pageSize };
}

export async function getPlan(db: TenantPrismaClient, planId: string) {
  const plan = await db.planOrder.findUnique({
    where: { id: planId },
    include: {
      items: true,
      childPlans: { include: { items: true } },
      parentPlan: true,
      productionOrders: { select: { id: true, dispatchStatus: true } },
    },
  });
  if (!plan) throw new AppError(404, '计划单不存在');
  return attachPlanDerivedStatus(plan);
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

  await deleteItemCodesAndVirtualBatchesForPlan(db, planId);
  await db.planOrder.delete({ where: { id: planId } });
  return { message: '已删除' };
}

// ── convert / sub-plans (transactions & multi-step) ─────────────────────

export async function convertPlanToOrders(db: TenantPrismaClient, tenantId: string, planId: string) {
  const plan = await db.planOrder.findUnique({
    where: { id: planId },
    include: { items: true },
  });
  if (!plan) throw new AppError(404, '计划单不存在');

  const product = await db.product.findUnique({ where: { id: plan.productId } });
  if (!product) throw new AppError(400, '关联产品不存在');

  const allDescendants = await getAllDescendantPlans(plan.id, tenantId);
  const plansToConvert: PlanWithItems[] = [plan, ...allDescendants].filter((p): p is PlanWithItems => p.status !== 'CONVERTED');

  if (plansToConvert.length === 0) {
    throw new AppError(
      400,
      plan.status === 'CONVERTED' ? '没有待下达的子计划' : '该计划单已下达工单',
    );
  }

  const existingOrders = await db.productionOrder.findMany({ select: { orderNumber: true } });
  const existingOrderNumbers = new Set(existingOrders.map(o => o.orderNumber));
  let maxNum = 0;
  for (const o of existingOrders) {
    const m = o.orderNumber.match(/^WO-?(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }

  const nodes = await db.globalNodeTemplate.findMany({});
  const planToOrderMap = new Map<string, string>();
  const orders: Array<{
    id: string;
    tenantId: string;
    orderNumber: string;
    planOrderId: string;
    parentOrderId: string | null;
    bomNodeId: string | null;
    sourcePlanId: string;
    productId: string;
    productName: string;
    sku: string;
    customer: string | null;
    startDate: Date | null;
    dueDate: Date | null;
    status: string;
    priority: string;
    items: Array<{ variantId: string | null; quantity: number; completedQuantity: number }>;
    milestones: Prisma.MilestoneCreateWithoutProductionOrderInput[];
  }> = [];

  for (const p of plansToConvert) {
    let orderNumber = p.planNumber.replace(/^PLN/, 'WO');
    if (existingOrderNumbers.has(orderNumber)) {
      maxNum++;
      orderNumber = `WO${maxNum}`;
    }
    existingOrderNumbers.add(orderNumber);
    const orderId = genId('order');
    planToOrderMap.set(p.id, orderId);

    const prod = p.id === plan.id ? product : await db.product.findUnique({ where: { id: p.productId } });

    const milestoneNodeIds = (prod?.milestoneNodeIds as string[]) || [];
    const milestones = milestoneNodeIds.map((nodeId, idx) => {
      const node = nodes.find(n => n.id === nodeId);
      return {
        id: genId('ms'),
        templateId: nodeId,
        name: node?.name || nodeId,
        status: 'PENDING',
        completedQuantity: 0,
        reportTemplate: (node?.reportTemplate || []) as Prisma.InputJsonValue,
        reportDisplayTemplate: ((node as { reportDisplayTemplate?: Prisma.InputJsonValue })?.reportDisplayTemplate ?? []) as Prisma.InputJsonValue,
        weight: 1,
        assignedWorkerIds: [],
        assignedEquipmentIds: [],
        sortOrder: idx,
      };
    });

    let parentOrderId: string | null = null;
    if (p.parentPlanId) {
      parentOrderId = planToOrderMap.get(p.parentPlanId) || null;
      if (!parentOrderId) {
        const existingParentOrder = await basePrisma.productionOrder.findFirst({
          where: { planOrderId: p.parentPlanId, tenantId },
        });
        parentOrderId = existingParentOrder?.id || null;
      }
    }

    orders.push({
      id: orderId,
      tenantId,
      orderNumber,
      planOrderId: p.id,
      parentOrderId,
      bomNodeId: p.bomNodeId ?? null,
      sourcePlanId: plan.id,
      productId: p.productId,
      productName: prod?.name ?? '',
      sku: prod?.sku ?? '',
      customer: p.customer,
      startDate: p.startDate,
      dueDate: p.dueDate,
      status: 'PLANNING',
      priority: p.priority,
      items: ((p as Record<string, unknown>).items as Array<Record<string, unknown>>)?.map(i => ({
        variantId: i.variantId as string | null,
        quantity: i.quantity as number,
        completedQuantity: 0,
      })) || [],
      milestones,
    });
  }

  await basePrisma.$transaction(async (tx) => {
    for (const order of orders) {
      const { items, milestones, ...orderData } = order;
      await tx.productionOrder.create({
        data: {
          ...orderData,
          items: { create: items },
          milestones: { create: milestones },
        },
      });
    }
    await tx.planOrder.updateMany({
      where: { id: { in: plansToConvert.map((p2: PlanWithItems) => p2.id) }, tenantId },
      data: { status: 'CONVERTED' },
    });
  });

  return { message: `已下达 ${orders.length} 条工单`, orderIds: orders.map(o => o.id) };
}

export async function createSubPlans(
  db: TenantPrismaClient,
  tenantId: string,
  parentPlanId: string,
  body: { subPlans: Array<{ id?: string; bomNodeId?: string; productId: string; items?: Record<string, unknown>[] }> },
) {
  const parentPlan = await db.planOrder.findUnique({ where: { id: parentPlanId } });
  if (!parentPlan) throw new AppError(404, '父计划单不存在');

  const subPlans = Array.isArray(body.subPlans) ? body.subPlans : [];
  const existingSubs = await db.planOrder.count({ where: { parentPlanId } });
  const created = [];

  for (let i = 0; i < subPlans.length; i++) {
    const sp = subPlans[i];
    const subNumber = `${parentPlan.planNumber}-S${existingSubs + i + 1}`;

    const plan = await db.planOrder.create({
      data: {
        id: sp.id || genId('plan'),
        tenantId,
        planNumber: subNumber,
        parentPlanId,
        bomNodeId: sp.bomNodeId,
        productId: sp.productId,
        startDate: parentPlan.startDate,
        dueDate: parentPlan.dueDate,
        status: 'DRAFT',
        customer: parentPlan.customer,
        priority: parentPlan.priority,
        items: sp.items ? { create: sanitizeItems(sp.items) } : undefined,
      },
      include: { items: true },
    });
    created.push(plan);
  }

  return created;
}
