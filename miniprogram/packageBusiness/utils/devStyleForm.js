const { productColorSizeEnabled, validateProductColorSizeSelection } = require('./productColorSize.js');
const { generateVariants } = require('./productForm.js');
const { DevStyleStatus } = require('./devStyleConstants.js');

function genDraftStyleId() {
  return `ds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildEmptyDevStyle(categoryId) {
  return {
    id: genDraftStyleId(),
    code: '',
    name: '',
    categoryId: categoryId || '',
    imageUrl: '',
    colorIds: [],
    sizeIds: [],
    milestoneNodeIds: [],
    defaultStageNames: [],
    categoryCustomData: {},
    salesPrice: undefined,
    purchasePrice: undefined,
    unitId: undefined,
    supplierId: undefined,
    customerName: undefined,
    status: DevStyleStatus.DEVELOPING,
    variants: [],
    samples: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function syncDevStyleVariants(style, category, dictionaries) {
  if (!style || !productColorSizeEnabled(style, category)) {
    return { ...style, variants: style.variants || [], colorIds: style.colorIds || [], sizeIds: style.sizeIds || [] };
  }
  const variants = generateVariants(
    style.colorIds,
    style.sizeIds,
    style.variants,
    dictionaries,
  ).map((v) => ({
    id: v.id,
    colorId: v.colorId,
    sizeId: v.sizeId,
    skuSuffix: v.skuSuffix,
    nodeBoms: v.nodeBoms || {},
  }));
  return { ...style, variants };
}

function validateDevStyleForSave(style, category) {
  const name = String((style && style.name) || '').trim();
  const code = String((style && style.code) || '').trim();
  if (!name) return '品名不能为空';
  if (!code) return '款号不能为空';
  if (!String((style && style.categoryId) || '').trim()) return '请选择产品分类';
  const stageNames = (style && style.defaultStageNames) || [];
  if (!stageNames.length) return '请至少选择一个开发流程节点';
  const colorSizeErr = validateProductColorSizeSelection(
    {
      colorIds: style.colorIds,
      sizeIds: style.sizeIds,
      categoryId: style.categoryId,
    },
    category,
  );
  if (colorSizeErr) return colorSizeErr;
  return null;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.originalImageUrl] 编辑前主图；与当前一致时省略 imageUrl（避免大 data URL 反复上传）
 */
function buildDevStyleSavePayload(style, partnerName, opts) {
  const syncedCustomer =
    partnerName ||
    (style.customerName ? String(style.customerName).trim() : undefined);
  const nextImage = String(style.imageUrl || '').trim();
  const imageUnchanged =
    opts &&
    typeof opts.originalImageUrl === 'string' &&
    nextImage === String(opts.originalImageUrl || '').trim();
  return {
    code: String(style.code || '').trim(),
    name: String(style.name || '').trim(),
    categoryId: style.categoryId || undefined,
    imageUrl: imageUnchanged ? undefined : style.imageUrl || undefined,
    colorIds: style.colorIds || [],
    sizeIds: style.sizeIds || [],
    milestoneNodeIds: style.milestoneNodeIds || [],
    defaultStageNames: style.defaultStageNames || [],
    categoryCustomData: style.categoryCustomData || {},
    salesPrice: style.salesPrice,
    purchasePrice: style.purchasePrice,
    unitId: style.unitId || undefined,
    supplierId: style.supplierId || undefined,
    customerName: syncedCustomer || undefined,
    status: style.status || DevStyleStatus.DEVELOPING,
    variants: (style.variants || []).map((v) => ({
      id: v.id,
      colorId: v.colorId,
      sizeId: v.sizeId,
      skuSuffix: v.skuSuffix,
      nodeBoms: v.nodeBoms || {},
    })),
  };
}

function toggleIdInList(list, id, selected) {
  const arr = Array.isArray(list) ? [...list] : [];
  const idx = arr.indexOf(id);
  if (selected) {
    if (idx < 0) arr.push(id);
  } else if (idx >= 0) {
    arr.splice(idx, 1);
  }
  return arr;
}

function reorderSelectedNames(allNames, selectedNames, fromIndex, toIndex) {
  const list = [...(selectedNames || [])];
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return list;
  const [item] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, item);
  return list;
}

module.exports = {
  buildEmptyDevStyle,
  syncDevStyleVariants,
  validateDevStyleForSave,
  buildDevStyleSavePayload,
  toggleIdInList,
  reorderSelectedNames,
};
