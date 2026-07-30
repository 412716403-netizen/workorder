import { describe, it, expect } from 'vitest';
import {
  buildBomCells,
  findBomForCell,
  buildBomStyleHeader,
  shouldSkipBomCellsList,
  devSingleSkuVariantId,
  isDevSingleSkuVariantId,
} from './devBomEdit.js';

const nodes = [
  { id: 'n1', name: '组装', hasBOM: true },
  { id: 'n2', name: '包装', hasBOM: false },
];

const dicts = { colors: [{ id: 'c1', name: '黑' }], sizes: [{ id: 's1', name: 'M' }], units: [] };

describe('devBomEdit single SKU', () => {
  it('builds 单规格 cells when style has no variants', () => {
    const style = { id: 'st1', variants: [], milestoneNodeIds: ['n1', 'n2'] };
    const cells = buildBomCells(style, nodes, dicts, { boms: [] });
    expect(cells).toHaveLength(1);
    expect(cells[0].variantLabel).toBe('单规格');
    expect(cells[0].nodeName).toBe('组装');
    expect(cells[0].configured).toBe(false);
  });

  it('marks configured from bom list when pseudo variant has no nodeBoms', () => {
    const style = { id: 'st1', variants: [], milestoneNodeIds: ['n1'] };
    const boms = [
      {
        id: 'b1',
        parentStyleId: 'st1',
        variantId: undefined,
        nodeId: 'n1',
        items: [{ productId: 'p1', quantity: 1 }],
      },
    ];
    const cells = buildBomCells(style, nodes, dicts, { boms });
    expect(cells[0].configured).toBe(true);
    expect(cells[0].bomId).toBe('b1');
  });

  it('findBomForCell matches dvar-single-* as single SKU', () => {
    const styleId = 'st1';
    const boms = [
      {
        id: 'b1',
        parentStyleId: styleId,
        variantId: devSingleSkuVariantId(styleId),
        nodeId: 'n1',
        items: [{ productId: 'p1', quantity: 2 }],
      },
    ];
    const hit = findBomForCell(boms, styleId, '', 'n1');
    expect(hit && hit.id).toBe('b1');
    expect(isDevSingleSkuVariantId('', styleId)).toBe(true);
    expect(isDevSingleSkuVariantId(devSingleSkuVariantId(styleId), styleId)).toBe(true);
  });

  it('buildBomStyleHeader exposes raw image for hydration', () => {
    const header = buildBomStyleHeader({
      id: 'st1',
      name: 'A001',
      code: '外套',
      imageThumb: 'data:image/jpeg;base64,abc',
      variants: [],
    });
    expect(header.productName).toBe('A001');
    expect(header.showProductSku).toBe(true);
    expect(header.isSingleSku).toBe(true);
    expect(header.showProductImage).toBe(false);
    expect(header._rawImageSrc).toBe('data:image/jpeg;base64,abc');
  });

  it('shouldSkipBomCellsList when single SKU and exactly one cell', () => {
    const style = { id: 'st1', variants: [] };
    expect(shouldSkipBomCellsList(style, [{ key: 'a' }])).toBe(true);
    expect(shouldSkipBomCellsList(style, [{ key: 'a' }, { key: 'b' }])).toBe(false);
    expect(shouldSkipBomCellsList(style, [])).toBe(false);
    expect(
      shouldSkipBomCellsList({ id: 'st1', variants: [{ id: 'v1' }] }, [{ key: 'a' }]),
    ).toBe(false);
  });
});
