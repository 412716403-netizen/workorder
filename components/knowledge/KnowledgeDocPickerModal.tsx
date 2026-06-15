import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, ChevronRight, Folder, FileText, Check, Loader2 } from 'lucide-react';
import { useKnowledgeBaseTree, useKnowledgeDocument, useKnowledgeDocumentSearch } from '../../hooks/useKnowledgeBase';
import { buildKnowledgeTree, type KnowledgeTreeNode } from '../../utils/knowledgeBaseTree';
import type { KnowledgeFieldRef } from '../../utils/knowledgeFieldValue';
import '../../views/knowledge-base/knowledge-editor.css';
import { bindKnowledgeEditorLinkClick } from '../../views/knowledge-base/knowledgeEditorLinkClick';
import { bindKnowledgeEditorImageClick } from '../../views/knowledge-base/knowledgeEditorImageClick';
import KnowledgeImagePreviewOverlay from '../../views/knowledge-base/KnowledgeImagePreviewOverlay';
import KnowledgeDocOutline from '../../views/knowledge-base/KnowledgeDocOutline';
import {
  collectKnowledgeOutlineFromHtmlRoot,
  scrollHtmlToKnowledgeOutline,
  type KnowledgeOutlineItem,
} from '../../utils/knowledgeDocOutline';

export interface KnowledgeDocPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (ref: KnowledgeFieldRef) => void;
  selectedId?: string | null;
  stackZClass?: string;
}

