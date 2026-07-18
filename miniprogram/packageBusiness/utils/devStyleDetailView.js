const {
  resolveDevStyleCustomerName,
  resolveDevStyleThumb,
  styleStatusLabel,
  stageStatusLabel,
  formatDevStyleCreatedAt,
  isDevStyleReadOnly,
  canDeleteDevStyle,
  canDeleteDevSample,
  getDevSampleDeleteBlockReason,
} = require('./devStyleDisplay.js');
const { DevStyleStatus } = require('./devStyleConstants.js');

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

function buildStageRows(sample) {
  const stages = ((sample && sample.stages) || [])
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  return stages.map((st, idx) => ({
    id: st.id,
    name: st.name,
    status: st.status,
    statusLabel: stageStatusLabel(st.status),
    statusClass: `dev-stage--${st.status}`,
    orderLabel: String(idx + 1),
    isLast: idx === stages.length - 1,
    updatedAtLabel: formatDevStyleCreatedAt(st.updatedAt),
    fieldPreview: (st.fields || [])
      .filter((f) => String((f && f.value) || '').trim())
      .map((f) => `${f.label}: ${f.value}`)
      .slice(0, 3)
      .join(' · '),
  }));
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
  const thumb = resolveDevStyleThumb(style);
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
    placeholderIconSrc: '/assets/icons/boxes.png',
    status,
    statusLabel: styleStatusLabel(status),
    customerName,
    showCustomer: !!customerName,
    categoryName: category ? category.name : '',
    showCategory: !!(category && category.name),
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
      showRestore: canEdit && !readOnly && status === DevStyleStatus.ARCHIVED,
      showPublish: canEdit && !readOnly && status === DevStyleStatus.ARCHIVED,
      showAddSample: canEdit && !readOnly,
      showBom: canEdit && !readOnly,
    },
  };

  const a = view.actions;
  view.hasProductActions = !!(
    a.showEdit ||
    a.showArchive ||
    a.showRestore ||
    a.showPublish ||
    a.showDelete
  );
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
};
