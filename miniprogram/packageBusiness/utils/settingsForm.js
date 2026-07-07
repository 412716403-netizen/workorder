const { hasSettingsNameConflict } = require('./settingsNameUnique.js');
const {
  isWorkerAssignmentEnabled,
  isEquipmentAssignmentEnabled,
} = require('./nodeAssignmentFlags.js');

function makeCustomFieldId(prefix) {
  return `${prefix || 'custom-'}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeCustomFieldsForSave(fields) {
  return (fields || []).map((f) => {
    const out = {
      id: f.id,
      label: String(f.label || '').trim() || '未命名',
      type: f.type || 'text',
      required: !!f.required,
      showInForm: f.showInForm !== false,
    };
    if (Array.isArray(f.options) && f.options.length) out.options = f.options;
    if (f.dateWithTime) out.dateWithTime = true;
    if (f.dateAutoFill) out.dateAutoFill = true;
    if (f.placeholder) out.placeholder = f.placeholder;
    return out;
  });
}

function validateArchiveName(name, allItems, excludeId, entityLabel) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return `${entityLabel}名称不能为空`;
  if (hasSettingsNameConflict(allItems || [], trimmed, excludeId)) {
    return `${entityLabel}"${trimmed}"已存在`;
  }
  return '';
}

function validateCategoryToggles(cat, updates) {
  const next = Object.assign({}, cat, updates);
  if (next.hasColorSize && next.hasBatchManagement) {
    return '颜色尺码与批次管理互斥，不能同时启用';
  }
  if (next.hasPurchasePrice && !next.linkPartner) {
    return '已启用采购价时需保持关联合作单位';
  }
  return '';
}

function applyCategoryToggle(cat, key, nextVal) {
  if (key === 'hasPurchasePrice' && nextVal) {
    return { hasPurchasePrice: true, linkPartner: true };
  }
  return { [key]: nextVal };
}

function isCategoryToggleBlocked(cat, key, nextVal) {
  if (key === 'hasColorSize' && nextVal && cat.hasBatchManagement) return true;
  if (key === 'hasBatchManagement' && nextVal && cat.hasColorSize) return true;
  if (key === 'linkPartner' && !nextVal && cat.hasPurchasePrice) return true;
  return false;
}

function prepareWarehouseForSave(form, allItems, isNew) {
  const name = String(form.name || '').trim();
  const err = validateArchiveName(name, allItems, isNew ? '' : form.id, '仓库');
  if (err) return { error: err };
  return { payload: { name } };
}

function preparePartnerCategoryForSave(form, allItems, isNew) {
  const name = String(form.name || '').trim();
  const err = validateArchiveName(name, allItems, isNew ? '' : form.id, '合作单位分类');
  if (err) return { error: err };
  return {
    payload: {
      name,
      customFields: normalizeCustomFieldsForSave(form.customFields),
    },
  };
}

function prepareCategoryForSave(form, allItems, isNew) {
  const name = String(form.name || '').trim();
  const err = validateArchiveName(name, allItems, isNew ? '' : form.id, '产品分类');
  if (err) return { error: err };
  const toggleErr = validateCategoryToggles(form, {});
  if (toggleErr) return { error: toggleErr };
  return {
    payload: {
      name,
      color: form.color || 'bg-indigo-600',
      hasProcess: !!form.hasProcess,
      hasSalesPrice: !!form.hasSalesPrice,
      hasPurchasePrice: !!form.hasPurchasePrice,
      linkPartner: !!form.linkPartner,
      hasColorSize: !!form.hasColorSize,
      hasBatchManagement: !!form.hasBatchManagement,
      customFields: normalizeCustomFieldsForSave(form.customFields),
    },
  };
}

function prepareFinanceCategoryForSave(form, allItems, isNew) {
  const name = String(form.name || '').trim();
  const err = validateArchiveName(name, allItems, isNew ? '' : form.id, '收付款类型');
  if (err) return { error: err };
  return {
    payload: {
      kind: form.kind === 'PAYMENT' ? 'PAYMENT' : 'RECEIPT',
      name,
      linkPartner: !!form.linkPartner,
      selectPaymentAccount: !!form.selectPaymentAccount,
      linkWorker: !!form.linkWorker,
      linkProduct: !!form.linkProduct,
      customFields: normalizeCustomFieldsForSave(form.customFields),
    },
  };
}

function prepareNodeForSave(form, allItems, isNew) {
  const name = String(form.name || '').trim();
  const err = validateArchiveName(name, allItems, isNew ? '' : form.id, '工序');
  if (err) return { error: err };
  return {
    payload: {
      name,
      reportTemplate: form.reportTemplate || [],
      reportDisplayTemplate: normalizeCustomFieldsForSave(form.reportDisplayTemplate),
      hasBOM: !!form.hasBOM,
      enableAssignment: !!form.enableAssignment,
      enableWorkerAssignment: !!form.enableWorkerAssignment,
      enableEquipmentAssignment: !!form.enableEquipmentAssignment,
      enableEquipmentOnReport: !!form.enableEquipmentOnReport,
      enablePieceRate: !!form.enablePieceRate,
      allowOutsource: !!form.allowOutsource,
      allowOutOfSequence: !!form.allowOutOfSequence,
      enableWeightOnReport: !!form.enableWeightOnReport,
      enableScanWeighing: !!form.enableScanWeighing,
    },
  };
}

function prepareArchiveForSave(tabId, form, allItems, isNew) {
  switch (tabId) {
    case 'warehouses':
      return prepareWarehouseForSave(form, allItems, isNew);
    case 'partner_categories':
      return preparePartnerCategoryForSave(form, allItems, isNew);
    case 'categories':
      return prepareCategoryForSave(form, allItems, isNew);
    case 'finance_categories':
      return prepareFinanceCategoryForSave(form, allItems, isNew);
    case 'nodes':
      return prepareNodeForSave(form, allItems, isNew);
    default:
      return { error: '未知设置类型' };
  }
}

function buildNodeToggleUpdates(node, key, nextVal, options) {
  const equipmentOn = options && options.equipmentFeaturesEnabled !== false;
  if (key === 'enableWorkerAssignment') {
    return nextVal
      ? { enableAssignment: true, enableWorkerAssignment: true }
      : { enableWorkerAssignment: false };
  }
  if (key === 'enableEquipmentAssignment') {
    if (!equipmentOn) return null;
    return nextVal
      ? { enableAssignment: true, enableEquipmentAssignment: true }
      : { enableEquipmentAssignment: false };
  }
  if (key === 'enableEquipmentOnReport' && !equipmentOn) return null;
  return { [key]: nextVal };
}

const CATEGORY_TOGGLES = [
  { key: 'hasProcess', label: '启用工序设置', desc: '开启后支持配置生产工序路线。' },
  { key: 'hasSalesPrice', label: '启用销售价格', desc: '是否在该类产品中录入销售标价。' },
  { key: 'hasPurchasePrice', label: '启用采购价', desc: '开启后可在产品档案中维护参考采购单价。' },
  { key: 'linkPartner', label: '关联合作单位', desc: '开启后可关联首选供应商。' },
  { key: 'hasColorSize', label: '启用颜色尺码', desc: '开启后支持颜色、尺码库选择。' },
  { key: 'hasBatchManagement', label: '启用批次管理', desc: '开启后该类产品在采购、出入库和生产入库中按批次记录库存。' },
];

const FINANCE_TOGGLES = [
  { key: 'linkPartner', label: '关联合作单位', desc: '开启后登记收付款时可选择合作单位。' },
  { key: 'selectPaymentAccount', label: '选择资金账户', desc: '开启后登记时可选择收支账户。' },
  { key: 'linkWorker', label: '关联工人', desc: '开启后登记时可选择工人。' },
  { key: 'linkProduct', label: '关联产品', desc: '开启后登记时可选择产品。' },
];

function buildNodeToggles(node, options) {
  const equipmentOn = options && options.equipmentFeaturesEnabled !== false;
  const traceOn = options && options.traceabilityEnabled;
  const toggles = [
    { key: 'hasBOM', label: '启用 BOM 依赖', desc: '开启后在此工序报工将扣减关联物料。' },
    { key: 'enableWorkerAssignment', label: '工人派工', desc: '开启后计划单详情中显示该工序的「分派负责人」选项。', getValue: () => isWorkerAssignmentEnabled(node) },
    { key: 'enableEquipmentAssignment', label: '设备派工', desc: '开启后计划单详情中显示该工序的「分派设备」选项。', equipmentOnly: true, getValue: () => isEquipmentAssignmentEnabled(node) },
    { key: 'enableEquipmentOnReport', label: '报工选择设备', desc: '开启后该工序报工时需选择设备。', equipmentOnly: true },
    { key: 'enablePieceRate', label: '开启计件工价', desc: '开启后产品与 BOM 中可配置该工序工价。' },
    { key: 'allowOutsource', label: '可外协', desc: '开启后该工序会在外协管理待发清单中显示。' },
    { key: 'allowOutOfSequence', label: '不按顺序生产', desc: '开启后本工序脱离顺序约束。' },
    { key: 'enableWeightOnReport', label: '报工时记录重量', desc: '开启后报工/外协收回时需录入交货重量。' },
    { key: 'enableScanWeighing', label: '扫码称重', desc: '开启后扫码报工/外协收货时显示电子秤捕获框。', traceOnly: true },
  ];
  return toggles.filter((t) => {
    if (t.equipmentOnly && !equipmentOn) return false;
    if (t.traceOnly && !traceOn) return false;
    return true;
  }).map((t) => ({
    key: t.key,
    label: t.label,
    desc: t.desc,
    value: t.getValue ? t.getValue() : !!node[t.key],
  }));
}

function filterCategoryToggles(cat, industryKind) {
  const sweater = industryKind === 'sweater_factory';
  return CATEGORY_TOGGLES.filter((t) => {
    if (t.key !== 'hasColorSize') return true;
    return sweater || !!cat.hasColorSize;
  });
}

module.exports = {
  makeCustomFieldId,
  normalizeCustomFieldsForSave,
  validateArchiveName,
  validateCategoryToggles,
  applyCategoryToggle,
  isCategoryToggleBlocked,
  prepareArchiveForSave,
  buildNodeToggleUpdates,
  buildNodeToggles,
  filterCategoryToggles,
  CATEGORY_TOGGLES,
  FINANCE_TOGGLES,
};
