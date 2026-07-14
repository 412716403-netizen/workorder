/**
 * 采购入库表单状态与保存（对齐 Web OrderBillFormPage PURCHASE_BILL 分支）
 */

const _require = require('../config/purchaseBills.js'),PSI_TYPE = _require.PSI_TYPE;
const _require2 =



  require('./psiOpsAggregators.js'),groupDocItemsByLineGroup = _require2.groupDocItemsByLineGroup,formatPsiQtyDisplay = _require2.formatPsiQtyDisplay,purchaseOrderDocHasUnsettled = _require2.purchaseOrderDocHasUnsettled;
const _require3 = require('./productionPlans.js'),productHasColorSizeMatrix = _require3.productHasColorSizeMatrix;
const _require4 = require('./variantQtyMatrix.js'),buildVariantMatrixUiModel = _require4.buildVariantMatrixUiModel;
const _require5 = require('./dateYmd.js'),localTodayYmd = _require5.localTodayYmd;
const {
  defaultEntryDate,
  defaultEntryTimeHm,
  hydratePsiEntryFields,
  psiEntryTimestampsFromDatetime,
} = require('./docEntryTime.js');
const _require6 = require('./materialIssueBatch.js'),categoryUsesBatchManagement = _require6.categoryUsesBatchManagement;
const _require7 = require('./materialStockConfirm.js'),BATCH_NO_UNTAGGED = _require7.BATCH_NO_UNTAGGED;

const WAREHOUSE_PREF_KEY = 'PSI_PURCHASE_BILL_WAREHOUSE';

