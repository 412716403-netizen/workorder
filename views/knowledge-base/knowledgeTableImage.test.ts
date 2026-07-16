/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeImageInsertAttrs,
  KNOWLEDGE_TABLE_IMAGE_THUMB_WIDTH,
} from './knowledgeTableImage';

describe('buildKnowledgeImageInsertAttrs', () => {
  it('正文插入不加宽度', () => {
    expect(buildKnowledgeImageInsertAttrs('/a.png', false)).toEqual({ src: '/a.png' });
  });

  it('表格内插入带缩略图宽度', () => {
    expect(buildKnowledgeImageInsertAttrs('/a.png', true)).toEqual({
      src: '/a.png',
      width: KNOWLEDGE_TABLE_IMAGE_THUMB_WIDTH,
    });
  });
});
