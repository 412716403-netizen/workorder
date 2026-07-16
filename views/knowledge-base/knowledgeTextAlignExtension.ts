import { Extension } from '@tiptap/core';
import type { KnowledgeTableHAlign } from './knowledgeTableCellExtensions';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    knowledgeTextAlign: {
      setTextAlign: (alignment: KnowledgeTableHAlign) => ReturnType;
      unsetTextAlign: () => ReturnType;
    };
  }
}

const ALIGNMENTS: KnowledgeTableHAlign[] = ['left', 'center', 'right'];

/** 正文段落/标题水平对齐（表格单元格对齐仍走 cell attrs） */
export const KnowledgeTextAlign = Extension.create({
  name: 'knowledgeTextAlign',

  addOptions() {
    return {
      types: ['heading', 'paragraph'],
      defaultAlignment: 'left' as KnowledgeTableHAlign,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: this.options.defaultAlignment,
            parseHTML: (element: HTMLElement) => {
              const align = (element.style.textAlign || '').trim().toLowerCase();
              if (align === 'left' || align === 'center' || align === 'right') return align;
              return this.options.defaultAlignment;
            },
            renderHTML: (attributes: { textAlign?: string }) => {
              if (!attributes.textAlign || attributes.textAlign === this.options.defaultAlignment) {
                return {};
              }
              return { style: `text-align: ${attributes.textAlign}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextAlign: (alignment: KnowledgeTableHAlign) => ({ commands }) => {
        if (!ALIGNMENTS.includes(alignment)) return false;
        return this.options.types
          .map(type => commands.updateAttributes(type, { textAlign: alignment }))
          .some(ok => ok);
      },
      unsetTextAlign: () => ({ commands }) => {
        return this.options.types
          .map(type => commands.resetAttributes(type, 'textAlign'))
          .every(ok => ok);
      },
    };
  },
});

export function getKnowledgeDocTextAlign(editor: {
  isActive: (attrs: Record<string, string>) => boolean;
}): KnowledgeTableHAlign {
  if (editor.isActive({ textAlign: 'center' })) return 'center';
  if (editor.isActive({ textAlign: 'right' })) return 'right';
  return 'left';
}

export function setKnowledgeDocTextAlign(
  editor: { commands: { setTextAlign: (a: KnowledgeTableHAlign) => boolean } },
  align: KnowledgeTableHAlign,
): boolean {
  return editor.commands.setTextAlign(align);
}
