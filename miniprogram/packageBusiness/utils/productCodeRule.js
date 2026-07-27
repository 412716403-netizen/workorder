/**
 * 产品编号自动生成规则 —— 纯函数（对齐 Web utils/productCodeRule.ts）。
 * 小程序只消费网页配置的规则，不做规则配置 UI。
 */

const PRODUCT_CODE_ELEMENT_MIN_COUNT = 1;
const PRODUCT_CODE_ELEMENT_MAX_COUNT = 10;
const PRODUCT_CODE_ELEMENT_DEFAULT_COUNT = 2;
const PRODUCT_CODE_FIELD_SKU = 'sku';
const PRODUCT_CODE_FIELD_CUSTOM_PREFIX = 'custom:';
const PRODUCT_CODE_DATE_FORMATS = ['yyMMdd', 'yyMM', 'yy', 'yyyyMMdd'];
const PRODUCT_CODE_SEPARATORS = ['-', '_', '/', ''];
const PRODUCT_CODE_SERIAL_LENGTH_MIN = 1;
const PRODUCT_CODE_SERIAL_LENGTH_MAX = 10;
const PRODUCT_CODE_DEFAULT_SERIAL_LENGTH = 3;
const PRODUCT_CODE_RULES_CONFIG_KEY = 'productCodeRules';

function blankProductCodeElement() {
  return { type: 'fixedText', fixedText: '' };
}

const DEFAULT_PRODUCT_CODE_RULE = {
  mode: 'manual',
  elements: Array.from({ length: PRODUCT_CODE_ELEMENT_DEFAULT_COUNT }, blankProductCodeElement),
  serialLength: PRODUCT_CODE_DEFAULT_SERIAL_LENGTH,
  separator: '-',
};

function isRecord(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeElement(raw) {
  if (!isRecord(raw)) return { type: 'none' };
  const type = raw.type === 'fixedText' || raw.type === 'field' ? raw.type : 'none';
  if (type === 'none') return { type };
  if (type === 'fixedText') {
    return { type, fixedText: typeof raw.fixedText === 'string' ? raw.fixedText : '' };
  }
  const fieldKey = typeof raw.fieldKey === 'string' ? raw.fieldKey : '';
  if (!fieldKey) return { type: 'none' };
  const display = raw.display === 'mapped' || raw.display === 'date' ? raw.display : 'text';
  const el = { type, fieldKey, display };
  if (display === 'text') {
    const n = Number(raw.length);
    if (Number.isInteger(n) && n > 0) el.length = Math.min(n, 50);
  } else if (display === 'mapped') {
    el.optionCodes = {};
    if (isRecord(raw.optionCodes)) {
      Object.keys(raw.optionCodes).forEach((k) => {
        const v = raw.optionCodes[k];
        if (typeof v === 'string') el.optionCodes[k] = v;
      });
    }
  } else {
    el.dateFormat = PRODUCT_CODE_DATE_FORMATS.indexOf(raw.dateFormat) >= 0 ? raw.dateFormat : 'yyMMdd';
  }
  return el;
}

function normalizeProductCodeRule(raw) {
  if (!isRecord(raw)) {
    return {
      ...DEFAULT_PRODUCT_CODE_RULE,
      elements: DEFAULT_PRODUCT_CODE_RULE.elements.map((e) => ({ ...e })),
    };
  }
  const elementsRaw = Array.isArray(raw.elements) ? raw.elements : [];
  const elements = elementsRaw.slice(0, PRODUCT_CODE_ELEMENT_MAX_COUNT).map(normalizeElement);
  while (elements.length < PRODUCT_CODE_ELEMENT_MIN_COUNT) elements.push(blankProductCodeElement());
  const serialRaw = Number(raw.serialLength);
  const serialLength = Number.isInteger(serialRaw)
    ? Math.min(Math.max(serialRaw, PRODUCT_CODE_SERIAL_LENGTH_MIN), PRODUCT_CODE_SERIAL_LENGTH_MAX)
    : PRODUCT_CODE_DEFAULT_SERIAL_LENGTH;
  const separator = PRODUCT_CODE_SEPARATORS.indexOf(raw.separator) >= 0 ? raw.separator : '-';
  return {
    mode: raw.mode === 'auto' ? 'auto' : 'manual',
    elements,
    serialLength,
    separator,
  };
}

function normalizeProductCodeRuleMap(raw) {
  if (!isRecord(raw)) return {};
  const map = {};
  Object.keys(raw).forEach((categoryId) => {
    if (!categoryId) return;
    map[categoryId] = normalizeProductCodeRule(raw[categoryId]);
  });
  return map;
}

function getProductCodeRule(map, categoryId) {
  if (categoryId && map && map[categoryId]) return map[categoryId];
  return normalizeProductCodeRule(undefined);
}

function formatProductCodeDate(value, format) {
  if (typeof value !== 'string') return '';
  const m = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const yyyy = m[1];
  const MM = m[2];
  const dd = m[3];
  const yy = yyyy.slice(2);
  switch (format) {
    case 'yyMMdd':
      return `${yy}${MM}${dd}`;
    case 'yyMM':
      return `${yy}${MM}`;
    case 'yy':
      return yy;
    case 'yyyyMMdd':
      return `${yyyy}${MM}${dd}`;
    default:
      return '';
  }
}

function truncateChars(s, n) {
  if (!n || n <= 0) return s;
  return Array.from(s).slice(0, n).join('');
}

function fieldRawValue(product, fieldKey) {
  if (fieldKey === PRODUCT_CODE_FIELD_SKU) return String((product && product.sku) || '').trim();
  if (fieldKey.indexOf(PRODUCT_CODE_FIELD_CUSTOM_PREFIX) === 0) {
    const id = fieldKey.slice(PRODUCT_CODE_FIELD_CUSTOM_PREFIX.length);
    const v = product && product.categoryCustomData ? product.categoryCustomData[id] : undefined;
    return typeof v === 'string' ? v.trim() : '';
  }
  return '';
}

function productCodeElementSegment(el, product) {
  if (!el || el.type === 'none') return '';
  if (el.type === 'fixedText') return String(el.fixedText || '').trim();
  if (!el.fieldKey) return '';
  const raw = fieldRawValue(product, el.fieldKey);
  if (!raw) return '';
  if (el.display === 'mapped') {
    return String((el.optionCodes && el.optionCodes[raw]) || '').trim();
  }
  if (el.display === 'date') return formatProductCodeDate(raw, el.dateFormat || 'yyMMdd');
  return truncateChars(raw, el.length);
}

function buildProductCodePrefix(rule, product) {
  const segments = (rule.elements || [])
    .map((el) => productCodeElementSegment(el, product))
    .filter((s) => s.length > 0);
  if (segments.length === 0) return '';
  return segments.join(rule.separator) + rule.separator;
}

module.exports = {
  PRODUCT_CODE_RULES_CONFIG_KEY,
  PRODUCT_CODE_FIELD_SKU,
  PRODUCT_CODE_FIELD_CUSTOM_PREFIX,
  DEFAULT_PRODUCT_CODE_RULE,
  normalizeProductCodeRule,
  normalizeProductCodeRuleMap,
  getProductCodeRule,
  formatProductCodeDate,
  productCodeElementSegment,
  buildProductCodePrefix,
};
