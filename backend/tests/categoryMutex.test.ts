import { describe, it, expect } from 'vitest';
import { AppError } from '../src/middleware/errorHandler.js';
import { assertCategoryBatchColorMutex, assertCategoryColorSizeUpgradeAllowed, applyCategoryPurchasePartnerRule, assertCategoryPurchasePartnerRule } from '../src/utils/categoryMutex.js';

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

  it('applyCategoryPurchasePartnerRule auto-enables linkPartner when purchase price on', () => {
    const data = { hasPurchasePrice: true, linkPartner: false };
    applyCategoryPurchasePartnerRule(data);
    expect(data.linkPartner).toBe(true);
  });

  it('assertCategoryPurchasePartnerRule rejects purchase without link partner', () => {
    expect(() =>
      assertCategoryPurchasePartnerRule({ hasPurchasePrice: true, linkPartner: false }),
    ).toThrow(AppError);
    expect(() =>
      assertCategoryPurchasePartnerRule({ hasPurchasePrice: true, linkPartner: false }),
    ).toThrow(/已启用采购价时需保持关联合作单位/);
  });

  it('assertCategoryPurchasePartnerRule allows linkPartner only', () => {
    expect(() =>
      assertCategoryPurchasePartnerRule({ hasPurchasePrice: false, linkPartner: true }),
    ).not.toThrow();
  });
});