function PickerTreeRow({
  node,
  depth,
  expanded,
  onToggle,
  selectedId,
  onPick,
}: {
  node: KnowledgeTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onPick: (node: KnowledgeTreeNode) => void;
}) {
  const isFolder = node.type === 'folder';
  const isExpanded = isFolder && expanded.has(node.id);
  return (
    <>
      <button
        type="button"
        onClick={() => (isFolder ? onToggle(node.id) : onPick(node))}
        className={`flex w-full items-center gap-1.5 rounded-lg py-2 pr-2 text-left text-sm ${
          !isFolder && selectedId === node.id
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-slate-600 hover:bg-slate-50'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {isFolder ? (
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {isFolder ? (
          <Folder className="h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <span className="truncate font-medium">{node.name}</span>
        {!isFolder && selectedId === node.id && <Check className="ml-auto h-4 w-4 shrink-0 text-indigo-600" />}
      </button>
      {isFolder && isExpanded && node.children.map(child => (
        <PickerTreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          selectedId={selectedId}
          onPick={onPick}
        />
      ))}
    </>
  );
}

/** 从资料库中选择一篇文档（单选）。值由调用方以 {id,title} 形式存储。 */
export const KnowledgeDocPickerModal: React.FC<KnowledgeDocPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  selectedId = null,
  stackZClass = 'z-[11300]',
}) => {
  const { data, isLoading, isError } = useKnowledgeBaseTree();
  const folders = useMemo(() => data?.folders ?? [], [data]);
  const documents = useMemo(() => data?.documents ?? [], [data]);
  const tree = useMemo(() => buildKnowledgeTree(folders, documents), [folders, documents]);

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pendingId, setPendingId] = useState<string | null>(selectedId);

  React.useEffect(() => {
    if (isOpen) {
      setPendingId(selectedId);
      setSearch('');
    }
  }, [isOpen, selectedId]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const q = search.trim().toLowerCase();
  const { data: serverSearchResults = [], isFetching: searchLoading } = useKnowledgeDocumentSearch(q);
  const searchResults = useMemo(() => {
    if (!q) return [];
    return serverSearchResults.slice(0, 50);
  }, [q, serverSearchResults]);

  const pickedDoc = pendingId ? documents.find(d => d.id === pendingId) : undefined;

  if (!isOpen) return null;

  const confirm = () => {
    if (!pendingId) return;
    const doc = documents.find(d => d.id === pendingId);
    onSelect({ id: pendingId, title: doc?.title?.trim() || '无标题' });
    onClose();
  };

  return (
    <div className={`fixed inset-0 ${stackZClass} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} role="presentation" />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">选择资料库文件</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索文档标题…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="min-h-[240px] flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载资料库…
            </div>
          ) : isError ? (
            <p className="px-3 py-10 text-center text-sm text-slate-400">无法加载资料库（可能无查看权限）</p>
          ) : documents.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-slate-400">资料库暂无文档</p>
          ) : q ? (
            searchLoading ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 搜索中…
              </div>
            ) : searchResults.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-slate-400">没有匹配的文档</p>
            ) : (
              searchResults.map(doc => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setPendingId(doc.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                    pendingId === doc.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate font-medium">{doc.title?.trim() || '无标题'}</span>
                  {pendingId === doc.id && <Check className="ml-auto h-4 w-4 shrink-0 text-indigo-600" />}
                </button>
              ))
            )
          ) : (
            tree.map(node => (
              <PickerTreeRow
                key={node.id}
                node={node}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
                selectedId={pendingId}
                onPick={n => setPendingId(n.id)}
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
            {pickedDoc ? `已选：${pickedDoc.title?.trim() || '无标题'}` : '未选择'}
          </span>
          <button
            type="button"
            onClick={confirm}
            disabled={!pendingId}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            确认选择
          </button>
        </div>
      </div>
    </div>
  );
};

export interface KnowledgeDocPreviewModalProps {
  docId: string | null;
  isOpen: boolean;
  onClose: () => void;
  stackZClass?: string;
}

/** 只读预览一篇资料库文档（标题 + 富文本正文）。 */
export const KnowledgeDocPreviewModal: React.FC<KnowledgeDocPreviewModalProps> = ({
  docId,
  isOpen,
  onClose,
  stackZClass = 'z-[11300]',
}) => {
  const { data: doc, isLoading, isError } = useKnowledgeDocument(isOpen ? docId : null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const [imagePreviewSrc, setImagePreviewSrc] = useState<string | null>(null);
  const [outlineItems, setOutlineItems] = useState<KnowledgeOutlineItem[]>([]);
  const [outlineActiveId, setOutlineActiveId] = useState<string | null>(null);

  useEffect(() => {
    const root = previewRef.current?.querySelector('.ProseMirror');
    if (!(root instanceof HTMLElement)) {
      setOutlineItems([]);
      setOutlineActiveId(null);
      return;
    }
    const unbindLink = bindKnowledgeEditorLinkClick(root);
    const unbindImage = bindKnowledgeEditorImageClick(root, setImagePreviewSrc);
    const items = collectKnowledgeOutlineFromHtmlRoot(root);
    setOutlineItems(items);
    setOutlineActiveId(items[0]?.id ?? null);
    return () => {
      unbindLink();
      unbindImage();
    };
  }, [doc?.content]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${stackZClass} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} role="presentation" />
      <div className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-slate-800">
            {doc?.title?.trim() || '资料库文件'}
          </h2>
          <button type="button" onClick={onClose} className="ml-2 rounded-full p-2 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div ref={previewScrollRef} className="min-h-[200px] flex-1 overflow-y-auto px-8 py-6">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中…
              </div>
            ) : isError || !doc ? (
              <p className="py-10 text-center text-sm text-slate-400">无法加载该文档（可能已删除或无权限）</p>
            ) : (
              <div ref={previewRef} className="kb-editor">
                <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: doc.content || '<p></p>' }} />
              </div>
            )}
          </div>
          <KnowledgeDocOutline
            items={outlineItems}
            activeId={outlineActiveId}
            onJump={item => {
              const scrollRoot = previewScrollRef.current;
              if (!scrollRoot) return;
              scrollHtmlToKnowledgeOutline(scrollRoot, item);
              setOutlineActiveId(item.id);
            }}
          />
        </div>
      </div>
      <KnowledgeImagePreviewOverlay
        src={imagePreviewSrc}
        onClose={() => setImagePreviewSrc(null)}
      />
    </div>
  );
};

export default KnowledgeDocPickerModal;
