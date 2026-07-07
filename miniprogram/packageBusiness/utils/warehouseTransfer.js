/**
 * 调拨单 view-model（对齐 Web TransferListModal）
 */

const { PSI_TRANSFER_TYPE } = require('../config/warehouses.js');
const { groupRecordsByDocNumber, groupDocItemsByLineGroup, lineGroupTotalQty, formatPsiQtyDisplay } = require('./psiOpsAggregators.js');
const { listProductDisplayFieldsFromMap } = require('./listProductThumb.js');
const { flowRecordsEarliestMs, formatLocalDateTimeZh } = require('./flowDocSortLite.js');
const { buildVariantMatrixUiModel } = require('./variantQtyMatrix.js');
const { productHasColorSizeMatrix } = require('./productionPlans.js');
const { getProductUnitName } = require('./planFormCustomField.js');

function parseTransferSearch(raw) {
  return { search: String(raw || '').trim() };
}

function formatDocDate(docLines) {
  const ms = flowRecordsEarliestMs(docLines);
  if (ms <= 0) return '—';
  return formatLocalDateTimeZh(ms).slice(0, 10);
}

function buildTransferListCards(records, productMap, warehouseMap) {
  const groups = groupRecordsByDocNumber(records, PSI_TRANSFER_TYPE);
  return Object.keys(groups)
    .sort((a, b) => b.localeCompare(a, 'zh-CN'))
    .map((docNumber) => {
      const items = groups[docNumber];
      const first = items[0] || {};
      const fromWh = warehouseMap.get(first.fromWarehouseId);
      const toWh = warehouseMap.get(first.toWarehouseId);
      const lineGroups = groupDocItemsByLineGroup(items);
      const skuCount = Object.keys(lineGroups).length;
      const totalQty = items.reduce((s, i) => s + formatPsiQtyDisplay(i.quantity), 0);
      return {
        docNumber,
        docNumberDisplay: docNumber,
        fromWarehouseName: (fromWh && fromWh.name) || '—',
        toWarehouseName: (toWh && toWh.name) || '—',
        routeText: `${(fromWh && fromWh.name) || '—'} → ${(toWh && toWh.name) || '—'}`,
        createdAtText: formatDocDate(items),
        skuCount,
        totalQtyText: String(totalQty),
        note: first.note || '',
      };
    });
}

function filterTransferCards(cards, search) {
  const term = String(search || '').trim().toLowerCase();
  if (!term) return cards;
  return cards.filter((c) =>
    String(c.docNumber || '').toLowerCase().includes(term)
    || String(c.fromWarehouseName || '').toLowerCase().includes(term)
    || String(c.toWarehouseName || '').toLowerCase().includes(term)
    || String(c.note || '').toLowerCase().includes(term));
}

function mapTransferDetailView(docNumber, items, productMap, categoryMap, warehouseMap, dictionaries) {
  const first = items[0] || {};
  const fromWh = warehouseMap.get(first.fromWarehouseId);
  const toWh = warehouseMap.get(first.toWarehouseId);
  const lineGroups = groupDocItemsByLineGroup(items);
  const sections = [{
    id: 'lines',
    title: '调拨明细',
    lines: Object.entries(lineGroups).map(([lineGroupId, grp]) => {
      const firstItem = grp[0];
      const product = productMap.get(firstItem.productId);
      const category = product && categoryMap.get(product.categoryId);
      const display = listProductDisplayFieldsFromMap(productMap, firstItem.productId);
      const batchNo = String(firstItem.batchNo || firstItem.batch || '').trim();
      const hasMatrix = product && productHasColorSizeMatrix(product, category);
      let matrixLayout = null;
      let qtyText = String(lineGroupTotalQty(grp));
      if (hasMatrix) {
        const vq = {};
        grp.forEach((i) => {
          if (i.variantId) vq[i.variantId] = formatPsiQtyDisplay(i.quantity);
        });
        matrixLayout = buildVariantMatrixUiModel(product, dictionaries, vq);
        qtyText = String(Object.values(vq).reduce((s, v) => s + (Number(v) || 0), 0));
      }
      return {
        lineGroupId,
        ...display,
        batchNo: batchNo || '',
        showBatch: Boolean(batchNo),
        qtyText,
        unitName: getProductUnitName(product, dictionaries),
        hasMatrix,
        matrixLayout,
      };
    }),
  }];

  return {
    docNumber,
    hero: {
      docNumber,
      routeText: `${(fromWh && fromWh.name) || '—'} → ${(toWh && toWh.name) || '—'}`,
      createdAtText: formatDocDate(items),
      note: first.note || '',
    },
    summaryStats: {
      skuCount: Object.keys(lineGroups).length,
      totalQtyText: String(items.reduce((s, i) => s + formatPsiQtyDisplay(i.quantity), 0)),
    },
    sections,
    recordIds: items.map((i) => i.id),
  };
}

module.exports = {
  parseTransferSearch,
  buildTransferListCards,
  filterTransferCards,
  mapTransferDetailView,
};
