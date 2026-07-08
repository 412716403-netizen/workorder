/**
 * 销售订单表单状态与保存（对齐 Web OrderBillFormPage SALES_ORDER 分支）
 */

const _require = require('./psiOpsAggregators.js'),groupDocItemsByLineGroup = _require.groupDocItemsByLineGroup,formatPsiQtyDisplay = _require.formatPsiQtyDisplay;
const _require2 = require('./productionPlans.js'),productHasColorSizeMatrix = _require2.productHasColorSizeMatrix;
const _require3 = require('./variantQtyMatrix.js'),buildVariantMatrixUiModel = _require3.buildVariantMatrixUiModel;
const _require4 = require('./dateYmd.js'),localTodayYmd = _require4.localTodayYmd;
const _require5 = require('./psiPartnerProductLastPrice.js'),resolveDefaultSalesPrice = _require5.resolveDefaultSalesPrice;

function newLineId() {
  return `so-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    salesPrice: '',
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
    operator: ''
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
  const price = Number(line.salesPrice) || 0;
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
    salesPrice: line.salesPrice != null ? String(line.salesPrice) : ''
  };
}

function computeFormTotals(lines, showAmount) {
  let totalQty = 0;
  let totalAmount = 0;
  (lines || []).forEach((line) => {
    const qty = psiOrderLineTotalQty(line);
    const price = Number(line.salesPrice) || 0;
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

function validateSalesOrderSave(form, lines) {
  if (!form || !String(form.partner || '').trim()) {
    wx.showToast({ title: '请选择客户', icon: 'none' });
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
    (r) => r.type === 'SALES_ORDER' && String(r.docNumber) === String(editingDocNumber)
  );
  let min = 0;
  lines.forEach((r) => {
    const ts = r.timestamp ? new Date(r.timestamp).getTime() : 0;
    if (ts > 0 && (min === 0 || ts < min)) min = ts;
  });
  if (min > 0) return new Date(min).toISOString();
  return new Date().toISOString();
}

function soCreatedAtIsoForSave(existingRecords, editingDocNumber) {
  if (!editingDocNumber) return localCalendarYmdStartToIso(localTodayYmd());
  const row = (existingRecords || []).find(
    (r) => r.type === 'SALES_ORDER' && String(r.docNumber) === String(editingDocNumber)
  );
  if (!row || row.createdAt == null || row.createdAt === '') {
    return localCalendarYmdStartToIso(localTodayYmd());
  }
  if (typeof row.createdAt === 'string' && row.createdAt.includes('T')) return row.createdAt;
  const ymd = String(row.createdAt).slice(0, 10);
  return localCalendarYmdStartToIso(ymd || localTodayYmd());
}

function preservedSalesOrderLinePsi(recordsList, sourceRecordIds, variantId, newQty) {
  const ids = (sourceRecordIds || []).filter(Boolean);
  if (!ids.length || newQty <= 0) return {};
  const idSet = new Set(ids);
  const candidates = (recordsList || []).filter(
    (r) =>
    r.type === 'SALES_ORDER' &&
    idSet.has(r.id) && (
    variantId ? r.variantId === variantId : !r.variantId)
  );
  if (!candidates.length) return {};
  const shippedRaw = candidates.reduce((s, r) => s + (Number(r.shippedQuantity) || 0), 0);
  const allocatedRaw = candidates.reduce((s, r) => s + (Number(r.allocatedQuantity) || 0), 0);
  const shipped = Math.min(shippedRaw, newQty);
  const allocated = Math.min(Math.max(allocatedRaw, shipped), newQty);
  const allocationWarehouseId = candidates.map((r) => r.allocationWarehouseId).find((w) => w != null && w !== '');
  const out = { shippedQuantity: shipped, allocatedQuantity: allocated };
  if (allocationWarehouseId) out.allocationWarehouseId = allocationWarehouseId;
  return out;
}

function buildSalesOrderSaveRecords(opts) {
  const
    form =





    opts.form,lines = opts.lines,docNumber = opts.docNumber,editingDocNumber = opts.editingDocNumber,existingRecords = opts.existingRecords,operator = opts.operator;
  const timestamp = psiDocTimestampIsoForSave(existingRecords, editingDocNumber);
  const soCreatedAtIso = soCreatedAtIsoForSave(existingRecords, editingDocNumber);
  const newRecords = [];
  let recIdx = 0;

  (lines || []).forEach((item) => {
    if (!item.productId) return;
    const price = Number(item.salesPrice) || 0;
    if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
      Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
        const n = Number(qty) || 0;
        if (n <= 0) return;
        newRecords.push({
          id: `psi-so-${Date.now()}-${recIdx++}`,
          type: 'SALES_ORDER',
          docNumber,
          timestamp,
          partner: form.partner,
          partnerId: form.partnerId || '',
          productId: item.productId,
          variantId,
          quantity: n,
          salesPrice: price,
          amount: n * price,
          dueDate: '',
          note: '',
          operator: operator || '',
          lineGroupId: item.id,
          createdAt: soCreatedAtIso,
          ...preservedSalesOrderLinePsi(existingRecords, item.sourceRecordIds, variantId, n)
        });
      });
    } else {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) return;
      newRecords.push({
        id: `psi-so-${Date.now()}-${recIdx++}`,
        type: 'SALES_ORDER',
        docNumber,
        timestamp,
        partner: form.partner,
        partnerId: form.partnerId || '',
        productId: item.productId,
        quantity: qty,
        salesPrice: price,
        amount: qty * price,
        dueDate: '',
        note: '',
        operator: operator || '',
        lineGroupId: item.id,
        createdAt: soCreatedAtIso,
        ...preservedSalesOrderLinePsi(existingRecords, item.sourceRecordIds, undefined, qty)
      });
    }
  });

  return newRecords;
}

function applyDefaultSalesPrices(lines, records, form, productMap, excludeDocNumber) {
  return (lines || []).map((line) => {
    if (!line.productId) return line;
    const price = resolveDefaultSalesPrice(
      records,
      form.partnerId,
      form.partner,
      line.productId,
      productMap,
      excludeDocNumber
    );
    return { ...line, salesPrice: String(price) };
  });
}

module.exports = {
  newLineId,
  psiOrderLineTotalQty,
  createEmptyLine,
  buildInitialForm,
  recordsToLineItems,
  enrichLineForUi,
  computeFormTotals,
  validateSalesOrderSave,
  buildSalesOrderSaveRecords,
  applyDefaultSalesPrices,
  preservedSalesOrderLinePsi
};