/**
 * 盘点单表单（对齐 Web WarehousePanel handleSaveStocktake）
 */

const _require = require('../config/warehouses.js'),PSI_STOCKTAKE_TYPE = _require.PSI_STOCKTAKE_TYPE;
const _require2 = require('./materialIssueBatch.js'),categoryUsesBatchManagement = _require2.categoryUsesBatchManagement;
const _require3 = require('./productionPlans.js'),productHasColorSizeMatrix = _require3.productHasColorSizeMatrix;
const _require4 = require('./variantQtyMatrix.js'),buildVariantMatrixUiModel = _require4.buildVariantMatrixUiModel;
const _require5 = require('./psiOpsAggregators.js'),formatPsiQtyDisplay = _require5.formatPsiQtyDisplay;
const _require6 = require('./dateYmd.js'),localTodayYmd = _require6.localTodayYmd;
const {
  defaultEntryDate,
  hydrateEntryDate,
  psiEntryTimestampsFromDate,
} = require('./docEntryTime.js');
const _require7 = require('./planFormCustomField.js'),getProductUnitName = _require7.getProductUnitName;
const _require8 = require('./materialStockConfirm.js'),BATCH_NO_UNTAGGED = _require8.BATCH_NO_UNTAGGED;
const _require9 = require('./warehouseStock.js'),buildStockSnapshotIndex = _require9.buildStockSnapshotIndex;

const WAREHOUSE_PREF_KEY = 'PSI_STOCKTAKE_WAREHOUSE';
/** PsiRecord.lineGroupId @db.VarChar(50) */
const LINE_GROUP_ID_MAX = 50;

