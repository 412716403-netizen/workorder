import { describe, it, expect } from 'vitest';
import {
  isAllowedKnowledgeExternalUrl,
  normalizeKnowledgeExternalUrl,
} from './knowledgeLinkUrl';

describe('normalizeKnowledgeExternalUrl', () => {
  it('adds https when protocol missing', () => {
    expect(normalizeKnowledgeExternalUrl('example.com/path')).toBe('https://example.com/path');
  });

  it('keeps mailto', () => {
    expect(normalizeKnowledgeExternalUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
  });
});

describe('isAllowedKnowledgeExternalUrl', () => {
  it('allows http and https', () => {
    expect(isAllowedKnowledgeExternalUrl('https://a.com')).toBe(true);
    expect(isAllowedKnowledgeExternalUrl('http://a.com')).toBe(true);
  });

  it('allows mailto', () => {
    expect(isAllowedKnowledgeExternalUrl('mailto:test@example.com')).toBe(true);
  });

  it('rejects javascript', () => {
    expect(isAllowedKnowledgeExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects empty', () => {
    expect(isAllowedKnowledgeExternalUrl('')).toBe(false);
  });
});
