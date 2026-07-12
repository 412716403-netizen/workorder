/**
 * 收款单 / 付款单共用（对齐 Web FinanceOpsView + FinanceRecordFormModal）
 */

const { formatLocalDateTimeZh } = require('./flowDocSortLite.js');
const { listProductNameSkuFields, listProductThumbFromProduct } = require('./listProductThumb.js');
const { buildReportCustomFields, buildInitialReportCustomData } = require('./orderReportForm.js');
const { buildCustomDataPayload, customFieldDisplayValue } = require('./planFormCustomField.js');

const DOC_META = {
  RECEIPT: {
    type: 'RECEIPT',
    partnerLabel: '缴款客户',
    docLabel: '收款单',
    placeholderIcon: '/assets/icons/arrow-down-circle.png',
    amountTone: 'receipt',
  },
  PAYMENT: {
    type: 'PAYMENT',
    partnerLabel: '收款单位/个人',
    docLabel: '付款单',
    placeholderIcon: '/assets/icons/arrow-up-circle.png',
    amountTone: 'payment',
  },
};

function getDocMeta(type) {
  return DOC_META[type] || DOC_META.RECEIPT;
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '¥0.00';
  return `¥${v.toFixed(2)}`;
}

function formatFinanceTimestamp(ts) {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  return formatLocalDateTimeZh(d);
}

function buildCategoryMap(categories) {
  const map = new Map();
  (categories || []).forEach((c) => {
    if (c && c.id) map.set(c.id, c);
  });
  return map;
}

function buildWorkerMap(workers) {
  const map = new Map();
  (workers || []).forEach((w) => {
    if (w && w.id) map.set(w.id, w);
  });
  return map;
}

function categoriesForType(categories, type) {
  return (categories || []).filter((c) => c && c.kind === type);
}

function resolveCategory(rec, categoryMap) {
  if (!rec) return null;
  if (rec.category && rec.category.id) return rec.category;
  if (rec.categoryId && categoryMap) return categoryMap.get(rec.categoryId) || null;
  return null;
}

function mapFinanceListCard(rec, ctx = {}, type = 'RECEIPT') {
  const meta = getDocMeta(type);
  const categoryMap = ctx.categoryMap || new Map();
  const workerMap = ctx.workerMap || new Map();
  const productMap = ctx.productMap || new Map();
  const cat = resolveCategory(rec, categoryMap);
  const partner = (rec.partner || '').trim() || '—';
  const amount = Number(rec.amount) || 0;
  const worker = rec.workerId ? workerMap.get(rec.workerId) : null;
  const product = rec.productId ? productMap.get(rec.productId) : null;
  const productFields = listProductNameSkuFields(product);
  const thumb = product
    ? listProductThumbFromProduct(product)
    : {
        productImageUrl: '',
        showProductImage: false,
        placeholderIconSrc: meta.placeholderIcon,
      };

  return {
    id: rec.id,
    docNo: rec.docNo || rec.id || '',
    partner,
    categoryName: (cat && cat.name) || meta.docLabel,
    amount,
    amountText: formatMoney(amount),
    amountTone: meta.amountTone,
    timestampText: formatFinanceTimestamp(rec.timestamp),
    operator: (rec.operator || '').trim(),
    showOperator: Boolean((rec.operator || '').trim()),
    workerName: worker ? worker.name : '',
    showWorker: Boolean(worker && worker.name),
    productName: productFields.productName,
    productSku: productFields.productSku,
    showProductSku: productFields.showProductSku,
    showProduct: Boolean(rec.productId),
    productImageUrl: thumb.productImageUrl,
    showProductImage: thumb.showProductImage,
    placeholderIconSrc: thumb.placeholderIconSrc || meta.placeholderIcon,
    note: (rec.note || '').trim(),
    showNote: Boolean((rec.note || '').trim()),
  };
}

