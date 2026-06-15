import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import {
  Bold, Italic, Underline, Strikethrough, Link2, Type, Highlighter,
} from 'lucide-react';
import {
  KNOWLEDGE_HIGHLIGHT_COLORS,
  KNOWLEDGE_TEXT_COLORS,
} from '../../shared/knowledgeInlineFormat';
import { shouldShowKnowledgeSelectionBubbleMenu } from './selectionBubbleShouldShow';

interface KnowledgeSelectionBubbleMenuProps {
  editor: Editor | null;
  editable: boolean;
  onOpenLinkDialog: () => void;
}

const preventBlur = (e: React.MouseEvent) => e.preventDefault();

const KnowledgeSelectionBubbleMenu: React.FC<KnowledgeSelectionBubbleMenuProps> = ({
  editor,
  editable,
  onOpenLinkDialog,
}) => {
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [highlightMenuOpen, setHighlightMenuOpen] = useState(false);
  const colorMenuRef = useRef<HTMLDivElement>(null);

  const bubbleOptions = useMemo(() => {
    const shell = editor?.view.dom.closest('.kb-editor-shell');
    return {
      placement: 'top' as const,
      offset: 8,
      strategy: 'fixed' as const,
      flip: { padding: 8 },
      shift: { padding: 8 },
      scrollTarget: shell instanceof HTMLElement ? shell : window,
    };
  }, [editor]);

  const closeMenus = useCallback(() => {
    setColorMenuOpen(false);
    setHighlightMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!colorMenuOpen && !highlightMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (colorMenuRef.current?.contains(e.target as Node)) return;
      closeMenus();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [colorMenuOpen, highlightMenuOpen, closeMenus]);

  if (!editor || !editable) return null;

  const btnClass = (active: boolean) =>
    `kb-selection-bubble-btn${active ? ' is-active' : ''}`;

  const applyTextColor = (value: string) => {
    if (!value) {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(value).run();
    }
    closeMenus();
  };

  const applyHighlight = (value: string) => {
    if (!value) {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().toggleHighlight({ color: value }).run();
    }
    closeMenus();
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="kbSelectionBubbleMenu"
      shouldShow={({ editor: ed, view }) => shouldShowKnowledgeSelectionBubbleMenu(ed, view)}
      appendTo={() => document.body}
      options={bubbleOptions}
      className="kb-selection-bubble-menu"
      onHide={closeMenus}
    >
      <button
        type="button"
        className={btnClass(editor.isActive('bold'))}
        title="加粗"
        onMouseDown={preventBlur}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className={btnClass(editor.isActive('italic'))}
        title="斜体"
        onMouseDown={preventBlur}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className={btnClass(editor.isActive('underline'))}
        title="下划线"
        onMouseDown={preventBlur}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className={btnClass(editor.isActive('strike'))}
        title="删除线"
        onMouseDown={preventBlur}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>

      <span className="kb-selection-bubble-divider" />

      <button
        type="button"
        className={btnClass(editor.isActive('link'))}
        title="超链接"
        onMouseDown={preventBlur}
        onClick={() => {
          closeMenus();
          onOpenLinkDialog();
        }}
      >
        <Link2 className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>

      <span className="kb-selection-bubble-divider" />

      <div className="kb-selection-bubble-picker-wrap" ref={colorMenuRef}>
        <button
          type="button"
          className={`${btnClass(editor.isActive('textStyle'))} kb-selection-bubble-picker-trigger`}
          title="文字颜色"
          onMouseDown={preventBlur}
          onClick={() => {
            setHighlightMenuOpen(false);
            setColorMenuOpen(v => !v);
          }}
        >
          <Type className="h-3.5 w-3.5" strokeWidth={2.5} />
          <span className="kb-selection-bubble-color-bar" style={{ background: '#ca8a04' }} />
        </button>
        {colorMenuOpen && (
          <div className="kb-selection-color-menu" role="menu">
            {KNOWLEDGE_TEXT_COLORS.map(item => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="kb-selection-color-swatch"
                title={item.label}
                onMouseDown={preventBlur}
                onClick={() => applyTextColor(item.value)}
              >
                {item.value ? (
                  <span style={{ color: item.value }}>A</span>
                ) : (
                  <span className="kb-selection-color-default">A</span>
                )}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className={`${btnClass(editor.isActive('highlight'))} kb-selection-bubble-picker-trigger`}
          title="高亮"
          onMouseDown={preventBlur}
          onClick={() => {
            setColorMenuOpen(false);
            setHighlightMenuOpen(v => !v);
          }}
        >
          <Highlighter className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        {highlightMenuOpen && (
          <div className="kb-selection-color-menu kb-selection-highlight-menu" role="menu">
            {KNOWLEDGE_HIGHLIGHT_COLORS.map(item => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="kb-selection-highlight-swatch"
                title={item.label}
                onMouseDown={preventBlur}
                onClick={() => applyHighlight(item.value)}
              >
                {item.value ? (
                  <span style={{ backgroundColor: item.value }} />
                ) : (
                  <span className="kb-selection-highlight-none" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </BubbleMenu>
  );
};

export default KnowledgeSelectionBubbleMenu;
