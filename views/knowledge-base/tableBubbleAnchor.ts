import type { Editor } from '@tiptap/core';
import { findParentNode } from '@tiptap/core';
import type { VirtualElement } from '@floating-ui/dom';

/** 表格 BubbleMenu 锚点：固定在表格顶部，不跟随光标 */
export function getKnowledgeTableBubbleAnchor(editor: Editor): VirtualElement | null {
  const table = findParentNode(node => node.type.name === 'table')(editor.state.selection);
  if (!table) return null;

  const tableDom = editor.view.nodeDOM(table.pos);
  if (!(tableDom instanceof HTMLElement)) return null;

  const anchorEl = tableDom.closest('.tableWrapper') ?? tableDom;

  return {
    getBoundingClientRect: () => {
      const rect = anchorEl.getBoundingClientRect();
      return {
        width: rect.width,
        height: 0,
        top: rect.top,
        bottom: rect.top,
        left: rect.left,
        right: rect.right,
        x: rect.x,
        y: rect.y,
        toJSON: () => ({}),
      };
    },
  };
}

export function shouldShowKnowledgeTableBubbleMenu(editor: Editor, view: { hasFocus: () => boolean }): boolean {
  if (!view.hasFocus()) return false;
  if (!editor.isActive('table')) return false;
  // 选中文字时优先展示行内格式工具栏
  return editor.state.selection.empty;
}
