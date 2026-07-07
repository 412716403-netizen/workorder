/**
 * 盘点单 view-model（对齐 Web StocktakeListModal）
 */

const { PSI_STOCKTAKE_TYPE } = require('../config/warehouses.js');
const { groupRecordsByDocNumber, groupDocItemsByLineGroup, lineGroupTotalQty, formatPsiQtyDisplay } = require('./psiOpsAggregators.js');
const { listProductDisplayFieldsFromMap } = require('./listProductThumb.js');
const { flowRecordsEarliestMs, formatLocalDateTimeZh } = require('./flowDocSortLite.js');
const { buildVariantMatrixUiModel } = require('./variantQtyMatrix.js');
const { productHasColorSizeMatrix } = require('./productionPlans.js');
const { getProductUnitName } = require('./planFormCustomField.js');
const { BATCH_NO_UNTAGGED } = require('./materialStockConfirm.js');

function parseStocktakeSearch(raw) {
  return { search: String(raw || '').trim() };
}

function formatDocDate(docLines) {
  const ms = flowRecordsEarliestMs(docLines);
  if (ms <= 0) return '—';
  return formatLocalDateTimeZh(ms).slice(0, 10);
}

function buildStocktakeListCards(records, productMap, warehouseMap) {
  const groups = groupRecordsByDocNumber(records, PSI_STOCKTAKE_TYPE);
  return Object.keys(groups)
    .sort((a, b) => b.localeCompare(a, 'zh-CN'))
    .map((docNumber) => {
      const items = groups[docNumber];
      const first = items[0] || {};
      const wh = warehouseMap.get(first.warehouseId);
      const lineGroups = groupDocItemsByLineGroup(items);
      const totalDiff = items.reduce((s, i) => s + (Number(i.diffQuantity) || 0), 0);
      return {
        docNumber,
        docNumberDisplay: docNumber,
        warehouseName: (wh && wh.name) || '—',
        createdAtText: formatDocDate(items),
        skuCount: Object.keys(lineGroups).length,
        totalDiffText: totalDiff >= 0 ? `+${totalDiff}` : String(totalDiff),
        diffPositive: totalDiff >= 0,
        note: first.note || '',
      };
    });
}

function filterStocktakeCards(cards, search) {
  const term = String(search || '').trim().toLowerCase();
  if (!term) return cards;
  return cards.filter((c) =>
    String(c.docNumber || '').toLowerCase().includes(term)
    || String(c.warehouseName || '').toLowerCase().includes(term)
    || String(c.note || '').toLowerCase().includes(term));
}

function formatBatchDisplay(batchNo) {
  const b = String(batchNo || '').trim();
  return b || BATCH_NO_UNTAGGED;
}

function mapStocktakeDetailView(docNumber, items, productMap, categoryMap, warehouseMap, dictionaries) {
  const first = items[0] || {};
  const wh = warehouseMap.get(first.warehouseId);
  const lineGroups = groupDocItemsByLineGroup(items);
  const sections = [{
    id: 'lines',
    title: '盘点明细',
    lines: Object.entries(lineGroups).map(([lineGroupId, grp]) => {
      const firstItem = grp[0];
      const product = productMap.get(firstItem.productId);
      const category = product && categoryMap.get(product.categoryId);
      const display = listProductDisplayFieldsFromMap(productMap, firstItem.productId);
      const batchNo = formatBatchDisplay(firstItem.batchNo || firstItem.batch);
      const hasMatrix = product && productHasColorSizeMatrix(product, category);
      const actualQty = lineGroupTotalQty(grp);
      const diffQty = grp.reduce((s, i) => s + (Number(i.diffQuantity) || 0), 0);
      let matrixLayout = null;
      if (hasMatrix) {
        const vq = {};
        grp.forEach((i) => {
          if (i.variantId) vq[i.variantId] = formatPsiQtyDisplay(i.quantity);
        });
        matrixLayout = buildVariantMatrixUiModel(product, dictionaries, vq);
      }
      return {
        lineGroupId,
        ...display,
        batchNo,
        showBatch: Boolean(String(firstItem.batchNo || firstItem.batch || '').trim()),
        qtyText: String(actualQty),
        systemQtyText: String(firstItem.systemQuantity != null ? firstItem.systemQuantity : '—'),
        diffQtyText: diffQty >= 0 ? `+${diffQty}` : String(diffQty),
        diffPositive: diffQty >= 0,
        unitName: getProductUnitName(product, dictionaries),
        hasMatrix,
        matrixLayout,
      };
    }),
  }];

  const totalDiff = items.reduce((s, i) => s + (Number(i.diffQuantity) || 0), 0);

  return {
    docNumber,
    hero: {
      docNumber,
      warehouseName: (wh && wh.name) || '—',
      createdAtText: formatDocDate(items),
      note: first.note || '',
    },
    summaryStats: {
      skuCount: Object.keys(lineGroups).length,
      totalDiffText: totalDiff >= 0 ? `+${totalDiff}` : String(totalDiff),
      diffPositive: totalDiff >= 0,
    },
    sections,
    recordIds: items.map((i) => i.id),
  };
}

module.exports = {
  parseStocktakeSearch,
  buildStocktakeListCards,
  filterStocktakeCards,
  mapStocktakeDetailView,
};
