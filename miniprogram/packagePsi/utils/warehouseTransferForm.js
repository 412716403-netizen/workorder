/**
 * 调拨单表单（对齐 Web WarehousePanel handleSaveTransfer）
 */

const { PSI_TRANSFER_TYPE } = require('../config/warehouses.js');
const { categoryUsesBatchManagement } = require('../../utils/materialIssueBatch.js');
const { productHasColorSizeMatrix } = require('../../utils/productionPlans.js');
const { buildVariantMatrixUiModel } = require('../../utils/variantQtyMatrix.js');
const { formatPsiQtyDisplay } = require('../../utils/psiOpsAggregators.js');
const { localTodayYmd } = require('../../utils/dateYmd.js');
const {
  defaultEntryDate,
  hydrateEntryDate,
  psiEntryTimestampsFromDate,
} = require('../../utils/docEntryTime.js');
const { getProductUnitName } = require('../../utils/planFormCustomField.js');
const { BATCH_NO_UNTAGGED } = require('../../utils/materialStockConfirm.js');

const WAREHOUSE_PREF_KEY = 'PSI_TRANSFER_WAREHOUSE';
/** PsiRecord.lineGroupId @db.VarChar(50) */
const LINE_GROUP_ID_MAX = 50;

function newLineId() {
  return `tr-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampLineGroupId(id) {
  const s = String(id || '').trim() || newLineId();
  return s.length > LINE_GROUP_ID_MAX ? s.slice(0, LINE_GROUP_ID_MAX) : s;
}

function finiteQty(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function batchNoForWrite(bn) {
  const s = String(bn || '').trim();
  if (!s || s === BATCH_NO_UNTAGGED) return '';
  return s;
}

/** 对齐 Web generateTRDocNumber：TR-YYYYMMDD-NNN */
function generateTRDocNumber(existingRecords) {
  const today = localTodayYmd().replace(/-/g, '');
  const prefix = `TR-${today}`;
  const existing = (existingRecords || []).filter(
    (r) => r.type === PSI_TRANSFER_TYPE
      && String(r.docNumber || '').toLowerCase().startsWith(prefix.toLowerCase()),
  );
  const seqNums = existing.map((r) => {
    const m = String(r.docNumber || '').match(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i'));
    return m ? parseInt(m[1], 10) : 0;
  });
  const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
  return `${prefix}-${String(nextSeq).padStart(3, '0')}`;
}

function readTransferPreference() {
  try {
    const raw = wx.getStorageSync(WAREHOUSE_PREF_KEY);
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeTransferPreference(fromWarehouseId, toWarehouseId) {
  try {
    wx.setStorageSync(WAREHOUSE_PREF_KEY, { fromWarehouseId, toWarehouseId });
  } catch {
    /* ignore */
  }
}

function resolvePreferredTransferWarehouses(warehouses) {
  const list = warehouses || [];
  const pref = readTransferPreference();
  const from = list.find((w) => w.id === pref.fromWarehouseId);
  const to = list.find((w) => w.id === pref.toWarehouseId);
  return {
    fromWarehouseId: (from && from.id) || (list[0] && list[0].id) || '',
    toWarehouseId: (to && to.id) || (list[1] && list[1].id) || (list[0] && list[0].id) || '',
  };
}

function createEmptyLine() {
  return {
    id: newLineId(),
    productId: '',
    productName: '',
    quantity: '',
    variantQuantities: {},
    batch: '',
    useMatrix: false,
    matrixLayout: null,
    showBatch: false,
    unitName: 'PCS',
    lineTotalQty: 0,
  };
}

function buildInitialForm() {
  return {
    fromWarehouseId: '',
    fromWarehouseName: '',
    toWarehouseId: '',
    toWarehouseName: '',
    docNumber: '',
    transferDate: defaultEntryDate(),
    note: '',
    operator: '',
  };
}

function lineTotalQty(line) {
  if (line.variantQuantities && Object.keys(line.variantQuantities).length > 0) {
    return Object.values(line.variantQuantities).reduce((s, v) => s + (Number(v) || 0), 0);
  }
  return Number(line.quantity) || 0;
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
      if (item.variantId) variantQuantities[item.variantId] = formatPsiQtyDisplay(item.quantity);
      else quantity = String((Number(quantity) || 0) + formatPsiQtyDisplay(item.quantity));
    });
    const useMatrix = product && productHasColorSizeMatrix(product, category);
    const line = {
      id: rowId,
      productId: firstItem.productId,
      productName: (product && product.name) || '',
      quantity: useMatrix ? '' : quantity,
      variantQuantities: useMatrix ? variantQuantities : {},
      batch: batchNo,
      useMatrix,
      matrixLayout: useMatrix ? buildVariantMatrixUiModel(product, dictionaries, variantQuantities) : null,
      showBatch: categoryUsesBatchManagement(category),
      unitName: getProductUnitName(product, dictionaries),
      lineTotalQty: 0,
    };
    line.lineTotalQty = lineTotalQty(line);
    return line;
  });
}

function enrichLineForUi(line, productMap, categoryMap, dictionaries, stockIndex, fromWarehouseId) {
  const product = productMap.get(line.productId);
  const category = product && categoryMap.get(product.categoryId);
  const useMatrix = product && productHasColorSizeMatrix(product, category);
  let systemQtyText = '—';
  if (line.productId && fromWarehouseId && stockIndex) {
    const bn = String(line.batch || '').trim();
    if (bn && categoryUsesBatchManagement(category)) {
      let q = stockIndex.getBatchStock(line.productId, fromWarehouseId, bn);
      if (q === 0 && bn === BATCH_NO_UNTAGGED) {
        q = stockIndex.getBatchStock(line.productId, fromWarehouseId, '');
      }
      systemQtyText = String(q);
    } else if (useMatrix) {
      const total = (product.variants || []).reduce(
        (s, v) => s + stockIndex.getVariantDisplayQty(line.productId, fromWarehouseId, v.id),
        0,
      );
      systemQtyText = String(total);
    } else {
      systemQtyText = String(stockIndex.getStock(line.productId, fromWarehouseId));
    }
  }
  let systemQtyByVariantId;
  if (useMatrix && line.productId && fromWarehouseId && stockIndex && product) {
    systemQtyByVariantId = {};
    (product.variants || []).forEach((v) => {
      systemQtyByVariantId[v.id] = stockIndex.getVariantDisplayQty(line.productId, fromWarehouseId, v.id);
    });
  }
  const next = {
    ...line,
    productName: (product && product.name) || line.productName || '',
    useMatrix,
    showBatch: categoryUsesBatchManagement(category),
    unitName: getProductUnitName(product, dictionaries),
    systemQtyText,
    matrixLayout: useMatrix
      ? buildVariantMatrixUiModel(product, dictionaries, line.variantQuantities || {}, {
        systemQtyByVariantId,
      })
      : null,
  };
  next.lineTotalQty = lineTotalQty(next);
  return next;
}

function validateTransferSave(form, lines, productMap, categoryMap) {
  const fromId = String(form.fromWarehouseId || '').trim();
  const toId = String(form.toWarehouseId || '').trim();
  if (!fromId || !toId) return '请选择调出仓库和调入仓库';
  if (fromId === toId) return '调出仓库与调入仓库不能相同';
  const hasValid = (lines || []).some((i) => i.productId && lineTotalQty(i) > 0);
  if (!hasValid) return '请至少添加一条调拨明细且数量大于 0';
  for (const item of lines || []) {
    if (!item.productId) continue;
    const product = productMap.get(item.productId);
    const cat = product && categoryMap.get(product.categoryId);
    if (!categoryUsesBatchManagement(cat)) continue;
    const q = lineTotalQty(item);
    if (q <= 0) continue;
    const bn = String(item.batch || '').trim();
    if (!bn) return `调拨产品「${(product && product.name) || item.productId}」启用批次管理，请选择批次`;
  }
  return '';
}

async function validateTransferBatchStock(lines, fromWarehouseId, productMap, categoryMap, fetchStockBatches) {
  for (const item of lines || []) {
    if (!item.productId) continue;
    const product = productMap.get(item.productId);
    const cat = product && categoryMap.get(product.categoryId);
    if (!categoryUsesBatchManagement(cat)) continue;
    const q = lineTotalQty(item);
    if (q <= 0) continue;
    const bn = String(item.batch || '').trim();
    if (!bn) continue;
    const opts = await fetchStockBatches({ productId: item.productId, warehouseId: fromWarehouseId });
    const av = (opts || []).find((o) => {
      const ob = String(o.batchNo || '').trim() || BATCH_NO_UNTAGGED;
      return ob === bn;
    });
    const stock = av ? (av.stock || 0) : 0;
    if (q > stock) {
      return `「${(product && product.name) || item.productId}」批次「${bn}」在调出仓可用量不足（${stock}）`;
    }
  }
  return '';
}

function buildTransferSaveRecords(form, lines, productMap, categoryMap, docNumber, _timestamp, operator) {
  const fromId = form.fromWarehouseId;
  const toId = form.toWarehouseId;
  const { createdAt, timestamp: timestampIso } = psiEntryTimestampsFromDate(
    form.transferDate || defaultEntryDate()
  );
  const op = String(operator || '').trim().slice(0, 100) || undefined;
  const note = String(form.note || '').trim() || undefined;
  const records = [];
  let idx = 0;
  const baseId = Date.now();

  (lines || []).forEach((item) => {
    if (!item.productId) return;
    const product = productMap.get(item.productId);
    const batchCat = categoryUsesBatchManagement(product && categoryMap.get(product.categoryId));
    const bn = String(item.batch || '').trim();
    const writeBn = batchNoForWrite(bn);
    const lineGroupId = clampLineGroupId(item.id);
    const vq = item.variantQuantities || {};

    if (Object.keys(vq).length > 0) {
      Object.entries(vq).forEach(([variantId, qty]) => {
        const n = finiteQty(qty);
        if (n <= 0) return;
        const rec = {
          id: `psi-tr-${baseId}-${idx++}`,
          type: PSI_TRANSFER_TYPE,
          docNumber,
          timestamp: timestampIso,
          fromWarehouseId: fromId,
          toWarehouseId: toId,
          productId: item.productId,
          variantId,
          quantity: n,
          note,
          lineGroupId,
          createdAt,
          operator: op,
        };
        if (batchCat && writeBn) rec.batchNo = writeBn;
        records.push(rec);
      });
    } else {
      const n = finiteQty(item.quantity);
      if (n <= 0) return;
      const rec = {
        id: `psi-tr-${baseId}-${idx++}`,
        type: PSI_TRANSFER_TYPE,
        docNumber,
        timestamp: timestampIso,
        fromWarehouseId: fromId,
        toWarehouseId: toId,
        productId: item.productId,
        quantity: n,
        note,
        lineGroupId,
        createdAt,
        operator: op,
      };
      if (batchCat && writeBn) rec.batchNo = writeBn;
      records.push(rec);
    }
  });
  return records;
}

module.exports = {
  WAREHOUSE_PREF_KEY,
  newLineId,
  generateTRDocNumber,
  readTransferPreference,
  writeTransferPreference,
  resolvePreferredTransferWarehouses,
  createEmptyLine,
  buildInitialForm,
  lineTotalQty,
  recordsToLineItems,
  enrichLineForUi,
  validateTransferSave,
  validateTransferBatchStock,
  buildTransferSaveRecords,
  hydrateEntryDate,
};
