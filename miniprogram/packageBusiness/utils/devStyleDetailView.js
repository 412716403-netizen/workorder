const {
  resolveDevStyleCustomerName,
  styleStatusLabel,
  stageStatusLabel,
  formatDevStyleCreatedAt,
  isDevStylePublishedForDisplay,
  isDevStyleReadOnly,
  canDeleteDevStyle,
  canDeleteDevSample,
  getDevSampleDeleteBlockReason,
} = require('./devStyleDisplay.js');
const { DevStyleStatus } = require('./devStyleConstants.js');
const { listDevStageImageUrls, parseDevStageFileItems } = require('./devStageFileValue.js');

/** 超过此长度的 data URL 禁止进 setData（易导致主图/缩略图整页不渲染） */
const HEAVY_DATA_URL_CHARS = 64 * 1024;

function isHeavyDataUrl(s) {
  return typeof s === 'string' && s.indexOf('data:') === 0 && s.length > HEAVY_DATA_URL_CHARS;
}

/** 详情主图：优先非重 thumb；禁止把原图 base64 直接塞进视图 */
function resolveSafeDetailImageUrl(style) {
  if (!style) return '';
  const thumb = String(style.imageThumb || '').trim();
  if (thumb && !isHeavyDataUrl(thumb)) return thumb;
  const url = String(style.imageUrl || '').trim();
  if (url && url.indexOf('data:') !== 0) return url;
  return '';
}

/** 供页面落盘的原始图源（优先 thumb） */
function resolveDetailImageRawSrc(style) {
  if (!style) return '';
  return String(style.imageThumb || style.imageUrl || '').trim();
}

function resolveDictName(items, id) {
  if (!id) return '';
  const hit = (items || []).find((x) => x.id === id);
  return hit ? hit.name || id : id;
}

function buildVariantLabel(variant, dictionaries) {
  const colors = (dictionaries && dictionaries.colors) || [];
  const sizes = (dictionaries && dictionaries.sizes) || [];
  const color = resolveDictName(colors, variant.colorId);
  const size = resolveDictName(sizes, variant.sizeId);
  if (color && size) return `${color} / ${size}`;
  return color || size || variant.skuSuffix || variant.id;
}

function buildSampleVariantLabel(sample, dictionaries) {
  if (!sample || (!sample.colorId && !sample.sizeId)) return '';
  return buildVariantLabel(
    { colorId: sample.colorId || '', sizeId: sample.sizeId || '', skuSuffix: '' },
    dictionaries,
  );
}

function isImageFieldValue(value) {
  return typeof value === 'string' && value.indexOf('data:image/') === 0;
}

function formatStageFieldPreviewText(field) {
  const value = String((field && field.value) || '').trim();
  if (!value) return '';
  const images = listDevStageImageUrls(value);
  if (images.length > 0) return '';
  const items = parseDevStageFileItems(value);
  if (items.length > 0 || field.type === 'file') {
    if (items.length === 1 && items[0].name) return `${field.label}: ${items[0].name}`;
    if (items.length > 1) {
      const named = items.filter((i) => i.name).map((i) => i.name);
      if (named.length) return `${field.label}: ${named.slice(0, 2).join('、')}${named.length > 2 ? '…' : ''}`;
      return `${field.label}: ${items.length} 个附件`;
    }
    return `${field.label}: 附件`;
  }
  if (value.indexOf('data:') === 0) {
    return `${field.label}: 附件`;
  }
  return `${field.label}: ${value}`;
}

function buildStageRows(sample) {
  const stages = ((sample && sample.stages) || [])
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  return stages.map((st, idx) => {
    const filled = (st.fields || []).filter((f) => String((f && f.value) || '').trim());
    const fieldThumbs = [];
    filled.forEach((f) => {
      listDevStageImageUrls(f.value).forEach((src, i) => {
        if (fieldThumbs.length >= 8) return;
        // 重图不进首屏 setData，避免拖垮整页主图渲染；有图时仍用 fieldPreview 提示
        if (isHeavyDataUrl(src)) return;
        fieldThumbs.push({
          id: `${f.id || f.label}-${i}`,
          label: f.label || '图片',
          src,
        });
      });
    });
    const fieldPreview = filled
      .map(formatStageFieldPreviewText)
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ');
    return {
      id: st.id,
      name: st.name,
      status: st.status,
      statusLabel: stageStatusLabel(st.status),
      statusClass: `dev-stage--${st.status}`,
      orderLabel: String(idx + 1),
      isLast: idx === stages.length - 1,
      updatedAtLabel: formatDevStyleCreatedAt(st.updatedAt),
      fieldThumbs,
      fieldPreview,
    };
  });
}

