import type {
  ProcessSequenceMode,
  ProductionOpRecord,
  ProductionOrder,
  ProductMilestoneProgress,
} from '../types';
import { MilestoneStatus } from '../types';
import { buildDefectiveReworkByOrderMilestone } from './defectiveReworkByOrderMilestone';
import { findGatingPredecessorIndex, isProcessSequential } from '../shared/processSequence';

export type OrderMilestoneStripItem = {
  milestoneId: string;
  templateId: string;
  name: string;
  completed: number;
  availableQty: number;
  remaining: number;
  remainingDisplay: number;
  isCompleted: boolean;
  tooltip: string;
};

function buildOutsourceNetMaps(prodRecords: ProductionOpRecord[]) {
  const outsourceNetByOrderTpl = new Map<string, number>();
  const outsourceNetByProductTpl = new Map<string, number>();
  for (const r of prodRecords) {
    if (r.type !== 'OUTSOURCE' || r.sourceReworkId || !r.nodeId) continue;
    if (r.orderId) {
      const k = `${r.orderId}|${r.nodeId}`;
      const cur = outsourceNetByOrderTpl.get(k) ?? 0;
      if (r.status === '加工中') outsourceNetByOrderTpl.set(k, cur + (r.quantity ?? 0));
      else if (r.status === '已收回') outsourceNetByOrderTpl.set(k, cur - (r.quantity ?? 0));
    } else if (r.productId) {
      const k = `${r.productId}|${r.nodeId}`;
      const cur = outsourceNetByProductTpl.get(k) ?? 0;
      if (r.status === '加工中') outsourceNetByProductTpl.set(k, cur + (r.quantity ?? 0));
      else if (r.status === '已收回') outsourceNetByProductTpl.set(k, cur - (r.quantity ?? 0));
    }
  }
  for (const [k, v] of outsourceNetByOrderTpl) outsourceNetByOrderTpl.set(k, Math.max(0, v));
  for (const [k, v] of outsourceNetByProductTpl) outsourceNetByProductTpl.set(k, Math.max(0, v));
  return { outsourceNetByOrderTpl, outsourceNetByProductTpl };
}

/** 与工单中心列表工序小卡同口径：可报 / 已报 / 剩余 */
export function buildOrderMilestoneStripItems(params: {
  order: ProductionOrder;
  orders: ProductionOrder[];
  prodRecords: ProductionOpRecord[];
  productionLinkMode?: 'order' | 'product';
  processSequenceMode: ProcessSequenceMode;
  outOfSequenceTemplateIds: Set<string>;
  allowExceedMaxReportQty?: boolean;
  productMilestoneProgresses?: ProductMilestoneProgress[];
}): OrderMilestoneStripItem[] {
  const {
    order,
    orders,
    prodRecords,
    productionLinkMode = 'order',
    processSequenceMode,
    outOfSequenceTemplateIds,
    allowExceedMaxReportQty = false,
    productMilestoneProgresses = [],
  } = params;

  if (!order.milestones?.length) return [];

  const orderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  const defectiveAndRework = buildDefectiveReworkByOrderMilestone(orders, prodRecords);
  const getDefectiveRework = (orderId: string, templateId: string) =>
    defectiveAndRework.get(`${orderId}|${templateId}`) ?? {
      defective: 0,
      rework: 0,
      reworkByVariant: {} as Record<string, number>,
    };

  const pmpCompletedByProductTpl = new Map<string, number>();
  productMilestoneProgresses.forEach(p => {
    const k = `${p.productId}|${p.milestoneTemplateId}`;
    pmpCompletedByProductTpl.set(k, (pmpCompletedByProductTpl.get(k) ?? 0) + (p.completedQuantity ?? 0));
  });

  const productOrdersTotalQtyByPid = new Map<string, number>();
  for (const o of orders) {
    const total = o.items.reduce((s, i) => s + i.quantity, 0);
    productOrdersTotalQtyByPid.set(o.productId, (productOrdersTotalQtyByPid.get(o.productId) ?? 0) + total);
  }

  const { outsourceNetByOrderTpl, outsourceNetByProductTpl } = buildOutsourceNetMaps(prodRecords);

  const productTotalAcrossOrders =
    productionLinkMode === 'product'
      ? (productOrdersTotalQtyByPid.get(order.productId) ?? orderTotalQty)
      : orderTotalQty;
  const shareRatio =
    productionLinkMode === 'product' && productTotalAcrossOrders > 0
      ? orderTotalQty / productTotalAcrossOrders
      : 0;

  const pmpShareAt = (templateId: string) => {
    if (productionLinkMode !== 'product' || shareRatio <= 0) return 0;
    const total = pmpCompletedByProductTpl.get(`${order.productId}|${templateId}`) ?? 0;
    return total * shareRatio;
  };

  return order.milestones.map(ms => {
    const isCompleted = ms.status === MilestoneStatus.COMPLETED;
    const pmpShareCur = pmpShareAt(ms.templateId);
    const currentCompletedRaw = ms.completedQuantity + pmpShareCur;
    const currentCompleted = Math.round(currentCompletedRaw);

    let baseQty = orderTotalQty;
    if (isProcessSequential(processSequenceMode, ms.templateId, outOfSequenceTemplateIds)) {
      const idx = order.milestones.findIndex(m => m.id === ms.id);
      const templateIds = order.milestones.map(m => m.templateId);
      const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
      if (gateIdx >= 0) {
        const prev = order.milestones[gateIdx];
        const pmpSharePrev = pmpShareAt(prev.templateId);
        baseQty = (prev?.completedQuantity ?? 0) + pmpSharePrev;
      }
    }

    const { defective, rework } = getDefectiveRework(order.id, ms.templateId);
    const availableQty = Math.max(0, Math.round(baseQty - defective + rework));
    const remaining = availableQty - currentCompleted;
    const remainingDisplay = allowExceedMaxReportQty ? Math.round(remaining) : Math.max(0, Math.round(remaining));

    const outsourceShareCurRaw =
      (outsourceNetByOrderTpl.get(`${order.id}|${ms.templateId}`) ?? 0) +
      (productionLinkMode === 'product'
        ? (outsourceNetByProductTpl.get(`${order.productId}|${ms.templateId}`) ?? 0) * shareRatio
        : 0);
    const outsourceShareCur = Math.max(0, Math.round(outsourceShareCurRaw));

    const tooltipParts = [
      `工序「${ms.name}」`,
      `可报 ${availableQty} 件（已扣不良、加返工完成）`,
      `已报 ${currentCompleted}`,
      `剩 ${remaining} 件`,
    ];
    if (outsourceShareCur > 0) tooltipParts.push(`外协剩余 ${outsourceShareCur} 件`);
    let tooltip = tooltipParts.join(' · ');
    if (
      productionLinkMode === 'product' &&
      (pmpShareCur > 0 || (outsourceNetByProductTpl.get(`${order.productId}|${ms.templateId}`) ?? 0) > 0)
    ) {
      tooltip = `${tooltip}\n（产品池上的已报与外协未收回按工单数量比例摊回，为估算值；精确数字请查看产品维度详情）`;
    }

    return {
      milestoneId: ms.id,
      templateId: ms.templateId,
      name: ms.name,
      completed: currentCompleted,
      availableQty,
      remaining,
      remainingDisplay,
      isCompleted,
      tooltip,
    };
  });
}
