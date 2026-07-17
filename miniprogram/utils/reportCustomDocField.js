/**
 * 产品分类自定义字段展示（对齐 Web utils/reportCustomDocField.ts）
 */

const DEFAULT_BOOLEAN_OPTIONS = ['是', '否'];

function parseKnowledgeFieldValue(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') {
    const obj = raw;
    if (typeof obj.id === 'string' && obj.id) {
      return { id: obj.id, title: typeof obj.title === 'string' ? obj.title : '' };
    }
    return null;
  }
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith('{')) {
    try {
      const obj = JSON.parse(s);
      if (typeof obj.id === 'string' && obj.id) {
        return { id: obj.id, title: typeof obj.title === 'string' ? obj.title : '' };
      }
    } catch {
      return null;
    }
    return null;
  }
  return { id: s, title: '' };
}

function effectiveCustomDocFieldType(field) {
  const t = field && field.type;
  if (t === 'number') return 'text';
  if (t === 'boolean') return 'select';
  if (t === 'date' || t === 'select' || t === 'file' || t === 'knowledge') return t;
  return 'text';
}

function normalizeReportFieldDefinition(field) {
  if (!field || typeof field !== 'object') {
    return { id: '', label: '', type: 'text' };
  }
  const raw = field.type;
  if (raw === 'boolean') {
    const opts = field.options && field.options.length ? field.options.slice() : DEFAULT_BOOLEAN_OPTIONS.slice();
    return Object.assign({}, field, { type: 'select', options: opts });
  }
  if (raw === 'number') {
    return Object.assign({}, field, { type: 'text', options: undefined });
  }
  if (raw === 'date' || raw === 'file' || raw === 'knowledge') {
    return Object.assign({}, field, { type: raw, options: undefined });
  }
  if (raw === 'select') {
    return Object.assign({}, field, { type: 'select', options: field.options || [] });
  }
  return Object.assign({}, field, { type: 'text', options: undefined });
}

function normalizeReportFieldDefinitions(defs) {
  if (!defs || !defs.length) return [];
  return defs.map(normalizeReportFieldDefinition);
}

function normalizeFinanceCategoriesFromApi(list) {
  return (list || []).map((c) => ({
    ...c,
    customFields: normalizeReportFieldDefinitions(c && c.customFields),
  }));
}

function normalizeReportCustomDataValue(field, raw) {
  const eff = effectiveCustomDocFieldType(field);
  if (eff !== 'select') return raw;
  if (typeof raw === 'boolean') {
    return raw ? ((field.options && field.options[0]) || '是') : ((field.options && field.options[1]) || '否');
  }
  return raw;
}

function formatReportCustomDataForList(field, raw) {
  const f = normalizeReportFieldDefinition(field);
  const eff = effectiveCustomDocFieldType(f);
  if (raw === undefined || raw === null || raw === '') return '';
  if (eff === 'select' && typeof raw === 'boolean') {
    return String(normalizeReportCustomDataValue(f, raw));
  }
  if (eff === 'file' && typeof raw === 'string' && raw.indexOf('data:') === 0) return '已上传';
  if (eff === 'knowledge') {
    const ref = parseKnowledgeFieldValue(raw);
    return ref ? (ref.title || '资料库文件') : '';
  }
  if (typeof raw === 'boolean') return raw ? '是' : '否';
  return String(raw);
}

function getShowInFormCategoryFields(category, options) {
  const includeFile = !options || options.includeFile !== false;
  const defs = (category && category.customFields) || [];
  return defs.filter((f) => {
    if (f.showInForm === false) return false;
    if (!includeFile && effectiveCustomDocFieldType(f) === 'file') return false;
    return true;
  });
}

function getProductCategoryCustomFieldEntries(product, category, options) {
  const includeEmpty = options && options.includeEmpty === true;
  const defs = getShowInFormCategoryFields(category, { includeFile: options && options.includeFile });
  const out = [];
  for (let i = 0; i < defs.length; i += 1) {
    const f = defs[i];
    const value = product && product.categoryCustomData ? product.categoryCustomData[f.id] : undefined;
    const empty = value == null || value === '';
    if (empty && !includeEmpty) continue;
    out.push({
      field: f,
      value,
      empty,
      display: empty ? '' : formatReportCustomDataForList(f, value),
    });
  }
  return out;
}

/** 列表/卡片用：{ id, label, display } */
function mapProductCustomTags(product, category, options) {
  return getProductCategoryCustomFieldEntries(product, category, options).map(({ field, display }) => ({
    id: field.id,
    label: field.label,
    display,
  }));
}

module.exports = {
  parseKnowledgeFieldValue,
  effectiveCustomDocFieldType,
  normalizeReportFieldDefinition,
  normalizeReportFieldDefinitions,
  normalizeFinanceCategoriesFromApi,
  formatReportCustomDataForList,
  getShowInFormCategoryFields,
  getProductCategoryCustomFieldEntries,
  mapProductCustomTags,
};
