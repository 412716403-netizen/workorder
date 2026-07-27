/**
 * 收款单 / 付款单**展示侧**（对齐 Web FinanceOpsView）。
 * 表单侧（校验 / payload / 可见性）在主包 utils/financeRecordForm.js，
 * 因为 packagePsi 的快捷登记也要用，分包之间不能互相 require。
 */

const { formatLocalDateTimeZh } = require('../../utils/flowDocSortLite.js');
const { listProductNameSkuFields, listProductThumbFromProduct } = require('../../utils/listProductThumb.js');
const { buildReportCustomFields } = require('../../utils/orderReportForm.js');
const { customFieldDisplayValue } = require('../../utils/planFormCustomField.js');
const { isImageDataUrl, formatCustomFileLabel } = require('../../utils/fileBase64.js');
const formShared = require('../../utils/financeRecordForm.js');

const DOC_META = formShared.DOC_META;
const getDocMeta = formShared.getDocMeta;
const formatMoney = formShared.formatMoney;
const categoriesForType = formShared.categoriesForType;

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
    operator: (rec.operator || '').trim() || '—',
    showOperator: true,
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
    if ((cat && cat.linkProduct) || rec.productId) {
      const skuPart = productFields.showProductSku ? ` ${productFields.productSku}` : '';
      rows.push({
        label: '关联产品',
        value: rec.productId
          ? `${productFields.productName}${skuPart}`.trim() || '—'
          : '—',
      });
    }
    const customFields = buildReportCustomFields(cat.customFields || []);
    customFields.forEach((field) => {
      const stored = rec.customData && rec.customData[field.id];
      const display = customFieldDisplayValue(field, rec.customData || {});
      if (field.desktopOnly) {
        rows.push({
          label: field.label,
          value: display || '请在电脑端查看',
          rowKey: field.id || field.label,
        });
        return;
      }
      if ((field.isFile || field.type === 'file') && isImageDataUrl(stored)) {
        rows.push({
          label: field.label,
          value: display || formatCustomFileLabel(stored) || '图片',
          isImage: true,
          imageUrl: String(stored),
          rowKey: field.id || field.label,
        });
        return;
      }
      rows.push({
        label: field.label,
        value: display || '—',
        rowKey: field.id || field.label,
      });
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

  rows.forEach((row, i) => {
    if (!row.rowKey) row.rowKey = row.label || `row-${i}`;
  });

  return {
    title: meta.docLabel,
    docNo,
    amountTone: meta.amountTone,
    sections: [{ id: 'main', title: '单据信息', kind: 'rows', rows }],
  };
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
  emptyFinanceForm: formShared.emptyFinanceForm,
  formFromRecord: formShared.formFromRecord,
  formVisibility: formShared.formVisibility,
  validateFinanceForm: formShared.validateFinanceForm,
  buildFinanceSavePayload: formShared.buildFinanceSavePayload,
  buildCategoryPickerOptions: formShared.buildCategoryPickerOptions,
  buildAccountPickerOptions: formShared.buildAccountPickerOptions,
  buildWorkerPickerOptions: formShared.buildWorkerPickerOptions,
  initialCustomDataForCategory: formShared.initialCustomDataForCategory,
  normalizeFinanceCategories: formShared.normalizeFinanceCategories,
};
