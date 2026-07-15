import { describe, expect, it } from 'vitest';
import {
  productHasImage,
  productThumbSrc,
  stripProductOriginalForListCache,
} from './productImageSrc';

describe('productThumbSrc', () => {
  it('prefers imageThumb over imageUrl', () => {
    expect(productThumbSrc({ imageThumb: 'thumb', imageUrl: 'full' })).toBe('thumb');
  });

  it('falls back to imageUrl when thumb missing', () => {
    expect(productThumbSrc({ imageUrl: 'full' })).toBe('full');
    expect(productThumbSrc({ imageThumb: '  ', imageUrl: 'full' })).toBe('full');
  });

  it('returns empty for nullish', () => {
    expect(productThumbSrc(null)).toBe('');
    expect(productThumbSrc(undefined)).toBe('');
    expect(productThumbSrc({})).toBe('');
  });
});

describe('productHasImage', () => {
  it('detects thumb or url', () => {
    expect(productHasImage({ imageThumb: 't' })).toBe(true);
    expect(productHasImage({ imageUrl: 'u' })).toBe(true);
    expect(productHasImage({})).toBe(false);
  });
});

describe('stripProductOriginalForListCache', () => {
  it('drops imageUrl when imageThumb present', () => {
    const out = stripProductOriginalForListCache({
      id: 'p1',
      imageThumb: 'thumb',
      imageUrl: 'data:image/png;base64,AAA',
    });
    expect(out).toEqual({ id: 'p1', imageThumb: 'thumb' });
    expect('imageUrl' in out).toBe(false);
  });

  it('keeps imageUrl when no thumb', () => {
    const src = { id: 'p1', imageUrl: 'full' };
    expect(stripProductOriginalForListCache(src)).toBe(src);
  });
});
