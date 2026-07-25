/** 表格内图片默认缩略图显示宽度（px）；原图仍用同一 src，点击预览放大 */
export const KNOWLEDGE_TABLE_IMAGE_THUMB_WIDTH = 120;

/** 宽高均未知时的占位高度（px） */
const DEFAULT_PLACEHOLDER_HEIGHT = 220;

/** 占位时假定的宽高比（4:3），仅用于已知宽度、未知高度的历史图片 */
const PLACEHOLDER_ASPECT = 0.75;

/**
 * 历史图片的 node attrs 可能没有 height，未加载时高度为 0，
 * 整篇图片会同时落进视口令懒加载失效。这里给一个占位高度撑开版面。
 */
export function knowledgeImagePlaceholderHeight(width?: number | null): number {
  if (width && width > 0) return Math.max(1, Math.round(width * PLACEHOLDER_ASPECT));
  return DEFAULT_PLACEHOLDER_HEIGHT;
}

export interface KnowledgeImageInsertAttrs {
  src: string;
  width?: number;
  height?: number;
}

export interface KnowledgeImageNaturalSize {
  width: number;
  height: number;
}

export interface KnowledgeImageInsertOptions {
  inTable: boolean;
  /** 图片原始像素尺寸；读取失败传 null，退化为不写高度 */
  naturalSize?: KnowledgeImageNaturalSize | null;
  /** 正文可用宽度（px）；原图更宽时等比缩到该宽度 */
  maxWidth?: number | null;
}

/**
 * 按是否在表格内决定插入属性：表格内固定缩略图宽度，正文按原图宽度并受可用宽度约束。
 * 已知原始尺寸时一并写入等比高度，让图片在懒加载完成前就占住版面高度。
 */
export function buildKnowledgeImageInsertAttrs(
  src: string,
  { inTable, naturalSize, maxWidth }: KnowledgeImageInsertOptions,
): KnowledgeImageInsertAttrs {
  const natural =
    naturalSize && naturalSize.width > 0 && naturalSize.height > 0 ? naturalSize : null;

  if (!natural) {
    return inTable ? { src, width: KNOWLEDGE_TABLE_IMAGE_THUMB_WIDTH } : { src };
  }

  const targetWidth = inTable
    ? KNOWLEDGE_TABLE_IMAGE_THUMB_WIDTH
    : Math.min(natural.width, maxWidth && maxWidth > 0 ? maxWidth : natural.width);
  const width = Math.max(1, Math.round(targetWidth));
  const height = Math.max(1, Math.round((width * natural.height) / natural.width));
  return { src, width, height };
}
