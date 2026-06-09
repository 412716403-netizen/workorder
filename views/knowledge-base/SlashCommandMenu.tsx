import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import type { Editor, Range } from '@tiptap/core';

export interface SlashCommandItem {
  title: string;
  group: string;
  icon: string;
  command: (props: { editor: Editor; range: Range }) => void;
}

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export interface SlashCommandMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const SlashCommandMenu = forwardRef<SlashCommandMenuRef, SlashCommandMenuProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((selectedIndex + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((selectedIndex + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          const item = items[selectedIndex];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (!items.length) {
      return (
        <div className="kb-slash-menu px-3 py-2 text-xs text-slate-400">
          无匹配命令
        </div>
      );
    }

    let lastGroup = '';
    return (
      <div className="kb-slash-menu">
        {items.map((item, index) => {
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <React.Fragment key={`${item.title}-${index}`}>
              {showGroup && <div className="kb-slash-menu-group">{item.group}</div>}
              <button
                type="button"
                className={`kb-slash-menu-item ${index === selectedIndex ? 'is-selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseDown={e => {
                  e.preventDefault();
                  command(item);
                }}
              >
                <span className="kb-slash-menu-item-icon">{item.icon}</span>
                <span>{item.title}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );
  },
);

SlashCommandMenu.displayName = 'SlashCommandMenu';

export function buildSlashCommands(
  onPickImage?: () => void,
): SlashCommandItem[] {
  return [
    {
      title: '标题 1',
      group: '基础',
      icon: 'H1',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
      },
    },
    {
      title: '标题 2',
      group: '基础',
      icon: 'H2',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
      },
    },
    {
      title: '标题 3',
      group: '基础',
      icon: 'H3',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
      },
    },
    {
      title: '无序列表',
      group: '基础',
      icon: '•',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: '有序列表',
      group: '基础',
      icon: '1.',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: '引用 / 高亮块',
      group: '常用',
      icon: '“',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      title: '表格 3×3',
      group: '常用',
      icon: '表',
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      },
    },
    {
      title: '分割线',
      group: '常用',
      icon: '—',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run();
      },
    },
    {
      title: '图片',
      group: '常用',
      icon: '图',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        onPickImage?.();
      },
    },
  ];
}

export default SlashCommandMenu;
