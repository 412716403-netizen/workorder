import { describe, expect, it } from 'vitest';
import {
  devStyleHasImage,
  devStyleOriginalSrc,
  devStyleThumbSrc,
} from './devStyleImageSrc';

describe('devStyleThumbSrc', () => {
  it('prefers imageThumb', () => {
    expect(devStyleThumbSrc({ imageThumb: 'thumb', imageUrl: 'full' })).toBe('thumb');
  });

  it('falls back to imageUrl', () => {
    expect(devStyleThumbSrc({ imageThumb: '  ', imageUrl: 'full' })).toBe('full');
  });
});

describe('devStyleOriginalSrc', () => {
  it('prefers imageUrl', () => {
    expect(devStyleOriginalSrc({ imageThumb: 'thumb', imageUrl: 'full' })).toBe('full');
  });

  it('falls back to thumb when original missing', () => {
    expect(devStyleOriginalSrc({ imageThumb: 'thumb' })).toBe('thumb');
  });
});

describe('devStyleHasImage', () => {
  it('detects any image field', () => {
    expect(devStyleHasImage({ imageThumb: 't' })).toBe(true);
    expect(devStyleHasImage({})).toBe(false);
  });
});