function newLineId() {
  return `st-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampLineGroupId(id) {
  const s = String(id || '').trim() || newLineId();
  return s.length > LINE_GROUP_ID_MAX ? s.slice(0, LINE_GROUP_ID_MAX) : s;
}

function finiteQty(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function emptyStockIndex() {
  return buildStockSnapshotIndex({ byWarehouse: [], byVariant: [], byBatch: [] });
}

/** 对齐 Web generateSTDocNumber：ST-YYYYMMDD-NNN */
function generateSTDocNumber(existingRecords) {
  const today = localTodayYmd().replace(/-/g, '');
  const prefix = `ST-${today}`;
  const existing = (existingRecords || []).filter(
    (r) => r.type === PSI_STOCKTAKE_TYPE &&
    String(r.docNumber || '').toLowerCase().startsWith(prefix.toLowerCase())
  );
  const seqNums = existing.map((r) => {
    const m = String(r.docNumber || '').match(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i'));
    return m ? parseInt(m[1], 10) : 0;
  });
  const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
  return `${prefix}-${String(nextSeq).padStart(3, '0')}`;
}

function batchNoForWrite(bn) {
  const s = String(bn || '').trim();
  if (!s || s === BATCH_NO_UNTAGGED) return '';
  return s;
}

function readStocktakePreference() {
  try {
    return wx.getStorageSync(WAREHOUSE_PREF_KEY) || '';
  } catch {
    return '';
  }
}

function writeStocktakePreference(warehouseId) {
  try {
    if (warehouseId) wx.setStorageSync(WAREHOUSE_PREF_KEY, warehouseId);
  } catch {

    /* ignore */}
}

function resolvePreferredStocktakeWarehouse(warehouses) {
  const list = warehouses || [];
  const prefId = readStocktakePreference();
  if (prefId) {
    const found = list.find((w) => w.id === prefId);
    if (found) return found;
  }
  return list[0] || null;
}

function createEmptyLine() {
  return {
    id: newLineId(),
    productId: '',
    productName: '',
    quantity: '',
    systemQtyText: '—',
    variantQuantities: {},
    batch: '',
    useMatrix: false,
    matrixLayout: null,
    showBatch: false,
    unitName: 'PCS',
    lineTotalQty: 0,
    hasEnteredQty: false
  };
}

function buildInitialForm() {
  return {
    warehouseId: '',
    warehouseName: '',
    docNumber: '',
    stocktakeDate: defaultEntryDate(),
    note: '',
    operator: ''
  };
}

function lineTotalQty(line) {
  if (line.variantQuantities && Object.keys(line.variantQuantities).length > 0) {
    return Object.values(line.variantQuantities).reduce((s, v) => s + (Number(v) || 0), 0);
  }
  if (line.quantity === '' || line.quantity == null) return 0;
  return Number(line.quantity) || 0;
}

/** 是否有色码实盘录入（勿依赖可能过期的 line.useMatrix） */
function lineHasVariantQty(line) {
  return Boolean(line && line.variantQuantities && Object.keys(line.variantQuantities).length > 0);
}

function lineWillBeSaved(line) {
  if (!line || !line.productId) return false;
  // 对齐 Web：有规格数量即保存；勿依赖 useMatrix（_lines 上可能仍是选品前的 false）
  if (lineHasVariantQty(line)) return true;
  return line.quantity !== '' && line.quantity != null;
}

function recordsToLineItems(items, productMap, categoryMap, dictionaries) {
  const groups = {};
  (items || []).forEach((item) => {
    const batchPart = String(item.batchNo || item.batch || '').trim();
    const gid = `${item.lineGroupId || item.id}|${batchPart}`;
    if (!groups[gid]) groups[gid] = [];
    groups[gid].push(item);
  });
  return Object.entries(groups).map(([_gid, grp]) => {
    const firstItem = grp[0];
    const product = productMap.get(firstItem.productId);
    const category = product && categoryMap.get(product.categoryId);
    const rowId = String(firstItem.lineGroupId || firstItem.id);
    const batchNo = String(firstItem.batchNo || firstItem.batch || '').trim();
    const variantQuantities = {};
    let quantity = '';
    grp.forEach((item) => {
      if (item.variantId) variantQuantities[item.variantId] = formatPsiQtyDisplay(item.quantity);else
      quantity = String((Number(quantity) || 0) + formatPsiQtyDisplay(item.quantity));
    });
    const useMatrix = product && productHasColorSizeMatrix(product, category);
    const line = {
      id: rowId,
      productId: firstItem.productId,
      productName: product && product.name || '',
      quantity: useMatrix ? '' : quantity,
      systemQtyText: String(firstItem.systemQuantity != null ? firstItem.systemQuantity : '—'),
      variantQuantities: useMatrix ? variantQuantities : {},
      batch: batchNo,
      useMatrix,
      matrixLayout: useMatrix ? buildVariantMatrixUiModel(product, dictionaries, variantQuantities) : null,
      showBatch: categoryUsesBatchManagement(category),
      unitName: getProductUnitName(product, dictionaries),
      lineTotalQty: 0,
      hasEnteredQty: true
    };
    line.lineTotalQty = lineTotalQty(line);
    return line;
  });
}

function enrichLineForUi(line, productMap, categoryMap, dictionaries, stockIndex, warehouseId) {
  const product = productMap.get(line.productId);
  const category = product && categoryMap.get(product.categoryId);
  const useMatrix = product && productHasColorSizeMatrix(product, category);
  let systemQtyText = '—';
  if (line.productId && warehouseId && stockIndex) {
    const bn = String(line.batch || '').trim();
    if (bn && categoryUsesBatchManagement(category)) {
      systemQtyText = String(stockIndex.getBatchStock(line.productId, warehouseId, bn));
    } else if (useMatrix) {
      const total = (product.variants || []).reduce(
        (s, v) => s + stockIndex.getVariantDisplayQty(line.productId, warehouseId, v.id),
        0
      );
      systemQtyText = String(total);
    } else {
      systemQtyText = String(stockIndex.getStock(line.productId, warehouseId));
    }
  }
  let systemQtyByVariantId;
  if (useMatrix && line.productId && warehouseId && stockIndex && product) {
    systemQtyByVariantId = {};
    (product.variants || []).forEach((v) => {
      systemQtyByVariantId[v.id] = stockIndex.getVariantDisplayQty(line.productId, warehouseId, v.id);
    });
  }
  const next = {
    ...line,
    productName: product && product.name || line.productName || '',
    useMatrix,
    showBatch: categoryUsesBatchManagement(category),
    unitName: getProductUnitName(product, dictionaries),
    systemQtyText,
    matrixLayout: useMatrix ?
    buildVariantMatrixUiModel(product, dictionaries, line.variantQuantities || {}, {
      systemQtyByVariantId
    }) :
    null
  };
  next.lineTotalQty = lineTotalQty(next);
  return next;
}

function validateStocktakeSave(form, lines, productMap, categoryMap) {
  const warehouseId = String(form.warehouseId || '').trim();
  if (!warehouseId) return '请选择盘点仓库';
  const hasValid = (lines || []).some(lineWillBeSaved);
  if (!hasValid) return '请至少添加一条盘点明细';

  const seenBatchKeys = new Set();
  const seenPlainProductIds = new Set();
  for (const item of lines || []) {
    if (!item.productId) continue;
    const product = productMap.get(item.productId);
    const usesBatch = categoryUsesBatchManagement(product && categoryMap.get(product.categoryId));
    const bn = String(item.batch || '').trim();
    if (usesBatch && bn) {
      const key = `${item.productId}::${bn}`;
      if (seenBatchKeys.has(key)) {
        return `产品「${product && product.name || item.productId}」批次「${bn}」在本次盘点中重复，请合并为一行`;
      }
      seenBatchKeys.add(key);
    } else if (!usesBatch) {
      if (seenPlainProductIds.has(item.productId)) {
        return `产品「${product && product.name || item.productId}」在本次盘点中重复，同一产品不能录入两次`;
      }
      seenPlainProductIds.add(item.productId);
    }
  }

  for (const item of lines || []) {
    if (!item.productId) continue;
    const product = productMap.get(item.productId);
    const cat = product && categoryMap.get(product.categoryId);
    if (!categoryUsesBatchManagement(cat)) continue;
    const q = lineTotalQty(item);
    if (q > 0 && !String(item.batch || '').trim()) {
      return `盘点产品「${product && product.name || item.productId}」启用批次管理，请选择批次`;
    }
  }
  return '';
}

function buildStocktakeSaveRecords(form, lines, productMap, categoryMap, stockIndex, docNumber, _timestamp, operator, editingDocNumber) {
  const warehouseId = form.warehouseId;
  const { createdAt, timestamp: timestampIso } = psiEntryTimestampsFromDate(
    form.stocktakeDate || defaultEntryDate()
  );
  const stock = stockIndex && typeof stockIndex.getStock === 'function' ?
  stockIndex :
  emptyStockIndex();
  const records = [];
  let idx = 0;
  const baseId = Date.now();

  const batchSysByProductBatch = new Map();
  /** 批次行（含「无批号」哨兵）：按行算 diff，写入时不落哨兵批号 */
  const batchLineKeys = new Set();

  (lines || []).forEach((item) => {
    if (!lineWillBeSaved(item)) return;
    const product = productMap.get(item.productId);
    const cat = product && categoryMap.get(product.categoryId);
    const bn = String(item.batch || '').trim();
    const batchCat = categoryUsesBatchManagement(cat);
    const isBatchLine = Boolean(batchCat && bn);
    const writeBn = batchNoForWrite(bn);
    const lineGroupId = clampLineGroupId(item.id);
    const note = String(form.note || '').trim() || undefined;
    const op = String(operator || '').trim().slice(0, 100) || undefined;

    // 有规格数量走变体行（与 useMatrix 标志解耦：选品后 _lines.useMatrix 可能未刷新）
    if (lineHasVariantQty(item)) {
      Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
        const n = finiteQty(qty);
        if (Number.isNaN(Number(qty))) return;
        const sysQty = finiteQty(stock.getVariantDisplayQty(item.productId, warehouseId, variantId));
        const rec = {
          id: `psi-st-${baseId}-${idx++}`,
          type: PSI_STOCKTAKE_TYPE,
          docNumber,
          timestamp: timestampIso,
          warehouseId,
          productId: item.productId,
          variantId,
          quantity: n,
          systemQuantity: sysQty,
          note,
          lineGroupId,
          createdAt,
          operator: op
        };
        if (writeBn) rec.batchNo = writeBn;
        if (isBatchLine) batchLineKeys.add(rec.id);
        records.push(rec);
      });
    } else if (item.quantity !== '' && item.quantity != null) {var _batchSysByProductBat;
      const n = finiteQty(item.quantity);
      const sysQtyAtSave = isBatchLine ? (_batchSysByProductBat =
      batchSysByProductBatch.get(`${item.productId}::${bn}`)) != null ? _batchSysByProductBat :
      finiteQty(stock.getBatchStock(item.productId, warehouseId, bn)) :
      finiteQty(stock.getStock(item.productId, warehouseId, editingDocNumber));
      if (isBatchLine) batchSysByProductBatch.set(`${item.productId}::${bn}`, sysQtyAtSave);
      const rec = {
        id: `psi-st-${baseId}-${idx++}`,
        type: PSI_STOCKTAKE_TYPE,
        docNumber,
        timestamp: timestampIso,
        warehouseId,
        productId: item.productId,
        quantity: n,
        systemQuantity: sysQtyAtSave,
        note,
        lineGroupId,
        createdAt,
        operator: op
      };
      if (writeBn) rec.batchNo = writeBn;
      if (isBatchLine) batchLineKeys.add(rec.id);
      records.push(rec);
    }
  });

  if (!records.length) return [];

  records.forEach((r) => {
    if (batchLineKeys.has(r.id) || r.batchNo) {
      r.diffQuantity = finiteQty(r.quantity) - finiteQty(r.systemQuantity);
    }
  });

  const productIdsWithBatchLine = new Set(
    records.filter((r) => batchLineKeys.has(r.id) || r.batchNo).map((r) => r.productId)
  );
  const byProductId = new Map();
  records.forEach((r) => {
    if (batchLineKeys.has(r.id) || r.batchNo) return;
    byProductId.set(r.productId, (byProductId.get(r.productId) || 0) + finiteQty(r.quantity));
  });
  const firstRecordIndexByProductId = new Map();
  records.forEach((r, i) => {
    if (!firstRecordIndexByProductId.has(r.productId)) firstRecordIndexByProductId.set(r.productId, i);
  });
  byProductId.forEach((actualTotal, productId) => {
    if (productIdsWithBatchLine.has(productId)) return;
    const product = productMap.get(productId);
    const hasVariants = (product && product.variants && product.variants.length) > 0;
    const systemQty = hasVariants ?
    (product.variants || []).reduce(
      (s, v) => s + finiteQty(stock.getVariantDisplayQty(productId, warehouseId, v.id)),
      0
    ) :
    finiteQty(stock.getStock(productId, warehouseId, editingDocNumber));
    const diff = actualTotal - systemQty;
    const firstIdx = firstRecordIndexByProductId.get(productId);
    if (firstIdx !== undefined) records[firstIdx].diffQuantity = diff;
  });

  return records;
}

module.exports = {
  WAREHOUSE_PREF_KEY,
  newLineId,
  generateSTDocNumber,
  readStocktakePreference,
  writeStocktakePreference,
  resolvePreferredStocktakeWarehouse,
  createEmptyLine,
  buildInitialForm,
  lineTotalQty,
  lineWillBeSaved,
  recordsToLineItems,
  enrichLineForUi,
  validateStocktakeSave,
  buildStocktakeSaveRecords,
  hydrateEntryDate,
};