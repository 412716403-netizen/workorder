import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma, getTenantPrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { generateReportNo } from '../utils/docNumber.js';
import { genId } from '../utils/genId.js';
import { sanitizeUpdate, sanitizeItems, normalizeDates } from '../utils/request.js';
import { calcUsageByWeight } from '../utils/bomMaterialUsageByWeight.js';

/**
 * 若工序开启「报工时记录重量」并传入 weight，则按当前 BOM 自动派生占比，
 * 返回写入 DB 的 weight + materialBreakdown JSON 快照。
 */
async function buildReportWeightBreakdown(opts: {
  productId: string;
  milestoneTemplateId: string;
  variantId?: string | null;
  quantity: number;
  weight?: unknown;
}): Promise<{ weight: number | null; materialBreakdown: unknown }> {
  const rawWeight = typeof opts.weight === 'number'
    ? opts.weight
    : typeof opts.weight === 'string' && opts.weight !== ''
      ? parseFloat(opts.weight)
      : null;
  if (rawWeight == null || !Number.isFinite(rawWeight) || rawWeight <= 0) {
    return { weight: null, materialBreakdown: null };
  }
  const node = await basePrisma.globalNodeTemplate.findUnique({
    where: { id: opts.milestoneTemplateId },
    select: { enableWeightOnReport: true },
  });
  if (!node?.enableWeightOnReport) {
    return { weight: null, materialBreakdown: null };
  }
  const productId = opts.productId;
  const variantId = opts.variantId || null;

  const boms = await basePrisma.bom.findMany({
    where: { parentProductId: productId, nodeId: opts.milestoneTemplateId },
    include: { items: true },
  });
  if (boms.length === 0) {
    return { weight: rawWeight, materialBreakdown: null };
  }
  const exactBom = variantId ? boms.find(b => b.variantId === variantId) : undefined;
  const chosenBom = exactBom ?? boms.find(b => !b.variantId) ?? boms[0];

  const childIds = chosenBom.items.map(it => it.productId);
  const childProducts = childIds.length
    ? await basePrisma.product.findMany({
      where: { id: { in: childIds } },
      select: { id: true, name: true },
    })
    : [];
  const nameById = new Map(childProducts.map(p => [p.id, p.name]));

  const breakdown = calcUsageByWeight(
    chosenBom.items.map(it => ({
      productId: it.productId,
      quantity: it.quantity,
      excludeFromWeightShare: it.excludeFromWeightShare,
    })),
    opts.quantity,
    rawWeight,
    pid => nameById.get(pid) ?? '',
  );

  return { weight: rawWeight, materialBreakdown: breakdown };
}

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
  const verified = await verifyMilestoneTenant(milestoneId, tenantId);
  const reportNo = await generateReportNo('BG', tenantId);

  /** 报工称重：若工序开启 enableWeightOnReport 且传入 weight，拉当前 BOM 现算 breakdown，固化到报工记录 */
  const milestone = await basePrisma.milestone.findUnique({
    where: { id: milestoneId },
    select: { templateId: true, productionOrder: { select: { id: true, productId: true } } },
  });

  // 报工最大数量硬校验（受 SystemSetting.allowExceedMaxReportQty 控制）
  if (milestone?.productionOrder?.id && milestone.templateId) {
    const db = getTenantPrisma(tenantId);
    await enforceReportQuantity(db, tenantId, {
      mode: 'order',
      orderId: milestone.productionOrder.id,
      templateId: milestone.templateId,
      addQty: Number(body.quantity) || 0,
    });
  }
  void verified;
  const weightPayload = milestone?.productionOrder?.productId
    ? await buildReportWeightBreakdown({
        productId: milestone.productionOrder.productId,
        milestoneTemplateId: milestone.templateId,
        variantId: (body.variantId as string | undefined) ?? null,
        quantity: Number(body.quantity) || 0,
        weight: body.weight,
      })
    : { weight: null, materialBreakdown: null };

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
      weight: weightPayload.weight,
      materialBreakdown: weightPayload.materialBreakdown as any,
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

/**
 * 单产品 + 单工序模板下，PMP（产品池报工）的累计完成量。
 * 关联产品模式下报工写入 PMP（不带 orderId），与工单 milestone 的 completedQuantity 互不重叠
 * （详见 docs/05-production-link-mode.md）。计算「上道工序完成量」时必须把两路相加，否则会
 * 在产品模式下漏算 PMP，导致 maxReportable / remaining 长期为 0。
 */
