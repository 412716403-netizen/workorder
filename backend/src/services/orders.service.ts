import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { generateReportNo } from '../utils/docNumber.js';
import { genId } from '../utils/genId.js';
import { sanitizeUpdate, sanitizeItems, normalizeDates } from '../utils/request.js';

export async function listOrders(
  db: TenantPrismaClient,
  opts: {
    status?: string; productId?: string; parentOrderId?: string;
    search?: string; page?: number; pageSize?: number; lite?: boolean;
  },
) {
  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (opts.productId) where.productId = opts.productId;
  if (opts.parentOrderId) where.parentOrderId = opts.parentOrderId;
  if (opts.search) {
    where.OR = [
      { orderNumber: { contains: opts.search, mode: 'insensitive' } },
      { productName: { contains: opts.search, mode: 'insensitive' } },
      { sku: { contains: opts.search, mode: 'insensitive' } },
      { customer: { contains: opts.search, mode: 'insensitive' } },
    ];
  }

  const include = opts.lite
    ? { items: true }
    : {
        items: true,
        milestones: { include: { reports: true }, orderBy: { sortOrder: 'asc' as const } },
        childOrders: { include: { items: true } },
      };
  const orderBy: any = [{ createdAt: 'desc' }, { id: 'asc' }];

  if (opts.page != null && opts.pageSize != null) {
    const [data, total] = await Promise.all([
      db.productionOrder.findMany({ where, include, orderBy, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize }),
      db.productionOrder.count({ where }),
    ]);
    return { data, total, page: opts.page, pageSize: opts.pageSize };
  }
  return db.productionOrder.findMany({ where, include, orderBy });
}

export async function getOrder(db: TenantPrismaClient, id: string) {
  const order = await db.productionOrder.findUnique({
    where: { id },
    include: {
      items: true,
      milestones: { include: { reports: true }, orderBy: { sortOrder: 'asc' } },
      childOrders: { include: { items: true, milestones: { include: { reports: true } } } },
      opRecords: true,
    },
  });
  if (!order) throw new AppError(404, '工单不存在');
  return order;
}

export async function updateOrder(
  db: TenantPrismaClient,
  orderId: string,
  body: Record<string, unknown>,
) {
  const existing = await db.productionOrder.findUnique({ where: { id: orderId } });
  if (!existing) throw new AppError(404, '工单不存在');

  const { items, milestones, childOrders, opRecords, ...rest } = body;
  const data = sanitizeUpdate(rest);
  normalizeDates(data);

  await basePrisma.$transaction(async (tx) => {
    await tx.productionOrder.update({ where: { id: orderId }, data });
    if (items) {
      await tx.orderItem.deleteMany({ where: { productionOrderId: orderId } });
      const cleanItems = sanitizeItems(items as Record<string, unknown>[]).map((i) => ({
        ...i,
        productionOrderId: orderId,
      }));
      await tx.orderItem.createMany({ data: cleanItems });
    }
  });

  return basePrisma.productionOrder.findUnique({
    where: { id: orderId },
    include: { items: true, milestones: { include: { reports: true } } },
  });
}

export async function deleteOrder(db: TenantPrismaClient, orderId: string) {
  const order = await db.productionOrder.findUnique({
    where: { id: orderId },
    include: { milestones: { include: { reports: true } } },
  });
  if (!order) throw new AppError(404, '工单不存在');

  const hasReports = order.milestones.some((m) => m.reports.length > 0);
  if (hasReports) throw new AppError(400, '该工单已有报工记录，不允许删除');

  const opCount = await db.productionOpRecord.count({ where: { orderId } });
  if (opCount > 0)
    throw new AppError(400, `该工单存在 ${opCount} 条关联单据，请先在相关模块删除后再试`);

  const childCount = await db.productionOrder.count({ where: { parentOrderId: orderId } });
  if (childCount > 0)
    throw new AppError(400, `该工单存在 ${childCount} 条子工单，请先删除子工单后再试`);

  await db.productionOrder.delete({ where: { id: orderId } });
  return { message: '已删除' };
}

// ── milestone reports ──

async function verifyMilestoneTenant(milestoneId: string, tenantId: string) {
  const milestone = await basePrisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { productionOrder: { select: { tenantId: true } } },
  });
  if (!milestone) throw new AppError(404, '工序不存在');
  if (milestone.productionOrder.tenantId !== tenantId) throw new AppError(404, '工序不存在');
  return milestone;
}

async function recalcMilestoneCompleted(milestoneId: string) {
  const totalCompleted = await basePrisma.milestoneReport.aggregate({
    where: { milestoneId },
    _sum: { quantity: true },
  });
  await basePrisma.milestone.update({
    where: { id: milestoneId },
    data: { completedQuantity: totalCompleted._sum?.quantity || 0 },
  });
}

export async function createReport(
  tenantId: string,
  milestoneId: string,
  body: Record<string, unknown>,
) {
  await verifyMilestoneTenant(milestoneId, tenantId);
  const reportNo = await generateReportNo('BG', tenantId);
  const report = await basePrisma.milestoneReport.create({
    data: {
      id: (body.id as string) || genId('rpt'),
      milestoneId,
      timestamp: new Date((body.timestamp as string) || Date.now()),
      operator: body.operator,
      quantity: body.quantity,
      defectiveQuantity: body.defectiveQuantity || 0,
      equipmentId: body.equipmentId,
      variantId: body.variantId,
      reportBatchId: body.reportBatchId,
      reportNo: (body.reportNo as string) || reportNo,
      customData: (body.customData as any) || {},
      notes: body.notes,
      rate: body.rate,
      workerId: body.workerId,
    } as any,
  });
  await recalcMilestoneCompleted(milestoneId);
  await basePrisma.milestone.update({
    where: { id: milestoneId },
    data: { status: 'IN_PROGRESS' },
  });
  return report;
}

