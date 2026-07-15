/**
 * 工人自报工 / 报工审核：可报任务列表、本人工序校验、通过/驳回。
 */
import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  buildOutOfSequenceTemplateIds,
  findGatingPredecessorIndex,
  isProcessSequential,
} from '../../../shared/processSequence.js';
import type { ProcessSequenceMode } from '../types/index.js';
import {
  OrderStatus,
  ReportApprovalStatus,
} from '../types/index.js';
import {
  reworkMergeBucketOrderId,
  type ReportableOrder,
  type ReportableProdRecord,
  type ReportablePmp,
} from '../../../shared/orderReportableAggregates.js';
import {
  computeWorkerReportTaskDisplayRemaining,
  computeProductModeWorkerTaskRemaining,
} from '../../../shared/workerReportTaskRemaining.js';
import { productHasColorSizeMatrix } from '../../../shared/productColorSize.js';
import {
  recalcMilestoneCompleted,
  recalcProgressCompleted,
} from './orders.service.js';
import * as settingsService from './settings.service.js';

function mapOrderForReportableRemaining(row: {
  id: string;
  productId: string;
  parentOrderId?: string | null;
  items: { quantity: unknown; variantId: string | null }[];
  milestones: {
    id: string;
    templateId: string;
    completedQuantity: unknown;
    reports: {
      quantity: unknown;
      defectiveQuantity: unknown;
      variantId: string | null;
      approvalStatus: string | null;
    }[];
  }[];
}): ReportableOrder {
  return {
    id: row.id,
    productId: row.productId,
    parentOrderId: row.parentOrderId ?? null,
    items: row.items.map((i) => ({
      quantity: Number(i.quantity ?? 0),
      variantId: i.variantId,
    })),
    milestones: row.milestones.map((m) => ({
      id: m.id,
      templateId: m.templateId,
      completedQuantity: Number(m.completedQuantity ?? 0),
      reports: m.reports.map((r) => ({
        quantity: Number(r.quantity ?? 0),
        defectiveQuantity: Number(r.defectiveQuantity ?? 0),
        variantId: r.variantId,
        approvalStatus: r.approvalStatus,
      })),
    })),
  };
}

function mapProdRecordForReportableRemaining(row: {
  id: string;
  type: string;
  orderId: string | null;
  productId: string;
  variantId: string | null;
  quantity: unknown;
  nodeId: string | null;
  sourceNodeId: string | null;
  sourceReworkId: string | null;
  reworkNodeIds: unknown;
  status: string | null;
}): ReportableProdRecord {
  const reworkNodeIds = Array.isArray(row.reworkNodeIds)
    ? row.reworkNodeIds.filter((v): v is string => typeof v === 'string')
    : null;
  return {
    id: row.id,
    type: row.type,
    orderId: row.orderId,
    productId: row.productId,
    variantId: row.variantId,
    quantity: Number(row.quantity ?? 0),
    nodeId: row.nodeId,
    sourceNodeId: row.sourceNodeId,
    sourceReworkId: row.sourceReworkId,
    reworkNodeIds,
    status: row.status,
  };
}

export async function getMemberAssignedMilestoneIds(
  tenantId: string,
  userId: string,
): Promise<string[]> {
  const membership = await basePrisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { assignedMilestoneIds: true },
  });
  const fromMembership = membership?.assignedMilestoneIds;
  const memberIds = Array.isArray(fromMembership)
    ? fromMembership.filter((x): x is string => typeof x === 'string')
    : [];

  // 报工选人里成员 userId 即 worker.id；若仅在工人档案分配工序，与成员分配合并
  const worker = await basePrisma.worker.findFirst({
    where: { tenantId, id: userId },
    select: { assignedMilestoneIds: true },
  });
  const fromWorker = worker?.assignedMilestoneIds;
  const workerIds = Array.isArray(fromWorker)
    ? fromWorker.filter((x): x is string => typeof x === 'string')
    : [];

  return [...new Set([...memberIds, ...workerIds])];
}

