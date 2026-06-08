import { describe, it, expect } from 'vitest';
import { isFeatureNavVisible, filterShortcutsByAccess } from './featurePluginFilter';

describe('isFeatureNavVisible', () => {
  it('hides when plugin disabled', () => {
    expect(isFeatureNavVisible('development', 'development', { development: false }, () => true)).toBe(false);
  });

  it('requires module perm when plugin enabled', () => {
    expect(isFeatureNavVisible('development', 'development', {}, () => false)).toBe(false);
    expect(isFeatureNavVisible('development', 'development', {}, () => true)).toBe(true);
  });
});

describe('filterShortcutsByAccess', () => {
  const items = [
    { id: 'a', module: 'psi' as const },
    { id: 'b', pluginId: 'collaboration', module: 'collaboration' as const },
  ];

  it('filters by plugin and permission', () => {
    const out = filterShortcutsByAccess(items, { collaboration: false }, 'worker', ['psi']);
    expect(out.map(i => i.id)).toEqual(['a']);
  });
});
