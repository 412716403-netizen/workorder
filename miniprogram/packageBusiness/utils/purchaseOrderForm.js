/**
 * 采购订单表单状态与保存（对齐 Web OrderBillFormPage PURCHASE_ORDER 分支）
 */

const _require = require('../config/purchaseOrders.js'),PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID = _require.PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID,PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER = _require.PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER;
const _require2 = require('./psiOpsAggregators.js'),groupDocItemsByLineGroup = _require2.groupDocItemsByLineGroup,formatPsiQtyDisplay = _require2.formatPsiQtyDisplay;
const _require3 = require('./productionPlans.js'),productHasColorSizeMatrix = _require3.productHasColorSizeMatrix;
const _require4 = require('./variantQtyMatrix.js'),buildVariantMatrixUiModel = _require4.buildVariantMatrixUiModel;
const _require5 = require('./dateYmd.js'),localTodayYmd = _require5.localTodayYmd;
const {
  defaultEntryDate,
  defaultEntryTimeHm,
  hydratePsiEntryFields,
  psiEntryTimestampsFromDatetime,
} = require('./docEntryTime.js');

function newLineId() {
  return `po-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function psiOrderLineTotalQty(line) {
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
    purchasePrice: '',
    variantQuantities: {},
    useMatrix: false,
    matrixLayout: null,
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
    docNumber: '',
    operator: '',
    createdAt: defaultEntryDate(),
    createdAtTime: defaultEntryTimeHm(),
  };
}

function recordsToLineItems(records) {
  const lineMap = groupDocItemsByLineGroup(records || []);
  return Object.entries(lineMap).map(([lgId, recs]) => {var _first$purchasePrice;
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
      purchasePrice: String((_first$purchasePrice = first.purchasePrice) != null ? _first$purchasePrice : ''),
      variantQuantities: hasVar ? vq : {},
      sourceRecordIds: recs.map((r) => r.id)
    };
  });
}

function enrichLineForUi(line, ctx) {
  const productMap = ctx.productMap,categoryMap = ctx.categoryMap,dictionaries = ctx.dictionaries,showAmount = ctx.showAmount;
  const product = line.productId && productMap ? productMap.get(line.productId) : null;
  const category = product && categoryMap ? categoryMap.get(product.categoryId) : null;
  const useMatrix = Boolean(product && productHasColorSizeMatrix(product, category));
  const unitName = product && product.unit || 'PCS';
  let matrixLayout = null;
  if (useMatrix && product) {
    matrixLayout = buildVariantMatrixUiModel(product, dictionaries, line.variantQuantities || {});
  }
  const qty = psiOrderLineTotalQty(line);
  const price = Number(line.purchasePrice) || 0;
  const amount = qty * price;
  return {
    ...line,
    productName: product && product.name || line.productName || '',
    useMatrix,
    matrixLayout,
    unitName,
    lineTotalQty: qty,
    lineAmountText: showAmount && amount > 0 ? `¥${amount.toFixed(2)}` : '',
    showAmount: Boolean(showAmount),
    quantity: line.quantity != null ? String(line.quantity) : '',
    purchasePrice: line.purchasePrice != null ? String(line.purchasePrice) : ''
  };
}

function computeFormTotals(lines, showAmount) {
  let totalQty = 0;
  let totalAmount = 0;
  (lines || []).forEach((line) => {
    const qty = psiOrderLineTotalQty(line);
    const price = Number(line.purchasePrice) || 0;
    totalQty += qty;
    totalAmount += qty * price;
  });
  return {
    totalQty,
    totalQtyText: `${totalQty} PCS`,
    totalAmountText: showAmount ? `¥${totalAmount.toFixed(2)}` : '',
    showAmount: Boolean(showAmount),
    canSubmit: (lines || []).some((l) => l.productId && psiOrderLineTotalQty(l) > 0)
  };
}

function validatePurchaseOrderSave(form, lines) {
  if (!form || !String(form.partner || '').trim()) {
    wx.showToast({ title: '请选择供应商', icon: 'none' });
    return false;
  }
  const productLines = (lines || []).filter((l) => l.productId);
  if (!productLines.length) {
    wx.showToast({ title: '请至少添加一条明细', icon: 'none' });
    return false;
  }
  const invalid = productLines.find((l) => psiOrderLineTotalQty(l) <= 0);
  if (invalid) {
    wx.showToast({ title: '明细数量须大于 0', icon: 'none' });
    return false;
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
    (r) => r.type === 'PURCHASE_ORDER' && String(r.docNumber) === String(editingDocNumber)
  );
  let min = 0;
  lines.forEach((r) => {
    const ts = r.timestamp ? new Date(r.timestamp).getTime() : 0;
    if (ts > 0 && (min === 0 || ts < min)) min = ts;
  });
  if (min > 0) return new Date(min).toISOString();
  return new Date().toISOString();
}

function poCreatedAtIsoForSave(existingRecords, editingDocNumber) {
  if (!editingDocNumber) return localCalendarYmdStartToIso(localTodayYmd());
  const row = (existingRecords || []).find(
    (r) => r.type === 'PURCHASE_ORDER' && String(r.docNumber) === String(editingDocNumber)
  );
  if (!row || row.createdAt == null || row.createdAt === '') {
    return localCalendarYmdStartToIso(localTodayYmd());
  }
  if (typeof row.createdAt === 'string' && row.createdAt.includes('T')) return row.createdAt;
  const ymd = String(row.createdAt).slice(0, 10);
  return localCalendarYmdStartToIso(ymd || localTodayYmd());
}

function buildHeaderCustomData(existingRecords, editingDocNumber) {
  if (!editingDocNumber) return null;
  const first = (existingRecords || []).find(
    (r) => r.type === 'PURCHASE_ORDER' && String(r.docNumber) === String(editingDocNumber)
  );
  if (!first || !first.customData || typeof first.customData !== 'object') return null;
  const raw = { ...first.customData };
  const sid = String(raw[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID] || '').trim();
  const snum = String(raw[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER] || '').trim();
  if (!sid && !snum) return Object.keys(raw).length ? raw : null;
  const out = {};
  if (sid) out[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID] = sid;
  if (snum) out[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER] = snum;
  return out;
}

function buildPurchaseOrderSaveRecords(opts) {
  const
    form =





    opts.form,lines = opts.lines,docNumber = opts.docNumber,editingDocNumber = opts.editingDocNumber,existingRecords = opts.existingRecords,operator = opts.operator;
  const { createdAt: poCreatedAtIso, timestamp } = psiEntryTimestampsFromDatetime(
    form.createdAt || defaultEntryDate(),
    form.createdAtTime
  );
  const headerCustomData = buildHeaderCustomData(existingRecords, editingDocNumber);
  const newRecords = [];
  let recIdx = 0;

  (lines || []).forEach((item) => {
    if (!item.productId) return;
    const price = Number(item.purchasePrice) || 0;
    if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
      Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
        const n = Number(qty) || 0;
        if (n <= 0) return;
        newRecords.push({
          id: `psi-po-${Date.now()}-${recIdx++}`,
          type: 'PURCHASE_ORDER',
          docNumber,
          timestamp,
          partner: form.partner,
          partnerId: form.partnerId || '',
          productId: item.productId,
          variantId,
          quantity: n,
          purchasePrice: price,
          amount: n * price,
          dueDate: '',
          note: '',
          operator: operator || '',
          lineGroupId: item.id,
          createdAt: poCreatedAtIso,
          ...(headerCustomData ? { customData: headerCustomData } : {})
        });
      });
    } else {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) return;
      newRecords.push({
        id: `psi-po-${Date.now()}-${recIdx++}`,
        type: 'PURCHASE_ORDER',
        docNumber,
        timestamp,
        partner: form.partner,
        partnerId: form.partnerId || '',
        productId: item.productId,
        quantity: qty,
        purchasePrice: price,
        amount: qty * price,
        dueDate: '',
        note: '',
        operator: operator || '',
        lineGroupId: item.id,
        createdAt: poCreatedAtIso,
        ...(headerCustomData ? { customData: headerCustomData } : {})
      });
    }
  });

  return newRecords;
}

function applyLastPurchasePrices(lines, prices, productIndexByLine) {
  const next = (lines || []).map((line, idx) => {
    const pIdx = productIndexByLine ? productIndexByLine[idx] : idx;
    const price = prices && prices[pIdx] && prices[pIdx].price != null ?
    Number(prices[pIdx].price) :
    null;
    if (price == null || !line.productId) return line;
    return { ...line, purchasePrice: String(price) };
  });
  return next;
}

module.exports = {
  newLineId,
  psiOrderLineTotalQty,
  createEmptyLine,
  buildInitialForm,
  recordsToLineItems,
  enrichLineForUi,
  computeFormTotals,
  validatePurchaseOrderSave,
  buildPurchaseOrderSaveRecords,
  applyLastPurchasePrices,
  hydratePsiEntryFields,
};