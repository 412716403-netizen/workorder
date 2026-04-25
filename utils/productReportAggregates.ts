import type { ProductionOrder, ProductMilestoneProgress, ProcessSequenceMode } from '../types';
import { reworkMergeBucketOrderId } from './reworkMergeBucketOrderId';

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
  templateId: string,
  pmpByKey?: Map<string, number>,
): number {
  if (pmpByKey) return pmpByKey.get(`${productId}|${templateId}`) ?? 0;
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
 * 同一产品 + 工序模板下，PMP（产品关联报工）与 工单里程碑（关联工单报工 / 外协收回计入）的「完成量」合并汇总。
 * 关联产品模式下，一次报工会写入 PMP；但外协收回且带 orderId 时会累加到工单里程碑的 completedQuantity——
 * 这两条路径互不覆盖，任何一处只看 PMP 或只看里程碑都会漏报。本函数将两路完成量求和。
 */
export function combinedCompletedAtTemplate(
  blockOrders: ProductionOrder[],
  pmp: ProductMilestoneProgress[],
  productId: string,
  templateId: string,
): number {
  const pmpTotal = pmp
    .filter(p => p.productId === productId && p.milestoneTemplateId === templateId)
    .reduce((s, p) => s + (p.completedQuantity ?? 0), 0);
  const mileTotal = blockOrders.reduce((s, o) => {
    const m = o.milestones.find(x => x.templateId === templateId);
    return s + (m?.completedQuantity ?? 0);
  }, 0);
  return pmpTotal + mileTotal;
}

/** 同 {@link combinedCompletedAtTemplate}，但按规格（variantId）拆分结果。 */
export function combinedCompletedByVariantAtTemplate(
  blockOrders: ProductionOrder[],
  pmp: ProductMilestoneProgress[],
  productId: string,
  templateId: string,
): Record<string, number> {
  const byVariant: Record<string, number> = {};
  const add = (vid: string, q: number) => {
    if (!(q > 0)) return;
    const key = vid || '';
    byVariant[key] = (byVariant[key] ?? 0) + q;
  };
  pmp
    .filter(p => p.productId === productId && p.milestoneTemplateId === templateId)
    .forEach(row => {
      const reps = row.reports;
      if (reps && reps.length > 0) {
        reps.forEach(r => add(r.variantId ?? row.variantId ?? '', Number(r.quantity) || 0));
      } else {
        add(row.variantId ?? '', Number(row.completedQuantity) || 0);
      }
    });
  for (const o of blockOrders) {
    const m = o.milestones.find(x => x.templateId === templateId);
    if (!m) continue;
    const reps = m.reports;
    if (reps && reps.length > 0) {
      reps.forEach(r => add((r as any).variantId ?? '', Number(r.quantity) || 0));
    } else {
      // 里程碑 completedQuantity 没有按规格拆分的 reports 时，按工单 items 数量占比分摊
      const total = m.completedQuantity ?? 0;
      if (total <= 0) continue;
      const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
      if (totalQty <= 0) { add('', total); continue; }
      let rem = total;
      o.items.forEach((item, idx) => {
        const part = idx === o.items.length - 1 ? rem : Math.floor((total * item.quantity) / totalQty);
        rem -= part;
        add(item.variantId ?? '', part);
      });
    }
  }
  return byVariant;
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
    pmpByKey?: Map<string, number>;
  }
): number {
  const { processSequenceMode, productId, pmp, blockOrders, defective, rework, pmpByKey } = args;
  const idx = order.milestones.findIndex(m => m.templateId === templateId);
  if (idx < 0) return 0;
  const orderQty = order.items.reduce((s, i) => s + i.quantity, 0);
  let baseQty = orderQty;
  if (processSequenceMode === 'sequential' && idx > 0) {
    const prevMs = order.milestones[idx - 1];
    const prevTid = prevMs.templateId;
    const blockQty = sumBlockOrderQty(blockOrders);
    const pmpPrevTotal = pmpCompletedAtTemplate(pmp, productId, prevTid, pmpByKey);
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

/** 产品报工（PMP）在本工序记录的不良合计；关联产品模式下与工单里程碑不良分开统计 */
export function pmpDefectiveTotalAtTemplate(
  pmp: ProductMilestoneProgress[],
  productId: string,
  templateId: string,
): number {
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
  getDefectiveRework: (orderId: string, tid: string) => { defective: number; rework: number },
  pmpByKey?: Map<string, number>,
  /** 传入后按父单桶分摊返工完成量（与子工单 map 键对齐） */
  orderForest?: Pick<ProductionOrder, 'id' | 'parentOrderId'>[],
): number {
  const qtyByBucket = new Map<string, number>();
  if (orderForest?.length) {
    for (const o of blockOrders) {
      const q = o.items.reduce((s, i) => s + i.quantity, 0);
      const b = reworkMergeBucketOrderId(o.id, orderForest);
      qtyByBucket.set(b, (qtyByBucket.get(b) ?? 0) + q);
    }
  }
  let sum = blockOrders.reduce((acc, o) => {
    const { defective } = getDefectiveRework(o.id, templateId);
    let rework = getDefectiveRework(o.id, templateId).rework;
    if (orderForest?.length) {
      const b = reworkMergeBucketOrderId(o.id, orderForest);
      const bucketRework = getDefectiveRework(b, templateId).rework;
      const tot = qtyByBucket.get(b) ?? 0;
      const qo = o.items.reduce((s, i) => s + i.quantity, 0);
      rework = tot > 0 ? (bucketRework * qo) / tot : 0;
    }
    return (
      acc +
      orderMaxReportableAtTemplateProductAware(o, templateId, {
        processSequenceMode,
        productId,
        pmp,
        blockOrders,
        defective,
        rework,
        pmpByKey
      })
    );
  }, 0);
  const pmpDef = pmpDefectiveTotalAtTemplate(pmp, productId, templateId);
  const mileDef = blockOrders.reduce((s, o) => s + getDefectiveRework(o.id, templateId).defective, 0);
  return Math.max(0, Math.round(sum - Math.max(0, pmpDef - mileDef)));
}

/**
 * PMP + 里程碑双通道：某规格在某工序的合并完成量。
 * 与 {@link combinedCompletedByVariantAtTemplate} 逻辑一致，但只算单个 variantId，避免全量遍历。
 */
function combinedCompletedAtTemplateVariant(
  blockOrders: ProductionOrder[],
  pmp: ProductMilestoneProgress[],
  productId: string,
  templateId: string,
  variantId: string,
): number {
  const vid = variantId || '';
  const pmpVal = pmpCompletedAtTemplateVariant(pmp, productId, templateId, variantId);
  let mileVal = 0;
  for (const o of blockOrders) {
    const m = o.milestones.find(x => x.templateId === templateId);
    if (!m) continue;
    const reps = m.reports;
    if (reps && reps.length > 0) {
      mileVal += reps
        .filter(r => ((r as any).variantId ?? '') === vid)
        .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    } else {
      const total = m.completedQuantity ?? 0;
      if (total <= 0) continue;
      const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
      if (totalQty <= 0) { if (vid === '') mileVal += total; continue; }
      const matched = o.items.filter(i => (i.variantId ?? '') === vid);
      const matchedQty = matched.reduce((s, i) => s + i.quantity, 0);
      mileVal += Math.round((total * matchedQty) / totalQty);
    }
  }
  return pmpVal + mileVal;
}

/** 颜色尺码：本规格在本工序「还可报良品」上限 = 可报最多(规格) - 本工序该规格已报良品 + 返工（规格）；顺序模式下可报基数 = 上一道该规格的合并完成量（PMP + 里程碑） */
export function variantMaxGoodProductMode(
  variantId: string,
  templateId: string,
  productId: string,
  blockOrders: ProductionOrder[],
  pmp: ProductMilestoneProgress[],
  processSequenceMode: ProcessSequenceMode,
  milestoneNodeIds: string[],
  getDefectiveRework: (orderId: string, tid: string) => { defective: number; rework: number; reworkByVariant: Record<string, number> },
  orderForest?: Pick<ProductionOrder, 'id' | 'parentOrderId'>[],
): number {
  const tid = templateId;
  const idx = milestoneNodeIds.indexOf(tid);
  const Qv = sumVariantQtyInOrders(blockOrders, variantId);
  const curDone = combinedCompletedAtTemplateVariant(blockOrders, pmp, productId, tid, variantId);
  let baseV = Qv;
  if (processSequenceMode === 'sequential' && idx > 0) {
    const prevTid = milestoneNodeIds[idx - 1];
    baseV = combinedCompletedAtTemplateVariant(blockOrders, pmp, productId, prevTid, variantId);
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
  const vidKey = variantId || '';
  let reworkV = 0;
  if (orderForest?.length) {
    const buckets = new Set(blockOrders.map(o => reworkMergeBucketOrderId(o.id, orderForest)));
    buckets.forEach(bid => {
      reworkV += getDefectiveRework(bid, tid).reworkByVariant[vidKey] ?? 0;
    });
  } else {
    blockOrders.forEach(o => {
      reworkV += getDefectiveRework(o.id, tid).reworkByVariant[vidKey] ?? 0;
    });
  }
  const availableV = Math.max(0, baseV - defectiveV + reworkV);
  return Math.max(0, availableV - curDone);
}
