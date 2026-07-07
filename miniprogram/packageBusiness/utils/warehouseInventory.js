/**
 * 仓库库存主列表 view-model（对齐 Web WarehousePanel 按仓库/按物料视图）
 */

const { categoryUsesBatchManagement } = require('./materialIssueBatch.js');
const { listProductDisplayFieldsFromMap } = require('./listProductThumb.js');
const { formatStockQty } = require('./warehouseStock.js');
const { productHasColorSizeMatrix } = require('./productionPlans.js');

function buildCategoryMap(categories) {
  const map = new Map();
  (categories || []).forEach((c) => {
    if (c && c.id) map.set(c.id, c);
  });
  return map;
}

function buildWarehouseMap(warehouses) {
  const map = new Map();
  (warehouses || []).forEach((w) => {
    if (w && w.id) map.set(w.id, w);
  });
  return map;
}

function buildProductStockRows(products, warehouses, categories, dictionaries, stockIndex) {
  const categoryMap = buildCategoryMap(categories);
  const idx = stockIndex && typeof stockIndex.getStock === 'function'
    ? stockIndex
    : {
      getStock: () => 0,
      getVariantDisplayQty: () => 0,
      getNullVariantProdStock: () => 0,
    };
  const { getStock, getVariantDisplayQty, getNullVariantProdStock } = idx;

  return (products || []).filter(Boolean).map((p) => {
    const category = categoryMap.get(p.categoryId);
    const hasVariants = (p.variants && p.variants.length) > 0;
    const distribution = (warehouses || []).map((wh) => {
      const qty = hasVariants
        ? (p.variants || []).reduce((s, v) => s + getVariantDisplayQty(p.id, wh.id, v.id), 0)
          + getNullVariantProdStock(p.id, wh.id)
        : getStock(p.id, wh.id);
      return {
        warehouseId: wh.id,
        warehouseName: wh.name,
        qty,
        qtyText: formatStockQty(qty),
      };
    });
    const total = distribution.reduce((s, d) => s + d.qty, 0);
    const colors = (dictionaries && dictionaries.colors) || [];
    const sizes = (dictionaries && dictionaries.sizes) || [];
    const variantBreakdown = hasVariants
      ? (p.variants || []).map((v) => {
        const perWarehouse = (warehouses || []).map((wh) => ({
          warehouseId: wh.id,
          qty: getVariantDisplayQty(p.id, wh.id, v.id),
        }));
        const totalQty = perWarehouse.reduce((s, x) => s + x.qty, 0);
        const colorMeta = colors.find((c) => c.id === v.colorId) || {};
        const sizeMeta = sizes.find((s) => s.id === v.sizeId) || {};
        const colorName = colorMeta.name || v.colorId;
        const sizeName = sizeMeta.name || v.sizeId;
        return {
          variantId: v.id,
          colorId: v.colorId || '',
          colorName,
          colorValue: colorMeta.value || '',
          sizeName,
          label: `${colorName} / ${sizeName}`,
          totalQty,
          totalQtyText: formatStockQty(totalQty),
          perWarehouse,
        };
      })
      : null;

    return {
      productId: p.id,
      categoryName: (category && category.name) || '未分类',
      categoryId: p.categoryId,
      usesBatch: categoryUsesBatchManagement(category),
      hasVariants,
      hasMatrix: productHasColorSizeMatrix(p, category),
      total,
      totalText: formatStockQty(total),
      distribution,
      variantBreakdown,
    };
  });
}

function filterProductStocks(rows, searchKeyword, productMap) {
  const term = String(searchKeyword || '').trim().toLowerCase();
  if (!term) return rows || [];
  const map = productMap || new Map();
  return (rows || []).filter((ps) => {
    const p = map.get(ps.productId);
    const name = (p && p.name) || '';
    const sku = (p && p.sku) || '';
    const cat = ps.categoryName || '';
    return name.toLowerCase().includes(term)
      || sku.toLowerCase().includes(term)
      || cat.toLowerCase().includes(term);
  });
}

function buildVisibleProductStocks(rows) {
  return rows.filter((p) => p.total !== 0);
}

