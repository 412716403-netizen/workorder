import type { ProductionOrder, ProductMilestoneProgress } from '../types';

/**
 * 关联产品模式下生成返工/报损：按各主工单在「来源工序」的不良占比拆分数量，
 * 使每条 REWORK/SCRAP 带 orderId，与关联工单一致，便于返工报工与工单中心可报数量回灌。
 */
export function splitQtyBySourceDefectiveAcrossParentOrders(
  productId: string,
  sourceTemplateId: string,
  parents: ProductionOrder[],
  pmp: ProductMilestoneProgress[],
  qtyByVariant: Record<string, number>
): { orderId: string; variantId?: string; quantity: number }[] {
  const out: { orderId: string; variantId?: string; quantity: number }[] = [];
  if (parents.length === 0) return out;

  const variantKeys = Object.keys(qtyByVariant).filter(k => (qtyByVariant[k] ?? 0) > 0);
  for (const vid of variantKeys) {
    const totalQ = qtyByVariant[vid] ?? 0;
    if (totalQ <= 0) continue;

    const weights = parents.map(o => {
      const ms = o.milestones.find(m => m.templateId === sourceTemplateId);
      return (ms?.reports || [])
        .filter(r => (r.variantId || '') === vid)
        .reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
    });
    const pmpDef = pmp
      .filter(p => p.productId === productId && p.milestoneTemplateId === sourceTemplateId && (p.variantId || '') === vid)
      .flatMap(p => p.reports || [])
      .reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
    let sumW = weights.reduce((a, b) => a + b, 0);
    if (sumW === 0 && pmpDef > 0) {
      weights.splice(0, weights.length, ...parents.map(() => 1));
      sumW = parents.length;
    }
    if (sumW === 0) {
      const n = parents.length;
      const base = Math.floor(totalQ / n);
      let rem = totalQ - base * n;
      parents.forEach((o, i) => {
        const q = base + (i < rem ? 1 : 0);
        if (q > 0) out.push({ orderId: o.id, variantId: vid || undefined, quantity: q });
      });
      continue;
    }
    const rawParts = weights.map(w => (totalQ * w) / sumW);
    const floors = rawParts.map(x => Math.floor(x));
    let rem = totalQ - floors.reduce((a, b) => a + b, 0);
    const fracIdx = rawParts.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f);
    for (let k = 0; k < rem; k++) floors[fracIdx[k % fracIdx.length].i] += 1;
    floors.forEach((q, i) => {
      if (q > 0) out.push({ orderId: parents[i].id, variantId: vid || undefined, quantity: q });
    });
  }
  return out;
}
