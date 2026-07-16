import { describe, expect, it } from 'vitest';
import { getKnowledgeDocTextAlign } from './knowledgeTextAlignExtension';

describe('getKnowledgeDocTextAlign', () => {
  it('returns matching alignment from isActive', () => {
    expect(getKnowledgeDocTextAlign({
      isActive: (attrs) => attrs.textAlign === 'center',
    })).toBe('center');
    expect(getKnowledgeDocTextAlign({
      isActive: (attrs) => attrs.textAlign === 'right',
    })).toBe('right');
    expect(getKnowledgeDocTextAlign({
      isActive: () => false,
    })).toBe('left');
  });
});
