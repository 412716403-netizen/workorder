import { type PlanOrder, type PlanItem, type Prisma } from '@prisma/client';
import { getTenantPrisma, prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { getNextPlanNumber } from '../utils/docNumber.js';
import { genId } from '../utils/genId.js';
import { str, optStr, sanitizeItems } from '../utils/request.js';
import * as planService from '../services/plans.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

type PlanWithItems = PlanOrder & { items: PlanItem[] };

export const listPlans = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const result = await planService.listPlans(db, {
    status: optStr(req.query.status),
    productId: optStr(req.query.productId),
  });
  res.json(result);
});

export const getPlan = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const plan = await planService.getPlan(db, str(req.params.id));
  res.json(plan);
});

export const createPlan = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const plan = await planService.createPlan(db, tenantId, req.body);
  res.status(201).json(plan);
});

export const updatePlan = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const plan = await planService.updatePlan(db, str(req.params.id), req.body);
  res.json(plan);
});

export const deletePlan = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const result = await planService.deletePlan(db, str(req.params.id));
  res.json(result);
});

export const splitPlan = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const sourcePlan = await db.planOrder.findUnique({ where: { id: str(req.params.id) }, include: { items: true } });
  if (!sourcePlan) throw new AppError(404, '计划单不存在');

  const { newPlans, splitItems } = req.body;
  const planDataList: Array<{ items: any[] }> = Array.isArray(newPlans)
    ? newPlans
    : splitItems ? [{ items: splitItems }] : [];
  if (planDataList.length === 0) throw new AppError(400, '请提供拆分后的计划数据');

  const results = await basePrisma.$transaction(async (tx) => {
    const created = [];
    for (const plan of planDataList) {
      const planNumber = await getNextPlanNumber(tenantId);
      const p = await tx.planOrder.create({
        data: {
          id: genId('plan'),
          tenantId,
          planNumber,
          productId: sourcePlan.productId,
          startDate: sourcePlan.startDate,
          dueDate: sourcePlan.dueDate,
          status: sourcePlan.status,
          customer: sourcePlan.customer,
          priority: sourcePlan.priority,
          parentPlanId: sourcePlan.parentPlanId,
          items: { create: sanitizeItems(plan.items) },
        } as any,
        include: { items: true },
      });
      created.push(p);
    }
    await tx.planItem.deleteMany({ where: { planOrderId: sourcePlan.id } });
    await tx.planOrder.delete({ where: { id: sourcePlan.id } });
    return created;
  });

  res.status(201).json(results);
});

export const convertToOrder = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const plan = await db.planOrder.findUnique({
    where: { id: str(req.params.id) },
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
      plan.status === 'CONVERTED' ? '没有待下达的子计划' : '该计划单已下达工单'
    );
  }

  const existingOrders = await db.productionOrder.findMany({ select: { orderNumber: true } });
  const existingOrderNumbers = new Set(existingOrders.map(o => o.orderNumber));
  let maxNum = 0;
  for (const o of existingOrders) {
    const m = o.orderNumber.match(/^WO-?(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
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
        reportTemplate: node?.reportTemplate || [],
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
        const existingParentOrder = await basePrisma.productionOrder.findFirst({ where: { planOrderId: p.parentPlanId, tenantId } });
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
      where: { id: { in: plansToConvert.map((p: PlanWithItems) => p.id) }, tenantId },
      data: { status: 'CONVERTED' },
    });
  });

  res.status(201).json({ message: `已下达 ${orders.length} 条工单`, orderIds: orders.map(o => o.id) });
});

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

export const createSubPlans = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const parentPlan = await db.planOrder.findUnique({ where: { id: str(req.params.id) } });
  if (!parentPlan) throw new AppError(404, '父计划单不存在');

  const { subPlans } = req.body;
  const existingSubs = await db.planOrder.count({ where: { parentPlanId: str(req.params.id) } });
  const created = [];

  for (let i = 0; i < subPlans.length; i++) {
    const sp = subPlans[i];
    const subNumber = `${parentPlan.planNumber}-S${existingSubs + i + 1}`;

    const plan = await db.planOrder.create({
      data: {
        id: sp.id || genId('plan'),
        tenantId,
        planNumber: subNumber,
        parentPlanId: str(req.params.id),
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

  res.status(201).json(created);
});
