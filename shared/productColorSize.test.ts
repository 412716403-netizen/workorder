import { describe, it, expect } from 'vitest';
import {
  validateProductColorSizeForSave,
  MSG_PRODUCT_COLOR_SIZE_REQUIRED_BOTH,
  MSG_PRODUCT_COLOR_SIZE_REQUIRED_COLOR,
  MSG_PRODUCT_COLOR_SIZE_REQUIRED_SIZE,
} from './productColorSize';

describe('validateProductColorSizeForSave', () => {
  it('分类未启用颜色尺码时不校验', () => {
    expect(
      validateProductColorSizeForSave({ hasColorSize: false, colorIds: [], sizeIds: [] }),
    ).toBeNull();
  });

  it('已启用时须至少 1 色 1 码', () => {
    expect(
      validateProductColorSizeForSave({ hasColorSize: true, colorIds: [], sizeIds: [] }),
    ).toBe(MSG_PRODUCT_COLOR_SIZE_REQUIRED_BOTH);
    expect(
      validateProductColorSizeForSave({ hasColorSize: true, colorIds: ['c1'], sizeIds: [] }),
    ).toBe(MSG_PRODUCT_COLOR_SIZE_REQUIRED_SIZE);
    expect(
      validateProductColorSizeForSave({ hasColorSize: true, colorIds: [], sizeIds: ['s1'] }),
    ).toBe(MSG_PRODUCT_COLOR_SIZE_REQUIRED_COLOR);
    expect(
      validateProductColorSizeForSave({ hasColorSize: true, colorIds: ['c1'], sizeIds: ['s1'] }),
    ).toBeNull();
  });
});
