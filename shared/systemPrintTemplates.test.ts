import { describe, expect, it } from 'vitest';
import {
  isSystemLockedPrintTemplateId,
  mergePrintTemplatesForTenantConfig,
  stripSystemPrintTemplatesForPersistence,
} from './systemPrintTemplates';

describe('systemPrintTemplates', () => {
  it('merge 去掉已废弃 builtin-outsource-dispatch-v1，保留租户模版', () => {
    const stored = [
      { id: 'builtin-outsource-dispatch-v1', name: '残留', paperSize: { widthMm: 1, heightMm: 1 }, elements: [], createdAt: '', updatedAt: '' },
      { id: 'user-1', name: '我的', paperSize: { widthMm: 210, heightMm: 297 }, elements: [], createdAt: '', updatedAt: '' },
    ];
    const merged = mergePrintTemplatesForTenantConfig(stored) as { id: string; name: string }[];
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('user-1');
  });

  it('strip 与 merge 一致过滤废弃 id', () => {
    const v = [
      { id: 'builtin-outsource-dispatch-v1', x: 1 },
      { id: 'user-1', x: 2 },
    ];
    expect(stripSystemPrintTemplatesForPersistence(v)).toEqual([{ id: 'user-1', x: 2 }]);
  });

  it('isSystemLockedPrintTemplateId 当前无锁定 id', () => {
    expect(isSystemLockedPrintTemplateId('builtin-outsource-dispatch-v1')).toBe(false);
    expect(isSystemLockedPrintTemplateId('user-1')).toBe(false);
  });
});
