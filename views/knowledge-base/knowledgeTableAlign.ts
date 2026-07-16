import type { Editor } from '@tiptap/core';
import type { KnowledgeTableHAlign, KnowledgeTableVAlign } from './knowledgeTableCellExtensions';

export function isKnowledgeSelectionInTable(editor: Editor): boolean {
  return editor.isActive('table');
}

export function getKnowledgeTableCellAlign(editor: Editor): {
  align: KnowledgeTableHAlign | null;
  verticalAlign: KnowledgeTableVAlign | null;
} {
  const attrs = editor.isActive('tableHeader')
    ? editor.getAttributes('tableHeader')
    : editor.getAttributes('tableCell');
  const align = attrs.align === 'left' || attrs.align === 'center' || attrs.align === 'right'
    ? attrs.align
    : null;
  const verticalAlign =
    attrs.verticalAlign === 'top'
    || attrs.verticalAlign === 'middle'
    || attrs.verticalAlign === 'bottom'
      ? attrs.verticalAlign
      : null;
  return { align, verticalAlign };
}

export function setKnowledgeTableHAlign(editor: Editor, align: KnowledgeTableHAlign): boolean {
  // 不 focus，避免选区被清空导致浮动工具栏收起
  return editor.commands.setCellAttribute('align', align);
}

export function setKnowledgeTableVAlign(editor: Editor, verticalAlign: KnowledgeTableVAlign): boolean {
  return editor.commands.setCellAttribute('verticalAlign', verticalAlign);
}
