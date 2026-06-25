/**
 * 报工弹窗：按产品维度的可报余量 / 外协 / hint 派生计算。
 */
import type {
  ProductionOrder,
  ProductionOpRecord,
  ProductMilestoneProgress,
  ProcessSequenceMode,
} from '../types';
import {
  pmpCompletedAtTemplate,
  pmpDefectiveTotalAtTemplate,
  productGroupMaxReportableSum,
  combinedCompletedAtTemplate,
} from './productReportAggregates';
import { findGatingPredecessorIndex, isProcessSequential } from '../shared/processSequence';

export interface ReportRowDerivationsInput {
  productId: string;
  milestoneTemplateId: string;
  productionLinkMode: 'order' | 'product';
  processSequenceMode: ProcessSequenceMode;
  outOfSequenceTemplateIds: ReadonlySet<string>;
  orders: ProductionOrder[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  prodRecords: ProductionOpRecord[];
  getDefectiveRework: (orderId: string, templateId: string) => {
    defective: number;
    rework: number;
    reworkByVariant: Record<string, number>;
  };
  reworkMergeBucketOrderId: (orderId: string, orders: ProductionOrder[]) => string;
  productTotalQty?: number;
  productCompletedQty?: number;
  productMaxReportableQty?: number;
}

export interface ReportRowDerivations {
  ordersInModal: ProductionOrder[];
  orderIdsInModal: string[];
  hintTotalQty: number;
  hintMaxReportable: number;
  hintCompletedDisplay: number;
  hintRemaining: number;
  totalOutsourcedAtNode: number;
  outsourcedByVariantId: Record<string, number>;
  effectiveRemainingForModal: number;
  defectiveQtyForHint: number;
  totalRework: number;
  totalCompleted: number;
  totalBase: number;
}

export function resolveOrdersForProductAtTemplate(
  orders: ProductionOrder[],
  productId: string,
  milestoneTemplateId: string,
  anchorOrderId?: string,
): ProductionOrder[] {
  const matched = orders.filter(
    o => o.productId === productId && o.milestones.some(m => m.templateId === milestoneTemplateId),
  );
  if (matched.length === 0) return [];
  if (anchorOrderId) {
    const anchor = matched.find(o => o.id === anchorOrderId);
    if (anchor) return [anchor, ...matched.filter(o => o.id !== anchorOrderId)];
  }
  return matched;
}

export function productHasMilestoneTemplate(
  productId: string,
  milestoneTemplateId: string,
  orders: ProductionOrder[],
  productionLinkMode: 'order' | 'product',
  productMilestoneNodeIds?: string[],
): boolean {
  if (productionLinkMode === 'product') {
    return (productMilestoneNodeIds ?? []).includes(milestoneTemplateId);
  }
  return orders.some(
    o => o.productId === productId && o.milestones.some(m => m.templateId === milestoneTemplateId),
  );
}

export function computeReportRowDerivations(input: ReportRowDerivationsInput): ReportRowDerivations {
  const {
    productId,
    milestoneTemplateId,
    productionLinkMode,
    processSequenceMode,
    outOfSequenceTemplateIds,
    orders,
    productMilestoneProgresses,
    prodRecords,
    getDefectiveRework,
    reworkMergeBucketOrderId,
    productTotalQty,
    productCompletedQty,
    productMaxReportableQty,
  } = input;

  const ordersInModal = resolveOrdersForProductAtTemplate(orders, productId, milestoneTemplateId);
  const orderIdsInModal = ordersInModal.map(o => o.id);
  const tid = milestoneTemplateId;
  const useProductPmp = productionLinkMode === 'product' && productMilestoneProgresses.length > 0;

  const totalBase = useProductPmp
    ? productGroupMaxReportableSum(
        ordersInModal,
        tid,
        productId,
        productMilestoneProgresses,
        processSequenceMode,
        (oid, t) => getDefectiveRework(oid, t),
        undefined,
        orders,
        outOfSequenceTemplateIds,
      )
    : isProcessSequential(processSequenceMode, tid, outOfSequenceTemplateIds)
      ? ordersInModal.reduce((s, o) => {
          const idx = o.milestones.findIndex(m => m.templateId === tid);
          const templateIds = o.milestones.map(m => m.templateId);
          const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
          if (gateIdx < 0) return s + o.items.reduce((a, i) => a + i.quantity, 0);
          const prev = o.milestones[gateIdx];
          return s + (prev?.completedQuantity ?? 0);
        }, 0)
      : ordersInModal.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);

  const totalDefective = ordersInModal.reduce((s, o) => s + getDefectiveRework(o.id, tid).defective, 0);
  const pmpDefectiveAtNode = useProductPmp ? pmpDefectiveTotalAtTemplate(productMilestoneProgresses, productId, tid) : 0;
  const defectiveQtyForHint = useProductPmp ? Math.max(pmpDefectiveAtNode, totalDefective) : totalDefective;
  const totalRework = [...new Set(ordersInModal.map(o => reworkMergeBucketOrderId(o.id, orders)))].reduce<number>(
    (s, bid) => s + getDefectiveRework(bid as string, tid).rework,
    0,
  );
  const totalCompleted = useProductPmp
    ? combinedCompletedAtTemplate(ordersInModal, productMilestoneProgresses, productId, tid)
    : ordersInModal.reduce((s, o) => s + (o.milestones.find(m => m.templateId === tid)?.completedQuantity ?? 0), 0);

