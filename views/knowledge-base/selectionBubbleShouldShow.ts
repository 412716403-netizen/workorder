import type { Editor } from '@tiptap/core';

/** 选区浮动工具栏：有文字选中且非代码块时显示 */
export function shouldShowKnowledgeSelectionBubbleMenu(
  editor: Editor,
  view: { hasFocus: () => boolean },
): boolean {
  if (!view.hasFocus()) return false;
  if (editor.state.selection.empty) return false;
  if (editor.isActive('codeBlock')) return false;
  if (editor.isActive('image')) return false;
  return true;
}