function newLineId() {
  return `pb-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function psiBillLineTotalQty(line) {
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
    batch: '',
    sourceOrderNumber: '',
    sourceLineId: '',
    lineNote: '',
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
    let sourceOrderNumber = '';
    let sourceLineId = '';
    recs.forEach((r) => {
      if (r.sourceOrderNumber) sourceOrderNumber = String(r.sourceOrderNumber);
      if (r.sourceLineId) sourceLineId = String(r.sourceLineId);
    });
    return {
      id: lgId,
      productId: first.productId || '',
      productName: first.productName || '',
      quantity: hasVar ? '' : String(lineQtyNoVar || ''),
      purchasePrice: String((_first$purchasePrice = first.purchasePrice) != null ? _first$purchasePrice : ''),
      variantQuantities: hasVar ? vq : {},
      batch: first.batchNo || first.batch || '',
      sourceOrderNumber,
      sourceLineId,
      lineNote: first.note != null ? String(first.note) : '',
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
  const qty = psiBillLineTotalQty(line);
  const price = Number(line.purchasePrice) || 0;
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
    purchasePrice: line.purchasePrice != null ? String(line.purchasePrice) : '',
    batch: line.batch != null ? String(line.batch) : ''
  };
}

function computeFormTotals(lines, showAmount) {
  let totalQty = 0;
  let totalAmount = 0;
  (lines || []).forEach((line) => {
    const qty = psiBillLineTotalQty(line);
    const price = Number(line.purchasePrice) || 0;
    totalQty += qty;
    totalAmount += qty * price;
  });
  const hasLine = (lines || []).some((l) => l.productId && psiBillLineTotalQty(l) !== 0);
  return {
    totalQty,
    totalQtyText: `${totalQty} PCS`,
    totalAmountText: showAmount ? `¥${totalAmount.toFixed(2)}` : '',
    showAmount: Boolean(showAmount),
    canSubmit: hasLine
  };
}

/** 启用批次管理的行：未填批号 → 哨兵「无批号」（与 Web / shared BATCH_NO_UNTAGGED 一致） */
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

function validatePurchaseBillSave(form, lines) {
  if (!form || !String(form.partner || '').trim()) {
    wx.showToast({ title: '请选择供应商', icon: 'none' });
    return false;
  }
  if (!form.warehouseId) {
    wx.showToast({ title: '请选择入库仓库', icon: 'none' });
    return false;
  }
  const productLines = (lines || []).filter((l) => l.productId);
  if (!productLines.length) {
    wx.showToast({ title: '请至少添加一条明细', icon: 'none' });
    return false;
  }
  const invalid = productLines.find((l) => psiBillLineTotalQty(l) === 0);
  if (invalid) {
    wx.showToast({ title: '明细数量不能为 0', icon: 'none' });
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

function pbCreatedAtIsoForSave(existingRecords, editingDocNumber) {
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

function pbNoteForLine(item) {
  const kept = item.lineNote != null && String(item.lineNote).trim() !== '' ? String(item.lineNote).trim() : '';
  if (kept) return kept;
  if (item.sourceOrderNumber && item.sourceLineId) {
    return `由订单[${item.sourceOrderNumber}]商品明细转化`;
  }
  return '';
}

function pbOperatorForLine(item, operator) {
  if (item.sourceOrderNumber && item.sourceLineId) {
    return `${operator}(订单转化)`;
  }
  return operator;
}

function pbSourceLinkForLine(item) {
  const son = item.sourceOrderNumber != null && String(item.sourceOrderNumber).trim() !== '' ?
  String(item.sourceOrderNumber).trim() : '';
  const sl = item.sourceLineId != null && String(item.sourceLineId).trim() !== '' ?
  String(item.sourceLineId).trim() : '';
  if (son && sl) return { sourceOrderNumber: son, sourceLineId: sl };
  return {};
}

function buildPurchaseBillSaveRecords(opts) {
  const
    form =





    opts.form,lines = opts.lines,docNumber = opts.docNumber,editingDocNumber = opts.editingDocNumber,existingRecords = opts.existingRecords,operator = opts.operator;
  const { createdAt: pbCreatedAtIso, timestamp } = psiEntryTimestampsFromDatetime(
    form.createdAt || defaultEntryDate(),
    form.createdAtTime
  );
  const newRecords = [];
  let recIdx = 0;

  (lines || []).forEach((item) => {
    if (!item.productId) return;
    const price = Number(item.purchasePrice) || 0;
    const note = pbNoteForLine(item);
    const op = pbOperatorForLine(item, operator || '');
    const sourceLink = pbSourceLinkForLine(item);
    const batchVal = resolveBatchForSave(item);

    if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
      Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
        const n = Number(qty) || 0;
        if (n === 0) return;
        newRecords.push({
          id: `psi-pb-${Date.now()}-${recIdx++}`,
          type: PSI_TYPE,
          docNumber,
          timestamp,
          partner: form.partner,
          partnerId: form.partnerId || '',
          productId: item.productId,
          variantId,
          quantity: n,
          purchasePrice: price,
          amount: n * price,
          warehouseId: form.warehouseId,
          dueDate: '',
          note,
          operator: op,
          lineGroupId: item.id,
          createdAt: pbCreatedAtIso,
          ...sourceLink,
          ...(batchVal ? { batch: batchVal } : {})
        });
      });
    } else {
      const qty = Number(item.quantity) || 0;
      if (qty === 0) return;
      newRecords.push({
        id: `psi-pb-${Date.now()}-${recIdx++}`,
        type: PSI_TYPE,
        docNumber,
        timestamp,
        partner: form.partner,
        partnerId: form.partnerId || '',
        productId: item.productId,
        quantity: qty,
        purchasePrice: price,
        amount: qty * price,
        warehouseId: form.warehouseId,
        dueDate: '',
        note,
        operator: op,
        lineGroupId: item.id,
        createdAt: pbCreatedAtIso,
        ...sourceLink,
        ...(batchVal ? { batch: batchVal } : {})
      });
    }
  });

  return newRecords;
}

function getReceivedQty(receivedByOrderLine, docNum, lineId) {var _receivedByOrderLine;
  return (_receivedByOrderLine = receivedByOrderLine[`${docNum}::${lineId}`]) != null ? _receivedByOrderLine : 0;
}

function buildPendingPoLineUi(item, docNumber, ctx) {
  const receivedByOrderLine = ctx.receivedByOrderLine,productMap = ctx.productMap,categoryMap = ctx.categoryMap,dictionaries = ctx.dictionaries,showAmount = ctx.showAmount;
  const orderQty = formatPsiQtyDisplay(item.quantity);
  const received = getReceivedQty(receivedByOrderLine, docNumber, item.id);
  const remaining = Math.max(0, orderQty - received);
  if (remaining <= 0) return null;

  const product = item.productId && productMap ? productMap.get(item.productId) : null;
  const category = product && categoryMap ? categoryMap.get(product.categoryId) : null;
  const useMatrix = Boolean(product && productHasColorSizeMatrix(product, category));
  const showBatch = Boolean(product && categoryUsesBatchManagement(category) && !useMatrix && !item.variantId);
  const price = Number(item.purchasePrice) || 0;

  return {
    id: item.id,
    lineGroupId: item.lineGroupId || item.id,
    docNumber,
    productId: item.productId || '',
    productName: product && product.name || item.productName || '',
    productSku: product && product.sku || item.productSku || '',
    ordered: orderQty,
    received,
    remaining,
    remainingText: `${remaining}`,
    orderedText: `${orderQty}`,
    receivedText: `${received}`,
    selected: false,
    qty: String(remaining),
    purchasePrice: String(price),
    batch: '',
    showBatch,
    showAmount: Boolean(showAmount),
    priceText: showAmount ? `¥${price.toFixed(2)}` : '',
    variantId: item.variantId || '',
    variantLabel: item.variantId && product && product.variants ?
    (product.variants.find((v) => v.id === item.variantId) || {}).size || item.variantId :
    ''
  };
}

function relatedProductTextFromPoItems(items, productMap) {
  for (let i = 0; i < (items || []).length; i++) {
    const cd = items[i] && items[i].customData;
    if (!cd || typeof cd !== 'object') continue;
    const id = String(cd.relatedProductId || '').trim();
    if (!id) continue;
    const p = productMap && productMap.get ? productMap.get(id) : null;
    if (p) return p.sku ? `${p.name || '—'}（${p.sku}）` : p.name || id;
    return id;
  }
  return '';
}

function buildPendingPoDocs(purchaseOrders, receivedByOrderLine, ctx) {
  const groups = {};
  (purchaseOrders || []).forEach((r) => {
    if (r.type !== 'PURCHASE_ORDER') return;
    const key = r.docNumber;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  const productMap = ctx && ctx.productMap;
  const docs = [];
  Object.entries(groups).forEach(([docNumber, items]) => {
    if (!purchaseOrderDocHasUnsettled(docNumber, items, receivedByOrderLine)) return;
    const first = items[0] || {};
    const lines = [];
    items.forEach((item) => {
      const line = buildPendingPoLineUi(item, docNumber, ctx);
      if (line) lines.push(line);
    });
    if (!lines.length) return;
    const relatedProductText = relatedProductTextFromPoItems(items, productMap);
    docs.push({
      docNumber,
      partner: String(first.partner || '').trim() || '—',
      lineCount: lines.length,
      relatedProductText,
      expanded: false,
      lines
    });
  });

  return docs.sort((a, b) => (b.docNumber || '').localeCompare(a.docNumber || ''));
}

function filterPendingPoDocs(docs, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return docs || [];
  return (docs || []).filter((doc) => {
    const fields = [doc.docNumber, doc.partner, doc.relatedProductText];
    (doc.lines || []).forEach((l) => {
      fields.push(l.productName, l.productSku, l.variantLabel);
    });
    return fields.filter(Boolean).join(' ').toLowerCase().includes(kw);
  });
}

function buildConvertFromOrderRecords(opts) {
  const
    form =



    opts.form,selectedLines = opts.selectedLines,docNumber = opts.docNumber,operator = opts.operator;
  const { createdAt: pbCreatedAtIso, timestamp } = psiEntryTimestampsFromDatetime(
    form.createdAt || defaultEntryDate(),
    form.createdAtTime
  );
  const newRecords = [];
  let idx = 0;

  (selectedLines || []).forEach((line) => {
    const qty = Math.max(0, Number(line.qty) || 0);
    if (qty <= 0) return;
    const price = Number(line.purchasePrice) || 0;
    const batchVal = resolveBatchForSave(line);
    const note = `由订单[${line.docNumber}]商品明细转化`;
    newRecords.push({
      id: `psi-pb-${Date.now()}-${idx++}`,
      type: PSI_TYPE,
      docNumber,
      timestamp,
      partner: line.partner || form.partner,
      partnerId: line.partnerId || form.partnerId || '',
      productId: line.productId,
      ...(line.variantId ? { variantId: line.variantId } : {}),
      quantity: qty,
      purchasePrice: price,
      amount: qty * price,
      warehouseId: form.warehouseId,
      sourceOrderNumber: line.docNumber,
      sourceLineId: line.id,
      note,
      operator: `${operator}(订单转化)`,
      lineGroupId: line.lineGroupId || line.id,
      createdAt: pbCreatedAtIso,
      ...(batchVal ? { batch: batchVal } : {})
    });
  });

  return newRecords;
}

function validateFromOrderConvert(form, selectedLines) {
  if (!form.warehouseId) {
    wx.showToast({ title: '请选择入库仓库', icon: 'none' });
    return false;
  }
  const positive = (selectedLines || []).filter((l) => (Number(l.qty) || 0) > 0);
  if (!positive.length) {
    wx.showToast({ title: '请至少选择一条并填写入库数量', icon: 'none' });
    return false;
  }
  return true;
}

function applyLastPurchasePrices(lines, prices, productIndexByLine) {
  return (lines || []).map((line, idx) => {
    const pIdx = productIndexByLine ? productIndexByLine[idx] : idx;
    const price = prices && prices[pIdx] && prices[pIdx].price != null ?
    Number(prices[pIdx].price) :
    null;
    if (price == null || !line.productId) return line;
    return { ...line, purchasePrice: String(price) };
  });
}

module.exports = {
  WAREHOUSE_PREF_KEY,
  newLineId,
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredWarehouse,
  psiBillLineTotalQty,
  createEmptyLine,
  buildInitialForm,
  recordsToLineItems,
  enrichLineForUi,
  computeFormTotals,
  resolveBatchForSave,
  validatePurchaseBillSave,
  validateFromOrderConvert,
  buildPurchaseBillSaveRecords,
  buildPendingPoDocs,
  filterPendingPoDocs,
  buildConvertFromOrderRecords,
  applyLastPurchasePrices,
  hydratePsiEntryFields,
};