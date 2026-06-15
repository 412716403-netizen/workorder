import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Link from '@tiptap/extension-link';
import { ResizableImage } from './resizableImageExtension';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { common, createLowlight } from 'lowlight';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  isAllowedKnowledgeExternalUrl,
} from '../../shared/knowledgeLinkUrl';
import EditorInsertHandle from './EditorInsertHandle';
import TableBubbleMenu from './TableBubbleMenu';
import KnowledgeSelectionBubbleMenu from './KnowledgeSelectionBubbleMenu';
import LinkInsertDialog from './LinkInsertDialog';
import { insertKnowledgeExternalLink } from './knowledgeEditorInsert';
import { bindKnowledgeEditorLinkClick } from './knowledgeEditorLinkClick';
import { bindKnowledgeEditorImageClick } from './knowledgeEditorImageClick';
import KnowledgeImagePreviewOverlay from './KnowledgeImagePreviewOverlay';
import { tableDeleteShortcut } from './tableDeleteShortcut';
import { focusDocumentTail, isClickBelowEditorContent } from './focusDocumentTail';
import { shouldApplyRemoteContentHydrate } from '../../utils/knowledgeEditorHydrate';
import { useKnowledgeDocOutline } from '../../hooks/useKnowledgeDocOutline';
import KnowledgeDocOutline from './KnowledgeDocOutline';
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
  onSaveError?: () => void;
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
  onSaveError,
  onUploadImage,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef(title);
  const documentIdRef = useRef(documentId);
  const onSaveRef = useRef(onSave);
  const lastSavedRef = useRef({ title: '', content: '' });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratingRef = useRef(true);
  const dirtyRef = useRef(false);
  const prevDocumentIdRef = useRef<string | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogInitialText, setLinkDialogInitialText] = useState('');
  const [imagePreviewSrc, setImagePreviewSrc] = useState<string | null>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);

  documentIdRef.current = documentId;
  onSaveRef.current = onSave;

  const insertImageFromFile = useCallback(async (file: File, ed: Editor | null) => {
    if (!ed || !file.type.startsWith('image/')) return;
    const url = await onUploadImage(file);
    ed.chain().focus().setImage({ src: url }).run();
  }, [onUploadImage]);

  const onSaveErrorRef = useRef(onSaveError);
  onSaveErrorRef.current = onSaveError;

  const flushSave = useCallback(async (docId: string, ed: Editor | null, opts?: { silent?: boolean }) => {
    if (!ed || !editable || hydratingRef.current) return;
    const payload = {
      docId,
      title: titleRef.current,
      content: ed.getHTML(),
    };
    if (
      payload.title === lastSavedRef.current.title
      && payload.content === lastSavedRef.current.content
    ) {
      dirtyRef.current = false;
      return;
    }
    try {
      await onSaveRef.current(payload);
      lastSavedRef.current = { title: payload.title, content: payload.content };
      dirtyRef.current = false;
    } catch (err: unknown) {
      if (opts?.silent) return;
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('已被他人修改')) {
        toast.error(msg || '文档已被他人修改，请刷新后重试');
      } else {
        onSaveErrorRef.current?.();
      }
    }
  }, [editable]);

  const scheduleSave = useCallback((docId: string, ed: Editor | null) => {
    if (!editable || hydratingRef.current) return;
    dirtyRef.current = true;
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
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        defaultProtocol: 'https',
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: {
          class: 'kb-external-link',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
        isAllowedUri: url => isAllowedKnowledgeExternalUrl(url),
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
      Underline,
      TextStyle,
      Color.configure({ types: ['textStyle'] }),
      Highlight.configure({ multicolor: true }),
      tableDeleteShortcut,
    ],
    content,
    editable,
    onUpdate: ({ editor: ed }) => {
      if (hydratingRef.current) return;
      scheduleSaveRef.current(documentIdRef.current, ed);
    },
  }, []);

  const { items: outlineItems, activeId: outlineActiveId, jumpTo: jumpToOutline } = useKnowledgeDocOutline(
    editor,
    editorScrollRef,
  );

  useEffect(() => {
    titleRef.current = title;
    if (!editor || hydratingRef.current) return;
    if (title !== lastSavedRef.current.title) {
      dirtyRef.current = true;
    }
  }, [title, editor]);

  /**
   * 切换文档或远端正文到达：写入编辑器并对齐保存基线。
   * 同一文档自动保存回写时，若用户正在编辑则跳过 setContent，避免光标被重置到文末。
   */
  useEffect(() => {
    if (!editor) return;

    const documentSwitched = prevDocumentIdRef.current !== documentId;
    prevDocumentIdRef.current = documentId;

    const current = editor.getHTML();
    const remoteContent = content || '<p></p>';
    if (
      !shouldApplyRemoteContentHydrate({
        documentSwitched,
        remoteContent,
        editorHtml: current,
        isDirty: dirtyRef.current,
        isEditorFocused: editor.isFocused,
      })
    ) {
      return;
    }

    hydratingRef.current = true;
    dirtyRef.current = false;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    titleRef.current = title;
    if (remoteContent !== current) {
      editor.commands.setContent(remoteContent, false);
    }
    lastSavedRef.current = { title: titleRef.current, content: editor.getHTML() };
    hydratingRef.current = false;
  }, [editor, content, documentId, title]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    const docId = documentId;
    const ed = editor;
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (dirtyRef.current && ed) {
        void flushSave(docId, ed, { silent: true });
      }
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

  useEffect(() => {
    const root = editor?.view.dom;
    if (!root) return;
    return bindKnowledgeEditorLinkClick(root);
  }, [editor]);

  useEffect(() => {
    const root = editor?.view.dom;
    if (!root) return;
    return bindKnowledgeEditorImageClick(root, setImagePreviewSrc);
  }, [editor]);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
    setLinkDialogInitialText(selectedText);
    setLinkDialogOpen(true);
  }, [editor]);

  const handleLinkConfirm = useCallback((text: string, href: string) => {
    if (!editor) return;
    insertKnowledgeExternalLink(editor, text, href);
    scheduleSaveRef.current(documentIdRef.current, editor);
  }, [editor]);

  const handleEditorShellMouseDown = (e: React.MouseEvent) => {
    if (!editor || !editable || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.kb-insert-plus, .kb-insert-popup-portal, .kb-table-bubble-menu, .kb-selection-bubble-menu, .kb-selection-color-menu, .kb-insert-wrap, .kb-link-insert-overlay')) {
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

      <div className="flex min-h-0 flex-1">
        <div
          ref={editorScrollRef}
          className="kb-editor-shell min-h-0 flex-1 overflow-y-auto px-8 py-6"
          onMouseDown={handleEditorShellMouseDown}
        >
          <EditorInsertHandle
            editor={editor}
            editable={editable}
            onPickImage={() => fileInputRef.current?.click()}
            onOpenLinkDialog={openLinkDialog}
          />
          <div className="kb-editor">
            <TableBubbleMenu editor={editor} editable={editable} />
            <KnowledgeSelectionBubbleMenu
              editor={editor}
              editable={editable}
              onOpenLinkDialog={openLinkDialog}
            />
            <EditorContent editor={editor} />
          </div>
          {editable && <div className="kb-editor-tail-hit" aria-hidden />}
        </div>

        <KnowledgeDocOutline
          items={outlineItems}
          activeId={outlineActiveId}
          onJump={jumpToOutline}
        />
      </div>

      <LinkInsertDialog
        open={linkDialogOpen}
        initialText={linkDialogInitialText}
        onClose={() => setLinkDialogOpen(false)}
        onConfirm={handleLinkConfirm}
      />

      <KnowledgeImagePreviewOverlay
        src={imagePreviewSrc}
        onClose={() => setImagePreviewSrc(null)}
      />

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
