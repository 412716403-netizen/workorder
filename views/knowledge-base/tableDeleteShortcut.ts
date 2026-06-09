import { Extension, findParentNode } from '@tiptap/core';

function isEmptyTableCell(node: { content: { childCount: number; firstChild: { type: { name: string }; content: { size: number } } | null } }) {
  return (
    node.content.childCount === 1
    && node.content.firstChild?.type.name === 'paragraph'
    && node.content.firstChild.content.size === 0
  );
}

/** 空单元格行首 Backspace：单行删整表，多行删当前行 */
export const tableDeleteShortcut = Extension.create({
  name: 'kbTableDeleteShortcut',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        if (!editor.isActive('table')) return false;

        const { selection } = editor.state;
        if (!selection.empty) return false;

        const cell = findParentNode(
          node => node.type.name === 'tableCell' || node.type.name === 'tableHeader',
        )(selection);
        if (!cell || !isEmptyTableCell(cell.node)) return false;

        const atCellStart = selection.$from.pos === cell.start + 1;
        if (!atCellStart) return false;

        const table = findParentNode(node => node.type.name === 'table')(selection);
        if (!table) return false;

        if (table.node.childCount <= 1) {
          return editor.commands.deleteTable();
        }
        return editor.commands.deleteRow();
      },
    };
  },
});