/** 按颜色分组尺寸存量，供仓内/按物料展开区渲染 */
function buildColorGroups(variantBreakdown, qtyKey) {
  const key = qtyKey || 'totalQty';
  const textKey = key === 'qty' ? 'qtyText' : 'totalQtyText';
  const map = new Map();
  (variantBreakdown || []).forEach((vb) => {
    const qty = Number(vb[key]) || 0;
    if (qty === 0) return;
    const groupKey = vb.colorId || vb.colorName || '_';
    if (!map.has(groupKey)) {
      map.set(groupKey, {
        colorId: vb.colorId || '',
        colorName: vb.colorName || '—',
        colorValue: vb.colorValue || '',
        items: [],
      });
    }
    map.get(groupKey).items.push({
      sizeName: vb.sizeName || '—',
      qty,
      qtyText: vb[textKey] || formatStockQty(qty),
    });
  });
  return Array.from(map.values());
}

function buildWarehouseCards(warehouses, productStocks, productMap) {
  return (warehouses || []).map((wh) => {
    const lines = productStocks
      .filter((ps) => {
        const d = ps.distribution.find((x) => x.warehouseId === wh.id);
        return d && d.qty !== 0;
      })
      .map((ps) => {
        const d = ps.distribution.find((x) => x.warehouseId === wh.id);
        const display = listProductDisplayFieldsFromMap(productMap, ps.productId);
        let variantBreakdown;
        if (ps.variantBreakdown) {
          variantBreakdown = ps.variantBreakdown.map((vb) => ({
            ...vb,
            qty: (vb.perWarehouse.find((pw) => pw.warehouseId === wh.id) || {}).qty || 0,
            qtyText: formatStockQty((vb.perWarehouse.find((pw) => pw.warehouseId === wh.id) || {}).qty || 0),
          })).filter((vb) => vb.qty !== 0);
        }
        const colorGroups = buildColorGroups(variantBreakdown, 'qty');
        const hasVariants = colorGroups.length > 0;
        const usesBatch = Boolean(ps.usesBatch);
        return {
          ...display,
          productId: ps.productId,
          categoryName: ps.categoryName,
          qty: d ? d.qty : 0,
          qtyText: formatStockQty(d ? d.qty : 0),
          usesBatch,
          hasVariants,
          hasMatrix: ps.hasMatrix,
          canExpand: hasVariants || usesBatch,
          variantBreakdown,
          colorGroups,
          detailsExpanded: false,
          batchRows: [],
          batchLoading: false,
          batchError: '',
        };
      });
    const totalQty = lines.reduce((s, l) => s + l.qty, 0);
    return {
      warehouseId: wh.id,
      warehouseName: wh.name,
      code: wh.code || '',
      category: wh.category || '',
      location: wh.location || '',
      totalQty,
      totalQtyText: formatStockQty(totalQty),
      skuCount: lines.length,
      lines,
    };
  });
}

function buildProductCards(productStocks, productMap) {
  return productStocks.map((ps) => {
    const display = listProductDisplayFieldsFromMap(productMap, ps.productId);
    const whLines = ps.distribution
      .filter((d) => d.qty !== 0)
      .map((d) => ({
        warehouseId: d.warehouseId,
        warehouseName: d.warehouseName,
        qty: d.qty,
        qtyText: d.qtyText,
      }));
    const colorGroups = buildColorGroups(ps.variantBreakdown, 'totalQty');
    const hasVariants = colorGroups.length > 0;
    const usesBatch = Boolean(ps.usesBatch);
    return {
      ...display,
      productId: ps.productId,
      categoryName: ps.categoryName,
      total: ps.total,
      totalText: ps.totalText,
      usesBatch,
      hasVariants,
      hasMatrix: ps.hasMatrix,
      canExpand: hasVariants || usesBatch || whLines.length > 0,
      variantBreakdown: ps.variantBreakdown,
      colorGroups,
      whLines,
      detailsExpanded: false,
      batchRowsByWarehouse: {},
      batchLoading: false,
      batchError: '',
    };
  });
}

function paginateItems(items, page, pageSize) {
  const p = Math.max(1, page || 1);
  const size = Math.max(1, pageSize || 20);
  const start = (p - 1) * size;
  return {
    items: items.slice(start, start + size),
    total: items.length,
    page: p,
    pageSize: size,
    hasMore: start + size < items.length,
  };
}

module.exports = {
  buildCategoryMap,
  buildWarehouseMap,
  buildProductStockRows,
  filterProductStocks,
  buildVisibleProductStocks,
  buildColorGroups,
  buildWarehouseCards,
  buildProductCards,
  paginateItems,
};
