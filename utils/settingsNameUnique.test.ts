import { describe, expect, it } from 'vitest';
import { hasSettingsNameConflict, settingsNameKey } from './settingsNameUnique';

describe('settingsNameKey', () => {
  it('trims and lowercases', () => {
    expect(settingsNameKey('  供应商  ')).toBe('供应商');
  });
});

describe('hasSettingsNameConflict', () => {
  const items = [
    { id: 'a', name: '毛衣' },
    { id: 'b', name: '针织' },
  ];

  it('detects duplicate ignoring case', () => {
    expect(hasSettingsNameConflict(items, '毛衣')).toBe(true);
    expect(hasSettingsNameConflict(items, ' 毛衣 ')).toBe(true);
  });

  it('excludes self when editing', () => {
    expect(hasSettingsNameConflict(items, '毛衣', 'a')).toBe(false);
  });
});
