import { describe, it, expect } from 'vitest';
import type { ProductCategory, ProductCodeElement, ProductCodeRule } from '../types';
import {
  PRODUCT_CODE_ELEMENT_DEFAULT_COUNT,
  PRODUCT_CODE_ELEMENT_MAX_COUNT,
  PRODUCT_CODE_ELEMENT_MIN_COUNT,
} from '../types';
import {
  appendProductCodeElement,
  removeProductCodeElement,
  normalizeProductCodeRule,
  normalizeProductCodeRuleMap,
  getProductCodeRule,
  listProductCodeFieldOptions,
  formatProductCodeDate,
  productCodeElementSegment,
  buildProductCodePrefix,
  buildProductCodePreview,
  listProductCodeFormulaParts,
} from './productCodeRule';

const makeCategory = (overrides?: Partial<ProductCategory>): ProductCategory => ({
  id: 'cat-1',
  name: '原料',
  color: 'bg-blue-100',
  hasProcess: false,
  hasSalesPrice: false,
  hasPurchasePrice: false,
  hasColorSize: false,
  customFields: [
    { id: 'f-spec', label: '产品规格', type: 'text' },
    { id: 'f-grade', label: '等级', type: 'select', options: ['一级', '二级'] },
    { id: 'f-date', label: '入库日期', type: 'date' },
    { id: 'f-file', label: '附件', type: 'file' },
    { id: 'f-doc', label: '工艺文档', type: 'knowledge' },
  ],
  ...overrides,
});

const autoRule: ProductCodeRule = {
  mode: 'auto',
  elements: [
    { type: 'fixedText', fixedText: 'WL' },
    { type: 'field', fieldKey: 'custom:f-spec', display: 'text', length: 4 },
    { type: 'field', fieldKey: 'custom:f-grade', display: 'mapped', optionCodes: { 一级: '01', 二级: '02' } },
    { type: 'none' },
  ],
  serialLength: 3,
  separator: '-',
};

describe('normalizeProductCodeRule / Map', () => {
  it('非法输入回落为手动默认规则', () => {
    const r = normalizeProductCodeRule('garbage');
    expect(r.mode).toBe('manual');
    expect(r.elements).toHaveLength(PRODUCT_CODE_ELEMENT_DEFAULT_COUNT);
    expect(r.elements.every((e) => e.type === 'fixedText' && e.fixedText === '')).toBe(true);
    expect(r.serialLength).toBe(3);
    expect(r.separator).toBe('-');
  });

  it('保留合法配置与元素条数，并夹住流水号位数', () => {
    const r = normalizeProductCodeRule({ mode: 'auto', serialLength: 99, separator: '_', elements: [{ type: 'fixedText', fixedText: 'WL' }] });
    expect(r.mode).toBe('auto');
    expect(r.serialLength).toBe(10);
    expect(r.separator).toBe('_');
    expect(r.elements).toHaveLength(1);
    expect(r.elements[0]).toEqual({ type: 'fixedText', fixedText: 'WL' });
  });

  it('元素条数被夹在 [MIN, MAX] 内', () => {
    const many = Array.from({ length: PRODUCT_CODE_ELEMENT_MAX_COUNT + 5 }, () => ({ type: 'none' }));
    expect(normalizeProductCodeRule({ elements: many }).elements).toHaveLength(PRODUCT_CODE_ELEMENT_MAX_COUNT);
    expect(normalizeProductCodeRule({ elements: [] }).elements).toHaveLength(PRODUCT_CODE_ELEMENT_MIN_COUNT);
  });

  it('field 元素缺 fieldKey 归一为 none；display 缺省为 text', () => {
    const r = normalizeProductCodeRule({ elements: [{ type: 'field' }, { type: 'field', fieldKey: 'sku' }] });
    expect(r.elements[0].type).toBe('none');
    expect(r.elements[1]).toMatchObject({ type: 'field', fieldKey: 'sku', display: 'text' });
  });

  it('增删元素受数量上下限约束', () => {
    const one: ProductCodeElement[] = [{ type: 'none' }];
    expect(appendProductCodeElement(one)).toHaveLength(2);
    expect(removeProductCodeElement(one, 0)).toBe(one);

    const full = Array.from({ length: PRODUCT_CODE_ELEMENT_MAX_COUNT }, () => ({ type: 'none' as const }));
    expect(appendProductCodeElement(full)).toBe(full);

    const three: ProductCodeElement[] = [
      { type: 'fixedText', fixedText: 'A' },
      { type: 'fixedText', fixedText: 'B' },
      { type: 'fixedText', fixedText: 'C' },
    ];
    expect(removeProductCodeElement(three, 1)).toEqual([
      { type: 'fixedText', fixedText: 'A' },
      { type: 'fixedText', fixedText: 'C' },
    ]);
    expect(removeProductCodeElement(three, 9)).toBe(three);
  });

  it('map 归一：丢弃非对象，逐条 normalize', () => {
    const map = normalizeProductCodeRuleMap({ 'cat-1': { mode: 'auto' }, 'cat-2': null });
    expect(map['cat-1'].mode).toBe('auto');
    expect(map['cat-2'].mode).toBe('manual');
    expect(normalizeProductCodeRuleMap(null)).toEqual({});
  });

  it('getProductCodeRule 未配置分类返回手动默认', () => {
    expect(getProductCodeRule({ 'cat-1': autoRule }, 'cat-1').mode).toBe('auto');
    expect(getProductCodeRule({ 'cat-1': autoRule }, 'cat-x').mode).toBe('manual');
    expect(getProductCodeRule({}, undefined).mode).toBe('manual');
  });
});

