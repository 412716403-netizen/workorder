import { describe, expect, it } from 'vitest';
import {
  isProductBlockedAsBomMaterialValue,
  isSingleSkuProductValue,
} from './productBomMaterial';

describe('isSingleSkuProductValue', () => {
  it('treats one blank generated variant as single SKU', () => {
    expect(
      isSingleSkuProductValue({
        colorIds: [],
        sizeIds: [],
        variants: [{ colorId: '', sizeId: '' }],
      }),
    ).toBe(true);
  });

  it('does not treat configured dimensions as single SKU', () => {
    expect(
      isSingleSkuProductValue({
        colorIds: ['red'],
        sizeIds: [],
        variants: [{ colorId: 'red', sizeId: '' }],
      }),
    ).toBe(false);
  });
});

describe('isProductBlockedAsBomMaterialValue', () => {
  it('allows a generated product with one blank default variant', () => {
    expect(
      isProductBlockedAsBomMaterialValue({
        colorIds: [],
        sizeIds: [],
        variants: [{ colorId: '', sizeId: '' }],
      }),
    ).toBe(false);
  });

  it('allows a product without variants or dimensions', () => {
    expect(
      isProductBlockedAsBomMaterialValue({
        colorIds: [],
        sizeIds: [],
        variants: [],
      }),
    ).toBe(false);
  });

  it('blocks configured color or size dimensions', () => {
    expect(
      isProductBlockedAsBomMaterialValue({
        colorIds: ['red'],
        sizeIds: [],
        variants: [{ colorId: '', sizeId: '' }],
      }),
    ).toBe(true);
    expect(
      isProductBlockedAsBomMaterialValue({
        colorIds: [],
        sizeIds: ['m'],
        variants: [],
      }),
    ).toBe(true);
  });

  it('blocks a variant that has a color or size', () => {
    expect(
      isProductBlockedAsBomMaterialValue({
        colorIds: [],
        sizeIds: [],
        variants: [{ colorId: 'red', sizeId: '' }],
      }),
    ).toBe(true);
  });

  it('blocks abnormal multiple blank variants', () => {
    expect(
      isProductBlockedAsBomMaterialValue({
        colorIds: [],
        sizeIds: [],
        variants: [
          { colorId: '', sizeId: '' },
          { colorId: '', sizeId: '' },
        ],
      }),
    ).toBe(true);
  });
});
