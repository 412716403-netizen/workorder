import type { ProductionOrder, ProductMilestoneProgress, ProcessSequenceMode } from '../types';
import {
  sumBlockOrderQty,
  pmpCompletedAtTemplate,
  pmpDefectiveTotalAtTemplate,
  orderMaxReportableAtTemplateProductAware,
  productGroupMaxReportableSum,
  reworkMergeBucketOrderId,
} from '../shared/orderReportableAggregates';
import { isProcessSequential, findGatingPredecessorIndex } from '../shared/processSequence';

export { sumBlockOrderQty, pmpCompletedAtTemplate, pmpDefectiveTotalAtTemplate, reworkMergeBucketOrderId, orderMaxReportableAtTemplateProductAware, productGroupMaxReportableSum };

export function sumVariantQtyInOrders(orders: ProductionOrder[], variantId: string): number {
  const vid = variantId || '';
  return orders.reduce((s, o) => s + o.items.filter(i => (i.variantId || '') === vid).reduce((a, i) => a + i.quantity, 0), 0);
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
 *
 * 实现上等于 {@link combinedCompletedByVariantAtTemplate} 各规格数量之和，与
 * `variantMaxGoodProductMode` / 外协录入弹窗「最多」使用的按规格口径一致；
 * 避免里程碑上 aggregate `completedQuantity` 与 `reports` 明细不一致时出现待发清单与录入页数量差。
 */
export function combinedCompletedAtTemplate(
  blockOrders: ProductionOrder[],
  pmp: ProductMilestoneProgress[],
  productId: string,
  templateId: string,
): number {
  const byVariant = combinedCompletedByVariantAtTemplate(blockOrders, pmp, productId, templateId);
  return Object.values(byVariant).reduce((s, n) => s + n, 0);
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
 * PMP + 里程碑双通道：某规格在某工序的合并完成量。
 * 与 {@link combinedCompletedByVariantAtTemplate} 单键结果一致，供 `variantMaxGoodProductMode` 使用。
 */
function combinedCompletedAtTemplateVariant(
  blockOrders: ProductionOrder[],
  pmp: ProductMilestoneProgress[],
  productId: string,
  templateId: string,
  variantId: string,
): number {
  const vid = variantId || '';
  const byVariant = combinedCompletedByVariantAtTemplate(blockOrders, pmp, productId, templateId);
  return byVariant[vid] ?? 0;
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
  outOfSequenceTemplateIds?: ReadonlySet<string>,
): number {
  const tid = templateId;
  const idx = milestoneNodeIds.indexOf(tid);
  const Qv = sumVariantQtyInOrders(blockOrders, variantId);
  const curDone = combinedCompletedAtTemplateVariant(blockOrders, pmp, productId, tid, variantId);
  let baseV = Qv;
  if (isProcessSequential(processSequenceMode, tid, outOfSequenceTemplateIds)) {
    const gateIdx = findGatingPredecessorIndex(milestoneNodeIds, idx, outOfSequenceTemplateIds);
    if (gateIdx >= 0) {
      const prevTid = milestoneNodeIds[gateIdx];
      baseV = combinedCompletedAtTemplateVariant(blockOrders, pmp, productId, prevTid, variantId);
    }
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