function mapFinanceDetailView(rec, ctx = {}, type = 'RECEIPT') {
  const meta = getDocMeta(type);
  const categoryMap = ctx.categoryMap || new Map();
  const workerMap = ctx.workerMap || new Map();
  const productMap = ctx.productMap || new Map();
  const categories = ctx.categories || [];
  const cat = resolveCategory(rec, categoryMap);
  const amount = Number(rec.amount) || 0;
  const partner = (rec.partner || '').trim() || '—';
  const worker = rec.workerId ? workerMap.get(rec.workerId) : null;
  const product = rec.productId ? productMap.get(rec.productId) : null;
  const productFields = listProductNameSkuFields(product);

  const docNo = rec.docNo || rec.id || '—';
  const rows = [{ label: '单据编号', value: docNo }];
  if (categoriesForType(categories, type).length > 0) {
    rows.push({ label: '单据分类', value: (cat && cat.name) || '—' });
  }

  if (cat) {
    if (cat.linkPartner === true) {
      rows.push({ label: meta.partnerLabel, value: partner });
    }
    if (cat.selectPaymentAccount || rec.paymentAccount) {
      rows.push({ label: '收支账户', value: (rec.paymentAccount || '').trim() || '—' });
    }
    if (cat.linkWorker) {
      rows.push({ label: '关联工人', value: (worker && worker.name) || '—' });
    }
    if (cat.linkProduct) {
      const skuPart = productFields.showProductSku ? ` ${productFields.productSku}` : '';
      rows.push({
        label: '关联产品',
        value: rec.productId
          ? `${productFields.productName}${skuPart}`.trim()
          : '—',
      });
    }
    const customFields = buildReportCustomFields(cat.customFields || []);
    customFields.forEach((field) => {
      if (field.desktopOnly) return;
      const val = customFieldDisplayValue(field, rec.customData || {});
      if (!val) return;
      rows.push({ label: field.label, value: val });
    });
  } else {
    rows.push({ label: meta.partnerLabel, value: partner });
    if (rec.paymentAccount) {
      rows.push({ label: '收支账户', value: rec.paymentAccount });
    }
  }

  rows.push({
    label: '结算金额',
    value: formatMoney(amount),
    amount: true,
    amountTone: meta.amountTone,
  });
  rows.push({ label: '业务时间', value: formatFinanceTimestamp(rec.timestamp) });
  rows.push({ label: '经办人', value: (rec.operator || '').trim() || '—' });
  if ((rec.note || '').trim()) {
    rows.push({ label: '备注', value: rec.note.trim() });
  }

  return {
    title: meta.docLabel,
    docNo,
    amountTone: meta.amountTone,
    sections: [{ id: 'main', title: '单据信息', kind: 'rows', rows }],
  };
}

function emptyFinanceForm() {
  return {
    amount: '',
    partner: '',
    note: '',
    categoryId: '',
    workerId: '',
    productId: '',
    paymentAccount: '',
    customData: {},
  };
}

function formFromRecord(rec) {
  const amount = Number(rec.amount);
  return {
    amount: Number.isFinite(amount) && amount > 0 ? String(amount) : '',
    partner: rec.partner || '',
    note: rec.note || '',
    categoryId: rec.categoryId || '',
    workerId: rec.workerId || '',
    productId: rec.productId || '',
    paymentAccount: rec.paymentAccount || '',
    customData: rec.customData && typeof rec.customData === 'object' ? { ...rec.customData } : {},
  };
}

function formVisibility(form, categories, fundsAccountEnabled, type = 'RECEIPT') {
  const list = categoriesForType(categories, type);
  const selected = form.categoryId
    ? list.find((c) => c.id === form.categoryId) || null
    : null;
  const customFields = selected
    ? buildReportCustomFields(selected.customFields || []).filter((f) => !f.desktopOnly)
    : [];

  return {
    categories: list,
    hasCategories: list.length > 0,
    selectedCategory: selected,
    showPartner: !selected || selected.linkPartner === true,
    needPartner: !selected || selected.linkPartner === true,
    showWorker: !!(selected && selected.linkWorker),
    showProduct: !!(selected && selected.linkProduct),
    showPaymentAccount: !!fundsAccountEnabled,
    needPaymentAccount: !!fundsAccountEnabled,
    customFields,
  };
}

