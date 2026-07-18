import type { Editor } from '@tiptap/core';
import type { LucideIcon } from 'lucide-react';
import {
  Heading1, Heading2, Heading3,
  List, ListOrdered, Table as TableIcon,
  Minus, Image as ImageIcon, Highlighter, Link2, Package, Paperclip, FileText,
} from 'lucide-react';

export type InsertMenuIconTone = 'slate' | 'blue' | 'amber' | 'green' | 'violet' | 'rose' | 'sky' | 'orange';

export interface InsertBasicItem {
  kind: 'basic';
  id: string;
  label: string;
  icon: LucideIcon;
  run: (editor: Editor) => void;
}

export interface InsertCommonItem {
  kind: 'common';
  id: string;
  label: string;
  icon: LucideIcon;
  tone: InsertMenuIconTone;
  hasSubmenu?: boolean;
  run: (editor: Editor) => void;
}

export type InsertMenuItem = InsertBasicItem | InsertCommonItem;

export function buildInsertMenuItems(
  onPickImage?: () => void,
  onOpenLinkDialog?: () => void,
  onOpenProductDialog?: () => void,
  onPickFile?: () => void,
  onOpenDocumentDialog?: () => void,
): {
  basic: InsertBasicItem[];
  common: InsertCommonItem[];
} {
  const basic: InsertBasicItem[] = [
    { kind: 'basic', id: 'h1', label: '标题 1', icon: Heading1, run: ed => ed.chain().focus().toggleHeading({ level: 1 }).run() },
    { kind: 'basic', id: 'h2', label: '标题 2', icon: Heading2, run: ed => ed.chain().focus().toggleHeading({ level: 2 }).run() },
    { kind: 'basic', id: 'h3', label: '标题 3', icon: Heading3, run: ed => ed.chain().focus().toggleHeading({ level: 3 }).run() },
    { kind: 'basic', id: 'bullet', label: '无序列表', icon: List, run: ed => ed.chain().focus().toggleBulletList().run() },
    { kind: 'basic', id: 'ordered', label: '有序列表', icon: ListOrdered, run: ed => ed.chain().focus().toggleOrderedList().run() },
    {
      kind: 'basic',
      id: 'highlight',
      label: '高亮块',
      icon: Highlighter,
      run: ed => ed.chain().focus().toggleBlockquote().run(),
    },
    {
      kind: 'basic',
      id: 'link',
      label: '超链接',
      icon: Link2,
      run: ed => {
        ed.chain().focus().run();
        onOpenLinkDialog?.();
      },
    },
    {
      kind: 'basic',
      id: 'divider',
      label: '分割线',
      icon: Minus,
      run: ed => ed.chain().focus().setHorizontalRule().run(),
    },
  ];

  const common: InsertCommonItem[] = [
    {
      kind: 'common',
      id: 'image',
      label: '图片',
      icon: ImageIcon,
      tone: 'amber',
      run: ed => {
        ed.chain().focus().run();
        onPickImage?.();
      },
    },
    {
      kind: 'common',
      id: 'file',
      label: '文件或视频',
      icon: Paperclip,
      tone: 'sky',
      run: ed => {
        ed.chain().focus().run();
        onPickFile?.();
      },
    },
    {
      kind: 'common',
      id: 'product',
      label: '关联产品',
      icon: Package,
      tone: 'blue',
      run: ed => {
        ed.chain().focus().run();
        onOpenProductDialog?.();
      },
    },
    {
      kind: 'common',
      id: 'document',
      label: '关联文档',
      icon: FileText,
      tone: 'violet',
      run: ed => {
        ed.chain().focus().run();
        onOpenDocumentDialog?.();
      },
    },
    {
      kind: 'common',
      id: 'table',
      label: '表格',
      icon: TableIcon,
      tone: 'green',
      hasSubmenu: true,
      run: ed => ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run(),
    },
  ];

  return { basic, common };
}

export function insertTable(editor: Editor, rows: number, cols: number) {
  editor.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run();
}
