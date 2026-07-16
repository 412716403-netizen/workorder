/**
 * 付款单适配层（共享逻辑见 financeRecords.js）
 */

const { PARTNER_LABEL } = require('../config/financePayments.js');
const records = require('./financeRecords.js');

const TYPE = 'PAYMENT';
const PAYMENT_PLACEHOLDER_ICON = records.DOC_META.PAYMENT.placeholderIcon;

function categoriesForPayment(categories) {
  return records.categoriesForType(categories, TYPE);
}

function mapPaymentListCard(rec, ctx) {
  return records.mapFinanceListCard(rec, ctx, TYPE);
}

function mapPaymentDetailView(rec, ctx) {
  return records.mapFinanceDetailView(rec, ctx, TYPE);
}

function emptyPaymentForm() {
  return records.emptyFinanceForm();
}

function formVisibility(form, categories, fundsAccountEnabled) {
  return records.formVisibility(form, categories, fundsAccountEnabled, TYPE);
}

function validatePaymentForm(form, visibility) {
  return records.validateFinanceForm(form, visibility, TYPE);
}

function buildPaymentSavePayload(form, visibility, operator, existing, entryOpts) {
  return records.buildFinanceSavePayload(form, visibility, operator, existing, TYPE, entryOpts);
}

function buildCategoryPickerOptions(categories) {
  return records.buildCategoryPickerOptions(categories, TYPE);
}

module.exports = {
  formatMoney: records.formatMoney,
  formatFinanceTimestamp: records.formatFinanceTimestamp,
  buildCategoryMap: records.buildCategoryMap,
  buildWorkerMap: records.buildWorkerMap,
  categoriesForPayment,
  mapPaymentListCard,
  mapPaymentDetailView,
  emptyPaymentForm,
  formFromRecord: records.formFromRecord,
  formVisibility,
  validatePaymentForm,
  buildPaymentSavePayload,
  buildCategoryPickerOptions,
  buildAccountPickerOptions: records.buildAccountPickerOptions,
  buildWorkerPickerOptions: records.buildWorkerPickerOptions,
  initialCustomDataForCategory: records.initialCustomDataForCategory,
  normalizeFinanceCategories: records.normalizeFinanceCategories,
  PARTNER_LABEL,
  PAYMENT_PLACEHOLDER_ICON,
};
