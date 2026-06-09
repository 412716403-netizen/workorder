import React, { useCallback, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { ResizableImage } from './resizableImageExtension';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Loader2 } from 'lucide-react';
import { createSlashCommandExtension } from './slashCommandExtension';
import EditorInsertHandle from './EditorInsertHandle';
import TableBubbleMenu from './TableBubbleMenu';
import { tableDeleteShortcut } from './tableDeleteShortcut';
import { focusDocumentTail, isClickBelowEditorContent } from './focusDocumentTail';
import './knowledge-editor.css';

const lowlight = createLowlight(common);

const AUTO_SAVE_DELAY_MS = 1000;

interface KnowledgeRichEditorProps {
  documentId: string;
  title: string;
  content: string;
  updatedAt?: string;
  editable: boolean;
  saving?: boolean;
  onTitleChange: (title: string) => void;
  onSave: (payload: { docId: string; title: string; content: string }) => void | Promise<void>;
  onUploadImage: (file: File) => Promise<string>;
}

const KnowledgeRichEditor: React.FC<KnowledgeRichEditorProps> = ({
  documentId,
  title,
  content,
  updatedAt,
  editable,
  saving,
  onTitleChange,
  onSave,
  onUploadImage,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef(title);
  const documentIdRef = useRef(documentId);
  const onSaveRef = useRef(onSave);
  const lastSavedRef = useRef({ title: '', content: '' });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  documentIdRef.current = documentId;
  onSaveRef.current = onSave;

  const insertImageFromFile = useCallback(async (file: File, ed: Editor | null) => {
    if (!ed || !file.type.startsWith('image/')) return;
    const url = await onUploadImage(file);
    ed.chain().focus().setImage({ src: url }).run();
  }, [onUploadImage]);

  const flushSave = useCallback(async (docId: string, ed: Editor | null) => {
    if (!ed || !editable) return;
    const payload = {
      docId,
      title: titleRef.current,
      content: ed.getHTML(),
    };
    if (
      payload.title === lastSavedRef.current.title
      && payload.content === lastSavedRef.current.content
    ) {
      return;
    }
    try {
      await onSaveRef.current(payload);
      lastSavedRef.current = { title: payload.title, content: payload.content };
    } catch {
      /* 保存失败时保留 dirty 状态，等待下次编辑重试 */
    }
  }, [editable]);

  const scheduleSave = useCallback((docId: string, ed: Editor | null) => {
    if (!editable) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void flushSave(docId, ed);
    }, AUTO_SAVE_DELAY_MS);
  }, [editable, flushSave]);

  const scheduleSaveRef = useRef(scheduleSave);
  scheduleSaveRef.current = scheduleSave;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableHeader,
      TableCell,
      ResizableImage.configure({
        inline: false,
        allowBase64: false,
        resize: {
          enabled: true,
          directions: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
          minWidth: 80,
          minHeight: 60,
          alwaysPreserveAspectRatio: true,
        },
      }),
      Placeholder.configure({
        placeholder: '输入正文，或点击左侧 + 插入内容块…',
      }),
      CodeBlockLowlight.configure({ lowlight }),
      createSlashCommandExtension(() => fileInputRef.current?.click()),
      tableDeleteShortcut,
    ],
    content,
    editable,
    onUpdate: ({ editor: ed }) => {
      scheduleSaveRef.current(documentIdRef.current, ed);
    },
  }, []);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  /** 仅在切换文档时对齐基线；勿依赖 title，否则每次改标题都会跳过保存 */
  useEffect(() => {
    lastSavedRef.current = { title, content };
  }, [documentId]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (content === current) {
      lastSavedRef.current = { title: titleRef.current, content };
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (content !== current) {
      editor.commands.setContent(content || '<p></p>', false);
    }
  }, [editor, content]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void flushSave(documentId, editor);
    };
  }, [documentId, editor, flushSave]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    try {
      await insertImageFromFile(file, editor);
    } catch {
      /* toast handled by parent */
    }
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!editor || !editable) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void insertImageFromFile(file, editor);
        }
        break;
      }
    }
  }, [editor, editable, insertImageFromFile]);

  useEffect(() => {
    const el = editor?.view.dom;
    if (!el) return;
    el.addEventListener('paste', handlePaste);
    return () => el.removeEventListener('paste', handlePaste);
  }, [editor, handlePaste]);

  const handleEditorShellMouseDown = (e: React.MouseEvent) => {
    if (!editor || !editable || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.kb-insert-plus, .kb-insert-popup-portal, .kb-table-bubble-menu, .kb-insert-wrap')) {
      return;
    }

    if (target.classList.contains('kb-editor-tail-hit')) {
      e.preventDefault();
      focusDocumentTail(editor);
      return;
    }

    const proseRoot = editor.view.dom;
    const hitProseMirror = target === proseRoot || proseRoot.contains(target);
    if (hitProseMirror && isClickBelowEditorContent(editor, e.clientY)) {
      e.preventDefault();
      focusDocumentTail(editor);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="relative z-10 flex items-center justify-between border-b border-slate-100 bg-white px-8 py-4">
        <div className="min-w-0 flex-1">
          {editable ? (
            <input
              type="text"
              value={title}
              onChange={e => {
                const next = e.target.value;
                titleRef.current = next;
                onTitleChange(next);
                scheduleSave(documentId, editor);
              }}
              placeholder="请输入标题"
              className="w-full border-none bg-transparent text-2xl font-black text-slate-900 outline-none placeholder:text-slate-300"
            />
          ) : (
            <h1 className="truncate text-2xl font-black text-slate-900">{title || '无标题'}</h1>
          )}
          {updatedAt && (
            <p className="mt-1 text-xs text-slate-400">
              最近更新 {new Date(updatedAt).toLocaleString('zh-CN')}
            </p>
          )}
        </div>
        {editable && (
          <div className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                <span>保存中…</span>
              </>
            ) : (
              <span>已自动保存</span>
            )}
          </div>
        )}
      </div>

      <div
        className="kb-editor-shell min-h-0 flex-1 overflow-y-auto px-8 py-6"
        onMouseDown={handleEditorShellMouseDown}
      >
        <EditorInsertHandle
          editor={editor}
          editable={editable}
          onPickImage={() => fileInputRef.current?.click()}
        />
        <div className="kb-editor">
          <TableBubbleMenu editor={editor} editable={editable} />
          <EditorContent editor={editor} />
        </div>
        {editable && <div className="kb-editor-tail-hit" aria-hidden />}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};

export default KnowledgeRichEditor;
