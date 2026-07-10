import { describe, expect, it } from 'vitest';
import { hasModulePerm, isTenantElevatedRole } from './hasModulePerm';

describe('isTenantElevatedRole', () => {
  it('treats only owner as elevated', () => {
    expect(isTenantElevatedRole('owner')).toBe(true);
    expect(isTenantElevatedRole('admin')).toBe(false);
    expect(isTenantElevatedRole('worker')).toBe(false);
    expect(isTenantElevatedRole(undefined)).toBe(false);
  });
});

describe('hasModulePerm', () => {
  it('denies legacy admin and unassigned members without permissions', () => {
    expect(hasModulePerm('admin', [], 'production', 'production:orders:view')).toBe(false);
    expect(hasModulePerm('worker', [], 'production', 'production:orders:view')).toBe(false);
  });

  it('allows owner without enumerating sub-perms', () => {
    expect(hasModulePerm('owner', [], 'psi', 'psi:purchase_bill:view')).toBe(true);
  });

  it('allows a member only through explicit module or exact permissions', () => {
    expect(hasModulePerm('worker', ['production'], 'production', 'production:orders:view')).toBe(true);
    expect(hasModulePerm('worker', ['production:orders:view'], 'production', 'production:orders:view')).toBe(true);
  });
});
