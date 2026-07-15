/**
 * 工人可报任务列表「可报 N」展示余量（对齐小程序 production-order-report 详情页最大可报）。
 */
import type { ProcessSequenceMode } from './types.js';
import { ReportApprovalStatus } from './types.js';
import { findGatingPredecessorIndex, isProcessSequential } from './processSequence.js';
import {
  buildDefectiveReworkByOrderMilestone,
  productGroupMaxReportableSum,
  pmpCompletedAtTemplate,
  reworkMergeBucketOrderId,
  sumBlockOrderQty,
  type ReportableMilestone,
  type ReportableMilestoneReport,
  type ReportableOrder,
  type ReportablePmp,
  type ReportableProdRecord,
} from './orderReportableAggregates.js';

function reportQtyOccupies(approvalStatus?: string | null): boolean {
  return (
    approvalStatus === ReportApprovalStatus.APPROVED ||
    approvalStatus === ReportApprovalStatus.PENDING ||
    !approvalStatus
  );
}

function sumOccupyingReportQty(
  reports: ReportableMilestoneReport[] | undefined,
  variantId?: string,
): number {
  const vid = variantId === undefined ? undefined : variantId || '';
  return (reports ?? [])
    .filter((r) => reportQtyOccupies(r.approvalStatus))
    .filter((r) => vid === undefined || (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
}

function sumOccupyingDefectiveQty(
  reports: ReportableMilestoneReport[] | undefined,
  variantId?: string,
): number {
  const vid = variantId === undefined ? undefined : variantId || '';
  return (reports ?? [])
    .filter((r) => reportQtyOccupies(r.approvalStatus))
    .filter((r) => vid === undefined || (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);
}

function sumPendingReportQty(reports: ReportableMilestoneReport[] | undefined): number {
  return (reports ?? [])
    .filter((r) => r.approvalStatus === ReportApprovalStatus.PENDING)
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
}

function orderUsesVariantBreakdown(order: ReportableOrder): boolean {
  const items = order.items || [];
  if (items.length === 0) return false;
  const variantIds = new Set(items.map((i) => i.variantId || ''));
  return variantIds.size > 1 || (variantIds.size === 1 && !variantIds.has(''));
}

function getSeqRemainingForVariant(
  order: ReportableOrder,
  milestoneTemplateId: string,
  variantId: string,
  processSequenceMode: ProcessSequenceMode,
  outOfSequenceTemplateIds: ReadonlySet<string>,
): number {
  const items = order.items || [];
  const milestones = order.milestones || [];
  const item =
    items.find((i) => (i.variantId || '') === variantId) ??
    (items.length === 1 ? items[0] : undefined);

  const templateIdPath = milestones.map((m) => m.templateId);
  const tplIndex = milestones.findIndex((m) => m.templateId === milestoneTemplateId);
  const gateIdx = findGatingPredecessorIndex(templateIdPath, tplIndex, outOfSequenceTemplateIds);
  const prevTemplateId = gateIdx >= 0 ? templateIdPath[gateIdx] : undefined;
  const milestone = milestones.find((m) => m.templateId === milestoneTemplateId);
  const seqConstrained = isProcessSequential(
    processSequenceMode,
    milestoneTemplateId,
    outOfSequenceTemplateIds,
  );

  if (!seqConstrained || gateIdx < 0) {
    if (!item) return 0;
    if (items.length === 1 && !item.variantId) {
      const completed = Number(milestone?.completedQuantity) || 0;
      return Math.max(0, (Number(item.quantity) || 0) - completed);
    }
    const completedInMilestone = sumOccupyingReportQty(milestone?.reports, variantId);
    return Math.max(0, (Number(item.quantity) || 0) - completedInMilestone);
  }

  let prevQty = 0;
  let curQty = 0;
  const vid = variantId || '';
  const variantItemQty = items
    .filter((i) => (i.variantId || '') === vid)
    .reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const orderTotalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  if (prevTemplateId) {
    const prevMs = milestones.find((m) => m.templateId === prevTemplateId);
    if (prevMs) {
      const hasVariantReports = (prevMs.reports || []).some(
        (r) => r.variantId && r.variantId !== '' && reportQtyOccupies(r.approvalStatus),
      );
      if (hasVariantReports) {
        prevQty = sumOccupyingReportQty(prevMs.reports, vid);
      } else if ((Number(prevMs.completedQuantity) || 0) > 0 && orderTotalQty > 0) {
        prevQty += Math.round(
          ((Number(prevMs.completedQuantity) || 0) * variantItemQty) / orderTotalQty,
        );
      }
    }
  }
  if (milestone) {
    const hasVariantReports = (milestone.reports || []).some(
      (r) => r.variantId && r.variantId !== '' && reportQtyOccupies(r.approvalStatus),
    );
    if (hasVariantReports) {
      curQty = sumOccupyingReportQty(milestone.reports, vid);
    } else if ((Number(milestone.completedQuantity) || 0) > 0 && orderTotalQty > 0) {
      curQty += Math.round(
        ((Number(milestone.completedQuantity) || 0) * variantItemQty) / orderTotalQty,
      );
    }
  }
  return Math.max(0, prevQty - curQty);
}

function sumOutsourceRemainingByVariant(
  prodRecords: ReportableProdRecord[],
  orderId: string,
  templateId: string,
): Record<string, number> {
  const dispatched: Record<string, number> = {};
  const received: Record<string, number> = {};
  prodRecords.forEach((r) => {
    if (r.type !== 'OUTSOURCE' || r.sourceReworkId) return;
    if (r.orderId !== orderId || r.nodeId !== templateId) return;
    const vid = r.variantId || '';
    const q = Number(r.quantity) || 0;
    if (r.status === '加工中') dispatched[vid] = (dispatched[vid] || 0) + q;
    else if (r.status === '已收回') received[vid] = (received[vid] || 0) + q;
  });
  const result: Record<string, number> = {};
  const keys = new Set([...Object.keys(dispatched), ...Object.keys(received)]);
  keys.forEach((vid) => {
    const net = (dispatched[vid] || 0) - (received[vid] || 0);
    if (net > 0) result[vid] = net;
  });
  return result;
}

function sumOutsourceRemainingAtNode(
  prodRecords: ReportableProdRecord[],
  orderId: string,
  templateId: string,
): number {
  let totalDispatched = 0;
  let totalReceived = 0;
  prodRecords.forEach((r) => {
    if (r.type !== 'OUTSOURCE' || r.sourceReworkId) return;
    if (r.orderId !== orderId || r.nodeId !== templateId) return;
    if (r.status === '加工中') totalDispatched += Number(r.quantity) || 0;
    else if (r.status === '已收回') totalReceived += Number(r.quantity) || 0;
  });
  return Math.max(0, totalDispatched - totalReceived);
}

function getReworkByVariantForReport(
  order: ReportableOrder,
  templateId: string,
  prodRecords: ReportableProdRecord[],
): Record<string, number> {
  const drMap = buildDefectiveReworkByOrderMilestone([order], prodRecords);
  const bucketId = reworkMergeBucketOrderId(order.id, [order]);
  const merged: Record<string, number> = {};
  const mergeEntry = (orderId: string) => {
    const rw = drMap.get(`${orderId}|${templateId}`)?.reworkByVariant || {};
    Object.entries(rw).forEach(([k, q]) => {
      merged[k] = (merged[k] || 0) + (Number(q) || 0);
    });
  };
  mergeEntry(bucketId);
  if (order.id !== bucketId) mergeEntry(order.id);
  return merged;
}

function getVariantMaxGood(
  order: ReportableOrder,
  milestone: ReportableMilestone,
  variantId: string,
  processSequenceMode: ProcessSequenceMode,
  outOfSequenceTemplateIds: ReadonlySet<string>,
  prodRecords: ReportableProdRecord[],
): number {
  const tid = milestone.templateId;
  const seqRemaining = getSeqRemainingForVariant(
    order,
    tid,
    variantId,
    processSequenceMode,
    outOfSequenceTemplateIds,
  );
  const defectiveForVariant = sumOccupyingDefectiveQty(milestone.reports, variantId);
  const base = Math.max(0, seqRemaining - defectiveForVariant);
  const reworkByVariant = getReworkByVariantForReport(order, tid, prodRecords);
  const outsourcedByVariant = sumOutsourceRemainingByVariant(prodRecords, order.id, tid);
  const vid = variantId || '';
  const reworkForVariant = reworkByVariant[vid] || 0;
  const outsourcedForVariant = outsourcedByVariant[vid] || 0;
  return Math.max(0, base + reworkForVariant - outsourcedForVariant);
}

function collectVariantIds(order: ReportableOrder, productVariantIds?: readonly string[]): string[] {
  const ids = new Set<string>();
  (productVariantIds ?? []).forEach((id) => ids.add(id));
  (order.items || []).forEach((it) => ids.add(it.variantId || ''));
  return [...ids];
}

function shouldUseVariantMatrix(
  order: ReportableOrder,
  useProductVariantMatrix?: boolean,
): boolean {
  return Boolean(useProductVariantMatrix) || orderUsesVariantBreakdown(order);
}

/**
 * 列表卡片「可报 N」：与报工详情页最大可报一致（含外协占用、待审占用、按规格顺控）。
 */
export function computeWorkerReportTaskDisplayRemaining(opts: {
  order: ReportableOrder;
  milestoneTemplateId: string;
  processSequenceMode: ProcessSequenceMode;
  outOfSequenceTemplateIds: ReadonlySet<string>;
  prodRecords: ReportableProdRecord[];
  /** 产品档案启用颜色尺码矩阵时与报工详情一致走规格汇总 */
  useProductVariantMatrix?: boolean;
  productVariantIds?: readonly string[];
}): number {
  const {
    order,
    milestoneTemplateId,
    processSequenceMode,
    outOfSequenceTemplateIds,
    prodRecords,
    useProductVariantMatrix,
    productVariantIds,
  } = opts;
  const milestone = order.milestones.find((m) => m.templateId === milestoneTemplateId);
  if (!milestone) return 0;

  const tid = milestoneTemplateId;
  const hintTotalQty = (order.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const idx = order.milestones.findIndex((m) => m.templateId === tid);
  let base = hintTotalQty;
  if (isProcessSequential(processSequenceMode, tid, outOfSequenceTemplateIds)) {
    const templateIds = order.milestones.map((m) => m.templateId);
    const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
    if (gateIdx >= 0) {
      base = Number(order.milestones[gateIdx]?.completedQuantity) || 0;
    }
  }

  const drMap = buildDefectiveReworkByOrderMilestone([order], prodRecords);
  const getDr = (oid: string, nodeTemplateId: string) =>
    drMap.get(`${oid}|${nodeTemplateId}`) ?? { defective: 0, rework: 0, reworkByVariant: {} };
  const bucketId = reworkMergeBucketOrderId(order.id, [order]);
  const defective = getDr(order.id, tid).defective;
  const rework = getDr(bucketId, tid).rework;
  const hintMaxReportable = Math.max(0, Math.round(base - defective + rework));
  const hintCompletedDisplay = Math.max(0, Number(milestone.completedQuantity) || 0);
  const pendingOccupied = sumPendingReportQty(milestone.reports);
  const totalOutsourcedAtNode = sumOutsourceRemainingAtNode(prodRecords, order.id, tid);
  const hintRemaining = Math.max(
    0,
    hintMaxReportable - hintCompletedDisplay - pendingOccupied - totalOutsourcedAtNode,
  );

  if (!shouldUseVariantMatrix(order, useProductVariantMatrix)) {
    return hintRemaining;
  }

  const variantIds = collectVariantIds(order, productVariantIds);
  const variantSum = variantIds.reduce((s, vid) => {
    return (
      s +
      getVariantMaxGood(
        order,
        milestone,
        vid,
        processSequenceMode,
        outOfSequenceTemplateIds,
        prodRecords,
      )
    );
  }, 0);
  return Math.max(0, Math.min(variantSum, hintRemaining));
}

/** 产品模式：产品级外协（无 orderId）在该工序的未收回净额 */
function sumProductLevelOutsourceRemainingAtNode(
  prodRecords: ReportableProdRecord[],
  productId: string,
  templateId: string,
): number {
  let dispatched = 0;
  let received = 0;
  prodRecords.forEach((r) => {
    if (r.type !== 'OUTSOURCE' || r.sourceReworkId) return;
    if (r.orderId || r.productId !== productId || r.nodeId !== templateId) return;
    if (r.status === '加工中') dispatched += Number(r.quantity) || 0;
    else if (r.status === '已收回') received += Number(r.quantity) || 0;
  });
  return Math.max(0, dispatched - received);
}

/**
 * 产品模式可报任务「可报 N」：与 Web 报工弹窗 hintRemaining 完全同口径——
 * maxReportable = productGroupMaxReportableSum（工单中心产品组卡「可报最多」）；
 * remaining = max − 已报(PMP + 里程碑 completedQuantity) − 待审(两路 PENDING) − 产品级外协净额。
 */
export function computeProductModeWorkerTaskRemaining(opts: {
  blockOrders: ReportableOrder[];
  productId: string;
  milestoneTemplateId: string;
  pmp: ReportablePmp[];
  processSequenceMode: ProcessSequenceMode;
  outOfSequenceTemplateIds: ReadonlySet<string>;
  prodRecords: ReportableProdRecord[];
}): {
  remaining: number;
  maxReportable: number;
  reported: number;
  totalQty: number;
} {
  const {
    blockOrders,
    productId,
    milestoneTemplateId,
    pmp,
    processSequenceMode,
    outOfSequenceTemplateIds,
    prodRecords,
  } = opts;
  const totalQty = Math.round(sumBlockOrderQty(blockOrders));
  const tid = milestoneTemplateId;
  const drMap = buildDefectiveReworkByOrderMilestone(blockOrders, prodRecords);
  const getDefectiveRework = (oid: string, nodeTemplateId: string) =>
    drMap.get(`${oid}|${nodeTemplateId}`) ?? { defective: 0, rework: 0, reworkByVariant: {} };
  const orderForest = blockOrders.map((o) => ({
    id: o.id,
    parentOrderId: o.parentOrderId ?? null,
  }));
  const maxReportable = productGroupMaxReportableSum(
    blockOrders,
    tid,
    productId,
    pmp,
    processSequenceMode,
    getDefectiveRework,
    undefined,
    orderForest,
    outOfSequenceTemplateIds,
  );
  const pmpRows = pmp.filter((p) => p.productId === productId && p.milestoneTemplateId === tid);
  const pmpCompleted = pmpCompletedAtTemplate(pmp, productId, tid);
  const milestoneCompleted = blockOrders.reduce((s, o) => {
    const ms = o.milestones.find((m) => m.templateId === tid);
    return s + (Number(ms?.completedQuantity) || 0);
  }, 0);
  const reported = Math.round(pmpCompleted + milestoneCompleted);
  const pendingOccupied =
    blockOrders.reduce((s, o) => {
      const ms = o.milestones.find((m) => m.templateId === tid);
      return s + sumPendingReportQty(ms?.reports);
    }, 0) + pmpRows.reduce((s, p) => s + sumPendingReportQty(p.reports), 0);
  const outsourced = sumProductLevelOutsourceRemainingAtNode(prodRecords, productId, tid);
  const remaining = Math.max(
    0,
    Math.round(maxReportable) - reported - pendingOccupied - outsourced,
  );
  return {
    remaining,
    maxReportable: Math.max(0, Math.round(maxReportable)),
    reported,
    totalQty,
  };
}
