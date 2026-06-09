import type { Editor } from '@tiptap/core';

/** 将光标移到文档末尾；若末尾不是空段落则先插入新段落 */
export function focusDocumentTail(editor: Editor): void {
  const { doc } = editor.state;
  const lastNode = doc.lastChild;
  const endPos = doc.content.size;

  if (lastNode?.type.name === 'paragraph' && lastNode.content.size === 0) {
    editor.chain().focus().setTextSelection(endPos - 1).run();
    return;
  }

  editor.chain().focus().insertContentAt(endPos, { type: 'paragraph' }).run();
}

export function isClickBelowEditorContent(editor: Editor, clientY: number): boolean {
  const root = editor.view.dom;
  const lastChild = root.lastElementChild;
  if (!lastChild) return true;
  return clientY > lastChild.getBoundingClientRect().bottom + 2;
}
