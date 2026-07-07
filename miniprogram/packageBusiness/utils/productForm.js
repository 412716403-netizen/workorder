const { productColorSizeEnabled, validateProductColorSizeSelection } = require('./productColorSize.js');
const { validateProductCatalogUnique } = require('./productCatalogUnique.js');
const { resolveProductSkuForSave } = require('./productSkuAutoGen.js');
const { sortVariantsByColorThenSize } = require('./variantQtyMatrix.js');
const { effectiveCustomDocFieldType, getShowInFormCategoryFields } = require('./reportCustomDocField.js');

function genDraftProductId() {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function genVariantId() {
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildEmptyProduct(categoryId) {
  return {
    id: genDraftProductId(),
    sku: '',
    name: '',
    categoryId: categoryId || '',
    milestoneNodeIds: [],
    categoryCustomData: {},
    routeReportValues: {},
    routeReportDisplayValues: {},
    salesPrice: undefined,
    purchasePrice: undefined,
    unitId: undefined,
    colorIds: [],
    sizeIds: [],
    variants: [],
    imageUrl: '',
    enabled: true,
    nodeRates: {},
    nodePricingModes: {},
  };
}

function normalizeRouteReportValuesFromApi(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.keys(raw).forEach((nodeId) => {
    const fields = raw[nodeId];
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return;
    out[nodeId] = {};
    Object.keys(fields).forEach((fieldId) => {
      const v = fields[fieldId];
      if (v == null) return;
      out[nodeId][fieldId] = typeof v === 'string' ? v : JSON.stringify(v);
    });
  });
  return out;
}

function generateVariants(colorIds, sizeIds, existingVariants, dictionaries) {
  const colors = (colorIds && colorIds.length) ? colorIds : [];
  const sizes = (sizeIds && sizeIds.length) ? sizeIds : [];
  if (colors.length === 0 && sizes.length === 0) return [];
  const colorList = colors.length > 0 ? colors : ['none'];
  const sizeList = sizes.length > 0 ? sizes : ['none'];
  const dictColors = (dictionaries && dictionaries.colors) || [];
  const dictSizes = (dictionaries && dictionaries.sizes) || [];
  const newVariants = [];
  colorList.forEach((cId) => {
    sizeList.forEach((sId) => {
      const existing = (existingVariants || []).find(
        (v) => v.colorId === cId && v.sizeId === sId,
      );
      if (existing) {
        newVariants.push(existing);
      } else {
        const colorName = (dictColors.find((c) => c.id === cId) || {}).name || '';
        const sizeName = (dictSizes.find((s) => s.id === sId) || {}).name || '';
        newVariants.push({
          id: genVariantId(),
          colorId: cId,
          sizeId: sId,
          skuSuffix: `${colorName}${colorName && sizeName ? '-' : ''}${sizeName}`,
          nodeBoms: {},
          nodeUnitWeights: {},
        });
      }
    });
  });
  return newVariants;
}

function syncVariantsIfNeeded(product, category, dictionaries) {
  if (!product || !productColorSizeEnabled(product, category)) return product;
  const newVariants = generateVariants(
    product.colorIds,
    product.sizeIds,
    product.variants,
    dictionaries,
  );
  const currentHash = (product.variants || []).map((v) => `${v.colorId}-${v.sizeId}`).sort().join(',');
  const nextHash = newVariants.map((v) => `${v.colorId}-${v.sizeId}`).sort().join(',');
  if (currentHash === nextHash) return product;
  return { ...product, variants: newVariants };
}

function validateProductForSave(product, catalog, category) {
  const name = String((product && product.name) || '').trim();
  const sku = String((product && product.sku) || '').trim();
  if (!name) return '产品全称不能为空';
  if (!sku) return '产品编号不能为空';
  const catalogErr = validateProductCatalogUnique(catalog, {
    name,
    sku,
    excludeProductId: product.id,
  });
  if (catalogErr) return catalogErr;
  const categoryId = String((product && product.categoryId) || '').trim();
  if (!categoryId) return '没有选择产品类型，请去系统设置中添加产品分类';
  const colorSizeErr = validateProductColorSizeSelection(product, category);
  if (colorSizeErr) return colorSizeErr;
  return null;
}

function buildProductSavePayload(product) {
  const resolved = {
    ...product,
    name: String(product.name || '').trim(),
    sku: String(product.sku || '').trim(),
    salesPrice: product.salesPrice != null ? product.salesPrice : 0,
    purchasePrice: product.purchasePrice != null ? product.purchasePrice : 0,
    routeReportValues: normalizeRouteReportValuesFromApi(product.routeReportValues),
    routeReportDisplayValues: product.routeReportDisplayValues || {},
  };
  const payload = { ...resolved };
  delete payload.processLocked;
  delete payload.category;
  delete payload.boms;
  return payload;
}

function buildCategoryPickerOptions(categories, selectedId) {
  return (categories || []).map((c) => ({
    id: c.id,
    name: c.name,
    active: c.id === selectedId,
  }));
}

function buildUnitPickerOptions(units, selectedId) {
  return (units || []).map((u) => ({
    id: u.id,
    name: u.name,
    active: u.id === selectedId,
  }));
}

function prepareProductForSave(product, catalog, category) {
  let resolved = resolveProductSkuForSave(product, catalog);
  resolved = syncVariantsIfNeeded(resolved, category, { colors: [], sizes: [] });
  const err = validateProductForSave(resolved, catalog, category);
  if (err) return { error: err };
  const payload = buildProductSavePayload(resolved);
  return { product: resolved, payload };
}

function buildCategoryCustomFieldsForForm(category, product) {
  const defs = getShowInFormCategoryFields(category, { includeFile: true });
  const data = (product && product.categoryCustomData) || {};
  return defs.map((field) => {
    const type = effectiveCustomDocFieldType(field);
    const raw = data[field.id];
    return {
      id: field.id,
      label: field.label,
      type,
      desktopOnly: type === 'file' || type === 'knowledge',
      options: field.options || [],
      value: raw != null ? String(raw) : '',
      displayValue: raw != null && String(raw).indexOf('data:') === 0 ? '已上传' : (raw != null ? String(raw) : ''),
    };
  });
}

function applyCategoryCustomFieldValue(product, fieldId, value) {
  return {
    ...product,
    categoryCustomData: {
      ...(product.categoryCustomData || {}),
      [fieldId]: value,
    },
  };
}

module.exports = {
  genDraftProductId,
  genVariantId,
  buildEmptyProduct,
  normalizeRouteReportValuesFromApi,
  generateVariants,
  syncVariantsIfNeeded,
  validateProductForSave,
  buildProductSavePayload,
  buildCategoryPickerOptions,
  buildUnitPickerOptions,
  prepareProductForSave,
  resolveProductSkuForSave,
  sortVariantsByColorThenSize,
  buildCategoryCustomFieldsForForm,
  applyCategoryCustomFieldValue,
};
