import { describe, expect, it } from 'vitest';
import { mergeTenantPrintContext } from './mergeTenantPrintContext';

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
});
