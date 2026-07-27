/**
 * 收款单 / 付款单**表单侧**共享逻辑（对齐 Web FinanceRecordFormModal）。
 *
 * 放在主包而非 packageFinance/utils：PSI 单据（packagePsi）也要弹「登记收/付款单」，
 * 而小程序分包之间不能互相 require，只能经主包共享。
 * 展示侧（列表卡片 / 详情行）仍在 packageFinance/utils/financeRecords.js。
 */

const {
  buildReportCustomFields,
  buildCustomDataPayload,
  validateReportCustomFields,
} = require('./orderReportForm.js');
const { localTodayYmd, localNowForDatetimePicker } = require('./dateYmd.js');
const { normalizeFinanceCategoriesFromApi } = require('./reportCustomDocField.js');

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

function categoriesForType(categories, type) {
  return (categories || []).filter((c) => c && c.kind === type);
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
  // 与 Web FinanceRecordFormModal 一致：展示全部分类自定义项（含 file/knowledge，小程序端提示电脑端填写）
  const customFields = selected
    ? buildReportCustomFields(selected.customFields || [])
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
  const customErr = validateReportCustomFields(visibility.customFields || [], form.customData || {});
  if (customErr) return customErr;
  return '';
}

/**
 * @param {object} [entryOpts] `{ entryDate, entryTime }` 新建时的业务时间；
 *   `sourceDocNo` 关联的 PSI 单号（PSI 快捷登记用，见 utils/psiDocFinance.js）
 */
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
  const sourceDocNo = entryOpts && entryOpts.sourceDocNo
    ? String(entryOpts.sourceDocNo).trim()
    : '';
  if (sourceDocNo) body.sourceDocNo = sourceDocNo;
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

/**
 * 收/付款「选择收支账户」列表项（无最近使用、无添加账户）。
 * balancesData 可选：来自 getAccountBalances，用于副标题余额。
 */
function buildAccountSelectRows(accountTypes, balancesData) {
  const list = (accountTypes || []).filter((a) => a && a.id && a.active !== false);
  list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const balanceById = new Map();
  ((balancesData && balancesData.accounts) || []).forEach((acc) => {
    if (acc && acc.accountTypeId) balanceById.set(acc.accountTypeId, acc.balance);
  });
  return list.map((a) => {
    const hasBal = balanceById.has(a.id);
    const bal = hasBal ? Number(balanceById.get(a.id)) : NaN;
    return {
      id: a.id,
      name: a.name || '',
      balanceText: hasBal && Number.isFinite(bal) ? formatMoney(bal) : '',
      balanceNegative: hasBal && Number.isFinite(bal) && bal < 0,
    };
  });
}

function initialCustomDataForCategory(category, existingCustomData) {
  if (!category) return {};
  const fields = buildReportCustomFields(category.customFields || []);
  const initial = {};
  fields.forEach((f) => {
    if (f.desktopOnly || !f.isDate || !f.dateAutoFill) return;
    initial[f.id] = f.dateWithTime ? localNowForDatetimePicker() : localTodayYmd();
  });
  if (existingCustomData && typeof existingCustomData === 'object') {
    return { ...initial, ...existingCustomData };
  }
  return initial;
}

function normalizeFinanceCategories(list) {
  return normalizeFinanceCategoriesFromApi(list || []);
}

module.exports = {
  DOC_META,
  getDocMeta,
  formatMoney,
  categoriesForType,
  emptyFinanceForm,
  formFromRecord,
  formVisibility,
  validateFinanceForm,
  buildFinanceSavePayload,
  buildCategoryPickerOptions,
  buildAccountPickerOptions,
  buildWorkerPickerOptions,
  buildAccountSelectRows,
  initialCustomDataForCategory,
  normalizeFinanceCategories,
};
