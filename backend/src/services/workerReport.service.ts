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
  getReportable,
  recalcMilestoneCompleted,
  recalcProgressCompleted,
} from './orders.service.js';
import * as settingsService from './settings.service.js';

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
  items: { quantity: unknown }[];
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
 * 可报任务 = 成员 assignedMilestoneIds ∩ remaining > 0 的工单工序（及产品模式入口）。
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
  void opts?.productionLinkMode;

  const outOfSequenceNodes = await db.globalNodeTemplate.findMany({
    where: { allowOutOfSequence: true },
    select: { id: true },
  });
  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(
    outOfSequenceNodes.map((n) => ({ id: n.id, allowOutOfSequence: true })),
  );

  // 与工单中心列表一致：未发货工单均可出现可报工序（不限定 dispatchStatus=IN_PROGRESS）
  const orders = await db.productionOrder.findMany({
    where: { status: { not: OrderStatus.SHIPPED } },
    select: {
      id: true,
      orderNumber: true,
      productId: true,
      productName: true,
      sku: true,
      items: { select: { quantity: true } },
      milestones: {
        select: {
          id: true,
          templateId: true,
          name: true,
          completedQuantity: true,
          reports: { select: { defectiveQuantity: true, approvalStatus: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 500,
  });

  for (const order of orders) {
    const msList = order.milestones;
    const relevantIdx = msList
      .map((m, idx) => ({ m, idx }))
      .filter(({ m }) => assignedSet.has(m.templateId));
    if (relevantIdx.length === 0) continue;

    let reportableRows: Awaited<ReturnType<typeof getReportable>> | null = null;
    try {
      reportableRows = await getReportable(db, order.id);
    } catch {
      reportableRows = null;
    }
    const byMs = reportableRows
      ? new Map(reportableRows.map((r) => [r.milestoneId, r]))
      : null;

    for (const { m, idx } of relevantIdx) {
      const chip = chipRemainingAtMilestone(
        order,
        idx,
        processSequenceMode,
        outOfSequenceTemplateIds,
      );
      const row = byMs?.get(m.id);
      const remaining =
        row != null ? Math.max(0, row.remaining) : Math.max(0, chip.remaining);
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
        maxReportable: row?.maxReportable ?? chip.maxReportable,
        totalQty: row?.totalQty ?? chip.totalQty,
        reported: row?.reported ?? chip.reported,
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
