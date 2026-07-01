/**
 * 计划单表单自定义字段（对齐 Web utils/planFormCustomField.ts + PlanFormModal）
 */

const { effectiveCustomDocFieldType } = require('./reportCustomDocField.js');
const { localTodayYmd } = require('./dateYmd.js');

function effectivePlanFormFieldType(field) {
  return effectiveCustomDocFieldType(field);
}

function normalizePlanFormFieldConfigArray(fields) {
  return (fields || []).map((f) => {
    if (f && f.type === 'number') {
      return { id: f.id, label: f.label, type: 'text', options: f.options, showInCreate: f.showInCreate, showInList: f.showInList, showInDetail: f.showInDetail, dateWithTime: f.dateWithTime, dateAutoFill: f.dateAutoFill };
    }
    return f;
  });
}

function customerShowInCreate(planFormSettings, productionLinkMode) {
  if (productionLinkMode === 'product') return false;
  const fields = normalizePlanFormFieldConfigArray(
    planFormSettings && planFormSettings.standardFields,
  );
  const customerField = fields.find((f) => f.id === 'customer');
  return !!(customerField && customerField.showInCreate === true);
}

function customerShowInDetail(planFormSettings, productionLinkMode) {
  if (productionLinkMode === 'product') return false;
  const fields = normalizePlanFormFieldConfigArray(
    planFormSettings && planFormSettings.standardFields,
  );
  const customerField = fields.find((f) => f.id === 'customer');
  return !!(customerField && customerField.showInDetail === true);
}

function standardFieldShowInDetail(planFormSettings, fieldId, defaultShow = true) {
  const fields = normalizePlanFormFieldConfigArray(
    planFormSettings && planFormSettings.standardFields,
  );
  const field = fields.find((f) => f.id === fieldId);
  if (!field) return defaultShow;
  return field.showInDetail !== false;
}

function buildPlanDetailCustomFields(planFormSettings) {
  const raw = normalizePlanFormFieldConfigArray(
    planFormSettings && planFormSettings.customFields,
  );
  return raw
    .filter((f) => f && f.showInDetail)
    .map((f) => {
      const type = effectivePlanFormFieldType(f);
      return {
        id: f.id,
        label: f.label,
        type,
        desktopOnly: type === 'file' || type === 'knowledge',
      };
    });
}

function buildPlanCreateCustomFields(planFormSettings) {
  const raw = normalizePlanFormFieldConfigArray(
    planFormSettings && planFormSettings.customFields,
  );
  return raw
    .filter((f) => f && f.showInCreate)
    .map((f) => {
      const type = effectivePlanFormFieldType(f);
      return {
        id: f.id,
        label: f.label,
        type,
        options: f.options || [],
        dateWithTime: !!f.dateWithTime,
        dateAutoFill: !!f.dateAutoFill,
        pickerMode: f.dateWithTime ? 'datetime' : 'date',
        isSelect: type === 'select',
        isDate: type === 'date',
        isText: type === 'text',
        isFile: type === 'file',
        isKnowledge: type === 'knowledge',
        desktopOnly: type === 'file' || type === 'knowledge',
      };
    });
}

function buildInitialPlanCustomData(createCustomFields) {
  const customData = {};
  const today = localTodayYmd();
  (createCustomFields || []).forEach((f) => {
    if (f.isDate && f.dateAutoFill) {
      customData[f.id] = today;
    }
  });
  return customData;
}

function getProductUnitName(product, dictionaries) {
  if (!product || !product.unitId) return 'PCS';
  const units = (dictionaries && dictionaries.units) || [];
  const unit = units.find((u) => u.id === product.unitId);
  return (unit && unit.name) ? String(unit.name) : 'PCS';
}

function buildCustomDataPayload(createCustomFields, customData) {
  const out = {};
  (createCustomFields || []).forEach((f) => {
    if (f.desktopOnly) return;
    const val = customData && customData[f.id];
    if (val !== undefined && val !== null && val !== '') {
      out[f.id] = val;
    }
  });
  return Object.keys(out).length ? out : undefined;
}

function customFieldDisplayValue(field, customData) {
  const val = customData && customData[field.id];
  if (val === undefined || val === null || val === '') return '';
  return String(val);
}

module.exports = {
  effectivePlanFormFieldType,
  normalizePlanFormFieldConfigArray,
  customerShowInCreate,
  customerShowInDetail,
  standardFieldShowInDetail,
  buildPlanCreateCustomFields,
  buildPlanDetailCustomFields,
  buildInitialPlanCustomData,
  getProductUnitName,
  buildCustomDataPayload,
  customFieldDisplayValue,
};