export async function assertWorkerSelfReportAllowed(params: {
  tenantId: string;
  actorUserId?: string;
  workerId?: string;
  templateId?: string;
}): Promise<void> {
  const { tenantId, actorUserId, workerId, templateId } = params;
  if (!actorUserId) {
    throw new AppError(401, '未登录，无法提交自报工');
  }
  if (workerId && workerId !== actorUserId) {
    throw new AppError(403, '自报工只能报本人，不能代报他人');
  }
  if (!templateId) {
    throw new AppError(400, '工序不存在');
  }
  const assigned = await getMemberAssignedMilestoneIds(tenantId, actorUserId);
  if (assigned.length === 0) {
    throw new AppError(403, '未分配生产工序，请联系管理员');
  }
  if (!assigned.includes(templateId)) {
    throw new AppError(403, '无权报该工序，仅可报已分配的生产工序');
  }
}

type OrderMilestoneRow = {
  id: string;
  templateId: string;
  name: string;
  completedQuantity: unknown;
  reports?: { defectiveQuantity?: unknown; approvalStatus?: string | null }[];
};

type OrderForWorkerTasks = {
  id: string;
  orderNumber: string | null;
  productId: string;
  productName: string | null;
  sku: string | null;
  items: { quantity: unknown; variantId?: string | null }[];
  milestones: OrderMilestoneRow[];
};