async function pmpCompletedAtTemplate(
  db: TenantPrismaClient,
  productId: string,
  templateId: string,
): Promise<number> {
  const rows = await db.productMilestoneProgress.findMany({
    where: { productId, milestoneTemplateId: templateId },
    select: { completedQuantity: true },
  });
  return rows.reduce((s, p) => s + Number(p.completedQuantity ?? 0), 0);
}

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

  // 预拉所有工序的 PMP 完成量，避免循环里反复查
  const pmpByTpl = new Map<string, number>();
  await Promise.all(
    order.milestones.map(async (m) => {
      pmpByTpl.set(m.templateId, await pmpCompletedAtTemplate(db, order.productId, m.templateId));
    }),
  );
  const combinedAt = (idx: number) => {
    if (idx < 0) return totalQty;
    const ms = order.milestones[idx];
    return Number(ms.completedQuantity) + (pmpByTpl.get(ms.templateId) ?? 0);
  };

  return order.milestones.map((ms, idx) => {
    const reported = ms.reports.reduce((s, r) => s + Number(r.quantity), 0);
    const defective = ms.reports.reduce((s, r) => s + Number(r.defectiveQuantity), 0);
    // 上道完成量：PMP（产品池）+ milestone（本工单）合并；首道用工单总量
    const prevCompleted = idx > 0 ? combinedAt(idx - 1) : totalQty;
    const reportedCombined = reported + (pmpByTpl.get(ms.templateId) ?? 0);
    return {
      milestoneId: ms.id,
      templateId: ms.templateId,
      name: ms.name,
      totalQty,
      reported,
      defective,
      maxReportable: prevCompleted - defective,
      remaining: prevCompleted - reportedCombined,
    };
  });
}

// ── 报工硬校验 ──

/**
 * 后端报工"最大可报数量"硬校验（兜底）：
 * - 受 SystemSetting.allowExceedMaxReportQty 控制：true 时**完全跳过**校验（业务允许超报）；
 *   false 时执行下面的兜底口径。
 * - 兜底口径（保守）：`已报 + 本次报 ≤ 工单总量（或该产品全部工单总量）`。
 *   不复刻前端的 sequential / 不良 / 返工等精确口径——前端 ReportModal 已做精确校验，
 *   后端这里只做"防止 API 直连绕过前端时的明显越界"，避免后端在不知道顺序模式的情况下误拦
 *   合法报工。
 * - 已报 = milestone.reports 累计 + PMP.completedQuantity（两路合并，与 getReportable 一致）。
 */
async function enforceReportQuantity(
  db: TenantPrismaClient,
  tenantId: string,
  scope:
    | { mode: 'order'; orderId: string; templateId: string; addQty: number }
    | { mode: 'product'; productId: string; templateId: string; addQty: number },
): Promise<void> {
  if (!(scope.addQty > 0)) return;
  const setting = await basePrisma.systemSetting.findUnique({
    where: { tenantId_key: { tenantId, key: 'allowExceedMaxReportQty' } },
  });
  const allowExceed = setting?.value === true;
  if (allowExceed) return;

  if (scope.mode === 'order') {
    const order = await db.productionOrder.findUnique({
      where: { id: scope.orderId },
      include: { items: true, milestones: { include: { reports: true } } },
    });
    if (!order) throw new AppError(404, '工单不存在');
    const totalQty = order.items.reduce((s, i) => s + Number(i.quantity), 0);
    const ms = order.milestones.find((m) => m.templateId === scope.templateId);
    if (!ms) throw new AppError(404, '工序不存在');
    const reported = ms.reports.reduce((s, r) => s + Number(r.quantity), 0);
    const pmpReported = await pmpCompletedAtTemplate(db, order.productId, scope.templateId);
    if (reported + pmpReported + scope.addQty > totalQty) {
      throw new AppError(
        400,
        `本次报工 ${scope.addQty} 件 + 已报 ${reported + pmpReported} 件 已超过工单总量 ${totalQty} 件，且系统未开启「允许超过最大可报数量」。`,
      );
    }
    return;
  }

  const orders = await db.productionOrder.findMany({
    where: { productId: scope.productId },
    include: { items: true, milestones: { include: { reports: true } } },
  });
  const totalQty = orders.reduce(
    (s, o) => s + o.items.reduce((a, i) => a + Number(i.quantity), 0),
    0,
  );
  let reported = 0;
  for (const o of orders) {
    const ms = o.milestones.find((m) => m.templateId === scope.templateId);
    if (ms) reported += ms.reports.reduce((s, r) => s + Number(r.quantity), 0);
  }
  const pmpReported = await pmpCompletedAtTemplate(db, scope.productId, scope.templateId);
  if (reported + pmpReported + scope.addQty > totalQty) {
    throw new AppError(
      400,
      `本次报工 ${scope.addQty} 件 + 该产品已报 ${reported + pmpReported} 件 已超过该产品全部工单总量 ${totalQty} 件，且系统未开启「允许超过最大可报数量」。`,
    );
  }
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

  // 报工最大数量硬校验（受 SystemSetting.allowExceedMaxReportQty 控制）
  await enforceReportQuantity(db, tenantId, {
    mode: 'product',
    productId: productId as string,
    templateId: milestoneTemplateId as string,
    addQty: Number(reportData.quantity) || 0,
  });

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
  const weightPayload = await buildReportWeightBreakdown({
    productId: productId as string,
    milestoneTemplateId: milestoneTemplateId as string,
    variantId: (variantId as string | undefined) ?? null,
    quantity: Number(reportData.quantity) || 0,
    weight: reportData.weight,
  });
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
      weight: weightPayload.weight,
      materialBreakdown: weightPayload.materialBreakdown as any,
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
