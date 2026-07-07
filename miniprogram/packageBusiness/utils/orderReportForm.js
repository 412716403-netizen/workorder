/**
 * 工单报工表单（对齐 Web ReportModal + useReportModalState 核心路径）
 */

const { effectiveCustomDocFieldType } = require('./reportCustomDocField.js');
const { productHasColorSizeMatrix, variantLabel } = require('./productionPlans.js');
const { buildVariantMatrixUiModel, sortVariantsByColorThenSize } = require('./variantQtyMatrix.js');

function getEffectiveReportTemplate(milestone, globalNodes) {
  const ms = milestone || {};
  const nodeDef = (globalNodes || []).find((n) => n.id === ms.templateId);
  const fromNode = nodeDef && nodeDef.reportTemplate ? nodeDef.reportTemplate : [];
  if (fromNode.length > 0) return fromNode;
  return ms.reportTemplate || [];
}

function normalizeReportFormField(field) {
  const raw = field && field.type;
  if (raw === 'boolean') {
    const opts = field.options && field.options.length ? field.options.slice() : ['是', '否'];
    return { id: field.id, label: field.label, type: 'select', options: opts, required: !!field.required, showInForm: field.showInForm };
  }
  if (raw === 'number') {
    return { id: field.id, label: field.label, type: 'text', required: !!field.required, showInForm: field.showInForm };
  }
  if (raw === 'date' || raw === 'select') {
    return {
      id: field.id,
      label: field.label,
      type: raw,
      options: field.options || [],
      required: !!field.required,
      showInForm: field.showInForm,
      dateWithTime: !!field.dateWithTime,
      dateAutoFill: !!field.dateAutoFill,
    };
  }
  if (raw === 'file' || raw === 'knowledge') {
    return {
      id: field.id,
      label: field.label,
      type: raw,
      required: !!field.required,
      showInForm: field.showInForm,
      desktopOnly: true,
    };
  }
  return { id: field.id, label: field.label, type: 'text', required: !!field.required, showInForm: field.showInForm };
}

function buildReportCustomFields(template) {
  return (template || [])
    .filter((f) => f && f.showInForm !== false)
    .map((f) => {
      const norm = normalizeReportFormField(f);
      const type = effectiveCustomDocFieldType(norm);
      return {
        id: norm.id,
        label: norm.label,
        type,
        options: norm.options || [],
        required: norm.required,
        dateWithTime: !!norm.dateWithTime,
        dateAutoFill: !!norm.dateAutoFill,
        pickerMode: norm.dateWithTime ? 'datetime' : 'date',
        isSelect: type === 'select',
        isDate: type === 'date',
        isText: type === 'text',
        isFile: type === 'file',
        isKnowledge: type === 'knowledge',
        desktopOnly: type === 'file' || type === 'knowledge',
      };
    });
}

function coerceRouteReportDefault(field, raw) {
  const eff = effectiveCustomDocFieldType(field);
  if (raw === undefined || raw === null || raw === '') return '';
  if (eff === 'select') {
    if (typeof raw === 'boolean') return raw ? ((field.options && field.options[0]) || '是') : ((field.options && field.options[1]) || '否');
    return String(raw);
  }
  if (eff === 'file' || eff === 'knowledge') return '';
  if (typeof raw === 'string' && raw.indexOf('data:') === 0) return '';
  return String(raw);
}

function buildInitialReportCustomData(fields, product) {
  const customData = {};
  const routeValues = (product && product.routeReportValues) || {};
  (fields || []).forEach((f) => {
    if (f.desktopOnly) return;
    if (routeValues[f.id] !== undefined) {
      customData[f.id] = coerceRouteReportDefault(f, routeValues[f.id]);
    }
  });
  return customData;
}

function buildCustomDataPayload(fields, customData) {
  const out = {};
  (fields || []).forEach((f) => {
    if (f.desktopOnly) return;
    const val = customData && customData[f.id];
    if (val !== undefined && val !== null && val !== '') {
      out[f.id] = val;
    }
  });
  return Object.keys(out).length ? out : undefined;
}

