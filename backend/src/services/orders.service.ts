import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma, getTenantPrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { generateReportNo } from '../utils/docNumber.js';
import { genId } from '../utils/genId.js';
import { sanitizeUpdate, sanitizeItems, normalizeDates } from '../utils/request.js';
import { buildReportWeightBreakdown } from './reportWeightBreakdown.service.js';
import { assertScanNotAlreadyUsed } from './scanValidate.service.js';
import { OrderDispatchStatus } from '../types/index.js';

export async function listOrders(
  db: TenantPrismaClient,
  opts: {
    status?: string; productId?: string; parentOrderId?: string;
    search?: string; page?: number; pageSize?: number; lite?: boolean;
    /** 列表仅显示进行中（隐藏 dispatchStatus=COMPLETED） */
    excludeCompleted?: boolean;
    all?: boolean;
  },
) {
  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (opts.productId) where.productId = opts.productId;
  if (opts.parentOrderId) where.parentOrderId = opts.parentOrderId;
  if (opts.excludeCompleted) {
    where.dispatchStatus = OrderDispatchStatus.IN_PROGRESS;
  }
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

  if (opts.all) {
    return db.productionOrder.findMany({ where, include, orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.productionOrder.findMany({ where, include, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.productionOrder.count({ where }),
  ]);
  return { data, total, page, pageSize };
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
    include: {
      items: true,
      milestones: { include: { reports: true }, orderBy: { sortOrder: 'asc' } },
    },
  });
}

/**
 * 手动切换工单派发完成状态（工单中心徽章点击）。
 *
 * 与 `production.service.recalcOrderDispatchStatusByStockIn` 的自动逻辑解耦：
 * 一旦手动切换，`dispatchStatusManual` 置为 `true`，后续 STOCK_IN 入库/删除不会再自动覆盖。
 * 走独立接口而非复用 `updateOrder`，避免 `sanitizeUpdate` 误带其他字段且权限语义清晰。
 */
export async function updateOrderDispatchStatus(
  db: TenantPrismaClient,
  orderId: string,
  status: OrderDispatchStatus,
) {
  const existing = await db.productionOrder.findUnique({
    where: { id: orderId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, '工单不存在');

  return db.productionOrder.update({
    where: { id: orderId },
    data: {
      dispatchStatus: status,
      dispatchStatusManual: true,
    },
    include: {
      items: true,
      milestones: { include: { reports: true }, orderBy: { sortOrder: 'asc' } },
    },
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

// ── report history（报工流水：按日期窗口扁平返回 milestone.reports + pmp.reports）──

export interface ListReportHistoryOpts {
  startDate?: string;
  endDate?: string;
  orderIds?: string[];
  productIds?: string[];
  search?: string;
  productionLinkMode?: 'order' | 'product';
}

export async function listReportHistory(
  db: TenantPrismaClient,
  opts: ListReportHistoryOpts,
) {
  const range: { gte?: Date; lt?: Date } = {};
  if (opts.startDate) {
    const d = new Date(opts.startDate);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (opts.endDate) {
    const d = new Date(opts.endDate);
    if (!Number.isNaN(d.getTime())) range.lt = d;
  }

  // 多租户隔离由 getTenantPrisma 通过 RELATION_TENANT_PATH 自动注入到 milestoneReport
  // / productProgressReport，这里不再手工带 tenant 过滤。
  const orderWhere: Record<string, unknown> = {};
  if (range.gte || range.lt) orderWhere.timestamp = range;
  if (opts.orderIds && opts.orderIds.length > 0) {
    orderWhere.milestone = { productionOrderId: { in: opts.orderIds } };
  }

  const orderReportsRaw = await db.milestoneReport.findMany({
    where: orderWhere,
    orderBy: [{ timestamp: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      milestoneId: true,
      timestamp: true,
      operator: true,
      quantity: true,
      defectiveQuantity: true,
      equipmentId: true,
      variantId: true,
      reportBatchId: true,
      reportNo: true,
      customData: true,
      notes: true,
      rate: true,
      workerId: true,
      weight: true,
      materialBreakdown: true,
      createdAt: true,
      milestone: {
        select: {
          id: true,
          name: true,
          templateId: true,
          productionOrderId: true,
          productionOrder: {
            select: {
              id: true,
              orderNumber: true,
              productId: true,
              productName: true,
              sku: true,
              customer: true,
              dueDate: true,
            },
          },
        },
      },
    },
  });

  const orderReports = orderReportsRaw.map((r) => ({
    source: 'order' as const,
    reportId: r.id,
    timestamp: r.timestamp,
    operator: r.operator,
    quantity: r.quantity,
    defectiveQuantity: r.defectiveQuantity,
    equipmentId: r.equipmentId,
    variantId: r.variantId,
    reportBatchId: r.reportBatchId,
    reportNo: r.reportNo,
    customData: r.customData,
    notes: r.notes,
    rate: r.rate,
    workerId: r.workerId,
    weight: r.weight,
    materialBreakdown: r.materialBreakdown,
    createdAt: r.createdAt,
    milestoneId: r.milestone.id,
    milestoneName: r.milestone.name,
    templateId: r.milestone.templateId,
    orderId: r.milestone.productionOrder.id,
    orderNumber: r.milestone.productionOrder.orderNumber,
    productId: r.milestone.productionOrder.productId,
    productName: r.milestone.productionOrder.productName,
    sku: r.milestone.productionOrder.sku,
    customer: r.milestone.productionOrder.customer,
    dueDate: r.milestone.productionOrder.dueDate,
  }));

  // 关联产品模式下，额外返回 PMP.reports；非该模式时跳过以节省查询
  let productReports: Array<Record<string, unknown>> = [];
  if (opts.productionLinkMode === 'product') {
    const pmpReportWhere: Record<string, unknown> = {};
    if (range.gte || range.lt) pmpReportWhere.timestamp = range;
    if (opts.productIds && opts.productIds.length > 0) {
      pmpReportWhere.progress = { productId: { in: opts.productIds } };
    }
    const pmpReportsRaw = await db.productProgressReport.findMany({
      where: pmpReportWhere,
      orderBy: [{ timestamp: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        progressId: true,
        timestamp: true,
        operator: true,
        quantity: true,
        defectiveQuantity: true,
        equipmentId: true,
        variantId: true,
        reportBatchId: true,
        reportNo: true,
        customData: true,
        notes: true,
        rate: true,
        workerId: true,
        weight: true,
        materialBreakdown: true,
        createdAt: true,
        progress: {
          select: {
            id: true,
            productId: true,
            milestoneTemplateId: true,
            variantId: true,
          },
        },
      },
    });
    const productIdsForName = [...new Set(pmpReportsRaw.map((r) => r.progress.productId))];
    const productNameMap = new Map<string, { name: string | null; sku: string | null }>();
    if (productIdsForName.length > 0) {
      const products = await db.product.findMany({
        where: { id: { in: productIdsForName } },
        select: { id: true, name: true, sku: true },
      });
      for (const p of products) productNameMap.set(p.id, { name: p.name ?? null, sku: p.sku ?? null });
    }
    productReports = pmpReportsRaw.map((r) => {
      const meta = productNameMap.get(r.progress.productId);
      return {
        source: 'pmp' as const,
        reportId: r.id,
        timestamp: r.timestamp,
        operator: r.operator,
        quantity: r.quantity,
        defectiveQuantity: r.defectiveQuantity,
        equipmentId: r.equipmentId,
        variantId: r.variantId,
        reportBatchId: r.reportBatchId,
        reportNo: r.reportNo,
        customData: r.customData,
        notes: r.notes,
        rate: r.rate,
        workerId: r.workerId,
        weight: r.weight,
        materialBreakdown: r.materialBreakdown,
        createdAt: r.createdAt,
        progressId: r.progress.id,
        productId: r.progress.productId,
        productName: meta?.name ?? null,
        sku: meta?.sku ?? null,
        templateId: r.progress.milestoneTemplateId,
      };
    });
  }

  // 服务端 search 模糊（同时覆盖两路结果的 docNo/operator/orderNumber/productName/reportNo）
  if (opts.search) {
    const kw = opts.search.toLowerCase();
    const match = (s: unknown) => typeof s === 'string' && s.toLowerCase().includes(kw);
    const filterFn = (row: Record<string, unknown>) =>
      match(row.reportNo) ||
      match(row.operator) ||
      match(row.orderNumber) ||
      match(row.productName) ||
      match(row.sku) ||
      match(row.notes);
    return {
      orderReports: orderReports.filter(filterFn as never),
      productReports: productReports.filter(filterFn as never),
    };
  }

  return { orderReports, productReports };
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

  // 扫码去重兜底：同一工序同一 itemCodeId / virtualBatchId 已报工 → 拒绝写入
  await assertScanNotAlreadyUsed(
    tenantId,
    'MILESTONE_REPORT',
    { milestoneId },
    {
      itemCodeId: (body.itemCodeId as string | undefined) ?? null,
      virtualBatchId: (body.virtualBatchId as string | undefined) ?? null,
    },
  );
  void verified;
  const weightPayload = milestone?.productionOrder?.productId
    ? await buildReportWeightBreakdown({
        tenantId,
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
      virtualBatchId: (body.virtualBatchId as string | undefined) || null,
      itemCodeId: (body.itemCodeId as string | undefined) || null,
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

  if ('weight' in body) {
    const existing = await basePrisma.milestoneReport.findUnique({
      where: { id: reportId },
      select: {
        quantity: true,
        variantId: true,
        milestone: {
          select: {
            templateId: true,
            productionOrder: { select: { productId: true } },
          },
        },
      },
    });
    const productId = existing?.milestone?.productionOrder?.productId;
    const templateId = existing?.milestone?.templateId;
    if (productId && templateId) {
      const qty = data.quantity !== undefined ? Number(data.quantity) : Number(existing?.quantity ?? 0);
      const vId =
        data.variantId !== undefined
          ? (data.variantId as string | null)
          : (existing?.variantId as string | null | undefined);
      const weightPayload = await buildReportWeightBreakdown({
        tenantId,
        productId,
        milestoneTemplateId: templateId,
        variantId: vId ?? null,
        quantity: qty,
        weight: body.weight,
      });
      data.weight = weightPayload.weight as unknown;
      data.materialBreakdown = weightPayload.materialBreakdown as unknown;
    } else {
      delete data.weight;
      delete data.materialBreakdown;
    }
  }

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

export async function listProductProgress(
  db: TenantPrismaClient,
  opts: { all?: boolean; page?: number; pageSize?: number },
) {
  const include = { reports: { orderBy: { timestamp: 'desc' as const } } };
  const orderBy = { updatedAt: 'desc' as const };

  if (opts.all) {
    return db.productMilestoneProgress.findMany({ include, orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.productMilestoneProgress.findMany({ include, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.productMilestoneProgress.count({}),
  ]);
  return { data, total, page, pageSize };
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

  // 扫码去重兜底：同一产品+工序模板（+规格）同一 itemCodeId / virtualBatchId 已报工 → 拒绝写入
  await assertScanNotAlreadyUsed(
    tenantId,
    'PRODUCT_REPORT',
    {
      productId: productId as string,
      milestoneTemplateId: milestoneTemplateId as string,
      variantId: (variantId as string | null | undefined) ?? null,
    },
    {
      itemCodeId: (reportData.itemCodeId as string | undefined) ?? null,
      virtualBatchId: (reportData.virtualBatchId as string | undefined) ?? null,
    },
  );

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
    tenantId,
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
      virtualBatchId: (reportData.virtualBatchId as string | undefined) || null,
      itemCodeId: (reportData.itemCodeId as string | undefined) || null,
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

  if ('weight' in body) {
    const qty =
      updateData.quantity !== undefined ? Number(updateData.quantity) : Number(report.quantity);
    const weightPayload = await buildReportWeightBreakdown({
      tenantId: progress.tenantId,
      productId: progress.productId as string,
      milestoneTemplateId: progress.milestoneTemplateId as string,
      variantId: progress.variantId,
      quantity: qty,
      weight: body.weight,
    });
    updateData.weight = weightPayload.weight as unknown;
    updateData.materialBreakdown = weightPayload.materialBreakdown as unknown;
  }

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
