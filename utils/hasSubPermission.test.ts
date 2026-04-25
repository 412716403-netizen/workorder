import { describe, it, expect } from 'vitest';
import { hasSubPermission } from './hasSubPermission';

describe('hasSubPermission', () => {
  it('denies when permissions is null', () => {
    expect(hasSubPermission(null, 'basic:products:edit')).toBe(false);
  });

  it('denies when permissions is undefined', () => {
    expect(hasSubPermission(undefined, 'basic:products:edit')).toBe(false);
  });

  it('denies when permissions is empty', () => {
    expect(hasSubPermission([], 'basic:products:edit')).toBe(false);
  });

  it('allows exact match', () => {
    expect(hasSubPermission(['basic:products:edit'], 'basic:products:edit')).toBe(true);
  });

  it('allows when holding top-level module permission', () => {
    expect(hasSubPermission(['basic'], 'basic:products:edit')).toBe(true);
  });

  it('denies when holding different module', () => {
    expect(hasSubPermission(['production'], 'basic:products:edit')).toBe(false);
  });

  it('denies when holding different sub-permission', () => {
    expect(hasSubPermission(['basic:categories:edit'], 'basic:products:edit')).toBe(false);
  });
});
