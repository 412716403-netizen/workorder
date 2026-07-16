import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import {
  AlignCenter,
  AlignCenterVertical,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  Bold,
  Check,
  Highlighter,
  Italic,
  Link2,
  Strikethrough,
  Type,
  Underline,
} from 'lucide-react';
import {
  KNOWLEDGE_HIGHLIGHT_COLORS,
  KNOWLEDGE_TEXT_COLORS,
} from '../../shared/knowledgeInlineFormat';
import { shouldShowKnowledgeSelectionBubbleMenu } from './selectionBubbleShouldShow';
import {
  getKnowledgeTableCellAlign,
  isKnowledgeSelectionInTable,
  setKnowledgeTableHAlign,
  setKnowledgeTableVAlign,
} from './knowledgeTableAlign';
import type { KnowledgeTableHAlign, KnowledgeTableVAlign } from './knowledgeTableCellExtensions';
import {
  getKnowledgeDocTextAlign,
  setKnowledgeDocTextAlign,
} from './knowledgeTextAlignExtension';

interface KnowledgeSelectionBubbleMenuProps {
  editor: Editor | null;
  editable: boolean;
  onOpenLinkDialog: () => void;
}

const preventBlur = (e: React.MouseEvent) => e.preventDefault();

const H_ALIGN_OPTIONS: { value: KnowledgeTableHAlign; label: string; Icon: typeof AlignLeft }[] = [
  { value: 'left', label: '左对齐', Icon: AlignLeft },
  { value: 'center', label: '居中对齐', Icon: AlignCenter },
  { value: 'right', label: '右对齐', Icon: AlignRight },
];

const V_ALIGN_OPTIONS: { value: KnowledgeTableVAlign; label: string; Icon: typeof AlignStartVertical }[] = [
  { value: 'top', label: '顶部对齐', Icon: AlignStartVertical },
  { value: 'middle', label: '垂直居中', Icon: AlignCenterVertical },
  { value: 'bottom', label: '底部对齐', Icon: AlignEndVertical },
];

const KnowledgeSelectionBubbleMenu: React.FC<KnowledgeSelectionBubbleMenuProps> = ({
  editor,
  editable,
  onOpenLinkDialog,
}) => {
  const [, setTick] = useState(0);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [highlightMenuOpen, setHighlightMenuOpen] = useState(false);
  const [alignMenuOpen, setAlignMenuOpen] = useState(false);
  const menusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick(t => t + 1);
    // 仅在选区变化或正文变更时刷新工具栏状态。
    // 不可对所有 transaction bump：BubbleMenu 的 updateOptions 也会发 transaction，
    // 若同时传入不稳定的 shouldShow/options，会形成 Maximum update depth 死循环。
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) bump();
    };
    editor.on('selectionUpdate', bump);
    editor.on('transaction', onTransaction);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('transaction', onTransaction);
    };
  }, [editor]);

  const bubbleOptions = useMemo(() => {
    const shell = editor?.view.dom.closest('.kb-editor-shell');
    return {
      placement: 'top' as const,
      offset: 8,
      // absolute + 挂到编辑器壳内，避免 fixed 挂 body 时误盖住应用侧栏
      strategy: 'absolute' as const,
      flip: { padding: 8 },
      shift: { padding: 8 },
      scrollTarget: shell instanceof HTMLElement ? shell : window,
    };
  }, [editor]);

  const appendTo = useCallback(() => {
    const shell = editor?.view.dom.closest('.kb-editor-shell');
    return shell instanceof HTMLElement ? shell : document.body;
  }, [editor]);

  const shouldShow = useCallback(
    ({ editor: ed, view }: { editor: Editor; view: { hasFocus: () => boolean } }) =>
      shouldShowKnowledgeSelectionBubbleMenu(ed, view),
    [],
  );

  const closeMenus = useCallback(() => {
    setColorMenuOpen(false);
    setHighlightMenuOpen(false);
    setAlignMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!colorMenuOpen && !highlightMenuOpen && !alignMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (menusRef.current?.contains(e.target as Node)) return;
      closeMenus();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [colorMenuOpen, highlightMenuOpen, alignMenuOpen, closeMenus]);

  if (!editor || !editable) return null;

  const btnClass = (active: boolean) =>
    `kb-selection-bubble-btn${active ? ' is-active' : ''}`;

  const inTable = isKnowledgeSelectionInTable(editor);
  const cellAlign = inTable ? getKnowledgeTableCellAlign(editor) : null;
  const currentH = inTable
    ? (cellAlign?.align ?? 'left')
    : getKnowledgeDocTextAlign(editor);
  const currentV = cellAlign?.verticalAlign ?? 'top';
  const CurrentHIcon = H_ALIGN_OPTIONS.find(o => o.value === currentH)?.Icon ?? AlignLeft;

  const applyHAlign = (value: KnowledgeTableHAlign) => {
    if (inTable) {
      setKnowledgeTableHAlign(editor, value);
    } else {
      setKnowledgeDocTextAlign(editor, value);
    }
  };

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
      shouldShow={shouldShow}
      appendTo={appendTo}
      options={bubbleOptions}
      className="kb-selection-bubble-menu"
      onHide={closeMenus}
    >
      <div className="kb-selection-bubble-inner" ref={menusRef}>
        <div className="kb-selection-bubble-picker-wrap">
          <button
            type="button"
            className={`${btnClass(alignMenuOpen)} kb-selection-bubble-picker-trigger`}
            title="对齐"
            aria-expanded={alignMenuOpen}
            onMouseDown={preventBlur}
            onClick={() => {
              setColorMenuOpen(false);
              setHighlightMenuOpen(false);
              setAlignMenuOpen(v => !v);
            }}
          >
            <CurrentHIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          {alignMenuOpen && (
            <div className="kb-selection-align-menu" role="menu">
              {H_ALIGN_OPTIONS.map(({ value, label, Icon }) => {
                const active = currentH === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`kb-selection-align-item${active ? ' is-active' : ''}`}
                    onMouseDown={preventBlur}
                    onClick={() => applyHAlign(value)}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                    <span className="kb-selection-align-label">{label}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
                  </button>
                );
              })}
              {inTable && (
                <>
                  <div className="kb-selection-align-divider" />
                  {V_ALIGN_OPTIONS.map(({ value, label, Icon }) => {
                    const active = currentV === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        className={`kb-selection-align-item${active ? ' is-active' : ''}`}
                        onMouseDown={preventBlur}
                        onClick={() => setKnowledgeTableVAlign(editor, value)}
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                        <span className="kb-selection-align-label">{label}</span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
        <span className="kb-selection-bubble-divider" />

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

        <div className="kb-selection-bubble-picker-wrap">
          <button
            type="button"
            className={`${btnClass(editor.isActive('textStyle'))} kb-selection-bubble-picker-trigger`}
            title="文字颜色"
            onMouseDown={preventBlur}
            onClick={() => {
              setAlignMenuOpen(false);
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
              setAlignMenuOpen(false);
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
      </div>
    </BubbleMenu>
  );
};

export default KnowledgeSelectionBubbleMenu;