  const outsourceFilter = useProductPmp
    ? (r: ProductionOpRecord) =>
        r.type === 'OUTSOURCE' && !r.sourceReworkId && !r.orderId && r.productId === productId && r.nodeId === tid
    : (r: ProductionOpRecord) =>
        r.type === 'OUTSOURCE' &&
        !r.sourceReworkId &&
        r.nodeId === tid &&
        orderIdsInModal.includes(r.orderId ?? '');

  const outsourceDispatchedByVariant: Record<string, number> = {};
  const outsourceReceivedByVariant: Record<string, number> = {};
  let totalDispatched = 0;
  let totalReceived = 0;
  prodRecords.filter(outsourceFilter).forEach(r => {
    const vid = r.variantId ?? '';
    if (r.status === '加工中') {
      totalDispatched += r.quantity ?? 0;
      outsourceDispatchedByVariant[vid] = (outsourceDispatchedByVariant[vid] ?? 0) + (r.quantity ?? 0);
    } else if (r.status === '已收回') {
      totalReceived += r.quantity ?? 0;
      outsourceReceivedByVariant[vid] = (outsourceReceivedByVariant[vid] ?? 0) + (r.quantity ?? 0);
    }
  });
  const totalOutsourcedAtNode = Math.max(0, totalDispatched - totalReceived);
  const outsourcedByVariantId: Record<string, number> = {};
  for (const vid of new Set([...Object.keys(outsourceDispatchedByVariant), ...Object.keys(outsourceReceivedByVariant)])) {
    const net = (outsourceDispatchedByVariant[vid] ?? 0) - (outsourceReceivedByVariant[vid] ?? 0);
    if (net > 0) outsourcedByVariantId[vid] = net;
  }

  const effectiveRemainingForModal = useProductPmp
    ? Math.max(0, totalBase - totalCompleted - totalOutsourcedAtNode)
    : Math.max(0, totalBase - totalDefective + totalRework - totalCompleted - totalOutsourcedAtNode);

  const hintTotalQty =
    productTotalQty ?? ordersInModal.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
  const hintMaxReportableRaw =
    productMaxReportableQty ??
    (useProductPmp
      ? productGroupMaxReportableSum(
          ordersInModal,
          tid,
          productId,
          productMilestoneProgresses,
          processSequenceMode,
          (oid, t) => getDefectiveRework(oid, t),
          undefined,
          orders,
          outOfSequenceTemplateIds,
        )
      : ordersInModal.reduce((s, o) => {
          const idx = o.milestones.findIndex(m => m.templateId === tid);
          let base = o.items.reduce((a, i) => a + i.quantity, 0);
          if (isProcessSequential(processSequenceMode, tid, outOfSequenceTemplateIds)) {
            const templateIds = o.milestones.map(m => m.templateId);
            const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
            if (gateIdx >= 0) {
              base = o.milestones[gateIdx]?.completedQuantity ?? 0;
            }
          }
          const { defective, rework } = getDefectiveRework(o.id, tid);
          return s + Math.max(0, base - defective + rework);
        }, 0));
  const hintMaxReportable = Math.max(0, Math.round(Number(hintMaxReportableRaw) || 0));
  const hintCompletedDisplay = productCompletedQty ?? totalCompleted;
  const hintRemaining = Math.max(0, hintMaxReportable - hintCompletedDisplay - totalOutsourcedAtNode);

  return {
    ordersInModal,
    orderIdsInModal,
    hintTotalQty,
    hintMaxReportable,
    hintCompletedDisplay,
    hintRemaining,
    totalOutsourcedAtNode,
    outsourcedByVariantId,
    effectiveRemainingForModal,
    defectiveQtyForHint,
    totalRework,
    totalCompleted,
    totalBase,
  };
}

export function resolveTargetOrderForReport(
  orders: ProductionOrder[],
  productId: string,
  milestoneTemplateId: string,
  variantId?: string,
  preferredOrderId?: string,
): { order: ProductionOrder; milestoneId: string } | null {
  const candidates = resolveOrdersForProductAtTemplate(orders, productId, milestoneTemplateId, preferredOrderId);
  if (candidates.length === 0) return null;
  if (variantId) {
    const withVariant = candidates.find(o => o.items.some(i => i.variantId === variantId));
    const order = withVariant ?? candidates[0]!;
    const ms = order.milestones.find(m => m.templateId === milestoneTemplateId);
    if (!ms) return null;
    return { order, milestoneId: ms.id };
  }
  const order = candidates[0]!;
  const ms = order.milestones.find(m => m.templateId === milestoneTemplateId);
  if (!ms) return null;
  return { order, milestoneId: ms.id };
}
