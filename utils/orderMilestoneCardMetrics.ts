import type { Milestone, ProcessSequenceMode } from '../types';
import { findGatingPredecessorIndex, isProcessSequential } from '../shared/processSequence';

export interface MilestoneCardMetric {
  milestone: Milestone;
  /** 产品池已报量按本工单数量占比摊回的部分（估算，仅关联产品模式非 0） */
  pmpShare: number;
  /** 小卡圆心「已报」 */
  currentCompleted: number;
  /** 小卡「可报」（已扣不良、加返工完成） */
  availableQty: number;
  /** 小卡「剩」= 可报 − 已报，可为负 */
  remaining: number;
}

export interface OrderMilestoneCardMetricsOptions {
  productionLinkMode: 'order' | 'product';
  processSequenceMode: ProcessSequenceMode;
  outOfSequenceTemplateIds: ReadonlySet<string>;
  /** 本工单下单总量 */
  orderTotalQty: number;
  /** 关联产品模式下该产品所有工单的下单总量（用于摊回比例） */
  productTotalAcrossOrders: number;
  /** 该产品在某工序上的产品池（PMP）已报合计 */
  pmpCompletedAt: (templateId: string) => number;
  /** 该工单某工序的不良与返工完成量 */
  getDefectiveRework: (templateId: string) => { defective: number; rework: number };
}

/**
 * 工单中心主列表「工序小卡」的可报 / 已报 / 剩余口径（单一事实源）。
 *
 * 抽成纯函数的原因：列表渲染与「按工序搜索时隐藏可报为 0 的标签」需要完全一致的
 * 剩余量口径，两处各算一份会漂移。同时这里一次性构造 `templateIds`，
 * 避免逐工序重复 `findIndex` / `map`。
 */
export function buildOrderMilestoneCardMetrics(
  milestones: readonly Milestone[],
  opts: OrderMilestoneCardMetricsOptions,
): MilestoneCardMetric[] {
  const {
    productionLinkMode,
    processSequenceMode,
    outOfSequenceTemplateIds,
    orderTotalQty,
    productTotalAcrossOrders,
    pmpCompletedAt,
    getDefectiveRework,
  } = opts;

  const shareRatio =
    productionLinkMode === 'product' && productTotalAcrossOrders > 0
      ? orderTotalQty / productTotalAcrossOrders
      : 0;
  const pmpShareAt = (templateId: string): number => {
    if (productionLinkMode !== 'product' || shareRatio <= 0) return 0;
    return pmpCompletedAt(templateId) * shareRatio;
  };

  const templateIds = milestones.map(m => m.templateId);

  return milestones.map((ms, idx) => {
    const pmpShare = pmpShareAt(ms.templateId);
    const currentCompleted = Math.round(ms.completedQuantity + pmpShare);
    let baseQty = orderTotalQty;
    if (isProcessSequential(processSequenceMode, ms.templateId, outOfSequenceTemplateIds)) {
      const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
      if (gateIdx >= 0) {
        const prev = milestones[gateIdx];
        baseQty = (prev?.completedQuantity ?? 0) + pmpShareAt(prev.templateId);
      }
    }
    const { defective, rework } = getDefectiveRework(ms.templateId);
    const availableQty = Math.max(0, Math.round(baseQty - defective + rework));
    return {
      milestone: ms,
      pmpShare,
      currentCompleted,
      availableQty,
      remaining: availableQty - currentCompleted,
    };
  });
}
