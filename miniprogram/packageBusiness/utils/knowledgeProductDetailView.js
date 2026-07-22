const { productNameSkuParts } = require('../../utils/productionPlans.js');
const { getProductUnitName } = require('../utils/productionOrders.js');
const {
  effectiveCustomDocFieldType,
  formatReportCustomDataForList,
  parseKnowledgeFieldValue,
  getProductCategoryCustomFieldEntries,
} = require('../../utils/reportCustomDocField.js');
const { productColorSizeEnabled } = require('../utils/productColorSize.js');

/** 超过此长度的 data URL 禁止进入 setData（易触发渲染层「Expected updated data…」） */
const HEAVY_DATA_URL_CHARS = 64 * 1024;

function isHeavyDataUrl(s) {
  return typeof s === 'string' && s.indexOf('data:') === 0 && s.length > HEAVY_DATA_URL_CHARS;
}

/**
 * 小程序展示用图：优先 thumb；禁止把原图 base64 塞进视图数据。
 * 若仅有大图 data URL，调用方应先写临时文件再传入 imageLocalPath。
 */
function resolveSafeProductImageUrl(product) {
  if (!product) return '';
  if (product.imageLocalPath && typeof product.imageLocalPath === 'string') {
    return product.imageLocalPath;
  }
  const thumb = product.imageThumb;
  if (typeof thumb === 'string' && thumb && !isHeavyDataUrl(thumb)) return thumb;
  const url = product.imageUrl;
  if (typeof url === 'string' && url && url.indexOf('data:') !== 0) return url;
  if (typeof thumb === 'string' && thumb) return thumb;
  return '';
}

/**
 * 剥离 getProduct 返回体中的大体积字段，避免误入 setData。
 * 返回可安全持有的产品副本；若需保留原图写本地，见 imageDataUrlForTemp。
 */
function sanitizeProductForMiniView(product) {
  if (!product || typeof product !== 'object') return product;
  const next = Object.assign({}, product);
  let imageDataUrlForTemp = '';
  if (isHeavyDataUrl(next.imageUrl)) {
    imageDataUrlForTemp = next.imageUrl;
    delete next.imageUrl;
  } else if (typeof next.imageUrl === 'string' && next.imageUrl.indexOf('data:') === 0) {
    // 中等体积 data URL：展示优先用 thumb，原图仍可预览时再写临时文件
    if (!next.imageThumb) imageDataUrlForTemp = next.imageUrl;
    delete next.imageUrl;
  }
  if (isHeavyDataUrl(next.imageThumb)) {
    if (!imageDataUrlForTemp) imageDataUrlForTemp = next.imageThumb;
    delete next.imageThumb;
  }
  if (next.categoryCustomData && typeof next.categoryCustomData === 'object') {
    const cleaned = {};
    Object.keys(next.categoryCustomData).forEach((k) => {
      const v = next.categoryCustomData[k];
      if (typeof v === 'string' && v.indexOf('data:') === 0) {
        cleaned[k] = v.indexOf('data:image/') === 0 ? '__image__' : '__file__';
      } else {
        cleaned[k] = v;
      }
    });
    next.categoryCustomData = cleaned;
  }
  next._imageDataUrlForTemp = imageDataUrlForTemp;
  return next;
}

/** BOM 物料名解析需轻量字段 + 表单展示用扩展属性 */
function slimProductsForBomLookup(products) {
  return (products || []).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    unitId: p.unitId,
    categoryId: p.categoryId,
    categoryCustomData: p.categoryCustomData,
  }));
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  return `¥ ${v.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}`;
}

/**
 * 对齐 Web ProductQuickDetailBody：展示分类全部扩展字段（含空值「未填写」）。
 * showInForm 只影响列表，不影响商品详情。
 * knowledge 类型带 docId，供小程序跳转资料库详情。
 */
function buildCustomFieldRows(product, category) {
  const defs = (category && category.customFields) || [];
  return defs.map((f) => {
    const raw = product && product.categoryCustomData ? product.categoryCustomData[f.id] : undefined;
    const fieldType = effectiveCustomDocFieldType(f);
    let display = '未填写';
    let empty = true;
    let isKnowledgeLink = false;
    let knowledgeDocId = '';
    let knowledgeTitle = '';

    if (raw === '__image__') {
      display = '图片已上传';
      empty = false;
    } else if (raw === '__file__') {
      display = '附件已上传';
      empty = false;
    } else if (fieldType === 'knowledge') {
      const ref = parseKnowledgeFieldValue(raw);
      if (ref && ref.id) {
        display = ref.title || '资料库文件';
        empty = false;
        isKnowledgeLink = true;
        knowledgeDocId = ref.id;
        knowledgeTitle = ref.title || '资料库文件';
      }
    } else if (raw != null && raw !== '') {
      let formatted = formatReportCustomDataForList(f, raw);
      if (typeof formatted === 'string' && formatted.indexOf('data:') === 0) {
        formatted =
          fieldType === 'file' || formatted.indexOf('data:image/') === 0
            ? '已上传'
            : '已填写';
      }
      if (formatted) {
        display = formatted;
        empty = false;
      }
    }
    return {
      rowKey: `cf-${f.id}`,
      label: f.label || '扩展字段',
      value: display,
      empty,
      isKnowledgeLink,
      knowledgeDocId,
      knowledgeTitle,
    };
  });
}