function buildStyleDetailView(style, ctx) {
  const partners = (ctx && ctx.partners) || [];
  const dictionaries = (ctx && ctx.dictionaries) || { colors: [], sizes: [], units: [] };
  const categories = (ctx && ctx.categories) || [];
  const globalNodes = (ctx && ctx.globalNodes) || [];
  const canEdit = !!(ctx && ctx.canEdit);
  const canDelete = !!(ctx && ctx.canDelete);

  const customerName = resolveDevStyleCustomerName(style, partners) || '';
  const category = categories.find((c) => c.id === style.categoryId);
  const thumb = resolveSafeDetailImageUrl(style);
  const rawImageSrc = resolveDetailImageRawSrc(style);
  const code = String(style.code || '').trim();
  const name = String(style.name || '').trim();
  const showProductSku = !!(name && code && name !== code);
  const readOnly = isDevStyleReadOnly(style);
  const status = style.status;

  const samples = (style.samples || []).map((sample) => ({
    id: sample.id,
    name: sample.name || '样品',
    variantLabel: buildSampleVariantLabel(sample, dictionaries),
    canDelete: canDeleteDevSample(sample),
    deleteBlockReason: getDevSampleDeleteBlockReason(sample),
    stageRows: buildStageRows(sample),
    logCount: (sample.logs || []).length,
  }));

  const colorNames = (style.colorIds || [])
    .map((id) => resolveDictName(dictionaries.colors, id))
    .filter(Boolean);
  const sizeNames = (style.sizeIds || [])
    .map((id) => resolveDictName(dictionaries.sizes, id))
    .filter(Boolean);
  const processNames = (style.milestoneNodeIds || [])
    .map((id) => {
      const n = globalNodes.find((g) => g.id === id);
      return n ? n.name || id : id;
    })
    .filter(Boolean);
  const unitName = resolveDictName(dictionaries.units || [], style.unitId);

  const hasVariants = (style.variants || []).length > 0;
  const variantOptions = (style.variants || []).map((v) => ({
    id: v.id,
    colorId: v.colorId,
    sizeId: v.sizeId,
    label: buildVariantLabel(v, dictionaries),
  }));

  const view = {
    id: style.id,
    productName: name || code || '未命名款式',
    productSku: code,
    showProductSku,
    productImageUrl: thumb,
    showProductImage: !!thumb,
    /** 重图时首屏可能无 productImageUrl，页面用此字段落盘后再填 */
    rawImageSrc,
    placeholderIconSrc: '/assets/icons/boxes.png',
    status,
    statusLabel: styleStatusLabel(status),
    /** 已生成商品但状态被还原时，状态徽章旁再挂一个「已发布」；published 本身已含该文案 */
    showPublishedBadge:
      isDevStylePublishedForDisplay(style) && status !== DevStyleStatus.PUBLISHED,
    customerName,
    showCustomer: !!customerName,
    unitName,
    showUnit: !!unitName,
    salesPriceText:
      style.salesPrice != null && style.salesPrice !== '' ? String(style.salesPrice) : '',
    purchasePriceText:
      style.purchasePrice != null && style.purchasePrice !== '' ? String(style.purchasePrice) : '',
    colorChips: colorNames,
    sizeChips: sizeNames,
    processSteps: processNames,
    colorText: colorNames.join('、'),
    sizeText: sizeNames.join('、'),
    processText: processNames.join(' → '),
    createdAtLabel: formatDevStyleCreatedAt(style.createdAt),
    sampleCount: samples.length,
    stageCount: samples.reduce((n, s) => n + ((s.stageRows && s.stageRows.length) || 0), 0),
    readOnly,
    samples,
    hasVariants,
    variantOptions,
    defaultStageNames: style.defaultStageNames || [],
    statusTone:
      status === DevStyleStatus.PUBLISHED
        ? 'published'
        : status === DevStyleStatus.ARCHIVED
          ? 'archived'
          : 'developing',
    actions: {
      showEdit: canEdit && !readOnly,
      showDelete: canDelete && canDeleteDevStyle(style),
      showArchive: canEdit && !readOnly && status === DevStyleStatus.DEVELOPING,
      showRestore:
        canEdit &&
        (status === DevStyleStatus.ARCHIVED || status === DevStyleStatus.PUBLISHED),
      showPublish:
        canEdit &&
        !readOnly &&
        status === DevStyleStatus.ARCHIVED &&
        !style.publishedProductId,
      showAddSample: canEdit && !readOnly && status === DevStyleStatus.DEVELOPING,
      showDeleteSample: canEdit && !readOnly,
      showBom: canEdit && !readOnly,
    },
  };

  const a = view.actions;
  view.hasProductActions = !!(a.showArchive || a.showRestore || a.showPublish);
  return view;
}

function findSampleById(style, sampleId) {
  return ((style && style.samples) || []).find((s) => s.id === sampleId) || null;
}

function findStageById(style, stageId) {
  for (const sample of (style && style.samples) || []) {
    const st = (sample.stages || []).find((x) => x.id === stageId);
    if (st) return { sample, stage: st };
  }
  return null;
}

module.exports = {
  buildStyleDetailView,
  buildVariantLabel,
  buildSampleVariantLabel,
  findSampleById,
  findStageById,
  resolveSafeDetailImageUrl,
  resolveDetailImageRawSrc,
};
