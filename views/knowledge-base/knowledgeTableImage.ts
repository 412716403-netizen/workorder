/** 表格内图片默认缩略图显示宽度（px）；原图仍用同一 src，点击预览放大 */
export const KNOWLEDGE_TABLE_IMAGE_THUMB_WIDTH = 120;

export interface KnowledgeImageInsertAttrs {
  src: string;
  width?: number;
}

/** 按是否在表格内决定插入属性：表格内写入缩略图宽度 */
export function buildKnowledgeImageInsertAttrs(
  src: string,
  inTable: boolean,
): KnowledgeImageInsertAttrs {
  if (inTable) {
    return { src, width: KNOWLEDGE_TABLE_IMAGE_THUMB_WIDTH };
  }
  return { src };
}
