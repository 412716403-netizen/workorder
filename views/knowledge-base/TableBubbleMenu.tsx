import React from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import { Columns2, Rows2, Trash2 } from 'lucide-react';

interface TableBubbleMenuProps {
  editor: Editor | null;
  editable: boolean;
}

const preventBlur = (e: React.MouseEvent) => e.preventDefault();

const TableBubbleMenu: React.FC<TableBubbleMenuProps> = ({ editor, editable }) => {
  if (!editor || !editable) return null;

  const run = (fn: () => boolean) => {
    fn();
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="kbTableBubbleMenu"
      shouldShow={({ editor: ed }) => ed.isActive('table')}
      appendTo={() => document.body}
      options={{
        placement: 'top-start',
        offset: 8,
        strategy: 'fixed',
      }}
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
