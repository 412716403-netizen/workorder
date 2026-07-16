import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';

export type KnowledgeTableHAlign = 'left' | 'center' | 'right';
export type KnowledgeTableVAlign = 'top' | 'middle' | 'bottom';

function parseVerticalAlign(element: HTMLElement): KnowledgeTableVAlign | null {
  const v = (element.style.verticalAlign || '').trim().toLowerCase();
  if (v === 'top' || v === 'middle' || v === 'bottom') return v;
  return null;
}

const verticalAlignAttribute = {
  default: null as KnowledgeTableVAlign | null,
  parseHTML: (element: HTMLElement) => parseVerticalAlign(element),
  renderHTML: (attributes: { verticalAlign?: KnowledgeTableVAlign | null }) => {
    if (!attributes.verticalAlign) return {};
    return { style: `vertical-align: ${attributes.verticalAlign}` };
  },
};

/** 扩展单元格：保留 TipTap 自带 align，并增加 verticalAlign */
export const KnowledgeTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      verticalAlign: verticalAlignAttribute,
    };
  },
});

export const KnowledgeTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      verticalAlign: verticalAlignAttribute,
    };
  },
});
