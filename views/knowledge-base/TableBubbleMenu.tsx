import React, { useCallback, useMemo } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import { Columns2, Rows2, Trash2 } from 'lucide-react';
import {
  getKnowledgeTableBubbleAnchor,
  shouldShowKnowledgeTableBubbleMenu,
} from './tableBubbleAnchor';

interface TableBubbleMenuProps {
  editor: Editor | null;
  editable: boolean;
}

const preventBlur = (e: React.MouseEvent) => e.preventDefault();

const TableBubbleMenu: React.FC<TableBubbleMenuProps> = ({ editor, editable }) => {
  const getReferencedVirtualElement = useCallback(() => {
    if (!editor) return null;
    return getKnowledgeTableBubbleAnchor(editor);
  }, [editor]);

  const bubbleOptions = useMemo(() => {
    const shell = editor?.view.dom.closest('.kb-editor-shell');
    return {
      placement: 'top-start' as const,
      offset: 8,
      strategy: 'fixed' as const,
      flip: { padding: 8 },
      shift: { padding: 8 },
      scrollTarget: shell instanceof HTMLElement ? shell : window,
    };
  }, [editor]);

  if (!editor || !editable) return null;

  const run = (fn: () => boolean) => {
    fn();
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="kbTableBubbleMenu"
      shouldShow={({ editor: ed, view }) => shouldShowKnowledgeTableBubbleMenu(ed, view)}
      getReferencedVirtualElement={getReferencedVirtualElement}
      appendTo={() => document.body}
      options={bubbleOptions}
      className="kb-table-bubble-menu"
    >
      <button
        type="button"
        className="kb-table-bubble-btn"
        title="删除行"
        onMouseDown={preventBlur}
        onClick={() => run(() => editor.chain().focus().deleteRow().run())}
      >
        <Rows2 className="h-3.5 w-3.5" />
        <span>删除行</span>
      </button>
      <button
        type="button"
        className="kb-table-bubble-btn"
        title="删除列"
        onMouseDown={preventBlur}
        onClick={() => run(() => editor.chain().focus().deleteColumn().run())}
      >
        <Columns2 className="h-3.5 w-3.5" />
        <span>删除列</span>
      </button>
      <span className="kb-table-bubble-divider" />
      <button
        type="button"
        className="kb-table-bubble-btn kb-table-bubble-btn-danger"
        title="删除表格"
        onMouseDown={preventBlur}
        onClick={() => run(() => editor.chain().focus().deleteTable().run())}
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span>删除表格</span>
      </button>
    </BubbleMenu>
  );
};

export default TableBubbleMenu;
