/**
 * 收款单适配层（共享逻辑见 financeRecords.js）
 */

const { PARTNER_LABEL } = require('../config/financeReceipts.js');
const records = require('./financeRecords.js');

const TYPE = 'RECEIPT';
const RECEIPT_PLACEHOLDER_ICON = records.DOC_META.RECEIPT.placeholderIcon;

function categoriesForReceipt(categories) {
  return records.categoriesForType(categories, TYPE);
}

function mapReceiptListCard(rec, ctx) {
  return records.mapFinanceListCard(rec, ctx, TYPE);
}

function mapReceiptDetailView(rec, ctx) {
  return records.mapFinanceDetailView(rec, ctx, TYPE);
}

function emptyReceiptForm() {
  return records.emptyFinanceForm();
}

function formVisibility(form, categories, fundsAccountEnabled) {
  return records.formVisibility(form, categories, fundsAccountEnabled, TYPE);
}

function validateReceiptForm(form, visibility) {
  return records.validateFinanceForm(form, visibility, TYPE);
}

function buildReceiptSavePayload(form, visibility, operator, existing, entryOpts) {
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
  categoriesForReceipt,
  mapReceiptListCard,
  mapReceiptDetailView,
  emptyReceiptForm,
  formFromRecord: records.formFromRecord,
  formVisibility,
  validateReceiptForm,
  buildReceiptSavePayload,
  buildCategoryPickerOptions,
  buildAccountPickerOptions: records.buildAccountPickerOptions,
  buildWorkerPickerOptions: records.buildWorkerPickerOptions,
  initialCustomDataForCategory: records.initialCustomDataForCategory,
  normalizeFinanceCategories: records.normalizeFinanceCategories,
  PARTNER_LABEL,
  RECEIPT_PLACEHOLDER_ICON,
};
