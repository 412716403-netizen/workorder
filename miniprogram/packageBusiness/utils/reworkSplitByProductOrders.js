/**
 * 关联产品模式下按父工单拆分数量（对齐 utils/reworkSplitByProductOrders.ts）
 */

function splitQtyBySourceDefectiveAcrossParentOrders(
productId,
sourceTemplateId,
parents,
pmp,
qtyByVariant)
{
  const out = [];
  if (!parents || parents.length === 0) return out;

  const variantKeys = Object.keys(qtyByVariant || {}).filter((k) => {var _qtyByVariant$k;return ((_qtyByVariant$k = qtyByVariant[k]) != null ? _qtyByVariant$k : 0) > 0;});
  variantKeys.forEach((vid) => {var _qtyByVariant$vid;
    const totalQ = (_qtyByVariant$vid = qtyByVariant[vid]) != null ? _qtyByVariant$vid : 0;
    if (totalQ <= 0) return;

    const weights = parents.map((o) => {
      const ms = (o.milestones || []).find((m) => m.templateId === sourceTemplateId);
      return (ms && ms.reports || []).
      filter((r) => (r.variantId || '') === vid).
      reduce((s, r) => {var _r$defectiveQuantity;return s + ((_r$defectiveQuantity = r.defectiveQuantity) != null ? _r$defectiveQuantity : 0);}, 0);
    });
    const pmpDef = (pmp || []).
    filter((p) => p.productId === productId &&
    p.milestoneTemplateId === sourceTemplateId &&
    (p.variantId || '') === vid).
    flatMap((p) => p.reports || []).
    reduce((s, r) => {var _r$defectiveQuantity2;return s + ((_r$defectiveQuantity2 = r.defectiveQuantity) != null ? _r$defectiveQuantity2 : 0);}, 0);

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
      return;
    }
    const rawParts = weights.map((w) => totalQ * w / sumW);
    const floors = rawParts.map((x) => Math.floor(x));
    let rem = totalQ - floors.reduce((a, b) => a + b, 0);
    const fracIdx = rawParts.
    map((r, i) => ({ i, f: r - Math.floor(r) })).
    sort((a, b) => b.f - a.f);
    for (let k = 0; k < rem; k += 1) {
      floors[fracIdx[k % fracIdx.length].i] += 1;
    }
    floors.forEach((q, i) => {
      if (q > 0) out.push({ orderId: parents[i].id, variantId: vid || undefined, quantity: q });
    });
  });
  return out;
}

module.exports = {
  splitQtyBySourceDefectiveAcrossParentOrders
};