function filterEntitiesForNode(entities, templateId) {
  return (entities || []).filter((e) => {
    const ids = e.assignedMilestoneIds;
    if (!ids || !ids.length) return true;
    return ids.includes(templateId);
  });
}

function normalizeWorkersList(raw) {
  const list = Array.isArray(raw) ? raw : (raw && raw.data) || [];
  return list
    .map((w) => {
      if (!w) return null;
      const name = String(w.name || w.displayName || w.username || '').trim();
      if (!name) return null;
      return {
        id: w.id || w.userId,
        name,
        groupName: w.groupName ? String(w.groupName) : '',
        status: w.status || 'ACTIVE',
        assignedMilestoneIds: Array.isArray(w.assignedMilestoneIds) ? w.assignedMilestoneIds : [],
      };
    })
    .filter(Boolean);
}

function filterActiveWorkers(workers, templateId) {
  return filterEntitiesForNode(
    (workers || []).filter((w) => !w.status || w.status === 'ACTIVE'),
    templateId,
  );
}

/** 优先本工序 + 未分配；若无匹配则回退全部在岗人员 */
function resolveWorkersForReport(workers, templateId) {
  const active = (workers || []).filter((w) => !w.status || w.status === 'ACTIVE');
  const filtered = filterEntitiesForNode(active, templateId);
  return filtered.length > 0 ? filtered : active;
}

function buildWorkerPickerOptions(workers) {
  return (workers || []).map((w) => ({
    id: w.id,
    label: w.groupName ? `${w.name} · ${w.groupName}` : w.name,
  }));
}

function needEquipmentOnReport(globalNodes, templateId, equipmentFeaturesEnabled) {
  if (!equipmentFeaturesEnabled) return false;
  const node = (globalNodes || []).find((n) => n.id === templateId);
  return !!(node && node.enableEquipmentOnReport);
}

function buildQtyHintText(stats, unitName) {
  const unit = unitName || '件';
  if (!stats) return '';
  const totalQty = Number(stats.totalQty) || 0;
  const maxReportable = Number(stats.maxReportable) || 0;
  const reported = Number(stats.reported) || 0;
  const remaining = Number(stats.remaining) || 0;
  const defective = Number(stats.defective) || 0;
  const totalOutsourcedAtNode = Number(stats.totalOutsourcedAtNode) || 0;
  const totalRework = Number(stats.totalRework) || 0;

  if (totalQty <= 0 && maxReportable <= 0 && remaining <= 0) return '';
  const head = maxReportable !== totalQty && totalQty > 0
    ? `可报 ${maxReportable}/${totalQty} ${unit}`
    : (totalQty > 0 ? `合计 ${totalQty} ${unit}` : `最多可报 ${remaining} ${unit}`);
  let text = `${head} · 已报 ${reported} · 剩 ${remaining} ${unit}`;
  if (totalOutsourcedAtNode > 0) {
    text += ` · 外协剩余 ${totalOutsourcedAtNode} ${unit}`;
  }
  if (defective > 0) {
    text += ` · 返工 ${defective} ${unit}`;
  }
  if (totalRework > 0) {
    text += ` ·${defective > 0 ? ' 返工完成' : ' 返工'} ${totalRework}`;
  }
  return text;
}

/** 报工页数量汇总（对齐 Web ReportProductQtyHints） */
function buildReportQtySummary(stats, unitName) {
  const unit = unitName || '件';
  const empty = {
    show: false,
    maxReportable: 0,
    remaining: 0,
    reported: 0,
    totalQty: 0,
    defective: 0,
    maxReportableText: '',
    remainingText: '',
    detailText: '',
    hintText: '',
  };
  if (!stats) return empty;

  const totalQty = Math.max(0, Number(stats.totalQty) || 0);
  const maxReportable = Math.max(0, Number(stats.maxReportable) || 0);
  const remaining = Math.max(0, Number(stats.remaining) || 0);
  const reported = Math.max(0, Number(stats.reported) || 0);
  const defective = Math.max(0, Number(stats.defective) || 0);
  const hintText = buildQtyHintText(stats, unitName);

  if (!hintText && totalQty <= 0 && maxReportable <= 0 && remaining <= 0) return empty;

  let detailText = `已报 ${reported} ${unit}`;
  if (maxReportable !== totalQty && totalQty > 0) {
    detailText = `可报上限 ${maxReportable}/${totalQty} ${unit} · ${detailText}`;
  } else if (totalQty > 0) {
    detailText = `工单合计 ${totalQty} ${unit} · ${detailText}`;
  }
  if (defective > 0) {
    detailText += ` · 不良 ${defective} ${unit}`;
  }

  return {
    show: true,
    maxReportable,
    remaining,
    reported,
    totalQty,
    defective,
    maxReportableText: `${maxReportable} ${unit}`,
    remainingText: `${remaining} ${unit}`,
    detailText,
    hintText,
  };
}

