import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';

/** 选区浮动工具栏：文字选中，或表格单元格多选（可合并/批量排版）时显示 */
export function shouldShowKnowledgeSelectionBubbleMenu(
  editor: Editor,
  view: { hasFocus: () => boolean },
): boolean {
  if (!view.hasFocus()) return false;
  // 整节点选中（如图片/表格）不展示，避免错误定位的浮动层挡住侧栏
  if (editor.state.selection instanceof NodeSelection) return false;
  // 表格单元格选区：支持合并与批量字体/对齐
  if (editor.state.selection instanceof CellSelection) return true;
  if (editor.state.selection.empty) return false;
  if (editor.isActive('codeBlock')) return false;
  if (editor.isActive('image')) return false;
  if (editor.isActive('productRef')) return false;
  if (editor.isActive('documentRef')) return false;
  return true;
}
