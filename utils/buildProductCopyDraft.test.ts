import { describe, it, expect } from 'vitest';
import type { BOM, Product } from '../types';
import {
  appendCopySuffix,
  buildProductCopyDraft,
  uniqueCopiedProductName,
} from './buildProductCopyDraft';

describe('appendCopySuffix', () => {
  it('空串保持空', () => {
    expect(appendCopySuffix('')).toBe('');
    expect(appendCopySuffix('   ')).toBe('');
  });

  it('普通值追加 -副本', () => {
    expect(appendCopySuffix('A001')).toBe('A001-副本');
  });

  it('已带 -副本 时变成 -副本2', () => {
    expect(appendCopySuffix('A001-副本')).toBe('A001-副本2');
  });

  it('已带序号则递增', () => {
    expect(appendCopySuffix('A001-副本2')).toBe('A001-副本3');
  });
});

describe('uniqueCopiedProductName', () => {
  const catalog = [
    { id: 'p1', name: 'A001', sku: '' },
    { id: 'p2', name: 'A001-副本', sku: '' },
  ] as Product[];

  it('被占用时跳到副本2', () => {
    expect(uniqueCopiedProductName('A001', catalog)).toBe('A001-副本2');
  });
});

describe('buildProductCopyDraft', () => {
  const source: Product = {
    id: 'p-src',
    name: 'PN-1',
    sku: '毛衣',
    categoryId: 'cat-1',
    colorIds: ['c1'],
    sizeIds: ['s1'],
    variants: [
      { id: 'pv-1', colorId: 'c1', sizeId: 's1', skuSuffix: '', nodeBoms: { n1: 'bom-1' }, nodeUnitWeights: { n1: 0.2 } },
    ],
    milestoneNodeIds: ['n1', 'n2'],
    nodeRates: { n1: 1.5 },
    salesPrice: 10,
    purchasePrice: 5,
    processLocked: true,
    enabled: false,
  };

  const sourceBoms: BOM[] = [
    {
      id: 'bom-1',
      name: 'PN-1 [缝制]',
      parentProductId: 'p-src',
      variantId: 'pv-1',
      nodeId: 'n1',
      version: 'V1.0',
      items: [{ productId: 'mat-1', quantity: 2 }],
    },
    {
      id: 'bom-other',
      name: '其他产品',
      parentProductId: 'p-other',
      variantId: 'pv-x',
      nodeId: 'n1',
      version: 'V1.0',
      items: [{ productId: 'mat-2', quantity: 1 }],
    },
  ];

  it('生成新 id，编号名称加后缀，并复制工序规格 BOM', () => {
    let n = 0;
    const draft = buildProductCopyDraft(source, sourceBoms, {
      idFactory: () => `fixed${++n}`,
      catalog: [source],
    });

    expect(draft.product.id).toBe('p-fixed1');
    expect(draft.product.name).toBe('PN-1-副本');
    expect(draft.product.sku).toBe('毛衣-副本');
    expect(draft.product.processLocked).toBe(false);
    expect(draft.product.enabled).toBe(true);
    expect(draft.product.milestoneNodeIds).toEqual(['n1', 'n2']);
    expect(draft.product.nodeRates).toEqual({ n1: 1.5 });
    expect(draft.product.variants).toHaveLength(1);
    expect(draft.product.variants[0].id).toBe('pv-fixed2');
    expect(draft.product.variants[0].id).not.toBe('pv-1');
    expect(draft.product.variants[0].nodeUnitWeights).toEqual({ n1: 0.2 });

    expect(draft.boms).toHaveLength(1);
    expect(draft.boms[0].id).toBe('bom-fixed3');
    expect(draft.boms[0].parentProductId).toBe(draft.product.id);
    expect(draft.boms[0].variantId).toBe(draft.product.variants[0].id);
    expect(draft.boms[0].items).toEqual([{ productId: 'mat-1', quantity: 2 }]);
    expect(draft.boms[0].name).toBe('PN-1-副本 [缝制]');
    expect(draft.product.variants[0].nodeBoms?.n1).toBe(draft.boms[0].id);
  });

  it('不改动源对象', () => {
    const before = JSON.stringify(source);
    buildProductCopyDraft(source, sourceBoms, { idFactory: () => 'x' });
    expect(JSON.stringify(source)).toBe(before);
  });

  it('自动编号时产品编号留空，名称仍加副本', () => {
    let n = 0;
    const draft = buildProductCopyDraft(source, sourceBoms, {
      idFactory: () => `a${++n}`,
      useAutoCode: true,
    });
    expect(draft.product.name).toBe('');
    expect(draft.product.sku).toBe('毛衣-副本');
    expect(draft.boms[0].name).toBe('PN-1-副本 [缝制]');
  });
});