function resolveReportFormMode(product, category, orderItems) {
  if (productHasColorSizeMatrix(product, category)) return 'matrix';
  const variantIds = new Set();
  (orderItems || []).forEach((it) => {
    if (it && it.variantId) variantIds.add(it.variantId);
  });
  if (variantIds.size > 1) return 'multi';
  return 'single';
}

function buildVariantRemainingMap(orderItems, milestoneReports) {
  const map = {};
  (orderItems || []).forEach((item) => {
    const vid = item.variantId || '';
    const prev = map[vid] || 0;
    map[vid] = prev + (Number(item.quantity) || 0);
  });
  (milestoneReports || []).forEach((r) => {
    const vid = r.variantId || '';
    if (map[vid] == null) return;
    map[vid] = Math.max(0, map[vid] - (Number(r.quantity) || 0));
  });
  return map;
}

function decorateReportMatrixCell(cell, qtyMap, defMap, layoutOpts, matrixTotal) {
  if (!cell.variantId) {
    return {
      ...cell,
      defectiveQty: '',
      maxQty: 0,
      maxQtyLabel: '',
    };
  }
  const variantMaxMap = (layoutOpts && layoutOpts.variantMaxGoodMap) || {};
  const effectiveRemaining = layoutOpts && layoutOpts.effectiveRemainingForModal;
  const allowExceed = !!(layoutOpts && layoutOpts.allowExceedMaxReportQty);
  const variantMaxGood = Math.max(0, Number(variantMaxMap[cell.variantId]) || 0);
  const currentQty = Number(qtyMap[cell.variantId]) || 0;
  const otherTotal = matrixTotal - currentQty;
  let maxAllowed = variantMaxGood;
  if (!allowExceed && Number.isFinite(effectiveRemaining)) {
    maxAllowed = Math.max(0, Math.min(variantMaxGood, effectiveRemaining - otherTotal));
  }
  const quantity = qtyMap[cell.variantId] != null ? String(qtyMap[cell.variantId]) : '';
  const defectiveQty = defMap[cell.variantId] != null ? String(defMap[cell.variantId]) : '';
  return {
    ...cell,
    quantity,
    defectiveQty,
    maxQty: maxAllowed,
    maxQtyLabel: `最多 ${maxAllowed}`,
  };
}

function patchReportMatrixLayout(matrixLayout, quantities, defectiveQuantities, layoutOpts) {
  if (!matrixLayout) return null;
  const defMap = defectiveQuantities || {};
  const qtyMap = quantities || {};
  const matrixTotal = sumMatrixQuantities(qtyMap);
  return {
    sizeColumns: matrixLayout.sizeColumns,
    colorRows: (matrixLayout.colorRows || []).map((row) => ({
      ...row,
      cells: (row.cells || []).map((cell) => decorateReportMatrixCell(
        cell,
        qtyMap,
        defMap,
        layoutOpts,
        matrixTotal,
      )),
    })),
  };
}

function buildReportMatrixLayout(product, dictionaries, quantities, defectiveQuantities, layoutOpts) {
  const matrix = buildVariantMatrixUiModel(product, dictionaries, quantities);
  if (!matrix) return null;
  return patchReportMatrixLayout(matrix, quantities, defectiveQuantities, layoutOpts);
}

