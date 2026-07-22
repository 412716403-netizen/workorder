import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import { KnowledgeTableCell, KnowledgeTableHeader } from './knowledgeTableCellExtensions';
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
import { Loader2, X } from 'lucide-react';
import { isAllowedKnowledgeExternalUrl } from '../../shared/knowledgeLinkUrl';
import { useMasterData } from '../../contexts/AppDataContext';
import EditorInsertHandle from './EditorInsertHandle';
import TableGutterControls from './TableGutterControls';
import KnowledgeSelectionBubbleMenu from './KnowledgeSelectionBubbleMenu';
import LinkInsertDialog from './LinkInsertDialog';
import ProductLinkInsertDialog from './ProductLinkInsertDialog';
import { insertKnowledgeExternalLink } from './knowledgeEditorInsert';
import { bindKnowledgeEditorLinkClick } from './knowledgeEditorLinkClick';
import { bindKnowledgeEditorImageClick } from './knowledgeEditorImageClick';
import {
  bindKnowledgeEditorProductRefClick,
  formatKnowledgeProductRefLabel,
} from './knowledgeEditorProductRef';
import {
  bindKnowledgeEditorDocumentRefClick,
  formatKnowledgeDocumentRefLabel,
} from './knowledgeEditorDocumentRef';
import KnowledgeImagePreviewOverlay from './KnowledgeImagePreviewOverlay';
import KnowledgeFilePreviewOverlay from './KnowledgeFilePreviewOverlay';
import { buildKnowledgeImageInsertAttrs } from './knowledgeTableImage';
import { KnowledgeProductRef } from './knowledgeProductRefExtension';
import { KnowledgeDocumentRef } from './knowledgeDocumentRefExtension';
import { KnowledgeFileAttachment, type KnowledgeAttachmentInfo } from './knowledgeFileAttachmentExtension';
import { KnowledgeDocPickerModal, KnowledgeDocPreviewModal } from '../../components/knowledge/KnowledgeDocPickerModal';
import type { KnowledgeFieldRef } from '../../utils/knowledgeFieldValue';
import { tableDeleteShortcut } from './tableDeleteShortcut';
import { KnowledgeTextAlign } from './knowledgeTextAlignExtension';
import { focusDocumentTail, isClickBelowEditorContent } from './focusDocumentTail';
import { shouldApplyRemoteContentHydrate } from '../../utils/knowledgeEditorHydrate';
import { useKnowledgeDocOutline } from '../../hooks/useKnowledgeDocOutline';
import KnowledgeDocOutline from './KnowledgeDocOutline';
import PlanProductDetail from '../plan-order-list/PlanProductDetail';
import { ModalPortal } from '../../components/ModalPortal';
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
  onUploadFile: (file: File) => Promise<KnowledgeAttachmentInfo>;
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
  onUploadFile,
}) => {
  const {
    products,
    categories,
    dictionaries,
    partners,
    globalNodes,
    boms,
  } = useMasterData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
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
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  /** 打开选择弹窗前记下光标，确认插入时还原（避免失焦后插到段末/新行） */
  const insertCaretRef = useRef<{ from: number; to: number } | null>(null);
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<{ url: string; type: 'image' | 'pdf' } | null>(null);
  const [imagePreviewSrc, setImagePreviewSrc] = useState<string | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<KnowledgeAttachmentInfo | null>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);

  documentIdRef.current = documentId;
  onSaveRef.current = onSave;

  const insertImageFromFile = useCallback(async (file: File, ed: Editor | null) => {
    if (!ed || !file.type.startsWith('image/')) return;
    const url = await onUploadImage(file);
    const attrs = buildKnowledgeImageInsertAttrs(url, ed.isActive('table'));
    ed.chain().focus().setImage(attrs).run();
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
        underline: false,
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
      Table.configure({
        resizable: true,
        allowTableNodeSelection: true,
        // 热区过宽会导致拖选文字时易触发列宽拖拽、选不中
        handleWidth: 4,
        cellMinWidth: 80,
        lastColumnResizable: true,
      }),
      TableRow,
      KnowledgeTableHeader,
      KnowledgeTableCell,
      KnowledgeProductRef,
      KnowledgeDocumentRef,
      KnowledgeFileAttachment.configure({
        onPreview: (info) => setAttachmentPreview(info),
      }),
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
      KnowledgeTextAlign,
      tableDeleteShortcut,
    ],
    content,
    // 必须初始为 true，否则 columnResizing 插件不会注册（后续 setEditable 也无法补上）
    editable: true,
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

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    try {
      const info = await onUploadFile(file);
      editor.commands.insertFileAttachment(info);
      scheduleSaveRef.current(documentIdRef.current, editor);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '附件上传失败');
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

  useEffect(() => {
    const root = editor?.view.dom;
    if (!root) return;
    return bindKnowledgeEditorProductRefClick(root, (productId) => {
      if (!products.some(p => p.id === productId)) {
        toast.error('未找到该产品，可能已删除');
        return;
      }
      setViewProductId(productId);
    });
  }, [editor, products]);

  useEffect(() => {
    const root = editor?.view.dom;
    if (!root) return;
    return bindKnowledgeEditorDocumentRefClick(root, (docId) => {
      setViewDocId(docId);
    });
  }, [editor]);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
    setLinkDialogInitialText(selectedText);
    setLinkDialogOpen(true);
  }, [editor]);

  const openProductDialog = useCallback(() => {
    if (editor) {
      const { from, to } = editor.state.selection;
      insertCaretRef.current = { from, to };
    }
    setProductDialogOpen(true);
  }, [editor]);

  const openDocumentDialog = useCallback(() => {
    if (editor) {
      const { from, to } = editor.state.selection;
      insertCaretRef.current = { from, to };
    }
    setDocumentDialogOpen(true);
  }, [editor]);

  const restoreInsertCaret = useCallback(() => {
    if (!editor || editor.isDestroyed) return;
    const saved = insertCaretRef.current;
    insertCaretRef.current = null;
    if (!saved) {
      editor.commands.focus();
      return;
    }
    const max = editor.state.doc.content.size;
    const from = Math.max(0, Math.min(saved.from, max));
    const to = Math.max(0, Math.min(saved.to, max));
    editor.chain().focus().setTextSelection({ from, to }).run();
  }, [editor]);

  const handleLinkConfirm = useCallback((text: string, href: string) => {
    if (!editor) return;
    insertKnowledgeExternalLink(editor, text, href);
    scheduleSaveRef.current(documentIdRef.current, editor);
  }, [editor]);

  const handleProductConfirm = useCallback((productId: string) => {
    if (!editor) return;
    restoreInsertCaret();
    const product = products.find(p => p.id === productId);
    const label = formatKnowledgeProductRefLabel(product ?? { name: '', sku: '' });
    editor.commands.insertProductRef({ productId, label });
    scheduleSaveRef.current(documentIdRef.current, editor);
  }, [editor, products, restoreInsertCaret]);

  const handleDocumentConfirm = useCallback((ref: KnowledgeFieldRef) => {
    if (!editor) return;
    if (ref.id === documentIdRef.current) {
      toast.error('不能关联当前文档');
      return;
    }
    restoreInsertCaret();
    const label = formatKnowledgeDocumentRefLabel(ref.title);
    editor.commands.insertDocumentRef({ documentId: ref.id, label });
    scheduleSaveRef.current(documentIdRef.current, editor);
  }, [editor, restoreInsertCaret]);

  const handleEditorShellMouseDown = (e: React.MouseEvent) => {
    if (!editor || !editable || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.kb-insert-plus, .kb-insert-popup-portal, .kb-table-gutters, .kb-selection-bubble-menu, .kb-selection-color-menu, .kb-selection-align-menu, .kb-insert-wrap, .kb-link-insert-overlay')) {
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
            onOpenProductDialog={openProductDialog}
            onOpenDocumentDialog={openDocumentDialog}
            onPickFile={() => attachmentInputRef.current?.click()}
          />
          <div className="kb-editor">
            <TableGutterControls editor={editor} editable={editable} />
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

      <ProductLinkInsertDialog
        open={productDialogOpen}
        onClose={() => setProductDialogOpen(false)}
        onConfirm={handleProductConfirm}
      />

      <KnowledgeDocPickerModal
        isOpen={documentDialogOpen}
        onClose={() => setDocumentDialogOpen(false)}
        onSelect={handleDocumentConfirm}
        excludeDocumentId={documentId}
        stackZClass="z-[11300]"
      />

      <KnowledgeDocPreviewModal
        docId={viewDocId}
        isOpen={Boolean(viewDocId)}
        onClose={() => setViewDocId(null)}
        stackZClass="z-[12100]"
      />

      {viewProductId && (
        <PlanProductDetail
          viewProductId={viewProductId}
          products={products}
          categories={categories}
          dictionaries={dictionaries}
          partners={partners}
          globalNodes={globalNodes}
          boms={boms}
          onClose={() => setViewProductId(null)}
          onFilePreview={(url, type) => setFilePreview({ url, type })}
          stackZClass="z-[12000]"
        />
      )}

      {filePreview && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-[12100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/80 backdrop-blur-sm"
          onClick={() => setFilePreview(null)}
        >
          <button
            type="button"
            onClick={() => setFilePreview(null)}
            className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-all"
            aria-label="关闭"
          >
            <X className="w-8 h-8" />
          </button>
          <div
            className="relative z-10 w-full max-w-4xl max-h-[min(92vh,960px)] bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {filePreview.type === 'image' ? (
              <img src={filePreview.url} alt="预览" className="w-full h-full max-h-[85vh] object-contain" />
            ) : (
              <iframe src={filePreview.url} title="PDF 预览" className="w-full h-[85vh] border-0" />
            )}
          </div>
        </div>
        </ModalPortal>
      )}

      <KnowledgeImagePreviewOverlay
        src={imagePreviewSrc}
        onClose={() => setImagePreviewSrc(null)}
      />

      <KnowledgeFilePreviewOverlay
        attachment={attachmentPreview}
        onClose={() => setAttachmentPreview(null)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <input
        ref={attachmentInputRef}
        type="file"
        className="hidden"
        onChange={handleAttachmentChange}
      />
    </div>
  );
};

export default KnowledgeRichEditor;
