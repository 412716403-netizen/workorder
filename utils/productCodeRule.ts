/**
 * 产品编号自动生成规则 —— 纯函数（禁止依赖 React state/context）。
 *
 * 规则按产品分类各配一套（systemSetting key: productCodeRules），
 * 编号 = 元素一~四（固定文本 / 产品字段）非空段用分隔符连接 + 流水号。
 * 流水号按「除流水号外的前缀」分组取号，由后端 `GET /products/next-code` 与
 * 创建时的 `codeAutoGen` 分支负责，前端只拼前缀与预览。
 */
import type {
  Product,
  ProductCategory,
  ProductCodeDateFormat,
  ProductCodeElement,
  ProductCodeRule,
  ProductCodeRuleMap,
  ProductCodeSeparator,
  ReportFieldDefinition,
} from '../types';
import {
  PRODUCT_CODE_DATE_FORMATS,
  PRODUCT_CODE_DEFAULT_SERIAL_LENGTH,
  PRODUCT_CODE_ELEMENT_DEFAULT_COUNT,
  PRODUCT_CODE_ELEMENT_MAX_COUNT,
  PRODUCT_CODE_ELEMENT_MIN_COUNT,
  PRODUCT_CODE_FIELD_CUSTOM_PREFIX,
  PRODUCT_CODE_FIELD_SKU,
  PRODUCT_CODE_SEPARATORS,
  PRODUCT_CODE_SERIAL_LENGTH_MAX,
  PRODUCT_CODE_SERIAL_LENGTH_MIN,
} from '../types';

/** 字段下拉候选项：内建「产品名称」+ 当前分类的 text/select/date 扩展字段 */
export interface ProductCodeFieldOption {
  /** 'sku' 或 `custom:<ReportFieldDefinition.id>` */
  key: string;
  label: string;
  fieldType: 'text' | 'select' | 'date';
  /** fieldType=select：选项列表（配「选项对应编号」映射用） */
  options?: string[];
}

/** 新增元素的初始形态（「空值」类型已从可选项移除，仅历史配置中存在） */
function blankProductCodeElement(): ProductCodeElement {
  return { type: 'fixedText', fixedText: '' };
}

export const DEFAULT_PRODUCT_CODE_RULE: ProductCodeRule = {
  mode: 'manual',
  elements: Array.from({ length: PRODUCT_CODE_ELEMENT_DEFAULT_COUNT }, blankProductCodeElement),
  serialLength: PRODUCT_CODE_DEFAULT_SERIAL_LENGTH,
  separator: '-',
};

/** 新增一个元素后的列表；已达上限则原样返回 */
export function appendProductCodeElement(elements: ProductCodeElement[]): ProductCodeElement[] {
  if (elements.length >= PRODUCT_CODE_ELEMENT_MAX_COUNT) return elements;
  return [...elements, blankProductCodeElement()];
}

