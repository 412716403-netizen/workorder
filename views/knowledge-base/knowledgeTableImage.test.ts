/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeImageInsertAttrs,
  knowledgeImagePlaceholderHeight,
  KNOWLEDGE_TABLE_IMAGE_THUMB_WIDTH,
} from './knowledgeTableImage';

describe('buildKnowledgeImageInsertAttrs', () => {
  it('原始尺寸未知时正文插入不加尺寸', () => {
    expect(buildKnowledgeImageInsertAttrs('/a.png', { inTable: false })).toEqual({ src: '/a.png' });
  });

  it('原始尺寸未知时表格内仍带缩略图宽度', () => {
    expect(buildKnowledgeImageInsertAttrs('/a.png', { inTable: true })).toEqual({
      src: '/a.png',
      width: KNOWLEDGE_TABLE_IMAGE_THUMB_WIDTH,
    });
  });

  it('正文按原图尺寸写入宽高', () => {
    expect(
      buildKnowledgeImageInsertAttrs('/a.png', {
        inTable: false,
        naturalSize: { width: 600, height: 400 },
        maxWidth: 800,
      }),
    ).toEqual({ src: '/a.png', width: 600, height: 400 });
  });

  it('原图超出可用宽度时等比缩到可用宽度', () => {
    expect(
      buildKnowledgeImageInsertAttrs('/a.png', {
        inTable: false,
        naturalSize: { width: 4000, height: 3000 },
        maxWidth: 720,
      }),
    ).toEqual({ src: '/a.png', width: 720, height: 540 });
  });

  it('缺少可用宽度时按原图宽度', () => {
    expect(
      buildKnowledgeImageInsertAttrs('/a.png', {
        inTable: false,
        naturalSize: { width: 300, height: 150 },
        maxWidth: null,
      }),
    ).toEqual({ src: '/a.png', width: 300, height: 150 });
  });

  it('表格内按缩略图宽度换算等比高度', () => {
    expect(
      buildKnowledgeImageInsertAttrs('/a.png', {
        inTable: true,
        naturalSize: { width: 4000, height: 1000 },
        maxWidth: 720,
      }),
    ).toEqual({ src: '/a.png', width: KNOWLEDGE_TABLE_IMAGE_THUMB_WIDTH, height: 30 });
  });

  it('非法原始尺寸退化为不写尺寸', () => {
    expect(
      buildKnowledgeImageInsertAttrs('/a.png', {
        inTable: false,
        naturalSize: { width: 0, height: 0 },
      }),
    ).toEqual({ src: '/a.png' });
  });
});

describe('knowledgeImagePlaceholderHeight', () => {
  it('已知宽度时按 4:3 估高', () => {
    expect(knowledgeImagePlaceholderHeight(KNOWLEDGE_TABLE_IMAGE_THUMB_WIDTH)).toBe(90);
  });

  it('宽度缺失或非法时用默认占位高度', () => {
    expect(knowledgeImagePlaceholderHeight(null)).toBe(220);
    expect(knowledgeImagePlaceholderHeight(0)).toBe(220);
    expect(knowledgeImagePlaceholderHeight(Number.NaN)).toBe(220);
  });
});