function dictNames(ids, list) {
  return (ids || [])
    .map((id) => {
      const item = (list || []).find((x) => x.id === id);
      return item ? item.name : '';
    })
    .filter(Boolean)
    .join('、');
}

function bomHasConfiguredItems(bom) {
  return ((bom && bom.items) || []).some((it) => String((it && it.productId) || '').trim() !== '');
}

function buildProcessRows(product, globalNodes) {
  const nodes = globalNodes || [];
  const ids = (product && product.milestoneNodeIds) || [];
  return ids
    .map((id, idx) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return null;
      const rate = product.nodeRates && product.nodeRates[id];
      const pricing = product.nodePricingModes && product.nodePricingModes[id];
      const rateNum = Number(rate);
      const pieceHint =
        node.enablePieceRate && Number.isFinite(rateNum) && rateNum > 0
          ? `工价 ${rateNum.toFixed(2)} 元/${pricing === 'per_hour' ? '时' : '件'}`
          : '';
      return {
        id: node.id,
        indexText: String(idx + 1),
        name: node.name || '未命名工序',
        hasBOM: Boolean(node.hasBOM),
        pieceHint,
        showPieceHint: Boolean(pieceHint),
      };
    })
    .filter(Boolean);
}

function buildBomSkuOptions(product, dictionaries, productBomsWithItems) {
  const colors = (dictionaries && dictionaries.colors) || [];
  const sizes = (dictionaries && dictionaries.sizes) || [];
  const singleId = `single-${product.id}`;
  const variants = product.variants || [];

  const options =
    variants.length > 0
      ? variants.map((v) => {
          const colorName = ((colors.find((c) => c.id === v.colorId) || {}).name) || '';
          const sizeName = ((sizes.find((s) => s.id === v.sizeId) || {}).name) || '';
          const label =
            [colorName, sizeName].filter(Boolean).join(' / ') || v.skuSuffix || '规格';
          const hasBom = productBomsWithItems.some((b) => b.variantId === v.id);
          return { id: v.id, label, hasBom };
        })
      : [{ id: singleId, label: '单 SKU', hasBom: productBomsWithItems.some((b) => b.variantId === singleId) }];

  return options;
}

function resolveDefaultBomSkuId(options, productBomsWithItems) {
  const list = options || [];
  if (list.length === 1 && list[0].hasBom) return list[0].id;
  if (productBomsWithItems.length === 1) {
    const only = productBomsWithItems[0];
    if (only && only.variantId && list.some((o) => o.id === only.variantId)) {
      return only.variantId;
    }
  }
  const firstConfigured = list.find((o) => o.hasBom);
  return firstConfigured ? firstConfigured.id : '';
}

function buildBomGroups(product, bomSkuId, productBomsWithItems, globalNodes, products, dictionaries, categories) {
  if (!bomSkuId) return [];
  const nodes = globalNodes || [];
  const cats = categories || [];
  const productMap = {};
  (products || []).forEach((p) => {
    if (p && p.id) productMap[p.id] = p;
  });

  return productBomsWithItems
    .filter((b) => b.variantId === bomSkuId)
    .map((bom) => {
      const nodeName = bom.nodeId
        ? ((nodes.find((n) => n.id === bom.nodeId) || {}).name) || ''
        : '';
      const items = ((bom.items) || [])
        .filter((it) => String((it && it.productId) || '').trim() !== '')
        .map((item, idx) => {
          const sub = productMap[item.productId];
          const unitName = sub ? getProductUnitName(sub, dictionaries) || '件' : '件';
          const parts = productNameSkuParts(sub || { name: '', sku: item.productId });
          const subCat = sub
            ? cats.find((c) => c && c.id === sub.categoryId) || null
            : null;
          const customEntries = getProductCategoryCustomFieldEntries(sub, subCat, {
            includeFile: false,
            includeEmpty: false,
          });
          const customTags = (customEntries || []).map((e) => ({
            id: e.field.id,
            text: `${e.field.label}: ${e.display}`,
          }));
          return {
            key: `${bom.id}-${idx}`,
            productName: parts.name || (sub && sub.name) || '未知物料',
            customTags,
            showCustomTags: customTags.length > 0,
            qtyText: `×${item.quantity} ${unitName}`,
            note: item.note && String(item.note).trim() ? String(item.note).trim() : '',
            showNote: Boolean(item.note && String(item.note).trim()),
          };
        });
      return {
        id: bom.id,
        name: bom.name || 'BOM',
        nodeName,
        showNodeName: Boolean(nodeName),
        items,
      };
    })
    .filter((g) => g.items.length > 0);
}

