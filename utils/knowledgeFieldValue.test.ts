import { describe, expect, it } from 'vitest';
import { parseKnowledgeFieldValue, stringifyKnowledgeFieldValue } from './knowledgeFieldValue';

describe('parseKnowledgeFieldValue', () => {
  it('parses JSON string', () => {
    expect(parseKnowledgeFieldValue('{"id":"d1","title":"SOP"}')).toEqual({ id: 'd1', title: 'SOP' });
  });
  it('parses object input', () => {
    expect(parseKnowledgeFieldValue({ id: 'd2', title: 'x' })).toEqual({ id: 'd2', title: 'x' });
  });
  it('falls back to bare docId string', () => {
    expect(parseKnowledgeFieldValue('d3')).toEqual({ id: 'd3', title: '' });
  });
  it('returns null for empty/invalid', () => {
    expect(parseKnowledgeFieldValue('')).toBeNull();
    expect(parseKnowledgeFieldValue(null)).toBeNull();
    expect(parseKnowledgeFieldValue('{"title":"no id"}')).toBeNull();
    expect(parseKnowledgeFieldValue('{bad json')).toBeNull();
  });
});

describe('stringifyKnowledgeFieldValue', () => {
  it('round-trips', () => {
    const ref = { id: 'd1', title: 'SOP' };
    expect(parseKnowledgeFieldValue(stringifyKnowledgeFieldValue(ref))).toEqual(ref);
  });
  it('empty for null/empty id', () => {
    expect(stringifyKnowledgeFieldValue(null)).toBe('');
    expect(stringifyKnowledgeFieldValue({ id: '', title: 'x' })).toBe('');
  });
});