/** 与小程序工单中心 `buildOrderProcessChips` 口径一致：remaining = availableQty − completedQuantity */
function chipRemainingAtMilestone(
  order: OrderForWorkerTasks,
  msIndex: number,
  processSequenceMode: ProcessSequenceMode,
  outOfSequenceTemplateIds: ReadonlySet<string>,
): { remaining: number; maxReportable: number; reported: number; totalQty: number } {
  const milestones = order.milestones;
  const ms = milestones[msIndex];
  const totalQty = order.items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
  const templateIds = milestones.map((m) => m.templateId);
  let baseQty = totalQty;
  if (isProcessSequential(processSequenceMode, ms.templateId, outOfSequenceTemplateIds)) {
    const gateIdx = findGatingPredecessorIndex(templateIds, msIndex, outOfSequenceTemplateIds);
    if (gateIdx >= 0) {
      baseQty = Number(milestones[gateIdx]?.completedQuantity ?? 0);
    }
  }
  const defective = (ms.reports ?? [])
    .filter((r) => {
      const status = (r as { approvalStatus?: string | null }).approvalStatus;
      return (
        status === ReportApprovalStatus.APPROVED ||
        status === ReportApprovalStatus.PENDING ||
        !status
      );
    })
    .reduce((s, r) => s + Number(r.defectiveQuantity ?? 0), 0);
  const maxReportable = Math.max(0, Math.round(baseQty - defective));
  const reported = Math.round(Number(ms.completedQuantity ?? 0));
  const remaining = maxReportable - reported;
  return { remaining, maxReportable, reported, totalQty };
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

type OrderForestNode = { id: string; parentOrderId: string | null };

function resolveProdRecordOrderIds(orders: OrderForestNode[]): string[] {
  const ids = new Set<string>();
  orders.forEach((o) => {
    ids.add(o.id);
    if (o.parentOrderId) ids.add(o.parentOrderId);
    const bucketId = reworkMergeBucketOrderId(o.id, orders);
    if (bucketId !== o.id) ids.add(bucketId);
  });
  return [...ids];
}

function resolveOrderProdRecords(
  order: OrderForestNode,
  prodRecordsByOrder: Map<string, ReportableProdRecord[]>,
  orderForest: OrderForestNode[],
): ReportableProdRecord[] {
  const bucketId = reworkMergeBucketOrderId(order.id, orderForest);
  const relatedIds = new Set<string>([order.id, bucketId]);
  if (order.parentOrderId) relatedIds.add(order.parentOrderId);
  const merged: ReportableProdRecord[] = [];
  const seen = new Set<string>();
  relatedIds.forEach((oid) => {
    (prodRecordsByOrder.get(oid) ?? []).forEach((r) => {
      if (seen.has(r.id)) return;
      seen.add(r.id);
      merged.push(r);
    });
  });
  return merged;
}

export type MyReportableTask = {
  mode: 'order' | 'product';
  orderId?: string;
  orderNumber?: string | null;
  milestoneId?: string;
  productId: string;
  productName: string | null;
  productSku: string | null;
  milestoneTemplateId: string;
  milestoneName: string;
  remaining: number;
  maxReportable: number;
  totalQty: number;
  reported: number;
};

/**
 * 可报任务 = 成员 assignedMilestoneIds ∩ remaining > 0。
 * product 模式按「产品 × 工序模板」聚合；order 模式按「工单 × 工序实例」。
 */
export async function listMyReportableTasks(
  db: TenantPrismaClient,
  tenantId: string,
  userId: string,
  opts?: { productionLinkMode?: 'order' | 'product' },
): Promise<{ tasks: MyReportableTask[]; assignedMilestoneIds: string[]; emptyReason?: string }> {
  const assignedMilestoneIds = await getMemberAssignedMilestoneIds(tenantId, userId);
  if (assignedMilestoneIds.length === 0) {
    return {
      tasks: [],
      assignedMilestoneIds,
      emptyReason: 'unassigned',
    };
  }

  const assignedSet = new Set(assignedMilestoneIds);
  const tasks: MyReportableTask[] = [];

  const config = await settingsService.getConfig(tenantId);
  const processSequenceMode: ProcessSequenceMode =
    config.processSequenceMode === 'free' ? 'free' : 'sequential';
  const productionLinkMode: 'order' | 'product' =
    opts?.productionLinkMode === 'product' || opts?.productionLinkMode === 'order'
      ? opts.productionLinkMode
      : config.productionLinkMode === 'product'
        ? 'product'
        : 'order';

  const outOfSequenceNodes = await db.globalNodeTemplate.findMany({
    where: { allowOutOfSequence: true },
    select: { id: true },
  });
  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(
    outOfSequenceNodes.map((n) => ({ id: n.id, allowOutOfSequence: true })),
  );

  // 与工单中心列表一致：未发货 + 含已分配工序的工单（不限定 dispatchStatus=IN_PROGRESS）
  const orders = await db.productionOrder.findMany({
    where: {
      status: { not: OrderStatus.SHIPPED },
      milestones: { some: { templateId: { in: assignedMilestoneIds } } },
    },
    select: {
      id: true,
      orderNumber: true,
      productId: true,
      productName: true,
      sku: true,
      parentOrderId: true,
      items: { select: { quantity: true, variantId: true } },
      milestones: {
        select: {
          id: true,
          templateId: true,
          name: true,
          completedQuantity: true,
          reports: {
            select: {
              quantity: true,
              defectiveQuantity: true,
              variantId: true,
              approvalStatus: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });

  const orderForest: OrderForestNode[] = orders.map((o) => ({
    id: o.id,
    parentOrderId: o.parentOrderId ?? null,
  }));
  const prodRecordOrderIds = resolveProdRecordOrderIds(orderForest);
  const productIdsForRecords = [...new Set(orders.map((o) => o.productId))];
  const prodRecordsRaw =
    prodRecordOrderIds.length === 0 && productIdsForRecords.length === 0
      ? []
      : await db.productionOpRecord.findMany({
          where: {
            OR: [
              ...(prodRecordOrderIds.length > 0
                ? [{ orderId: { in: prodRecordOrderIds } }]
                : []),
              ...(productIdsForRecords.length > 0
                ? [{ productId: { in: productIdsForRecords }, orderId: null }]
                : []),
            ],
            type: { in: ['OUTSOURCE', 'REWORK', 'REWORK_REPORT'] },
          },
          select: {
            id: true,
            type: true,
            orderId: true,
            productId: true,
            variantId: true,
            quantity: true,
            nodeId: true,
            sourceNodeId: true,
            sourceReworkId: true,
            reworkNodeIds: true,
            status: true,
          },
        });
  const prodRecords = prodRecordsRaw.map(mapProdRecordForReportableRemaining);
  const prodRecordsByOrder = new Map<string, ReportableProdRecord[]>();
  prodRecords.forEach((r) => {
    if (!r.orderId) return;
    const list = prodRecordsByOrder.get(r.orderId) ?? [];
    list.push(r);
    prodRecordsByOrder.set(r.orderId, list);
  });

  const productIds = [...new Set(orders.map((o) => o.productId))];
  const productsRaw =
    productIds.length === 0
      ? []
      : await db.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            name: true,
            sku: true,
            categoryId: true,
            colorIds: true,
            sizeIds: true,
            milestoneNodeIds: true,
            variants: { select: { id: true } },
          },
        });
  const categoryIds = [
    ...new Set(
      productsRaw.map((p) => p.categoryId).filter((id): id is string => typeof id === 'string'),
    ),
  ];
  const categoriesRaw =
    categoryIds.length === 0
      ? []
      : await db.productCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, hasColorSize: true },
        });
  const productById = new Map(
    productsRaw.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        sku: p.sku,
        categoryId: p.categoryId,
        colorIds: jsonStringArray(p.colorIds),
        sizeIds: jsonStringArray(p.sizeIds),
        milestoneNodeIds: jsonStringArray(p.milestoneNodeIds),
        variants: p.variants,
      },
    ]),
  );
  const categoryById = new Map(categoriesRaw.map((c) => [c.id, c]));

  if (productionLinkMode === 'product') {
    const nodeNameById = new Map<string, string>();
    const nodeRows = await db.globalNodeTemplate.findMany({
      where: { id: { in: assignedMilestoneIds } },
      select: { id: true, name: true },
    });
    nodeRows.forEach((n) => nodeNameById.set(n.id, n.name));

    const pmpRaw =
      productIds.length === 0
        ? []
        : await db.productMilestoneProgress.findMany({
            where: { productId: { in: productIds } },
            select: {
              productId: true,
              milestoneTemplateId: true,
              variantId: true,
              completedQuantity: true,
              reports: {
                select: {
                  quantity: true,
                  defectiveQuantity: true,
                  variantId: true,
                  approvalStatus: true,
                },
              },
            },
          });
    const pmpList: ReportablePmp[] = pmpRaw.map((p) => ({
      productId: p.productId,
      milestoneTemplateId: p.milestoneTemplateId,
      variantId: p.variantId,
      completedQuantity: Number(p.completedQuantity ?? 0),
      reports: (p.reports ?? []).map((r) => ({
        quantity: Number(r.quantity ?? 0),
        defectiveQuantity: Number(r.defectiveQuantity ?? 0),
        variantId: r.variantId,
        approvalStatus: r.approvalStatus,
      })),
    }));

    const ordersByProduct = new Map<string, typeof orders>();
    orders.forEach((o) => {
      const list = ordersByProduct.get(o.productId) ?? [];
      list.push(o);
      ordersByProduct.set(o.productId, list);
    });

    for (const productId of productIds) {
      const blockOrdersRaw = ordersByProduct.get(productId) ?? [];
      if (blockOrdersRaw.length === 0) continue;
      const product = productById.get(productId);
      let routeIds = product?.milestoneNodeIds ?? [];
      if (routeIds.length === 0) {
        const seen = new Set<string>();
        blockOrdersRaw.forEach((o) => {
          o.milestones.forEach((m) => {
            if (!seen.has(m.templateId)) {
              seen.add(m.templateId);
              routeIds.push(m.templateId);
            }
          });
        });
      }
      const relevantTemplates = routeIds.filter((tid) => assignedSet.has(tid));
      if (relevantTemplates.length === 0) continue;

      const reportableOrders = blockOrdersRaw.map(mapOrderForReportableRemaining);
      const productProdRecords: ReportableProdRecord[] = [];
      const seenRec = new Set<string>();
      blockOrdersRaw.forEach((o) => {
        resolveOrderProdRecords(o, prodRecordsByOrder, orderForest).forEach((r) => {
          if (seenRec.has(r.id)) return;
          seenRec.add(r.id);
          productProdRecords.push(r);
        });
      });
      prodRecords.forEach((r) => {
        if (r.orderId == null && r.productId === productId && !seenRec.has(r.id)) {
          seenRec.add(r.id);
          productProdRecords.push(r);
        }
      });

      const productName =
        product?.name ?? blockOrdersRaw[0]?.productName ?? null;
      const productSku = product?.sku ?? blockOrdersRaw[0]?.sku ?? null;

      for (const tid of relevantTemplates) {
        let milestoneName = nodeNameById.get(tid) || tid;
        for (const o of blockOrdersRaw) {
          const hit = o.milestones.find((m) => m.templateId === tid);
          if (hit?.name) {
            milestoneName = hit.name;
            break;
          }
        }
        const stats = computeProductModeWorkerTaskRemaining({
          blockOrders: reportableOrders,
          productId,
          milestoneTemplateId: tid,
          pmp: pmpList,
          processSequenceMode,
          outOfSequenceTemplateIds,
          prodRecords: productProdRecords,
        });
        if (!(stats.remaining > 0)) continue;
        tasks.push({
          mode: 'product',
          productId,
          productName,
          productSku,
          milestoneTemplateId: tid,
          milestoneName,
          remaining: stats.remaining,
          maxReportable: stats.maxReportable,
          totalQty: stats.totalQty,
          reported: stats.reported,
        });
      }
    }

    return {
      tasks,
      assignedMilestoneIds,
      emptyReason: tasks.length === 0 ? 'none' : undefined,
    };
  }

  for (const order of orders) {
    const msList = order.milestones;
    const relevantIdx = msList
      .map((m, idx) => ({ m, idx }))
      .filter(({ m }) => assignedSet.has(m.templateId));
    if (relevantIdx.length === 0) continue;

    const reportableOrder = mapOrderForReportableRemaining(order);
    const orderProdRecords = resolveOrderProdRecords(order, prodRecordsByOrder, orderForest);
    const product = productById.get(order.productId);
    const category =
      product?.categoryId && typeof product.categoryId === 'string'
        ? categoryById.get(product.categoryId)
        : undefined;
    const useProductVariantMatrix = productHasColorSizeMatrix(product, category);
    const productVariantIds = product?.variants.map((v) => v.id) ?? [];

    for (const { m, idx } of relevantIdx) {
      const chip = chipRemainingAtMilestone(
        order,
        idx,
        processSequenceMode,
        outOfSequenceTemplateIds,
      );
      const remaining = computeWorkerReportTaskDisplayRemaining({
        order: reportableOrder,
        milestoneTemplateId: m.templateId,
        processSequenceMode,
        outOfSequenceTemplateIds,
        prodRecords: orderProdRecords,
        useProductVariantMatrix,
        productVariantIds,
      });
      if (!(remaining > 0)) continue;
      tasks.push({
        mode: 'order',
        orderId: order.id,
        orderNumber: order.orderNumber,
        milestoneId: m.id,
        productId: order.productId,
        productName: order.productName,
        productSku: order.sku,
        milestoneTemplateId: m.templateId,
        milestoneName: m.name,
        remaining,
        maxReportable: chip.maxReportable,
        totalQty: chip.totalQty,
        reported: chip.reported,
      });
    }
  }

  return {
    tasks,
    assignedMilestoneIds,
    emptyReason: tasks.length === 0 ? 'none' : undefined,
  };
}