/**
 * 资料库关联产品只读快览（对齐 Web PlanProductDetail：基本信息 + 工序 + BOM）
 */
function buildKnowledgeProductDetailView(ctx) {
  const product = ctx && ctx.product;
  if (!product) return null;

  const category = ctx.category || null;
  const categories = ctx.categories || (category ? [category] : []);
  const dictionaries = ctx.dictionaries || { units: [], colors: [], sizes: [] };
  const partners = ctx.partners || [];
  const globalNodes = ctx.globalNodes || [];
  const boms = ctx.boms || [];
  const products = ctx.products || [];
  const bomSkuId = ctx.bomSkuId || '';

  const parts = productNameSkuParts(product);
  const unitName = getProductUnitName(product, dictionaries) || '件';
  const supplier = product.supplierId
    ? partners.find((p) => p.id === product.supplierId)
    : null;

  const rows = [];
  rows.push({ rowKey: 'category', label: '产品分类', value: (category && category.name) || '未分类' });
  rows.push({ rowKey: 'unit', label: '计量单位', value: unitName });

  const salesText = formatMoney(product.salesPrice);
  if (salesText) rows.push({ rowKey: 'sales', label: '销售单价', value: `${salesText} / ${unitName}` });

  const purchaseText = formatMoney(product.purchasePrice);
  if (purchaseText) rows.push({ rowKey: 'purchase', label: '采购单价', value: `${purchaseText} / ${unitName}` });

  if (supplier && supplier.name) {
    rows.push({ rowKey: 'supplier', label: '默认供应商', value: supplier.name });
  }

  if (product.description && String(product.description).trim()) {
    rows.push({ rowKey: 'desc', label: '商品描述', value: String(product.description).trim() });
  }

  if (productColorSizeEnabled(product, category)) {
    const colors = dictNames(product.colorIds, dictionaries.colors);
    const sizes = dictNames(product.sizeIds, dictionaries.sizes);
    if (colors) rows.push({ rowKey: 'colors', label: '颜色', value: colors });
    if (sizes) rows.push({ rowKey: 'sizes', label: '尺码', value: sizes });
  }

  const customRows = buildCustomFieldRows(product, category);

  const processRows = buildProcessRows(product, globalNodes);
  const hasBomNodes = processRows.some((r) => r.hasBOM);
  const productBomsAll = boms.filter((b) => b.parentProductId === product.id);
  const productBomsWithItems = productBomsAll.filter(bomHasConfiguredItems);
  const bomSkuOptions = buildBomSkuOptions(product, dictionaries, productBomsWithItems).map((opt) => ({
    ...opt,
    selected: opt.id === bomSkuId,
  }));
  const hasVariantMatrix = ((product.variants) || []).length > 0;
  const showBomSection = productBomsWithItems.length > 0 || hasBomNodes;
  const bomGroups = buildBomGroups(
    product,
    bomSkuId,
    productBomsWithItems,
    globalNodes,
    products,
    dictionaries,
    categories,
  );

  let bomEmptyText = '';
  if (showBomSection) {
    if (!bomSkuId && hasVariantMatrix && bomSkuOptions.length > 1) {
      bomEmptyText = '请选择上方规格查看 BOM';
    } else if (bomSkuId && bomGroups.length === 0) {
      bomEmptyText = '该规格尚未配置有效 BOM 物料明细';
    } else if (!productBomsWithItems.length) {
      bomEmptyText = '暂无 BOM 配置';
    }
  }

  const imageUrl = resolveSafeProductImageUrl(product);

  return {
    productName: parts.name || product.name || '产品',
    productSku: parts.sku || product.sku || '',
    showProductSku: parts.showSku,
    categoryName: (category && category.name) || '未分类',
    imageUrl,
    showImage: Boolean(imageUrl),
    rows,
    customRows,
    showCustomSection: customRows.length > 0,
    processRows,
    processEmpty: processRows.length === 0,
    showBomSection,
    bomSkuOptions,
    showBomSkuTabs: hasVariantMatrix && bomSkuOptions.length > 0,
    bomGroups,
    bomEmptyText,
    showBomEmpty: Boolean(bomEmptyText),
    defaultBomSkuId: resolveDefaultBomSkuId(bomSkuOptions, productBomsWithItems),
  };
}

module.exports = {
  buildKnowledgeProductDetailView,
  bomHasConfiguredItems,
  resolveDefaultBomSkuId,
  isHeavyDataUrl,
  resolveSafeProductImageUrl,
  sanitizeProductForMiniView,
  slimProductsForBomLookup,
  buildCustomFieldRows,
};
