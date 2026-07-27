import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const {
  listProductNameSkuFields,
  listProductMetaFields,
  listProductMetaFieldsFromMaps,
  buildPartnerNameById,
} = require('./listProductThumb.js');

/** Product.name = 产品编号，Product.sku = 产品名称 */
function product(overrides: Record<string, unknown> = {}) {
  return { id: 'p1', name: 'WW-001', sku: '圆领毛衣', ...overrides };
}

function textField(id: string, label: string, extra: Record<string, unknown> = {}) {
  return { id, label, type: 'text', ...extra };
}

describe('listProductNameSkuFields', () => {
  it('主标题取编号，副标题取名称', () => {
    expect(listProductNameSkuFields(product())).toEqual({
      productName: 'WW-001',
      productSku: '圆领毛衣',
      showProductSku: true,
    });
  });

  it('只有编号时不展示副标题', () => {
    expect(listProductNameSkuFields(product({ sku: '' }))).toEqual({
      productName: 'WW-001',
      productSku: '',
      showProductSku: false,
    });
  });

  it('编号缺失时名称升为主标题', () => {
    expect(listProductNameSkuFields(product({ name: '' }))).toEqual({
      productName: '圆领毛衣',
      productSku: '',
      showProductSku: false,
    });
  });

  it('编号与名称相同时只展示一次', () => {
    expect(listProductNameSkuFields(product({ sku: 'WW-001' }))).toEqual({
      productName: 'WW-001',
      productSku: '',
      showProductSku: false,
    });
  });

  it('产品缺失时按 fallback 的 name / sku 语义取值', () => {
    expect(listProductNameSkuFields(null, { name: 'WW-002', sku: '开衫' })).toEqual({
      productName: 'WW-002',
      productSku: '开衫',
      showProductSku: true,
    });
  });

  it('fallback 也接受 productName / productSku 别名', () => {
    expect(listProductNameSkuFields(null, { productName: 'WW-003', productSku: '马甲' })).toEqual({
      productName: 'WW-003',
      productSku: '马甲',
      showProductSku: true,
    });
  });

  it('两端空白不计入内容', () => {
    expect(listProductNameSkuFields({ name: '  WW-004 ', sku: ' 短袖 ' })).toEqual({
      productName: 'WW-004',
      productSku: '短袖',
      showProductSku: true,
    });
  });

  it('全空退化为占位符', () => {
    expect(listProductNameSkuFields(null)).toEqual({
      productName: '—',
      productSku: '',
      showProductSku: false,
    });
  });
});

describe('listProductMetaFields', () => {
  const partnerNameById = buildPartnerNameById([{ id: 's1', name: '张三加工厂' }]);

  it('分类开启 linkPartner 且供应商命中时展示合作单位', () => {
    const meta = listProductMetaFields(
      product({ supplierId: 's1' }),
      { id: 'c1', linkPartner: true },
      partnerNameById,
    );
    expect(meta.partnerName).toBe('张三加工厂');
    expect(meta.showPartner).toBe(true);
    expect(meta.showProductMeta).toBe(true);
  });

  it('分类未开启 linkPartner 时不展示合作单位', () => {
    const meta = listProductMetaFields(
      product({ supplierId: 's1' }),
      { id: 'c1', linkPartner: false },
      partnerNameById,
    );
    expect(meta.showPartner).toBe(false);
    expect(meta.showProductMeta).toBe(false);
  });

  it('供应商 id 在合作单位表中找不到时不展示', () => {
    const meta = listProductMetaFields(
      product({ supplierId: 'missing' }),
      { id: 'c1', linkPartner: true },
      partnerNameById,
    );
    expect(meta.showPartner).toBe(false);
  });

  it('自定义字段 pill 跳过空值与 showInForm=false 的字段', () => {
    const category = {
      id: 'c1',
      customFields: [
        textField('f1', '面料'),
        textField('f2', '克重'),
        textField('f3', '内部备注', { showInForm: false }),
      ],
    };
    const meta = listProductMetaFields(
      product({ categoryCustomData: { f1: '羊毛', f2: '', f3: '不该出现' } }),
      category,
      partnerNameById,
    );
    expect(meta.productCustomTags).toEqual([{ id: 'f1', label: '面料', display: '羊毛' }]);
    expect(meta.showProductCustomTags).toBe(true);
  });

  it('file 类型字段不进列表 pill', () => {
    const category = {
      id: 'c1',
      customFields: [{ id: 'f1', label: '工艺单', type: 'file' }],
    };
    const meta = listProductMetaFields(
      product({ categoryCustomData: { f1: [{ name: 'a.pdf', url: 'https://x/a.pdf' }] } }),
      category,
      partnerNameById,
    );
    expect(meta.productCustomTags).toEqual([]);
    expect(meta.showProductMeta).toBe(false);
  });

  it('按 maxTags 截断 pill 数量', () => {
    const category = {
      id: 'c1',
      customFields: [1, 2, 3, 4, 5].map((i) => textField(`f${i}`, `字段${i}`)),
    };
    const categoryCustomData: Record<string, string> = {};
    [1, 2, 3, 4, 5].forEach((i) => {
      categoryCustomData[`f${i}`] = `值${i}`;
    });
    const meta = listProductMetaFields(product({ categoryCustomData }), category, partnerNameById, {
      maxTags: 2,
    });
    expect(meta.productCustomTags.map((t: { id: string }) => t.id)).toEqual(['f1', 'f2']);
  });

  it('pill 内容超长截断到 48 字', () => {
    const category = { id: 'c1', customFields: [textField('f1', '备注')] };
    const meta = listProductMetaFields(
      product({ categoryCustomData: { f1: '很'.repeat(80) } }),
      category,
      partnerNameById,
    );
    expect(meta.productCustomTags[0].display).toHaveLength(48);
  });

  it('无合作单位也无自定义字段时整行不展示', () => {
    const meta = listProductMetaFields(product(), null, partnerNameById);
    expect(meta.showProductMeta).toBe(false);
  });
});

describe('listProductMetaFieldsFromMaps', () => {
  it('按 categoryId 在 categoryMap 中取分类', () => {
    const categoryMap = new Map([['c1', { id: 'c1', linkPartner: true }]]);
    const meta = listProductMetaFieldsFromMaps(
      product({ categoryId: 'c1', supplierId: 's1' }),
      categoryMap,
      buildPartnerNameById([{ id: 's1', name: '李四染厂' }]),
    );
    expect(meta.partnerName).toBe('李四染厂');
  });

  it('categoryId 未命中时按无分类处理', () => {
    const meta = listProductMetaFieldsFromMaps(
      product({ categoryId: 'unknown', supplierId: 's1' }),
      new Map(),
      buildPartnerNameById([{ id: 's1', name: '李四染厂' }]),
    );
    expect(meta.showPartner).toBe(false);
  });
});
