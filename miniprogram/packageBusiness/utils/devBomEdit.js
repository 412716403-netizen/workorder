const { buildVariantLabel } = require('./devStyleDetailView.js');

function genBomId() {
  return `dbom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 与 Web utils/devBomHelpers.devSingleSkuVariantId 对齐 */
function devSingleSkuVariantId(styleId) {
  return `dvar-single-${styleId}`;
}

function isDevSingleSkuVariantId(variantId, styleId) {
  const id = variantId || '';
  return !id || id === devSingleSkuVariantId(styleId);
}

function bomHasItems(bom) {
  return !!(bom && Array.isArray(bom.items) && bom.items.length > 0);
}

/**
 * 构建变体×工序格子列表。
 * sampleColorId/sampleSizeId 有值时仅保留对应变体行。
 * opts.boms：用于单 SKU（无颜色尺码）判定「已配置」（伪变体无 nodeBoms）。
 */
function buildBomCells(style, globalNodes, dictionaries, opts) {
  const sampleColorId = opts && opts.colorId;
  const sampleSizeId = opts && opts.sizeId;
  const boms = (opts && opts.boms) || [];
  let variants = style.variants || [];
  if (sampleColorId || sampleSizeId) {
    variants = variants.filter(
      (v) =>
        (!sampleColorId || v.colorId === sampleColorId) &&
        (!sampleSizeId || v.sizeId === sampleSizeId),
    );
  }
  // 筛选后为空、且款式本身也无变体 → 单 SKU 伪变体
  // 筛选后为空但款式有变体 → 保留空列表（提示无匹配格子）
  if (!variants.length && !(style.variants || []).length) {
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
      // 与 Web DevBomConfigSection 一致：未开启「启用 BOM 依赖」的工序不进入录入列表
      if (!node || !node.hasBOM) return;
      const mappedBomId = (variant.nodeBoms && variant.nodeBoms[nodeId]) || '';
      const bom = findBomForCell(boms, style.id, variant.id, nodeId);
      const configured = !!mappedBomId || bomHasItems(bom);
      cells.push({
        key: `${variant.id || 'sku'}__${nodeId}`,
        variantId: variant.id || '',
        nodeId,
        variantLabel,
        nodeName: node.name || nodeId,
        bomId: mappedBomId || (bom && bom.id) || '',
        configured,
      });
    });
  });
  return cells;
}

function findBomForCell(boms, styleId, variantId, nodeId) {
  const wantSingle = isDevSingleSkuVariantId(variantId, styleId);
  return (boms || []).find((b) => {
    if (b.parentStyleId !== styleId) return false;
    if ((b.nodeId || '') !== (nodeId || '')) return false;
    if (wantSingle) return isDevSingleSkuVariantId(b.variantId, styleId);
    return (b.variantId || '') === (variantId || '');
  });
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

/**
 * 无颜色尺码（单 SKU）且只有一个可配工序时，跳过格子列表直接进编辑。
 * 多工序仍保留列表，便于选择工序。
 */
function shouldSkipBomCellsList(style, cells) {
  const isSingleSku = !(style && style.variants && style.variants.length);
  return isSingleSku && Array.isArray(cells) && cells.length === 1;
}

/**
 * BOM 页顶栏：款式编号/名称 + 可安全 setData 的缩略图候选（重图由页面落盘后再填）。
 */
function buildBomStyleHeader(style) {
  if (!style) {
    return {
      productName: '',
      productSku: '',
      showProductSku: false,
      productImageUrl: '',
      showProductImage: false,
      placeholderIconSrc: '/assets/icons/boxes.png',
      isSingleSku: true,
    };
  }
  const code = String(style.name || '').trim();
  const title = String(style.code || '').trim();
  const productName = code || title || '未命名款式';
  const showProductSku = !!(title && code && title !== code);
  const thumb = String(style.imageThumb || '').trim();
  const url = String(style.imageUrl || '').trim();
  // 仅 http(s)/本地路径可直接进 setData；data URL 由页面 resolveImageDisplaySrc
  let productImageUrl = '';
  if (thumb && thumb.indexOf('data:') !== 0) productImageUrl = thumb;
  else if (url && url.indexOf('data:') !== 0) productImageUrl = url;
  return {
    productName,
    productSku: showProductSku ? title : '',
    showProductSku,
    productImageUrl,
    showProductImage: !!productImageUrl,
    placeholderIconSrc: '/assets/icons/boxes.png',
    isSingleSku: !(style.variants || []).length,
    /** 供页面落盘用的原始图（优先 thumb） */
    _rawImageSrc: thumb || url || '',
  };
}

module.exports = {
  genBomId,
  devSingleSkuVariantId,
  isDevSingleSkuVariantId,
  buildBomCells,
  findBomForCell,
  buildBomItemsUi,
  itemsFromUi,
  buildBomStyleHeader,
  shouldSkipBomCellsList,
};
