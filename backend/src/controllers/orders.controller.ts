import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma, prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { generateReportNo } from '../utils/docNumber.js';
import { genId } from '../utils/genId.js';
import { str, optStr, sanitizeUpdate, sanitizeItems, normalizeDates } from '../utils/request.js';

export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const where: Record<string, unknown> = {};
    const status = optStr(req.query.status);
    const productId = optStr(req.query.productId);
    const parentOrderId = optStr(req.query.parentOrderId);
    if (status) where.status = status;
    if (productId) where.productId = productId;
    if (parentOrderId) where.parentOrderId = parentOrderId;
    res.json(await db.productionOrder.findMany({
      where,
      include: {
        items: true,
        milestones: { include: { reports: true }, orderBy: { sortOrder: 'asc' } },
        childOrders: { include: { items: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    }));
  } catch (e) { next(e); }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const order = await db.productionOrder.findUnique({
      where: { id: str(req.params.id) },
      include: {
        items: true,
        milestones: { include: { reports: true }, orderBy: { sortOrder: 'asc' } },
        childOrders: { include: { items: true, milestones: { include: { reports: true } } } },
        opRecords: true,
      },
    });
    if (!order) { res.status(404).json({ error: '工单不存在' }); return; }
    res.json(order);
  } catch (e) { next(e); }
}

export async function updateOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const orderId = str(req.params.id);
    const existing = await db.productionOrder.findUnique({ where: { id: orderId } });
    if (!existing) throw new AppError(404, '工单不存在');

    const { items, milestones, childOrders, opRecords, ...rest } = req.body;
    const data = sanitizeUpdate(rest);
    normalizeDates(data);
    await basePrisma.$transaction(async (tx) => {
      await tx.productionOrder.update({ where: { id: orderId }, data });
      if (items) {
        await tx.orderItem.deleteMany({ where: { productionOrderId: orderId } });
        const cleanItems = sanitizeItems(items).map(i => ({ ...i, productionOrderId: orderId }));
        await tx.orderItem.createMany({ data: cleanItems });
      }
    });
    const order = await basePrisma.productionOrder.findUnique({
      where: { id: orderId },
      include: { items: true, milestones: { include: { reports: true } } },
    });
    res.json(order);
  } catch (e) { next(e); }
}

export async function deleteOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const orderId = str(req.params.id);
    const order = await db.productionOrder.findUnique({
      where: { id: orderId },
      include: { milestones: { include: { reports: true } } },
    });
    if (!order) throw new AppError(404, '工单不存在');

    const hasReports = order.milestones.some(m => m.reports.length > 0);
    if (hasReports) throw new AppError(400, '该工单已有报工记录，不允许删除');

    const opCount = await db.productionOpRecord.count({ where: { orderId } });
    if (opCount > 0) throw new AppError(400, `该工单存在 ${opCount} 条关联单据，请先在相关模块删除后再试`);

    const childCount = await db.productionOrder.count({ where: { parentOrderId: orderId } });
    if (childCount > 0) throw new AppError(400, `该工单存在 ${childCount} 条子工单，请先删除子工单后再试`);

    await db.productionOrder.delete({ where: { id: orderId } });
    res.json({ message: '已删除' });
  } catch (e) { next(e); }
}

// ── 工单模式报工 ──

async function verifyMilestoneTenant(milestoneId: string, tenantId: string) {
  const milestone = await basePrisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { productionOrder: { select: { tenantId: true } } },
  });
  if (!milestone) throw new AppError(404, '工序不存在');
  if (milestone.productionOrder.tenantId !== tenantId) throw new AppError(404, '工序不存在');
  return milestone;
}

export async function createReport(req: Request, res: Response, next: NextFunction) {
  try {
    const milestoneId = str(req.params.milestoneId);
    const milestone = await verifyMilestoneTenant(milestoneId, req.tenantId!);

    const reportNo = await generateReportNo('BG', req.tenantId);
    const reportData = {
      id: req.body.id || genId('rpt'),
      milestoneId,
      timestamp: new Date(req.body.timestamp || Date.now()),
      operator: req.body.operator,
      quantity: req.body.quantity,
      defectiveQuantity: req.body.defectiveQuantity || 0,
      equipmentId: req.body.equipmentId,
      variantId: req.body.variantId,
      reportBatchId: req.body.reportBatchId,
      reportNo: req.body.reportNo || reportNo,
      customData: req.body.customData || {},
      notes: req.body.notes,
      rate: req.body.rate,
      workerId: req.body.workerId,
    };

    const report = await basePrisma.milestoneReport.create({ data: reportData });

    const totalCompleted = await basePrisma.milestoneReport.aggregate({
      where: { milestoneId },
      _sum: { quantity: true },
    });
    await basePrisma.milestone.update({
      where: { id: milestoneId },
      data: { completedQuantity: totalCompleted._sum?.quantity || 0, status: 'IN_PROGRESS' },
    });

    res.status(201).json(report);
  } catch (e) { next(e); }
}

export async function updateReport(req: Request, res: Response, next: NextFunction) {
  try {
    const milestoneId = str(req.params.milestoneId);
    await verifyMilestoneTenant(milestoneId, req.tenantId!);
    const reportId = str(req.params.reportId);
    const report = await basePrisma.milestoneReport.update({
      where: { id: reportId },
      data: sanitizeUpdate(req.body),
    });

    const totalCompleted = await basePrisma.milestoneReport.aggregate({
      where: { milestoneId },
      _sum: { quantity: true },
    });
    await basePrisma.milestone.update({
      where: { id: milestoneId },
      data: { completedQuantity: totalCompleted._sum?.quantity || 0 },
    });

    res.json(report);
  } catch (e) { next(e); }
}