function validateFinanceForm(form, visibility, type = 'RECEIPT') {
  const meta = getDocMeta(type);
  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) return '请填写结算金额';
  if (visibility.hasCategories && !form.categoryId) return '请选择单据分类';
  if (visibility.needPartner && !(form.partner || '').trim()) return `请选择${meta.partnerLabel}`;
  if (visibility.needPaymentAccount && !(form.paymentAccount || '').trim()) return '请选择收支账户';
  return '';
}

function buildFinanceSavePayload(form, visibility, operator, existing, type = 'RECEIPT', entryOpts) {
  const amount = Number(form.amount) || 0;
  const customData = buildCustomDataPayload(visibility.customFields || [], form.customData || {});
  const isEdit = !!(existing && existing.id);
  const body = {
    type,
    amount,
    partner: visibility.showPartner ? (form.partner || '').trim() : '',
    note: (form.note || '').trim(),
    operator: operator || (existing && existing.operator) || '',
    status: (existing && existing.status) || 'COMPLETED',
    categoryId: form.categoryId || (isEdit ? null : undefined),
    workerId: visibility.showWorker
      ? (form.workerId || (isEdit ? null : undefined))
      : (isEdit ? null : undefined),
    productId: visibility.showProduct
      ? (form.productId || (isEdit ? null : undefined))
      : (isEdit ? null : undefined),
    paymentAccount: visibility.showPaymentAccount
      ? ((form.paymentAccount || '').trim() || (isEdit ? null : undefined))
      : (isEdit ? null : undefined),
    customData: customData || (isEdit ? null : undefined),
  };
  if (existing && existing.id) {
    body.id = existing.id;
    body.docNo = existing.docNo;
    body.timestamp = existing.timestamp;
  } else if (entryOpts && entryOpts.entryDate) {
    const { entryDateAndTimeToTimestamp } = require('./docEntryTime.js');
    body.timestamp = entryDateAndTimeToTimestamp(entryOpts.entryDate, entryOpts.entryTime);
  }
  return body;
}

function buildCategoryPickerOptions(categories, type = 'RECEIPT') {
  const list = categoriesForType(categories, type);
  return {
    names: ['请选择分类…', ...list.map((c) => c.name)],
    ids: ['', ...list.map((c) => c.id)],
  };
}

function buildAccountPickerOptions(accountTypes) {
  const list = (accountTypes || []).filter((a) => a && a.id && a.active !== false);
  list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return {
    names: ['请选择收支账户…', ...list.map((a) => a.name)],
    ids: ['', ...list.map((a) => a.id)],
  };
}

function buildWorkerPickerOptions(workers) {
  const list = (workers || []).filter((w) => w && w.id);
  return {
    names: ['请选择工人…', ...list.map((w) => w.name || w.id)],
    ids: ['', ...list.map((w) => w.id)],
  };
}

function initialCustomDataForCategory(category, existingCustomData) {
  if (!category) return {};
  const fields = buildReportCustomFields(category.customFields || []);
  const initial = buildInitialReportCustomData(fields);
  if (existingCustomData && typeof existingCustomData === 'object') {
    return { ...initial, ...existingCustomData };
  }
  return initial;
}

module.exports = {
  DOC_META,
  getDocMeta,
  formatMoney,
  formatFinanceTimestamp,
  buildCategoryMap,
  buildWorkerMap,
  categoriesForType,
  mapFinanceListCard,
  mapFinanceDetailView,
  emptyFinanceForm,
  formFromRecord,
  formVisibility,
  validateFinanceForm,
  buildFinanceSavePayload,
  buildCategoryPickerOptions,
  buildAccountPickerOptions,
  buildWorkerPickerOptions,
  initialCustomDataForCategory,
};
