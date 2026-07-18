import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';

/** 选区浮动工具栏：有文字选中且非代码块/图片/表格单元格选区时显示 */
export function shouldShowKnowledgeSelectionBubbleMenu(
  editor: Editor,
  view: { hasFocus: () => boolean },
): boolean {
  if (!view.hasFocus()) return false;
  // 行列选区由表格操作条处理，不展示行内格式工具栏
  if (editor.state.selection instanceof CellSelection) return false;
  // 整节点选中（如图片/表格）不展示，避免错误定位的浮动层挡住侧栏
  if (editor.state.selection instanceof NodeSelection) return false;
  if (editor.state.selection.empty) return false;
  if (editor.isActive('codeBlock')) return false;
  if (editor.isActive('image')) return false;
  if (editor.isActive('productRef')) return false;
  if (editor.isActive('documentRef')) return false;
  return true;
}
