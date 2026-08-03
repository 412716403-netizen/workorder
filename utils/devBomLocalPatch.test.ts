import { describe, it, expect } from 'vitest';

/**
 * 本地 nodeBoms patch 语义（与 hooks/useDevStyles 中 patchStyleVariantNodeBom 一致）
 */
function patchStyleVariantNodeBom<T extends {
  variants: Array<{ id: string; nodeBoms?: Record<string, string> }>;
}>(
  style: T,
  variantId: string,
  nodeId: string,
  bomId: string | null,
): T {
  return {
    ...style,
    variants: style.variants.map((v) => {
      if (v.id !== variantId) return v;
      const next = { ...(v.nodeBoms ?? {}) };
      if (bomId) next[nodeId] = bomId;
      else delete next[nodeId];
      return { ...v, nodeBoms: next };
    }),
  };
}

describe('patchStyleVariantNodeBom', () => {
  it('sets and clears nodeBom mapping locally without touching other variants', () => {
    const style = {
      id: 's1',
      variants: [
        { id: 'v1', nodeBoms: { n1: 'b1' } },
        { id: 'v2', nodeBoms: { n1: 'b2' } },
      ],
    };
    const set = patchStyleVariantNodeBom(style, 'v1', 'n2', 'b9');
    expect(set.variants[0].nodeBoms).toEqual({ n1: 'b1', n2: 'b9' });
    expect(set.variants[1].nodeBoms).toEqual({ n1: 'b2' });

    const cleared = patchStyleVariantNodeBom(set, 'v1', 'n1', null);
    expect(cleared.variants[0].nodeBoms).toEqual({ n2: 'b9' });
  });
});
