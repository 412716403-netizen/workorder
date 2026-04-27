import { describe, it, expect } from 'vitest';
import { AppError } from '../src/middleware/errorHandler.js';
import { assertCategoryBatchColorMutex, assertCategoryColorSizeUpgradeAllowed } from '../src/utils/categoryMutex.js';

describe('categoryMutex', () => {
  it('assertCategoryBatchColorMutex rejects color+size with batch', () => {
    expect(() => assertCategoryBatchColorMutex({ hasColorSize: true, hasBatchManagement: true })).toThrow(AppError);
    expect(() => assertCategoryBatchColorMutex({ hasColorSize: true, hasBatchManagement: true })).toThrow(
      /颜色尺码与批次管理不可同时启用/,
    );
  });

  it('assertCategoryBatchColorMutex allows only color', () => {
    expect(() => assertCategoryBatchColorMutex({ hasColorSize: true, hasBatchManagement: false })).not.toThrow();
  });

  it('assertCategoryColorSizeUpgradeAllowed rejects when category has batch management', () => {
    expect(() =>
      assertCategoryColorSizeUpgradeAllowed({ hasBatchManagement: true, hasColorSize: false }),
    ).toThrow(AppError);
  });

  it('assertCategoryColorSizeUpgradeAllowed no-op for null category', () => {
    expect(() => assertCategoryColorSizeUpgradeAllowed(null)).not.toThrow();
    expect(() => assertCategoryColorSizeUpgradeAllowed(undefined)).not.toThrow();
  });
});
