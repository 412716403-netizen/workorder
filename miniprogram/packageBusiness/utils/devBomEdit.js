const { buildVariantLabel } = require('./devStyleDetailView.js');

function genBomId() {
  return `dbom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 构建变体×工序格子列表。
 * sampleColorId/sampleSizeId 有值时仅保留对应变体行。
 */
function buildBomCells(style, globalNodes, dictionaries, opts) {
  const sampleColorId = opts && opts.colorId;
  const sampleSizeId = opts && opts.sizeId;
  let variants = style.variants || [];
  if (sampleColorId || sampleSizeId) {
    variants = variants.filter(
      (v) =>
        (!sampleColorId || v.colorId === sampleColorId) &&
        (!sampleSizeId || v.sizeId === sampleSizeId),
    );
  }
  if (!variants.length && !(style.variants || []).length) {
    // 单 SKU：用伪变体
    variants = [{ id: '', colorId: '', sizeId: '', skuSuffix: '', nodeBoms: {} }];
  }
  const nodeIds = style.milestoneNodeIds || [];
  const cells = [];
  variants.forEach((variant) => {
    const variantLabel = variant.id
      ? buildVariantLabel(variant, dictionaries)
      : '单规格';
    nodeIds.forEach((nodeId) => {
      const node = (globalNodes || []).find((n) => n.id === nodeId);
      const bomId = (variant.nodeBoms && variant.nodeBoms[nodeId]) || '';
      cells.push({
        key: `${variant.id || 'sku'}__${nodeId}`,
        variantId: variant.id || '',
        nodeId,
        variantLabel,
        nodeName: node ? node.name || nodeId : nodeId,
        bomId,
        configured: !!bomId,
      });
    });
  });
  return cells;
}

function findBomForCell(boms, styleId, variantId, nodeId) {
  return (boms || []).find(
    (b) =>
      b.parentStyleId === styleId &&
      (b.variantId || '') === (variantId || '') &&
      (b.nodeId || '') === (nodeId || ''),
  );
}

function buildBomItemsUi(bom, products) {
  const items = (bom && bom.items) || [];
  return items.map((it, idx) => {
    const product = (products || []).find((p) => p.id === it.productId);
    const name = product ? product.name || '' : '';
    const sku = product ? product.sku || '' : '';
    return {
      rowKey: `${it.productId || 'p'}-${idx}`,
      productId: it.productId,
      productName: name || sku || it.productId,
      productSku: sku,
      showProductSku: !!(name && sku && name !== sku),
      quantityText: it.quantity != null ? String(it.quantity) : '',
      note: it.note || '',
      categoryId: it.categoryId,
    };
  });
}

function itemsFromUi(rows) {
  return (rows || [])
    .filter((r) => r.productId)
    .map((r, idx) => ({
      productId: r.productId,
      quantity: Number(r.quantityText) || 0,
      note: r.note || undefined,
      categoryId: r.categoryId,
      sortOrder: idx,
    }));
}

module.exports = {
  genBomId,
  buildBomCells,
  findBomForCell,
  buildBomItemsUi,
  itemsFromUi,
};
