/**
 * 工人多工单扫码确认页：展示行与提交条目
 */
const { variantLabel } = require('./productionPlans.js');

function entriesFromQuantities(quantities, defectiveQuantities) {
  const entries = [];
  const keys = new Set([
    ...Object.keys(quantities || {}),
    ...Object.keys(defectiveQuantities || {}),
  ]);
  keys.forEach((vid) => {
    const quantity = Math.max(0, Number((quantities || {})[vid]) || 0);
    const defectiveQuantity = Math.max(0, Number((defectiveQuantities || {})[vid]) || 0);
    if (quantity > 0 || defectiveQuantity > 0) {
      entries.push({
        variantId: vid || undefined,
        quantity,
        defectiveQuantity,
      });
    }
  });
  return entries;
}

function buildWorkerReportLineCards(lines, ctx) {
  const { productMap, categoryMap, dictionaries } = ctx;
  return (lines || []).map((line) => {
    const product = line.productId && productMap ? productMap.get(line.productId) : null;
    const category = product && product.categoryId && categoryMap
      ? categoryMap.get(product.categoryId)
      : null;
    const qtyRows = [];
    const keys = new Set([
      ...Object.keys(line.quantities || {}),
      ...Object.keys(line.defectiveQuantities || {}),
    ]);
    keys.forEach((vid) => {
      const good = Math.max(0, Number((line.quantities || {})[vid]) || 0);
      const def = Math.max(0, Number((line.defectiveQuantities || {})[vid]) || 0);
      if (good <= 0 && def <= 0) return;
      let label = '合计';
      if (vid && product) {
        label = variantLabel(product, category, dictionaries, vid) || vid;
      } else if (vid) {
        label = vid;
      }
      qtyRows.push({
        label,
        goodText: `${good} 件`,
        showDefective: def > 0,
        defectiveText: def > 0 ? `不良 ${def}` : '',
      });
    });
    const sumGood = Object.values(line.quantities || {}).reduce(
      (s, v) => s + (Number(v) || 0),
      0,
    );
    const orderNumber = line.orderNumber || '—';
    const productName = line.productName || '—';
    return {
      key: `${line.orderId}:${line.milestoneId}`,
      orderNumber,
      productName,
      productSku: line.productSku || '',
      showProductSku: Boolean(line.productSku),
      headline: `${orderNumber} · ${productName}`,
      qtyRows,
      totalGoodText: `${sumGood} 件`,
    };
  });
}

module.exports = {
  entriesFromQuantities,
  buildWorkerReportLineCards,
};
