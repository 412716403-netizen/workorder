const { buildReportCustomFields, buildCustomDataPayload } = require('../../utils/orderReportForm.js');
const { findPartnerByName } = require('../../utils/partnerNormalize.js');

function buildEmptyPartner(categoryId) {
  return {
    name: '',
    categoryId: categoryId || '',
    contact: '',
    customData: {},
  };
}

function buildPartnerCustomFieldsForForm(category) {
  if (!category) return [];
  return buildReportCustomFields(category.customFields || []);
}

function validatePartnerForSave(partner, allPartners, category, isNew, customFields) {
  const trimmedName = String(partner.name || '').trim();
  if (!trimmedName) return '请填写单位名称';
  if (isNew && !partner.categoryId) return '请选择单位分类';
  const excludeId = isNew ? undefined : partner.id;
  if (findPartnerByName(allPartners, trimmedName, excludeId)) {
    return `单位名称「${trimmedName}」已存在`;
  }
  for (let i = 0; i < (customFields || []).length; i += 1) {
    const f = customFields[i];
    if (f.desktopOnly || !f.required) continue;
    const val = partner.customData && partner.customData[f.id];
    if (val === undefined || val === null || String(val).trim() === '') {
      return `请填写${f.label}`;
    }
  }
  return null;
}

function preparePartnerForSave(partner, allPartners, category, isNew) {
  const customFields = buildPartnerCustomFieldsForForm(category);
  const err = validatePartnerForSave(partner, allPartners, category, isNew, customFields);
  if (err) return { error: err };

  const trimmedName = String(partner.name || '').trim();
  const customData = buildCustomDataPayload(customFields, partner.customData || {}) || {};
  const payload = {
    name: trimmedName,
    categoryId: partner.categoryId,
    contact: partner.contact || '',
    customData,
  };
  return { payload };
}

function formatPartnerListNo(partnerListNo) {
  if (partnerListNo == null || partnerListNo === '') return '—';
  const n = typeof partnerListNo === 'number' ? partnerListNo : parseInt(String(partnerListNo), 10);
  if (!Number.isFinite(n) || n < 1) return '—';
  return String(n).padStart(4, '0');
}

function resolvePhoneFieldId(category) {
  const fields = (category && category.customFields) || [];
  const phoneField = fields.find((f) => String(f.label || '').includes('电话'));
  return phoneField ? phoneField.id : null;
}

function getPartnerPhoneDisplay(partner, category) {
  const fieldId = resolvePhoneFieldId(category);
  if (!fieldId) return '—';
  const phone = partner.customData && partner.customData[fieldId];
  if (phone == null || String(phone).trim() === '') return '—';
  return String(phone);
}

module.exports = {
  buildEmptyPartner,
  buildPartnerCustomFieldsForForm,
  validatePartnerForSave,
  preparePartnerForSave,
  formatPartnerListNo,
  resolvePhoneFieldId,
  getPartnerPhoneDisplay,
};
