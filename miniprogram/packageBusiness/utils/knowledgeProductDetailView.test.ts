import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildKnowledgeProductDetailView,
  bomHasConfiguredItems,
} = require('./knowledgeProductDetailView.js');

describe('knowledgeProductDetailView', () => {
  it('detects configured bom items', () => {
    expect(bomHasConfiguredItems({ items: [{ productId: 'm1', quantity: 1 }] })).toBe(true);
    expect(bomHasConfiguredItems({ items: [{ productId: '', quantity: 1 }] })).toBe(false);
  });

  it('builds process and bom sections', () => {
    const view = buildKnowledgeProductDetailView({
      product: {
        id: 'p1',
        name: '成品A',
        sku: 'A01',
        categoryId: 'c1',
        milestoneNodeIds: ['n1', 'n2'],
        nodeRates: { n1: 1.5 },
        nodePricingModes: { n1: 'per_piece' },
        variants: [],
      },
      category: { id: 'c1', name: '成衣' },
      dictionaries: { units: [], colors: [], sizes: [] },
      partners: [],
      globalNodes: [
        { id: 'n1', name: '裁剪', enablePieceRate: true, hasBOM: true },
        { id: 'n2', name: '缝制', enablePieceRate: false, hasBOM: false },
      ],
      boms: [
        {
          id: 'b1',
          parentProductId: 'p1',
          variantId: 'single-p1',
          nodeId: 'n1',
          name: '裁剪BOM',
          items: [{ productId: 'm1', quantity: 2, note: '主料' }],
        },
      ],
      products: [{ id: 'm1', name: '面料', sku: 'M1', unitId: 'u1' }],
      bomSkuId: 'single-p1',
    });

    expect(view.processRows).toHaveLength(2);
    expect(view.processRows[0].name).toBe('裁剪');
    expect(view.processRows[0].hasBOM).toBe(true);
    expect(view.processRows[0].showPieceHint).toBe(true);
    expect(view.showBomSection).toBe(true);
    expect(view.bomGroups).toHaveLength(1);
    expect(view.bomGroups[0].items[0].productName).toBe('面料 M1');
    expect(view.bomGroups[0].items[0].qtyText).toContain('×2');
    expect(view.showBomSkuTabs).toBe(false);
  });

  it('hides single-sku tab when product has no variants', () => {
    const view = buildKnowledgeProductDetailView({
      product: {
        id: 'p1',
        name: '成品A',
        sku: 'A01',
        categoryId: 'c1',
        milestoneNodeIds: ['n1'],
        variants: [],
      },
      category: { id: 'c1', name: '成衣' },
      dictionaries: { units: [], colors: [], sizes: [] },
      partners: [],
      globalNodes: [{ id: 'n1', name: '裁剪', hasBOM: true }],
      boms: [
        {
          id: 'b1',
          parentProductId: 'p1',
          variantId: 'single-p1',
          nodeId: 'n1',
          name: '裁剪BOM',
          items: [{ productId: 'm1', quantity: 1 }],
        },
      ],
      products: [{ id: 'm1', name: '面料', sku: 'M1', categoryId: 'c2', categoryCustomData: { f1: '棉' } }],
      categories: [
        { id: 'c2', name: '物料', customFields: [{ id: 'f1', label: '成分', type: 'text', showInForm: true }] },
      ],
      bomSkuId: 'single-p1',
    });

    expect(view.showBomSkuTabs).toBe(false);
    expect(view.bomGroups[0].items[0].productName).toBe('面料 M1');
    expect(view.bomGroups[0].items[0].showCustomTags).toBe(true);
    expect(view.bomGroups[0].items[0].customTags[0].text).toBe('成分: 棉');
  });

  it('shows all category custom fields including empty (not filtered by showInForm)', () => {
    const view = buildKnowledgeProductDetailView({
      product: {
        id: 'p1',
        name: '成品A',
        sku: 'A01',
        categoryId: 'c1',
        categoryCustomData: { f1: '羊毛', f2: '' },
        milestoneNodeIds: [],
      },
      category: {
        id: 'c1',
        name: '成衣',
        customFields: [
          { id: 'f1', label: '成分', type: 'text', showInForm: false },
          { id: 'f2', label: '产地', type: 'text', showInForm: true },
          { id: 'f3', label: '备注', type: 'text' },
        ],
      },
      dictionaries: { units: [], colors: [], sizes: [] },
      partners: [],
      globalNodes: [],
      boms: [],
      products: [],
      bomSkuId: '',
    });

    expect(view.showCustomSection).toBe(true);
    expect(view.customRows).toHaveLength(3);
    expect(view.customRows[0]).toMatchObject({ label: '成分', value: '羊毛', empty: false });
    expect(view.customRows[1]).toMatchObject({ label: '产地', value: '未填写', empty: true });
    expect(view.customRows[2]).toMatchObject({ label: '备注', value: '未填写', empty: true });
    expect(view.rows.some((r) => r.rowKey.startsWith('cf-'))).toBe(false);
  });

  it('marks knowledge custom fields as openable links', () => {
    const view = buildKnowledgeProductDetailView({
      product: {
        id: 'p1',
        name: '成品A',
        categoryId: 'c1',
        categoryCustomData: {
          kn: JSON.stringify({ id: 'doc-1', title: '工艺说明' }),
        },
        milestoneNodeIds: [],
      },
      category: {
        id: 'c1',
        name: '成衣',
        customFields: [{ id: 'kn', label: '工艺文档', type: 'knowledge' }],
      },
      dictionaries: { units: [], colors: [], sizes: [] },
      partners: [],
      globalNodes: [],
      boms: [],
      products: [],
      bomSkuId: '',
    });
    expect(view.customRows[0]).toMatchObject({
      label: '工艺文档',
      value: '工艺说明',
      empty: false,
      isKnowledgeLink: true,
      knowledgeDocId: 'doc-1',
      knowledgeTitle: '工艺说明',
    });
  });

  it('prefers thumb and never puts heavy imageUrl into view', () => {
    const heavy = `data:image/jpeg;base64,${'A'.repeat(70 * 1024)}`;
    const view = buildKnowledgeProductDetailView({
      product: {
        id: 'p1',
        name: '成品A',
        sku: 'A01',
        imageThumb: 'data:image/jpeg;base64,abc',
        imageUrl: heavy,
        milestoneNodeIds: [],
      },
      category: null,
      dictionaries: { units: [], colors: [], sizes: [] },
      partners: [],
      globalNodes: [],
      boms: [],
      products: [],
      bomSkuId: '',
    });
    expect(view.imageUrl).toBe('data:image/jpeg;base64,abc');
    expect(view.imageUrl.length).toBeLessThan(1000);

    const viewNoThumb = buildKnowledgeProductDetailView({
      product: {
        id: 'p1',
        name: '成品A',
        imageUrl: heavy,
        milestoneNodeIds: [],
      },
      category: null,
      dictionaries: { units: [], colors: [], sizes: [] },
      partners: [],
      globalNodes: [],
      boms: [],
      products: [],
      bomSkuId: '',
    });
    expect(viewNoThumb.showImage).toBe(false);
    expect(viewNoThumb.imageUrl).toBe('');
  });
});
