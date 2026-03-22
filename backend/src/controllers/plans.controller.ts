import type { Request, Response, NextFunction } from 'express';
import { type PlanOrder, type PlanItem, type Prisma } from '@prisma/client';
import { getTenantPrisma, prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { getNextPlanNumber } from '../utils/docNumber.js';
import { str, optStr, sanitizeUpdate, sanitizeCreate, sanitizeItems, normalizeDates } from '../utils/request.js';

function genId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

type PlanWithItems = PlanOrder & { items: PlanItem[] };

export async function listPlans(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const status = optStr(req.query.status);
    const productId = optStr(req.query.productId);
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (productId) where.productId = productId;
    res.json(await db.planOrder.findMany({
      where,
      include: { items: true, childPlans: { include: { items: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    }));
  } catch (e) { next(e); }
}

export async function getPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await basePrisma.planOrder.findUnique({
      where: { id: str(req.params.id) },
      include: { items: true, childPlans: { include: { items: true } }, parentPlan: true },
    });
    if (!plan) { res.status(404).json({ error: '计划单不存在' }); return; }
    res.json(plan);
  } catch (e) { next(e); }
}

export async function createPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const { items, childPlans, parentPlan, productionOrders, ...rest } = req.body;
    const data = sanitizeCreate(rest);

    if (!data.id) data.id = genId('plan');
    data.planNumber = await getNextPlanNumber(tenantId);
    normalizeDates(data);

    const cleanItems = items ? sanitizeItems(items) : undefined;
    const plan = await basePrisma.planOrder.create({
      data: { ...data, tenantId, items: cleanItems ? { create: cleanItems } : undefined },
      include: { items: true },
    });
    res.status(201).json(plan);
  } catch (e) { next(e); }
}

export async function updatePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, childPlans, parentPlan, productionOrders, ...rest } = req.body;
    const data = sanitizeUpdate(rest);
    normalizeDates(data);
    await basePrisma.$transaction(async (tx) => {
      await tx.planOrder.update({ where: { id: str(req.params.id) }, data });
      if (items) {
        const planOrderId = str(req.params.id);
        await tx.planItem.deleteMany({ where: { planOrderId } });
        const cleanItems = sanitizeItems(items).map(i => ({ ...i, planOrderId }));
        await tx.planItem.createMany({ data: cleanItems });
      }
    });
    const plan = await basePrisma.planOrder.findUnique({ where: { id: str(req.params.id) }, include: { items: true } });
    res.json(plan);
  } catch (e) { next(e); }
}

export async function deletePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const childCount = await basePrisma.planOrder.count({ where: { parentPlanId: str(req.params.id) } });
    if (childCount > 0) throw new AppError(400, `该计划存在 ${childCount} 条子计划，请先删除子计划`);
    await basePrisma.planOrder.delete({ where: { id: str(req.params.id) } });
    res.json({ message: '已删除' });
  } catch (e) { next(e); }
}

export async function splitPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const sourcePlan = await basePrisma.planOrder.findUnique({ where: { id: str(req.params.id) }, include: { items: true } });
    if (!sourcePlan) throw new AppError(404, '计划单不存在');

    const { splitItems } = req.body;
    const planNumber = await getNextPlanNumber(tenantId);

    const newPlan = await basePrisma.planOrder.create({
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
        items: { create: sanitizeItems(splitItems) },
      },
      include: { items: true },
    });

    res.status(201).json(newPlan);
  } catch (e) { next(e); }
}

export async function convertToOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const plan = await basePrisma.planOrder.findUnique({
      where: { id: str(req.params.id) },
      include: { items: true },
    });
    if (!plan) throw new AppError(404, '计划单不存在');
    if (plan.status === 'CONVERTED') throw new AppError(400, '该计划单已下达工单');

    const product = await basePrisma.product.findUnique({ where: { id: plan.productId } });
    if (!product) throw new AppError(400, '关联产品不存在');

    const allDescendants = await getAllDescendantPlans(plan.id);
    const plansToConvert: PlanWithItems[] = [plan, ...allDescendants].filter((p): p is PlanWithItems => p.status !== 'CONVERTED');

    const existingOrders = await basePrisma.productionOrder.findMany({ where: { tenantId }, select: { orderNumber: true } });
    let maxNum = 0;
    for (const o of existingOrders) {
      const m = o.orderNumber.match(/^WO-?(\d+)/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
    }

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
      maxNum++;
      const orderNumber = p.planNumber.replace(/^PLN/, 'WO');
      const orderId = `order-${Date.now()}-${maxNum}`;
      planToOrderMap.set(p.id, orderId);

      const prod = p.id === plan.id ? product : await basePrisma.product.findUnique({ where: { id: p.productId } });
      const nodes = await basePrisma.globalNodeTemplate.findMany({ where: { tenantId } });

      const milestoneNodeIds = (prod?.milestoneNodeIds as string[]) || [];
      const milestones = milestoneNodeIds.map((nodeId, idx) => {
        const node = nodes.find(n => n.id === nodeId);
        return {
          id: `ms-${Date.now()}-${maxNum}-${idx}`,
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
          const existingParentOrder = await basePrisma.productionOrder.findFirst({ where: { planOrderId: p.parentPlanId } });
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
        where: { id: { in: plansToConvert.map((p: PlanWithItems) => p.id) } },
        data: { status: 'CONVERTED' },
      });
    });

    res.status(201).json({ message: `已下达 ${orders.length} 条工单`, orderIds: orders.map(o => o.id) });
  } catch (e) { next(e); }
}

async function getAllDescendantPlans(planId: string): Promise<PlanWithItems[]> {
  const children = await basePrisma.planOrder.findMany({
    where: { parentPlanId: planId },
    include: { items: true },
  });
  const result: PlanWithItems[] = [...children];
  for (const child of children) {
    const descendants = await getAllDescendantPlans(child.id);
    result.push(...descendants);
  }
  return result;
}

export async function createSubPlans(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const parentPlan = await basePrisma.planOrder.findUnique({ where: { id: str(req.params.id) } });
    if (!parentPlan) throw new AppError(404, '父计划单不存在');

    const { subPlans } = req.body;
    const created = [];

    for (let i = 0; i < subPlans.length; i++) {
      const sp = subPlans[i];
      const existingSubs = await basePrisma.planOrder.count({ where: { parentPlanId: str(req.params.id) } });
      const subNumber = `${parentPlan.planNumber}-S${existingSubs + 1}`;

      const plan = await basePrisma.planOrder.create({
        data: {
          id: sp.id || `plan-${Date.now()}-${i}`,
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
  } catch (e) { next(e); }
}