type ReportSource = 'order' | 'pmp';

async function findReportForApproval(
  tenantId: string,
  reportId: string,
): Promise<{
  source: ReportSource;
  milestoneId?: string;
  progressId?: string;
  approvalStatus: string;
} | null> {
  const orderRpt = await basePrisma.milestoneReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      milestoneId: true,
      approvalStatus: true,
      milestone: { select: { productionOrder: { select: { tenantId: true } } } },
    },
  });
  if (orderRpt) {
    if (orderRpt.milestone.productionOrder.tenantId !== tenantId) return null;
    return {
      source: 'order',
      milestoneId: orderRpt.milestoneId,
      approvalStatus: orderRpt.approvalStatus,
    };
  }
  const pmpRpt = await basePrisma.productProgressReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      progressId: true,
      approvalStatus: true,
      progress: { select: { tenantId: true } },
    },
  });
  if (pmpRpt) {
    if (pmpRpt.progress.tenantId !== tenantId) return null;
    return {
      source: 'pmp',
      progressId: pmpRpt.progressId,
      approvalStatus: pmpRpt.approvalStatus,
    };
  }
  return null;
}

export async function approveReport(
  tenantId: string,
  reportId: string,
  actorUserId: string,
) {
  const found = await findReportForApproval(tenantId, reportId);
  if (!found) throw new AppError(404, '报工记录不存在');
  if (found.approvalStatus !== ReportApprovalStatus.PENDING) {
    throw new AppError(400, '仅待审核的报工可通过');
  }
  const now = new Date();
  if (found.source === 'order' && found.milestoneId) {
    const report = await basePrisma.milestoneReport.update({
      where: { id: reportId },
      data: {
        approvalStatus: ReportApprovalStatus.APPROVED,
        approvedAt: now,
        approvedBy: actorUserId,
        rejectedReason: null,
      },
    });
    await recalcMilestoneCompleted(found.milestoneId);
    return report;
  }
  if (found.source === 'pmp' && found.progressId) {
    const report = await basePrisma.productProgressReport.update({
      where: { id: reportId },
      data: {
        approvalStatus: ReportApprovalStatus.APPROVED,
        approvedAt: now,
        approvedBy: actorUserId,
        rejectedReason: null,
      },
    });
    await recalcProgressCompleted(found.progressId);
    return report;
  }
  throw new AppError(404, '报工记录不存在');
}

