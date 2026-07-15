/**
 * 销售单表单状态与保存（对齐 Web OrderBillFormPage SALES_BILL 分支）
 */

const _require = require('../config/salesBills.js'),PSI_TYPE = _require.PSI_TYPE;
const _require2 = require('../../utils/psiOpsAggregators.js'),groupDocItemsByLineGroup = _require2.groupDocItemsByLineGroup,formatPsiQtyDisplay = _require2.formatPsiQtyDisplay;
const _require3 = require('../../utils/productionPlans.js'),productHasColorSizeMatrix = _require3.productHasColorSizeMatrix;
const _require4 = require('../../utils/variantQtyMatrix.js'),buildVariantMatrixUiModel = _require4.buildVariantMatrixUiModel;
const _require5 = require('../../utils/dateYmd.js'),localTodayYmd = _require5.localTodayYmd;
const {
  defaultEntryDate,
  defaultEntryTimeHm,
  hydratePsiEntryFields,
  psiEntryTimestampsFromDatetime,
} = require('../../utils/docEntryTime.js');
const _require6 = require('../../utils/materialIssueBatch.js'),categoryUsesBatchManagement = _require6.categoryUsesBatchManagement;
const _require7 = require('../../utils/materialStockConfirm.js'),BATCH_NO_UNTAGGED = _require7.BATCH_NO_UNTAGGED;
const _require8 = require('./purchaseBillBatch.js'),listLocalAvailableBatches = _require8.listLocalAvailableBatches;

const WAREHOUSE_PREF_KEY = 'PSI_SALES_BILL_WAREHOUSE';

