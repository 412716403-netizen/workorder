import { describe, it, expect } from 'vitest';
import {
  validateProductColorSizeForSave,
  MSG_PRODUCT_COLOR_SIZE_REQUIRED_BOTH,
} from './productColorSize.js';

describe('validateProductColorSizeForSave (miniprogram parity)', () => {
  it('passes when category has no color size', () => {
    expect(validateProductColorSizeForSave({
      hasColorSize: false,
      colorIds: [],
      sizeIds: [],
    })).toBeNull();
  });

  it('requires both when enabled', () => {
    expect(validateProductColorSizeForSave({
      hasColorSize: true,
      colorIds: [],
      sizeIds: [],
    })).toBe(MSG_PRODUCT_COLOR_SIZE_REQUIRED_BOTH);
  });

  it('passes with color and size selected', () => {
    expect(validateProductColorSizeForSave({
      hasColorSize: true,
      colorIds: ['c1'],
      sizeIds: ['s1'],
    })).toBeNull();
  });
});
