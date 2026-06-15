import { describe, it, expect } from 'vitest';
import { sanitizeKnowledgeHtml } from '../src/utils/sanitizeKnowledgeHtml.js';
import {
  formatKnowledgeDocumentReferencesMessage,
  hasKnowledgeDocumentReferences,
} from '../src/utils/knowledgeDocReferences.js';

describe('sanitizeKnowledgeHtml', () => {
  it('strips script tags', () => {
    const out = sanitizeKnowledgeHtml('<p>ok</p><script>alert(1)</script>');
    expect(out).toContain('ok');
    expect(out).not.toContain('script');
  });

  it('keeps basic formatting tags', () => {
    const out = sanitizeKnowledgeHtml('<h2>标题</h2><p><strong>加粗</strong></p>');
    expect(out).toContain('<h2>');
    expect(out).toContain('<strong>');
  });

  it('strips unsafe link href', () => {
    const out = sanitizeKnowledgeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('keeps https links', () => {
    const out = sanitizeKnowledgeHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('href="https://example.com"');
  });
});

describe('knowledgeDocReferences helpers', () => {
  it('detects references', () => {
    expect(hasKnowledgeDocumentReferences({ products: [{ id: 'p1', name: 'A', sku: 'S1' }], devStyles: [] })).toBe(true);
    expect(hasKnowledgeDocumentReferences({ products: [], devStyles: [] })).toBe(false);
  });

  it('formats reference message', () => {
    const msg = formatKnowledgeDocumentReferencesMessage({
      products: [{ id: 'p1', name: '产品A', sku: 'SKU1' }],
      devStyles: [{ id: 'd1', name: '款1' }],
    });
    expect(msg).toContain('产品A(SKU1)');
    expect(msg).toContain('款1');
  });
});