function buildMultiVariantRows(
  product,
  category,
  dictionaries,
  orderItems,
  quantities,
  defectiveQuantities,
  variantMaxGoodMap,
  unitName,
) {
  const qtyMap = quantities || {};
  const defMap = defectiveQuantities || {};
  const maxMap = variantMaxGoodMap || {};
  const unit = unitName || '件';
  const itemByVariant = new Map();
  (orderItems || []).forEach((it) => {
    const vid = it.variantId || '';
    itemByVariant.set(vid, (itemByVariant.get(vid) || 0) + (Number(it.quantity) || 0));
  });
  const variants = sortVariantsByColorThenSize(
    (product && product.variants) || [],
    product && product.colorIds,
    product && product.sizeIds,
  ).filter((v) => itemByVariant.has(v.id));

  return variants.map((v) => {
    const maxQty = Math.max(0, Number(maxMap[v.id]) || 0);
    return {
      variantId: v.id,
      label: variantLabel(v, dictionaries),
      orderQty: itemByVariant.get(v.id) || 0,
      remainingQty: maxQty,
      remainingMeta: `最多 ${maxQty} ${unit}`,
      quantity: qtyMap[v.id] != null ? String(qtyMap[v.id]) : '',
      defectiveQty: defMap[v.id] != null ? String(defMap[v.id]) : '',
    };
  });
}

function parseNonNegativeInt(val, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function parsePositiveInt(val, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function sumMatrixQuantities(quantities) {
  return Object.values(quantities || {}).reduce((s, q) => s + (Number(q) || 0), 0);
}

function validateReportCustomFields(fields, customData) {
  for (let i = 0; i < (fields || []).length; i += 1) {
    const f = fields[i];
    if (f.desktopOnly || !f.required) continue;
    const v = customData && customData[f.id];
    if (v == null || (typeof v === 'string' && v.trim() === '')) {
      return `请填写：${f.label}`;
    }
  }
  return '';
}

function buildSubmitEntries(state) {
  const {
    formMode,
    singleQuantity,
    singleDefectiveQty,
    variantId,
    quantities,
    defectiveQuantities,
    variantRows,
  } = state;

  const entries = [];

  if (formMode === 'matrix') {
    const variantIds = new Set([
      ...Object.keys(quantities || {}),
      ...Object.keys(defectiveQuantities || {}),
    ]);
    variantIds.forEach((vid) => {
      const qty = parseNonNegativeInt(quantities[vid], 0);
      const def = parseNonNegativeInt((defectiveQuantities || {})[vid], 0);
      if (qty > 0 || def > 0) entries.push({ variantId: vid, quantity: qty, defectiveQuantity: def });
    });
    return entries;
  }

  if (formMode === 'multi') {
    (variantRows || []).forEach((row) => {
      const qty = parseNonNegativeInt(row.quantity, 0);
      const def = parseNonNegativeInt(row.defectiveQty, 0);
      if (qty > 0 || def > 0) {
        entries.push({ variantId: row.variantId, quantity: qty, defectiveQuantity: def });
      }
    });
    return entries;
  }

  const qty = parsePositiveInt(singleQuantity, 0);
  const def = parseNonNegativeInt(singleDefectiveQty, 0);
  if (qty > 0 || def > 0) {
    entries.push({
      variantId: variantId || undefined,
      quantity: qty,
      defectiveQuantity: def,
    });
  }
  return entries;
}

function computeCanSubmit(state) {
  if (!state.workerId) return false;
  if (state.needEquipment && !state.equipmentId) return false;
  const entries = buildSubmitEntries(state);
  return entries.some((e) => e.quantity > 0 || e.defectiveQuantity > 0);
}

module.exports = {
  getEffectiveReportTemplate,
  buildReportCustomFields,
  buildInitialReportCustomData,
  buildCustomDataPayload,
  normalizeWorkersList,
  filterActiveWorkers,
  resolveWorkersForReport,
  buildWorkerPickerOptions,
  filterEntitiesForNode,
  needEquipmentOnReport,
  buildQtyHintText,
  buildReportQtySummary,
  resolveReportFormMode,
  buildVariantRemainingMap,
  buildReportMatrixLayout,
  patchReportMatrixLayout,
  buildMultiVariantRows,
  parseNonNegativeInt,
  parsePositiveInt,
  sumMatrixQuantities,
  validateReportCustomFields,
  buildSubmitEntries,
  computeCanSubmit,
};
