import type { ProductionOrder, ProductMilestoneProgress, ProcessSequenceMode } from '../types';

export function sumBlockOrderQty(orders: ProductionOrder[]): number {
  return orders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
}

export function sumVariantQtyInOrders(orders: ProductionOrder[], variantId: string): number {
  const vid = variantId || '';
  return orders.reduce((s, o) => s + o.items.filter(i => (i.variantId || '') === vid).reduce((a, i) => a + i.quantity, 0), 0);
}

export function pmpCompletedAtTemplate(
  pmp: ProductMilestoneProgress[],
  productId: string,
  templateId: string
): number {
  return pmp
    .filter(p => p.productId === productId && p.milestoneTemplateId === templateId)
    .reduce((s, p) => s + (p.completedQuantity ?? 0), 0);
}

export function pmpCompletedAtTemplateVariant(
  pmp: ProductMilestoneProgress[],
  productId: string,
  templateId: string,
  variantId: string
): number {
  const vid = variantId || '';
  return pmp
    .filter(p => p.productId === productId && p.milestoneTemplateId === templateId && (p.variantId ?? '') === vid)
    .reduce((s, p) => s + (p.completedQuantity ?? 0), 0);
}

/**
 * 单工单在某工序的「可报最多」= 基数 - 本工序不良 + 本工序返工完成（与工单中心一致）。
 * 关联产品 + 顺序模式：基数 = 上一道工序完成量——优先用该单里程碑上的完成数；否则按本单数量占同产品工单块的比例分摊产品报工中上一道的完成总量（与关联工单「上道完成限制本道」一致）。
 */
export function orderMaxReportableAtTemplateProductAware(
  order: ProductionOrder,
  templateId: string,
  args: {
    processSequenceMode: ProcessSequenceMode;
    productId: string;
    pmp: ProductMilestoneProgress[];
    blockOrders: ProductionOrder[];
    defective: number;
    rework: number;
  }
): number {
  const { processSequenceMode, productId, pmp, blockOrders, defective, rework } = args;
  const idx = order.milestones.findIndex(m => m.templateId === templateId);
  if (idx < 0) return 0;
  const orderQty = order.items.reduce((s, i) => s + i.quantity, 0);
  let baseQty = orderQty;
  if (processSequenceMode === 'sequential' && idx > 0) {
    const prevMs = order.milestones[idx - 1];
    const prevTid = prevMs.templateId;
    const blockQty = sumBlockOrderQty(blockOrders);
    const pmpPrevTotal = pmpCompletedAtTemplate(pmp, productId, prevTid);
    const fromMilestone = prevMs.completedQuantity ?? 0;
    if (fromMilestone > 0) {
      baseQty = Math.min(orderQty, fromMilestone);
    } else if (blockQty > 0) {
      baseQty = (orderQty * pmpPrevTotal) / blockQty;
    } else {
      baseQty = 0;
    }
  }
  return Math.max(0, baseQty - defective + rework);
}

function pmpDefectiveTotalAtTemplate(pmp: ProductMilestoneProgress[], productId: string, templateId: string): number {
  return pmp
    .filter(p => p.productId === productId && p.milestoneTemplateId === templateId)
    .flatMap(p => p.reports || [])
    .reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
}

/** 产品卡片：工序可报最多合计（非顺序模式或需按单分摊不良时使用） */
export function productGroupMaxReportableSum(
  blockOrders: ProductionOrder[],
  templateId: string,
  productId: string,
  pmp: ProductMilestoneProgress[],
  processSequenceMode: ProcessSequenceMode,
  getDefectiveRework: (orderId: string, tid: string) => { defective: number; rework: number }
): number {
  let sum = blockOrders.reduce((acc, o) => {
    const { defective, rework } = getDefectiveRework(o.id, templateId);
    return (
      acc +
      orderMaxReportableAtTemplateProductAware(o, templateId, {
        processSequenceMode,
        productId,
        pmp,
        blockOrders,
        defective,
        rework
      })
    );
  }, 0);
  const pmpDef = pmpDefectiveTotalAtTemplate(pmp, productId, templateId);
  const mileDef = blockOrders.reduce((s, o) => s + getDefectiveRework(o.id, templateId).defective, 0);
  /** 件数展示为整数，避免顺序分摊出现 337.835… */
  return Math.max(0, Math.round(sum - Math.max(0, pmpDef - mileDef)));
}

/** 颜色尺码：本规格在本工序「还可报良品」上限 = 可报最多(规格) - 本工序该规格已报良品 + 返工（规格）；顺序模式下可报基数 = 上一道该规格在产品报工中的完成量 */
export function variantMaxGoodProductMode(
  variantId: string,
  templateId: string,
  productId: string,
  blockOrders: ProductionOrder[],
  pmp: ProductMilestoneProgress[],
  processSequenceMode: ProcessSequenceMode,
  milestoneNodeIds: string[],
  getDefectiveRework: (orderId: string, tid: string) => { defective: number; rework: number; reworkByVariant: Record<string, number> }
): number {
  const tid = templateId;
  const idx = milestoneNodeIds.indexOf(tid);
  const Qv = sumVariantQtyInOrders(blockOrders, variantId);
  const curDone = pmpCompletedAtTemplateVariant(pmp, productId, tid, variantId);
  let baseV = Qv;
  if (processSequenceMode === 'sequential' && idx > 0) {
    const prevTid = milestoneNodeIds[idx - 1];
    baseV = pmpCompletedAtTemplateVariant(pmp, productId, prevTid, variantId);
  }
  const defectiveFromPmp = pmp
    .filter(p => p.productId === productId && p.milestoneTemplateId === tid && (p.variantId ?? '') === variantId)
    .flatMap(p => p.reports || [])
    .reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
  let defectiveV = defectiveFromPmp;
  if (defectiveV === 0) {
    blockOrders.forEach(o => {
      const ms = o.milestones.find(m => m.templateId === tid);
      defectiveV += (ms?.reports || [])
        .filter(r => (r.variantId || '') === variantId)
        .reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
    });
  }
  let reworkV = 0;
  blockOrders.forEach(o => {
    const dr = getDefectiveRework(o.id, tid);
    reworkV += dr.reworkByVariant[variantId] ?? 0;
  });
  const availableV = Math.max(0, baseV - defectiveV + reworkV);
  return Math.max(0, availableV - curDone);
}