export async function rejectReport(
  tenantId: string,
  reportId: string,
  actorUserId: string,
  reason?: string,
) {
  const found = await findReportForApproval(tenantId, reportId);
  if (!found) throw new AppError(404, '报工记录不存在');
  if (found.approvalStatus !== ReportApprovalStatus.PENDING) {
    throw new AppError(400, '仅待审核的报工可驳回');
  }
  const now = new Date();
  const rejectedReason =
    typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 500) : null;
  if (found.source === 'order' && found.milestoneId) {
    const report = await basePrisma.milestoneReport.update({
      where: { id: reportId },
      data: {
        approvalStatus: ReportApprovalStatus.REJECTED,
        approvedAt: now,
        approvedBy: actorUserId,
        rejectedReason,
      },
    });
    // 驳回不推进进度；completed 仍只计 APPROVED，无需 recalc 亦可，保守 recalc
    await recalcMilestoneCompleted(found.milestoneId);
    return report;
  }
  if (found.source === 'pmp' && found.progressId) {
    const report = await basePrisma.productProgressReport.update({
      where: { id: reportId },
      data: {
        approvalStatus: ReportApprovalStatus.REJECTED,
        approvedAt: now,
        approvedBy: actorUserId,
        rejectedReason,
      },
    });
    await recalcProgressCompleted(found.progressId);
    return report;
  }
  throw new AppError(404, '报工记录不存在');
}