/** 删除指定位置的元素；已达下限则原样返回 */
export function removeProductCodeElement(elements: ProductCodeElement[], index: number): ProductCodeElement[] {
  if (elements.length <= PRODUCT_CODE_ELEMENT_MIN_COUNT) return elements;
  if (index < 0 || index >= elements.length) return elements;
  return elements.filter((_, i) => i !== index);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeElement(raw: unknown): ProductCodeElement {
  if (!isRecord(raw)) return { type: 'none' };
  const type = raw.type === 'fixedText' || raw.type === 'field' ? raw.type : 'none';
  if (type === 'none') return { type };
  if (type === 'fixedText') {
    return { type, fixedText: typeof raw.fixedText === 'string' ? raw.fixedText : '' };
  }
  const fieldKey = typeof raw.fieldKey === 'string' ? raw.fieldKey : '';
  if (!fieldKey) return { type: 'none' };
  const display = raw.display === 'mapped' || raw.display === 'date' ? raw.display : 'text';
  const el: ProductCodeElement = { type, fieldKey, display };
  if (display === 'text') {
    const n = Number(raw.length);
    if (Number.isInteger(n) && n > 0) el.length = Math.min(n, 50);
  } else if (display === 'mapped') {
    el.optionCodes = {};
    if (isRecord(raw.optionCodes)) {
      for (const [k, v] of Object.entries(raw.optionCodes)) {
        if (typeof v === 'string') el.optionCodes[k] = v;
      }
    }
  } else {
    el.dateFormat = PRODUCT_CODE_DATE_FORMATS.includes(raw.dateFormat as ProductCodeDateFormat)
      ? (raw.dateFormat as ProductCodeDateFormat)
      : 'yyMMdd';
  }
  return el;
}

/** 容错解析单条规则（config JSON 可能残缺/类型漂移） */
export function normalizeProductCodeRule(raw: unknown): ProductCodeRule {
  if (!isRecord(raw)) return { ...DEFAULT_PRODUCT_CODE_RULE, elements: DEFAULT_PRODUCT_CODE_RULE.elements.map((e) => ({ ...e })) };
  const elementsRaw = Array.isArray(raw.elements) ? raw.elements : [];
  const elements = elementsRaw.slice(0, PRODUCT_CODE_ELEMENT_MAX_COUNT).map(normalizeElement);
  while (elements.length < PRODUCT_CODE_ELEMENT_MIN_COUNT) elements.push(blankProductCodeElement());
  const serialRaw = Number(raw.serialLength);
  const serialLength = Number.isInteger(serialRaw)
    ? Math.min(Math.max(serialRaw, PRODUCT_CODE_SERIAL_LENGTH_MIN), PRODUCT_CODE_SERIAL_LENGTH_MAX)
    : PRODUCT_CODE_DEFAULT_SERIAL_LENGTH;
  const separator = PRODUCT_CODE_SEPARATORS.includes(raw.separator as ProductCodeSeparator)
    ? (raw.separator as ProductCodeSeparator)
    : '-';
  return {
    mode: raw.mode === 'auto' ? 'auto' : 'manual',
    elements,
    serialLength,
    separator,
  };
}

/** 容错解析整个 map（分类 id -> 规则） */
export function normalizeProductCodeRuleMap(raw: unknown): ProductCodeRuleMap {
  if (!isRecord(raw)) return {};
  const map: ProductCodeRuleMap = {};
  for (const [categoryId, rule] of Object.entries(raw)) {
    if (!categoryId) continue;
    map[categoryId] = normalizeProductCodeRule(rule);
  }
  return map;
}

/** 取某分类的规则；未配置时返回手动输入的默认规则 */
export function getProductCodeRule(map: ProductCodeRuleMap, categoryId: string | undefined): ProductCodeRule {
  if (categoryId && map[categoryId]) return map[categoryId];
  return normalizeProductCodeRule(undefined);
}

function customFieldOptionType(f: ReportFieldDefinition): ProductCodeFieldOption['fieldType'] | null {
  if (f.type === 'text' || f.type === 'select' || f.type === 'date') return f.type;
  return null; // file / knowledge 不参与编号
}

/** 当前分类可选的产品字段：产品名称 + 分类专属扩展字段（text/select/date） */
export function listProductCodeFieldOptions(category: ProductCategory | undefined): ProductCodeFieldOption[] {
  const out: ProductCodeFieldOption[] = [
    { key: PRODUCT_CODE_FIELD_SKU, label: '产品名称', fieldType: 'text' },
  ];
  for (const f of category?.customFields ?? []) {
    const fieldType = customFieldOptionType(f);
    if (!fieldType) continue;
    out.push({
      key: `${PRODUCT_CODE_FIELD_CUSTOM_PREFIX}${f.id}`,
      label: f.label,
      fieldType,
      options: fieldType === 'select' ? (f.options ?? []) : undefined,
    });
  }
  return out;
}

/** 从字段 key 解析出候选项定义（用于按字段类型联动显示方式） */
export function resolveProductCodeFieldOption(
  category: ProductCategory | undefined,
  fieldKey: string | undefined,
): ProductCodeFieldOption | undefined {
  if (!fieldKey) return undefined;
  return listProductCodeFieldOptions(category).find((o) => o.key === fieldKey);
}

/** 把日期字符串（'2026-07-10' / ISO / 带时间）格式化为编号段；解析失败返回 '' */
export function formatProductCodeDate(value: unknown, format: ProductCodeDateFormat): string {
  if (typeof value !== 'string') return '';
  const m = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [, yyyy, MM, dd] = m;
  const yy = yyyy.slice(2);
  switch (format) {
    case 'yyMMdd': return `${yy}${MM}${dd}`;
    case 'yyMM': return `${yy}${MM}`;
    case 'yy': return yy;
    case 'yyyyMMdd': return `${yyyy}${MM}${dd}`;
  }
}

function truncateChars(s: string, n: number | undefined): string {
  if (!n || n <= 0) return s;
  return Array.from(s).slice(0, n).join('');
}

/** 取产品字段原始值（string）；取不到返回 '' */
function fieldRawValue(product: Pick<Product, 'sku' | 'categoryCustomData'>, fieldKey: string): string {
  if (fieldKey === PRODUCT_CODE_FIELD_SKU) return (product.sku ?? '').trim();
  if (fieldKey.startsWith(PRODUCT_CODE_FIELD_CUSTOM_PREFIX)) {
    const id = fieldKey.slice(PRODUCT_CODE_FIELD_CUSTOM_PREFIX.length);
    const v = product.categoryCustomData?.[id];
    return typeof v === 'string' ? v.trim() : '';
  }
  return '';
}

/** 单个元素的编号段；取不到值返回 ''（拼接时跳过空段） */
export function productCodeElementSegment(
  el: ProductCodeElement,
  product: Pick<Product, 'sku' | 'categoryCustomData'>,
): string {
  if (el.type === 'none') return '';
  if (el.type === 'fixedText') return (el.fixedText ?? '').trim();
  if (!el.fieldKey) return '';
  const raw = fieldRawValue(product, el.fieldKey);
  if (!raw) return '';
  if (el.display === 'mapped') return (el.optionCodes?.[raw] ?? '').trim();
  if (el.display === 'date') return formatProductCodeDate(raw, el.dateFormat ?? 'yyMMdd');
  return truncateChars(raw, el.length);
}

/**
 * 拼出不含流水号的前缀（非空段用分隔符连接，末尾带分隔符）。
 * 完整编号 = prefix + 流水号（serialLength 位左补零）。
 */
export function buildProductCodePrefix(
  rule: ProductCodeRule,
  product: Pick<Product, 'sku' | 'categoryCustomData'>,
): string {
  const segments = rule.elements
    .map((el) => productCodeElementSegment(el, product))
    .filter((s) => s.length > 0);
  if (segments.length === 0) return '';
  return segments.join(rule.separator) + rule.separator;
}

const PREVIEW_TEXT_PLACEHOLDER_LEN = 8;

/** 弹窗预览：文本段用 * 占位（未设截位时 8 个），映射段 **，日期段用今天示例，流水号 001 */
export function buildProductCodePreview(rule: ProductCodeRule, today: Date = new Date()): string {
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const segments: string[] = [];
  for (const el of rule.elements) {
    if (el.type === 'none') continue;
    if (el.type === 'fixedText') {
      const t = (el.fixedText ?? '').trim();
      if (t) segments.push(t);
      continue;
    }
    if (!el.fieldKey) continue;
    if (el.display === 'mapped') {
      segments.push('**');
    } else if (el.display === 'date') {
      segments.push(formatProductCodeDate(iso, el.dateFormat ?? 'yyMMdd'));
    } else {
      segments.push('*'.repeat(el.length && el.length > 0 ? el.length : PREVIEW_TEXT_PLACEHOLDER_LEN));
    }
  }
  segments.push('1'.padStart(rule.serialLength, '0'));
  return segments.join(rule.separator);
}

/** 规则公式条：产品定义编号 = WL + 产品名称 + 产品规格 + 流水号 */
export function listProductCodeFormulaParts(
  rule: ProductCodeRule,
  category: ProductCategory | undefined,
): string[] {
  const parts: string[] = [];
  for (const el of rule.elements) {
    if (el.type === 'none') continue;
    if (el.type === 'fixedText') {
      const t = (el.fixedText ?? '').trim();
      parts.push(t || '固定文本');
      continue;
    }
    const opt = resolveProductCodeFieldOption(category, el.fieldKey);
    parts.push(opt?.label ?? '产品字段');
  }
  parts.push('流水号');
  return parts;
}