function newLineId() {
  return `sb-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readWarehousePreference() {
  try {
    return wx.getStorageSync(WAREHOUSE_PREF_KEY) || '';
  } catch {
    return '';
  }
}

function writeWarehousePreference(warehouseId) {
  try {
    if (warehouseId) wx.setStorageSync(WAREHOUSE_PREF_KEY, warehouseId);
  } catch {

    /* ignore */}
}

function resolvePreferredWarehouse(warehouses) {
  const list = warehouses || [];
  if (!list.length) return null;
  const prefId = readWarehousePreference();
  if (prefId) {
    const found = list.find((w) => w.id === prefId);
    if (found) return found;
  }
  return list[0];
}

function sbLineTotalQty(line) {
  if (line.variantQuantities && Object.keys(line.variantQuantities).length > 0) {
    return Object.values(line.variantQuantities).reduce((s, v) => s + (Number(v) || 0), 0);
  }
  return Number(line.quantity) || 0;
}

function createEmptyLine() {
  return {
    id: newLineId(),
    productId: '',
    productName: '',
    quantity: '',
    salesPrice: '',
    variantQuantities: {},
    batch: '',
    useMatrix: false,
    matrixLayout: null,
    showBatch: false,
    unitName: 'PCS',
    lineTotalQty: 0,
    lineAmountText: '',
    showAmount: false
  };
}

function buildInitialForm() {
  return {
    partner: '',
    partnerId: '',
    warehouseId: '',
    warehouseName: '',
    docNumber: '',
    operator: '',
    note: '',
    createdAt: defaultEntryDate(),
    createdAtTime: defaultEntryTimeHm(),
  };
}

function recordsToLineItems(records) {
  const lineMap = groupDocItemsByLineGroup(records || []);
  return Object.entries(lineMap).map(([lgId, recs]) => {var _first$salesPrice;
    const first = recs[0] || {};
    const hasVar = recs.some((r) => r.variantId);
    const vq = {};
    if (hasVar) {
      recs.forEach((r) => {
        if (r.variantId) vq[r.variantId] = (vq[r.variantId] || 0) + formatPsiQtyDisplay(r.quantity);
      });
    }
    const lineQtyNoVar = recs.reduce((s, r) => s + formatPsiQtyDisplay(r.quantity), 0);
    return {
      id: lgId,
      productId: first.productId || '',
      productName: first.productName || '',
      quantity: hasVar ? '' : String(lineQtyNoVar || ''),
      salesPrice: String((_first$salesPrice = first.salesPrice) != null ? _first$salesPrice : ''),
      variantQuantities: hasVar ? vq : {},
      batch: first.batchNo || first.batch || '',
      sourceRecordIds: recs.map((r) => r.id)
    };
  });
}

function enrichLineForUi(line, ctx) {
  const productMap = ctx.productMap,categoryMap = ctx.categoryMap,dictionaries = ctx.dictionaries,showAmount = ctx.showAmount;
  const product = line.productId && productMap ? productMap.get(line.productId) : null;
  const category = product && categoryMap ? categoryMap.get(product.categoryId) : null;
  const useMatrix = Boolean(product && productHasColorSizeMatrix(product, category));
  const showBatch = Boolean(product && categoryUsesBatchManagement(category) && !useMatrix);
  const unitName = product && product.unit || 'PCS';
  let matrixLayout = null;
  if (useMatrix && product) {
    matrixLayout = buildVariantMatrixUiModel(product, dictionaries, line.variantQuantities || {});
  }
  const qty = sbLineTotalQty(line);
  const price = Number(line.salesPrice) || 0;
  const amount = qty * price;
  return {
    ...line,
    productName: product && product.name || line.productName || '',
    useMatrix,
    showBatch,
    matrixLayout,
    unitName,
    lineTotalQty: qty,
    lineAmountText: showAmount && amount !== 0 ? `¥${amount.toFixed(2)}` : '',
    showAmount: Boolean(showAmount),
    quantity: line.quantity != null ? String(line.quantity) : '',
    salesPrice: line.salesPrice != null ? String(line.salesPrice) : '',
    batch: line.batch != null ? String(line.batch) : ''
  };
}

function computeFormTotals(lines, showAmount) {
  let totalQty = 0;
  let totalAmount = 0;
  (lines || []).forEach((line) => {
    const qty = sbLineTotalQty(line);
    const price = Number(line.salesPrice) || 0;
    totalQty += qty;
    totalAmount += qty * price;
  });
  const hasLine = (lines || []).some((l) => l.productId && sbLineTotalQty(l) !== 0);
  return {
    totalQty,
    totalQtyText: `${totalQty} PCS`,
    totalAmountText: showAmount ? `¥${totalAmount.toFixed(2)}` : '',
    showAmount: Boolean(showAmount),
    canSubmit: hasLine
  };
}

function resolveBatchForSave(item) {
  if (!item || !item.showBatch) {
    const raw = item && item.batch != null ? String(item.batch).trim() : '';
    return raw || undefined;
  }
  const raw = item.batch != null ? String(item.batch).trim() : '';
  if (!raw || raw === BATCH_NO_UNTAGGED) {
    return BATCH_NO_UNTAGGED;
  }
  return raw;
}

function validateSalesBillSave(form, lines, opts) {
  const _ref = opts || {},psiRecordsForBatch = _ref.psiRecordsForBatch;
  if (!form || !String(form.partner || '').trim()) {
    wx.showToast({ title: '请选择客户', icon: 'none' });
    return false;
  }
  if (!form.warehouseId) {
    wx.showToast({ title: '请选择出库仓库', icon: 'none' });
    return false;
  }
  const productLines = (lines || []).filter((l) => l.productId);
  if (!productLines.length) {
    wx.showToast({ title: '请至少添加一条明细', icon: 'none' });
    return false;
  }
  const invalid = productLines.find((l) => sbLineTotalQty(l) === 0);
  if (invalid) {
    wx.showToast({ title: '明细数量不能为 0', icon: 'none' });
    return false;
  }
  const whId = form.warehouseId;
  for (const line of productLines) {
    const qty = sbLineTotalQty(line);
    if (!line.showBatch || qty <= 0) continue;
    const batchVal = resolveBatchForSave(line);
    if (!batchVal) {
      wx.showToast({ title: '启用批次管理的产品须选择出库批次', icon: 'none' });
      return false;
    }
    if (psiRecordsForBatch && whId) {
      const avail = listLocalAvailableBatches(psiRecordsForBatch, line.productId, whId);
      const hit = avail.find((b) => b.batchNo === batchVal);
      const stock = hit ? hit.stock : 0;
      if (qty > stock) {
        wx.showToast({ title: '批次可用库存不足', icon: 'none' });
        return false;
      }
    }
  }
  return true;
}

function localCalendarYmdStartToIso(ymd) {
  const s = String(ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date().toISOString();
  return `${s}T00:00:00.000Z`;
}

function psiDocTimestampIsoForSave(existingRecords, editingDocNumber) {
  if (!editingDocNumber) return new Date().toISOString();
  const lines = (existingRecords || []).filter(
    (r) => r.type === PSI_TYPE && String(r.docNumber) === String(editingDocNumber)
  );
  let min = 0;
  lines.forEach((r) => {
    const ts = r.timestamp ? new Date(r.timestamp).getTime() : 0;
    if (ts > 0 && (min === 0 || ts < min)) min = ts;
  });
  if (min > 0) return new Date(min).toISOString();
  return new Date().toISOString();
}

function sbCreatedAtIsoForSave(existingRecords, editingDocNumber) {
  if (!editingDocNumber) return localCalendarYmdStartToIso(localTodayYmd());
  const row = (existingRecords || []).find(
    (r) => r.type === PSI_TYPE && String(r.docNumber) === String(editingDocNumber)
  );
  if (!row || row.createdAt == null || row.createdAt === '') {
    return localCalendarYmdStartToIso(localTodayYmd());
  }
  if (typeof row.createdAt === 'string' && row.createdAt.includes('T')) return row.createdAt;
  const ymd = String(row.createdAt).slice(0, 10);
  return localCalendarYmdStartToIso(ymd || localTodayYmd());
}

function buildSalesBillSaveRecords(opts) {
  const
    form =





    opts.form,lines = opts.lines,docNumber = opts.docNumber,editingDocNumber = opts.editingDocNumber,existingRecords = opts.existingRecords,operator = opts.operator;
  const { createdAt: sbCreatedAtIso, timestamp } = psiEntryTimestampsFromDatetime(
    form.createdAt || defaultEntryDate(),
    form.createdAtTime
  );
  const head = editingDocNumber ?
  (existingRecords || []).find(
    (r) => r.type === PSI_TYPE && r.docNumber === editingDocNumber
  ) :
  null;
  const notePreserve = head && editingDocNumber ? head.note != null ? String(head.note) : '' : '';
  const newRecords = [];
  let recIdx = 0;

  (lines || []).forEach((item) => {
    if (!item.productId) return;
    const price = Number(item.salesPrice) || 0;
    const batchVal = resolveBatchForSave(item);

    if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
      Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
        const n = Number(qty) || 0;
        if (n === 0) return;
        newRecords.push({
          id: `psi-sb-${Date.now()}-${recIdx++}`,
          type: PSI_TYPE,
          docNumber,
          timestamp,
          _savedAtMs: Date.now(),
          partner: form.partner,
          partnerId: form.partnerId || '',
          productId: item.productId,
          variantId,
          quantity: n,
          salesPrice: price,
          amount: n * price,
          warehouseId: form.warehouseId,
          dueDate: '',
          note: notePreserve,
          operator: operator || '',
          lineGroupId: item.id,
          createdAt: sbCreatedAtIso
        });
      });
    } else {
      const qty = Number(item.quantity) || 0;
      if (qty === 0) return;
      newRecords.push({
        id: `psi-sb-${Date.now()}-${recIdx++}`,
        type: PSI_TYPE,
        docNumber,
        timestamp,
        _savedAtMs: Date.now(),
        partner: form.partner,
        partnerId: form.partnerId || '',
        productId: item.productId,
        quantity: qty,
        salesPrice: price,
        amount: qty * price,
        warehouseId: form.warehouseId,
        dueDate: '',
        note: notePreserve,
        operator: operator || '',
        lineGroupId: item.id,
        createdAt: sbCreatedAtIso,
        ...(batchVal ? { batch: batchVal } : {})
      });
    }
  });

  return newRecords;
}

module.exports = {
  WAREHOUSE_PREF_KEY,
  newLineId,
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredWarehouse,
  sbLineTotalQty,
  createEmptyLine,
  buildInitialForm,
  recordsToLineItems,
  enrichLineForUi,
  computeFormTotals,
  resolveBatchForSave,
  validateSalesBillSave,
  buildSalesBillSaveRecords,
  hydratePsiEntryFields,
};