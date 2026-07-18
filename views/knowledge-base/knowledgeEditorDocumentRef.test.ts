/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import {
  formatKnowledgeDocumentRefLabel,
  resolveKnowledgeEditorDocumentRefId,
} from './knowledgeEditorDocumentRef';

describe('formatKnowledgeDocumentRefLabel', () => {
  it('trims title', () => {
    expect(formatKnowledgeDocumentRefLabel('  工艺说明  ')).toBe('工艺说明');
  });

  it('falls back when empty', () => {
    expect(formatKnowledgeDocumentRefLabel('')).toBe('无标题');
    expect(formatKnowledgeDocumentRefLabel(null)).toBe('无标题');
  });
});

describe('resolveKnowledgeEditorDocumentRefId', () => {
  it('reads data-document-id from chip', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<p><span data-type="document-ref" data-document-id="d1" class="kb-document-ref">工艺说明</span></p>';
    const chip = root.querySelector('.kb-document-ref')!;
    expect(resolveKnowledgeEditorDocumentRefId(chip, root)).toBe('d1');
  });

  it('returns null outside root', () => {
    const root = document.createElement('div');
    const other = document.createElement('span');
    other.setAttribute('data-type', 'document-ref');
    other.setAttribute('data-document-id', 'd1');
    expect(resolveKnowledgeEditorDocumentRefId(other, root)).toBeNull();
  });
});