export async function updateReport(
  tenantId: string,
  milestoneId: string,
  reportId: string,
  body: Record<string, unknown>,
) {
  await verifyMilestoneTenant(milestoneId, tenantId);
  const data = sanitizeUpdate(body);
  normalizeDates(data);
  const report = await basePrisma.milestoneReport.update({
    where: { id: reportId },
    data,
  });
  await recalcMilestoneCompleted(milestoneId);
  return report;
}

export async function deleteReport(
  tenantId: string,
  milestoneId: string,
  reportId: string,
) {
  await verifyMilestoneTenant(milestoneId, tenantId);
  await basePrisma.milestoneReport.delete({ where: { id: reportId } });
  await recalcMilestoneCompleted(milestoneId);
  return { message: '已删除' };
}

// ── reportable ──

export async function getReportable(db: TenantPrismaClient, orderId: string) {
  const order = await db.productionOrder.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      milestones: { include: { reports: true }, orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!order) throw new AppError(404, '工单不存在');

  const totalQty = order.items.reduce((s, i) => s + Number(i.quantity), 0);

  return order.milestones.map((ms, idx) => {
    const reported = ms.reports.reduce((s, r) => s + Number(r.quantity), 0);
    const defective = ms.reports.reduce((s, r) => s + Number(r.defectiveQuantity), 0);
    const prevCompleted =
      idx > 0 ? Number(order.milestones[idx - 1].completedQuantity) : totalQty;
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
}

// ── product progress ──

export async function listProductProgress(db: TenantPrismaClient) {
  return db.productMilestoneProgress.findMany({
    include: { reports: { orderBy: { timestamp: 'desc' } } },
    orderBy: { updatedAt: 'desc' },
  });
}

async function recalcProgressCompleted(progressId: string) {
  const totalCompleted = await basePrisma.productProgressReport.aggregate({
    where: { progressId },
    _sum: { quantity: true },
  });
  await basePrisma.productMilestoneProgress.update({
    where: { id: progressId },
    data: { completedQuantity: totalCompleted._sum?.quantity || 0 },
  });
}

export async function createProductReport(
  db: TenantPrismaClient,
  tenantId: string,
  body: Record<string, unknown>,
) {
  const { productId, variantId, milestoneTemplateId, ...reportData } = body;

  let progress = await db.productMilestoneProgress.findFirst({
    where: {
      productId: productId as string,
      variantId: (variantId as string) || null,
      milestoneTemplateId: milestoneTemplateId as string,
    },
  });

  if (!progress) {
    progress = await db.productMilestoneProgress.create({
      data: {
        id: genId('pmp'),
        productId,
        variantId: (variantId as string) || null,
        milestoneTemplateId,
        completedQuantity: 0,
      } as any,
    });
  }

  const reportNo = await generateReportNo('BG', tenantId);
  const report = await basePrisma.productProgressReport.create({
    data: {
      id: (reportData.id as string) || genId('ppr'),
      progressId: progress.id,
      timestamp: new Date((reportData.timestamp as string) || Date.now()),
      operator: reportData.operator,
      quantity: reportData.quantity,
      defectiveQuantity: reportData.defectiveQuantity || 0,
      equipmentId: reportData.equipmentId,
      variantId,
      reportBatchId: reportData.reportBatchId,
      reportNo: (reportData.reportNo as string) || reportNo,
      customData: (reportData.customData as any) || {},
      notes: reportData.notes,
      rate: reportData.rate,
      workerId: reportData.workerId,
    } as any,
  });

  await recalcProgressCompleted(progress.id);
  return report;
}

export async function updateProductReport(
  db: TenantPrismaClient,
  reportId: string,
  body: Record<string, unknown>,
) {
  const report = await basePrisma.productProgressReport.findUnique({ where: { id: reportId } });
  if (!report) throw new AppError(404, '报工记录不存在');

  const progress = await db.productMilestoneProgress.findUnique({
    where: { id: report.progressId },
  });
  if (!progress) throw new AppError(404, '报工记录不存在');

  const updateData = sanitizeUpdate(body);
  normalizeDates(updateData);
  const updated = await basePrisma.productProgressReport.update({
    where: { id: reportId },
    data: updateData,
  });
  await recalcProgressCompleted(report.progressId);
  return updated;
}

export async function deleteProductReport(
  db: TenantPrismaClient,
  reportId: string,
) {
  const report = await basePrisma.productProgressReport.findUnique({ where: { id: reportId } });
  if (!report) throw new AppError(404, '报工记录不存在');

  const progress = await db.productMilestoneProgress.findUnique({
    where: { id: report.progressId },
  });
  if (!progress) throw new AppError(404, '报工记录不存在');

  await basePrisma.productProgressReport.delete({ where: { id: reportId } });
  await recalcProgressCompleted(report.progressId);
  return { message: '已删除' };
}
