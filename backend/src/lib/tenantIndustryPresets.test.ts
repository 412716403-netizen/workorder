import { describe, it, expect } from 'vitest';
import { isTenantIndustryKind, normalizeTenantIndustryKind } from '../../../shared/types.js';
import { SWEATER_FACTORY_PRESET_ROW_COUNTS } from './tenantIndustryPresets.js';

describe('tenantIndustryPresets', () => {
  it('sweater_factory preset row counts sum to 14', () => {
    const { productCategories, partnerCategories, warehouses, financeCategories, globalNodeTemplates } =
      SWEATER_FACTORY_PRESET_ROW_COUNTS;
    expect(productCategories + partnerCategories + warehouses + financeCategories + globalNodeTemplates).toBe(14);
  });

  it('normalizeTenantIndustryKind', () => {
    expect(normalizeTenantIndustryKind('sweater_factory')).toBe('sweater_factory');
    expect(normalizeTenantIndustryKind('generic')).toBe('generic');
    expect(normalizeTenantIndustryKind('')).toBe('generic');
    expect(normalizeTenantIndustryKind(undefined)).toBe('generic');
    expect(normalizeTenantIndustryKind('bogus')).toBe('generic');
  });

  it('isTenantIndustryKind', () => {
    expect(isTenantIndustryKind('generic')).toBe(true);
    expect(isTenantIndustryKind('sweater_factory')).toBe(true);
    expect(isTenantIndustryKind('x')).toBe(false);
  });
});
