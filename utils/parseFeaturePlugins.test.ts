import { describe, it, expect } from 'vitest';
import { defaultFeaturePlugins, parseFeaturePlugins } from '../shared/workbench';

describe('parseFeaturePlugins', () => {
  it('returns catalog defaults when value is null', () => {
    const parsed = parseFeaturePlugins(null);
    expect(parsed.traceability).toBe(false);
    expect(parsed.collaboration).toBe(false);
  });

  it('treats missing traceability key on stored object as enabled (legacy tenants)', () => {
    const parsed = parseFeaturePlugins({ collaboration: true });
    expect(parsed.traceability).toBe(true);
    expect(parsed.collaboration).toBe(true);
  });

  it('respects explicit traceability false', () => {
    const parsed = parseFeaturePlugins({ traceability: false, collaboration: true });
    expect(parsed.traceability).toBe(false);
  });

  it('merges new tenant seed defaults with stored overrides', () => {
    const base = defaultFeaturePlugins();
    expect(base.traceability).toBe(false);
    const parsed = parseFeaturePlugins({ ...base, knowledge_base: true });
    expect(parsed.traceability).toBe(false);
    expect(parsed.knowledge_base).toBe(true);
  });
});
