import { describe, it, expect } from 'vitest';
import { mergeTenantPrintContext } from './mergeTenantPrintContext';
import type { Partner, ProductCategory } from '../types';

describe('mergeTenantPrintContext', () => {
  it('fills tenantName when missing', () => {
    expect(mergeTenantPrintContext({}, '  某公司  ')).toEqual({ tenantName: '某公司' });
  });

  it('does not override existing tenantName', () => {
    expect(mergeTenantPrintContext({ tenantName: '已有' }, '别的')).toEqual({ tenantName: '已有' });
  });

  it('ignores empty tenantName', () => {
    expect(mergeTenantPrintContext({ page: { current: 1, total: 1 } }, '   ')).toEqual({
      page: { current: 1, total: 1 },
    });
  });

  it('injects partners and productCategories when missing', () => {
    const partners: Partner[] = [{ id: 'p1', name: '甲', contact: '' }];
    const productCategories: ProductCategory[] = [
      {
        id: 'c1',
        name: '原料',
        color: '',
        hasProcess: false,
        hasSalesPrice: false,
        hasPurchasePrice: false,
        hasColorSize: false,
        linkPartner: true,
        customFields: [],
      },
    ];
    expect(mergeTenantPrintContext({}, null, { partners, productCategories })).toEqual({
      partners,
      productCategories,
    });
  });

  it('does not override existing partners / productCategories', () => {
    const existing: Partner[] = [{ id: 'x', name: '已有', contact: '' }];
    const incoming: Partner[] = [{ id: 'y', name: '新的', contact: '' }];
    expect(mergeTenantPrintContext({ partners: existing }, '公司', { partners: incoming })).toEqual({
      tenantName: '公司',
      partners: existing,
    });
  });
});