export async function deleteReport(req: Request, res: Response, next: NextFunction) {
  try {
    const milestoneId = str(req.params.milestoneId);
    await verifyMilestoneTenant(milestoneId, req.tenantId!);
    const reportId = str(req.params.reportId);
    await basePrisma.milestoneReport.delete({ where: { id: reportId } });

    const totalCompleted = await basePrisma.milestoneReport.aggregate({
      where: { milestoneId },
      _sum: { quantity: true },
    });
    await basePrisma.milestone.update({
      where: { id: milestoneId },
      data: { completedQuantity: totalCompleted._sum?.quantity || 0 },
    });

    res.json({ message: '已删除' });
  } catch (e) { next(e); }
}

// ── 可报数量 ──
export async function getReportable(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const order = await db.productionOrder.findUnique({
      where: { id: str(req.params.id) },
      include: { items: true, milestones: { include: { reports: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!order) throw new AppError(404, '工单不存在');

    const totalQty = order.items.reduce((s, i) => s + Number(i.quantity), 0);

    const result = order.milestones.map((ms, idx) => {
      const reported = ms.reports.reduce((s, r) => s + Number(r.quantity), 0);
      const defective = ms.reports.reduce((s, r) => s + Number(r.defectiveQuantity), 0);
      const prevCompleted = idx > 0 ? Number(order.milestones[idx - 1].completedQuantity) : totalQty;
      return {
        milestoneId: ms.id,
        templateId: ms.templateId,
        name: ms.name,
        totalQty,
        reported,
        defective,
        maxReportable: prevCompleted - defective,
        remaining: prevCompleted - reported,
      };
    });

    res.json(result);
  } catch (e) { next(e); }
}

// ── 产品工序进度列表 ──
export async function listProductProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const rows = await db.productMilestoneProgress.findMany({
      include: { reports: { orderBy: { timestamp: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(rows);
  } catch (e) { next(e); }
}

// ── 产品模式报工 ──
export async function createProductReport(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const db = getTenantPrisma(tenantId);
    const { productId, variantId, milestoneTemplateId, ...reportData } = req.body;

    let progress = await db.productMilestoneProgress.findFirst({
      where: { productId, variantId: variantId || null, milestoneTemplateId },
    });

    if (!progress) {
      progress = await db.productMilestoneProgress.create({
        data: {
          id: genId('pmp'),
          productId,
          variantId: variantId || null,
          milestoneTemplateId,
          completedQuantity: 0,
        } as any,
      });
    }

    const reportNo = await generateReportNo('BG', tenantId);
    const report = await basePrisma.productProgressReport.create({
      data: {
        id: reportData.id || genId('ppr'),
        progressId: progress.id,
        timestamp: new Date(reportData.timestamp || Date.now()),
        operator: reportData.operator,
        quantity: reportData.quantity,
        defectiveQuantity: reportData.defectiveQuantity || 0,
        equipmentId: reportData.equipmentId,
        variantId,
        reportBatchId: reportData.reportBatchId,
        reportNo: reportData.reportNo || reportNo,
        customData: reportData.customData || {},
        notes: reportData.notes,
        rate: reportData.rate,
        workerId: reportData.workerId,
      },
    });

    const totalCompleted = await basePrisma.productProgressReport.aggregate({
      where: { progressId: progress.id },
      _sum: { quantity: true },
    });
    await basePrisma.productMilestoneProgress.update({
      where: { id: progress.id },
      data: { completedQuantity: totalCompleted._sum?.quantity || 0 },
    });

    res.status(201).json(report);
  } catch (e) { next(e); }
}

export async function updateProductReport(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const reportId = str(req.params.reportId);
    const report = await basePrisma.productProgressReport.findUnique({ where: { id: reportId } });
    if (!report) throw new AppError(404, '报工记录不存在');

    const progress = await db.productMilestoneProgress.findUnique({ where: { id: report.progressId } });
    if (!progress) throw new AppError(404, '报工记录不存在');

    const updated = await basePrisma.productProgressReport.update({ where: { id: reportId }, data: sanitizeUpdate(req.body) });

    const totalCompleted = await basePrisma.productProgressReport.aggregate({
      where: { progressId: report.progressId },
      _sum: { quantity: true },
    });
    await basePrisma.productMilestoneProgress.update({
      where: { id: report.progressId },
      data: { completedQuantity: totalCompleted._sum?.quantity || 0 },
    });

    res.json(updated);
  } catch (e) { next(e); }
}

export async function deleteProductReport(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const reportId = str(req.params.reportId);
    const report = await basePrisma.productProgressReport.findUnique({ where: { id: reportId } });
    if (!report) throw new AppError(404, '报工记录不存在');

    const progress = await db.productMilestoneProgress.findUnique({ where: { id: report.progressId } });
    if (!progress) throw new AppError(404, '报工记录不存在');

    await basePrisma.productProgressReport.delete({ where: { id: reportId } });

    const totalCompleted = await basePrisma.productProgressReport.aggregate({
      where: { progressId: report.progressId },
      _sum: { quantity: true },
    });
    await basePrisma.productMilestoneProgress.update({
      where: { id: report.progressId },
      data: { completedQuantity: totalCompleted._sum?.quantity || 0 },
    });

    res.json({ message: '已删除' });
  } catch (e) { next(e); }
}
