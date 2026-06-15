import { describe, it, expect } from 'vitest';
import { extractKnowledgeAssetIdsFromHtml } from './knowledgeAssetRefs';

describe('extractKnowledgeAssetIdsFromHtml', () => {
  it('extracts asset ids from img src', () => {
    const html = '<p><img src="/api/knowledge-base/assets/ka123" /></p>';
    expect(extractKnowledgeAssetIdsFromHtml(html)).toEqual(['ka123']);
  });

  it('deduplicates repeated ids', () => {
    const html = `
      <img src="/api/knowledge-base/assets/ka1" />
      <img src="/api/knowledge-base/assets/ka1" />
      <img src="/api/knowledge-base/assets/ka2" />
    `;
    expect(extractKnowledgeAssetIdsFromHtml(html)).toEqual(['ka1', 'ka2']);
  });

  it('returns empty for blank html', () => {
    expect(extractKnowledgeAssetIdsFromHtml('')).toEqual([]);
  });
});
