import { describe, expect, it } from 'vitest';
import { DevStyleStatus, type DevStyleDto, type Product } from '../types';
import {
  patchDevStyleFromProduct,
  resolveDevStyleWithPublishedProduct,
} from './productInfoDevStyleBridge';

const style = (overrides: Partial<DevStyleDto> = {}): DevStyleDto =>
  ({
    id: 'st1',
    code: '款号A',
    name: '编号A',
    status: DevStyleStatus.DEVELOPING,
    publishedProductId: 'prod1',
    salesPrice: 10,
    purchasePrice: 5,
    colorIds: ['c1'],
    sizeIds: ['s1'],
    milestoneNodeIds: ['n1'],
    defaultStageNames: [],
    categoryCustomData: {},
    variants: [{ id: 'dvar-1', colorId: 'c1', sizeId: 's1', skuSuffix: '', nodeBoms: { n1: 'dbom-1' } }],
    samples: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as DevStyleDto;

const product = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 'prod1',
    name: '编号B',
    sku: '款号B',
    salesPrice: 99,
    purchasePrice: 88,
    colorIds: ['c1'],
    sizeIds: ['s1'],
    milestoneNodeIds: ['n1'],
    categoryCustomData: {},
    variants: [{ id: 'pv-1', colorId: 'c1', sizeId: 's1', skuSuffix: '', nodeBoms: { n1: 'bom-1' } }],
    ...overrides,
  }) as Product;

describe('resolveDevStyleWithPublishedProduct', () => {
  it('does not overlay product data while restored to developing (editable source of truth)', () => {
    const resolved = resolveDevStyleWithPublishedProduct(style(), [product()]);
    expect(resolved.salesPrice).toBe(10);
    expect(resolved.name).toBe('编号A');
    expect(resolved.variants[0].id).toBe('dvar-1');
    expect(resolved.variants[0].nodeBoms).toEqual({ n1: 'dbom-1' });
  });

  it('overlays product data only when status is published (read-only display)', () => {
    const resolved = resolveDevStyleWithPublishedProduct(
      style({ status: DevStyleStatus.PUBLISHED }),
      [product()],
    );
    expect(resolved.salesPrice).toBe(99);
    expect(resolved.name).toBe('编号B');
    expect(resolved.code).toBe('款号B');
    expect(resolved.variants[0].id).toBe('pv-1');
  });

  it('leaves never-published styles untouched', () => {
    const s = style({ publishedProductId: undefined, salesPrice: 7 });
    expect(resolveDevStyleWithPublishedProduct(s, [product()])).toBe(s);
  });
});

describe('patchDevStyleFromProduct', () => {
  it('writes product catalog fields onto the style while keeping style id', () => {
    const patched = patchDevStyleFromProduct(style(), product());
    expect(patched.id).toBe('st1');
    expect(patched.name).toBe('编号B');
    expect(patched.code).toBe('款号B');
    expect(patched.salesPrice).toBe(99);
  });
});
