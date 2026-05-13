import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductMilestoneProgress,
  ProcessSequenceMode,
} from '../types';
import { variantMaxGoodProductMode } from './productReportAggregates';

/** 产品维度外协：某规格在该产品+工序上净发出（加工中 − 已收回） */
export function netOutsourceDispatchedProductNodeVariant(
  records: ProductionOpRecord[],
  productId: string,
  nodeId: string,
  variantId: string,
): number {
  const vid = variantId || '';
  const rows = records.filter(
    r => r.type === 'OUTSOURCE' && !r.orderId && r.productId === productId && r.nodeId === nodeId,
  );
  const sent = rows
    .filter(r => r.status === '加工中' && (r.variantId || '') === vid)
    .reduce((s, r) => s + r.quantity, 0);
  const recv = rows
    .filter(r => r.status === '已收回' && (r.variantId || '') === vid)
    .reduce((s, r) => s + r.quantity, 0);
  return Math.max(0, sent - recv);
}

/**
 * 与 `OutsourceDispatchQuantityModal` 一致：产品块内是否走「多规格共享可委外池」
 *（无工单行/PMP/里程碑上的规格线索时，矩阵每格上限由整行 `availableQty` 分摊）。
 */
export function productOutsourceDispatchUsesAggregateVariantPool(
  blockOrders: ProductionOrder[],
  pmp: ProductMilestoneProgress[] | undefined,
  productId: string,
  nodeId: string,
  product: Product,
): boolean {
  const variantIdsInBlock = new Set<string>();
  blockOrders.forEach(o => {
    (o.items ?? []).forEach(i => {
      if ((i.quantity ?? 0) > 0 && i.variantId) variantIdsInBlock.add(i.variantId);
    });
  });
  const variantIdsFromProgress = new Set<string>();
  (pmp ?? []).forEach(row => {
    if (row.productId !== productId || row.milestoneTemplateId !== nodeId) return;
    if (row.variantId) variantIdsFromProgress.add(row.variantId);
    (row.reports ?? []).forEach(r => {
      if (r.variantId) variantIdsFromProgress.add(r.variantId);
    });
  });
  blockOrders.forEach(o => {
    const ms = o.milestones?.find(m => m.templateId === nodeId);
    (ms?.reports ?? []).forEach(r => {
      if (r.variantId) variantIdsFromProgress.add(r.variantId);
    });
  });
  const variants = product.variants ?? [];
  const unionSize = new Set([...variantIdsInBlock, ...variantIdsFromProgress]).size;
  return variants.length > 0 && unionSize === 0;
}

/**
 * 关联产品 + 颜色尺码矩阵 + 已能按规格拆分时：各规格「还可委外」上限之和。
 * 与发出录入弹窗各格「最多」相加一致，用于收紧待发清单上的 `availableQty`，避免与下一步弹窗数字打架。
 */
export function sumOutsourceableByVariantProductMatrix(
  records: ProductionOpRecord[],
  product: Product,
  nodeId: string,
  blockOrders: ProductionOrder[],
  productMilestoneProgresses: ProductMilestoneProgress[] | undefined,
  processSequenceMode: ProcessSequenceMode,
  getDr: (orderId: string, tid: string) => {
    defective: number;
    rework: number;
    reworkByVariant?: Record<string, number>;
  },
  orders?: ProductionOrder[],
): number {
  const variants = (product.variants ?? []) as ProductVariant[];
  if (variants.length === 0) return Number.POSITIVE_INFINITY;
  const milestoneNodeIds = product.milestoneNodeIds || [];
  const pmp = productMilestoneProgresses ?? [];
  const seq = processSequenceMode ?? 'free';
  const getDefectiveRework = (orderId: string, tid: string) => {
    const x = getDr(orderId, tid);
    return { defective: x.defective, rework: x.rework, reworkByVariant: x.reworkByVariant ?? {} };
  };
  let sum = 0;
  for (const v of variants) {
    const vid = (v.id || '').trim();
    if (!vid) continue;
    const maxGood = variantMaxGoodProductMode(
      vid,
      nodeId,
      product.id,
      blockOrders,
      pmp,
      seq,
      milestoneNodeIds,
      getDefectiveRework,
      orders,
    );
    const dispatched = netOutsourceDispatchedProductNodeVariant(records, product.id, nodeId, vid);
    sum += Math.max(0, maxGood - dispatched);
  }
  return sum;
}
