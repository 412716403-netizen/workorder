/**
 * 领料 BOM 精简聚合（对齐 MaterialIssueModal 核心口径）
 */

const { sumOrderQty } = require('./orderProcessChips.js');

function bomsForProduct(boms, productId) {
  return (boms || []).filter((b) => b.parentProductId === productId);
}

function issuedQtyForMaterial(prodRecords, orderId, materialProductId) {
  let issued = 0;
  let returned = 0;
  (prodRecords || []).forEach((r) => {
    if (r.orderId !== orderId) return;
    if (r.productId !== materialProductId) return;
    if (r.type === 'STOCK_OUT') issued += Number(r.quantity) || 0;
    if (r.type === 'STOCK_RETURN') returned += Number(r.quantity) || 0;
  });
  return Math.max(0, issued - returned);
}

/**
 * 构建工单领料行
 */
function buildMaterialIssueRows(order, boms, prodRecords, productsById) {
  const orderQty = sumOrderQty(order);
  const productBoms = bomsForProduct(boms, order.productId);
  if (!productBoms.length) return [];

  const byMaterial = new Map();
  productBoms.forEach((bom) => {
    (bom.items || []).forEach((item) => {
      const matId = item.productId;
      if (!matId) return;
      const unitNeeded = Number(item.quantity) || 0;
      const needed = unitNeeded * orderQty;
      const cur = byMaterial.get(matId) || { materialProductId: matId, needed: 0 };
      cur.needed += needed;
      byMaterial.set(matId, cur);
    });
  });

  return Array.from(byMaterial.values()).map((row) => {
    const product = productsById.get(row.materialProductId);
    const issued = issuedQtyForMaterial(prodRecords, order.id, row.materialProductId);
    const pending = Math.max(0, row.needed - issued);
    return {
      materialProductId: row.materialProductId,
      name: product?.name || row.materialProductId,
      sku: product?.sku || '',
      needed: Math.round(row.needed * 1000) / 1000,
      issued: Math.round(issued * 1000) / 1000,
      pending: Math.round(pending * 1000) / 1000,
      canIssue: pending > 0,
    };
  }).filter((r) => r.needed > 0);
}

module.exports = {
  buildMaterialIssueRows,
  issuedQtyForMaterial,
  bomsForProduct,
};
