import { describe, expect, it } from 'vitest';
import { hasModulePerm, isTenantElevatedRole } from './hasModulePerm';

describe('isTenantElevatedRole', () => {
  it('treats owner and admin as elevated', () => {
    expect(isTenantElevatedRole('owner')).toBe(true);
    expect(isTenantElevatedRole('admin')).toBe(true);
    expect(isTenantElevatedRole('worker')).toBe(false);
    expect(isTenantElevatedRole(undefined)).toBe(false);
  });
});

describe('hasModulePerm', () => {
  it('allows admin without enumerating sub-perms', () => {
    expect(hasModulePerm('admin', [], 'production', 'production:orders:view')).toBe(true);
  });

  it('allows owner without enumerating sub-perms', () => {
    expect(hasModulePerm('owner', [], 'psi', 'psi:purchase_bill:view')).toBe(true);
  });
});