describe('listProductCodeFieldOptions', () => {
  it('含产品名称与 text/select/date 扩展字段，过滤 file/knowledge', () => {
    const opts = listProductCodeFieldOptions(makeCategory());
    expect(opts.map((o) => o.key)).toEqual(['sku', 'custom:f-spec', 'custom:f-grade', 'custom:f-date']);
    expect(opts[2].options).toEqual(['一级', '二级']);
  });

  it('无分类时只有产品名称', () => {
    expect(listProductCodeFieldOptions(undefined)).toHaveLength(1);
  });
});

describe('formatProductCodeDate', () => {
  it('2026-07-10 各格式', () => {
    expect(formatProductCodeDate('2026-07-10', 'yyMMdd')).toBe('260710');
    expect(formatProductCodeDate('2026-07-10', 'yyMM')).toBe('2607');
    expect(formatProductCodeDate('2026-07-10', 'yy')).toBe('26');
    expect(formatProductCodeDate('2026-07-10', 'yyyyMMdd')).toBe('20260710');
  });

  it('兼容带时间的值；非法值返回空串', () => {
    expect(formatProductCodeDate('2026-07-10T08:00:00.000Z', 'yyMMdd')).toBe('260710');
    expect(formatProductCodeDate('not-a-date', 'yyMMdd')).toBe('');
    expect(formatProductCodeDate(undefined, 'yyMMdd')).toBe('');
  });
});

describe('productCodeElementSegment / buildProductCodePrefix', () => {
  const product = {
    sku: '纯棉纱线',
    categoryCustomData: { 'f-spec': '32支双股', 'f-grade': '一级', 'f-date': '2026-07-10' },
  };

  it('固定文本 / 截位文本 / 选项映射 / 日期', () => {
    expect(productCodeElementSegment({ type: 'fixedText', fixedText: ' WL ' }, product)).toBe('WL');
    expect(productCodeElementSegment({ type: 'field', fieldKey: 'custom:f-spec', display: 'text', length: 4 }, product)).toBe('32支双');
    expect(productCodeElementSegment({ type: 'field', fieldKey: 'sku', display: 'text' }, product)).toBe('纯棉纱线');
    expect(productCodeElementSegment({ type: 'field', fieldKey: 'custom:f-grade', display: 'mapped', optionCodes: { 一级: '01' } }, product)).toBe('01');
    expect(productCodeElementSegment({ type: 'field', fieldKey: 'custom:f-date', display: 'date', dateFormat: 'yyMMdd' }, product)).toBe('260710');
  });

  it('取不到值返回空段：未填字段 / 未映射选项 / none', () => {
    expect(productCodeElementSegment({ type: 'none' }, product)).toBe('');
    expect(productCodeElementSegment({ type: 'field', fieldKey: 'custom:f-miss', display: 'text' }, product)).toBe('');
    expect(productCodeElementSegment({ type: 'field', fieldKey: 'custom:f-grade', display: 'mapped', optionCodes: {} }, product)).toBe('');
  });

  it('前缀拼接：跳过空段、末尾带分隔符', () => {
    expect(buildProductCodePrefix(autoRule, product)).toBe('WL-32支双-01-');
    const noGrade = { ...product, categoryCustomData: { 'f-spec': '32支双股' } };
    expect(buildProductCodePrefix(autoRule, noGrade)).toBe('WL-32支双-');
  });

  it('全部空段时前缀为空串（编号仅剩流水号）', () => {
    const fieldsOnly: ProductCodeRule = {
      ...autoRule,
      elements: [
        { type: 'field', fieldKey: 'sku', display: 'text' },
        { type: 'field', fieldKey: 'custom:f-spec', display: 'text' },
        { type: 'none' },
        { type: 'none' },
      ],
    };
    expect(buildProductCodePrefix(fieldsOnly, { sku: '', categoryCustomData: {} })).toBe('');
  });

  it('空分隔符直接连拼', () => {
    expect(buildProductCodePrefix({ ...autoRule, separator: '' }, product)).toBe('WL32支双01');
  });
});

describe('buildProductCodePreview / listProductCodeFormulaParts', () => {
  it('文本段 * 占位、映射段 **、日期段用当天、流水号补零', () => {
    const rule: ProductCodeRule = {
      mode: 'auto',
      elements: [
        { type: 'fixedText', fixedText: 'WL' },
        { type: 'field', fieldKey: 'sku', display: 'text' },
        { type: 'field', fieldKey: 'custom:f-date', display: 'date', dateFormat: 'yyMMdd' },
        { type: 'field', fieldKey: 'custom:f-grade', display: 'mapped', optionCodes: {} },
      ],
      serialLength: 3,
      separator: '-',
    };
    expect(buildProductCodePreview(rule, new Date(2026, 6, 10))).toBe('WL-********-260710-**-001');
  });

  it('公式条按元素顺序输出标签并以流水号收尾', () => {
    expect(listProductCodeFormulaParts(autoRule, makeCategory())).toEqual(['WL', '产品规格', '等级', '流水号']);
  });
});
