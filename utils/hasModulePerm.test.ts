import { describe, it, expect } from 'vitest';
import { hasModulePerm } from './hasModulePerm';

describe('hasModulePerm', () => {
  it('allows owner regardless of permissions', () => {
    expect(hasModulePerm('owner', [], 'psi', 'psi:purchase_order:view')).toBe(true);
    expect(hasModulePerm('owner', undefined, 'psi', 'psi:purchase_order:view')).toBe(true);
  });

  it('allows when permissions list is empty (backward compat)', () => {
    expect(hasModulePerm('member', [], 'psi', 'psi:purchase_order:view')).toBe(true);
  });

  it('allows when permissions is undefined', () => {
    expect(hasModulePerm('member', undefined, 'psi', 'psi:purchase_order:view')).toBe(true);
  });

  it('allows module-level wildcard when no fine-grained keys exist', () => {
    expect(hasModulePerm('member', ['psi'], 'psi', 'psi:purchase_order:view')).toBe(true);
  });

  it('denies module-level wildcard when fine-grained keys exist', () => {
    expect(hasModulePerm('member', ['psi', 'psi:sales_order:view'], 'psi', 'psi:purchase_order:view')).toBe(false);
  });

  it('allows exact permKey match', () => {
    expect(hasModulePerm('member', ['psi:purchase_order:view'], 'psi', 'psi:purchase_order:view')).toBe(true);
  });

  it('allows prefix match on permKey', () => {
    expect(hasModulePerm('member', ['psi:purchase_order:view:extra'], 'psi', 'psi:purchase_order:view')).toBe(true);
  });

  it('denies when no matching permission', () => {
    expect(hasModulePerm('member', ['psi:sales_order:view'], 'psi', 'psi:purchase_order:view')).toBe(false);
  });

  it('works with finance module', () => {
    expect(hasModulePerm('member', ['finance:receipt:view'], 'finance', 'finance:receipt:view')).toBe(true);
    expect(hasModulePerm('member', ['finance:receipt:view'], 'finance', 'finance:payment:create')).toBe(false);
  });
});
