import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  BookOpen, ChevronRight, FileText, Folder, FolderPlus, MoreHorizontal,
  Pencil, Plus, Search, Trash2,
} from 'lucide-react';
import type { KnowledgeDocumentSummaryDto, KnowledgeFolderDto } from '../../types';
import { useKnowledgeDocumentSearch } from '../../hooks/useKnowledgeBase';
import {
  buildKnowledgeTree,
  folderHasChildren,
  planDocumentMove,
  planFolderMove,
  type KnowledgeDropPosition,
  type KnowledgeTreeNode,
} from '../../utils/knowledgeBaseTree';

const ROOT_DROP_ID = 'kb-folder:root';

function rowDndId(node: KnowledgeTreeNode): string {
  return node.type === 'folder' ? `kb-row:folder:${node.id}` : `kb-row:doc:${node.id}`;
}

function dragDndId(node: KnowledgeTreeNode): string {
  return node.type === 'folder' ? `kb-drag-folder:${node.id}` : `kb-drag-doc:${node.id}`;
}

function parseRowDndId(id: string): { kind: 'folder' | 'document'; itemId: string } | null {
  if (id.startsWith('kb-row:folder:')) {
    return { kind: 'folder', itemId: id.slice('kb-row:folder:'.length) };
  }
  if (id.startsWith('kb-row:doc:')) {
    return { kind: 'document', itemId: id.slice('kb-row:doc:'.length) };
  }
  return null;
}

function getDropPosition(event: DragOverEvent): KnowledgeDropPosition | null {
  const over = event.over;
  if (!over) return null;
  const overId = String(over.id);
  if (overId === ROOT_DROP_ID) return 'inside';

  const translated = event.active.rect.current.translated;
  if (!translated || !over.rect) {
    if (overId.startsWith('kb-row:folder:')) return 'inside';
    if (overId.startsWith('kb-row:doc:')) return 'after';
    return null;
  }

  const dragCenterY = translated.top + translated.height / 2;
  const ratio = (dragCenterY - over.rect.top) / over.rect.height;

  if (overId.startsWith('kb-row:folder:')) {
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'inside';
  }
  if (overId.startsWith('kb-row:doc:')) {
    return ratio < 0.5 ? 'before' : 'after';
  }
  return null;
}

type DragItem =
  | { type: 'document'; id: string; folderId: string | null; name: string }
  | { type: 'folder'; id: string; parentId: string | null; name: string };

type DropHint = { rowId: string; position: KnowledgeDropPosition };

interface KnowledgeTreeSidebarProps {
  folders: KnowledgeFolderDto[];
  documents: KnowledgeDocumentSummaryDto[];
  selectedDocId: string | null;
  canCreateFolder: boolean;
  canEditFolder: boolean;
  canDeleteFolder: boolean;
  canCreateDoc: boolean;
  canDeleteDoc: boolean;
  canMoveDoc: boolean;
  canMoveFolder: boolean;
  onSelectDoc: (id: string) => void;
  onMoveDocument: (docId: string, body: { folderId?: string | null; sortOrder: number }) => void;
  onMoveFolder: (folderId: string, body: { parentId?: string | null; sortOrder: number }) => void;
  onCreateFolder: (parentId: string | null) => void;
  onRenameFolder: (folder: KnowledgeFolderDto) => void;
  onDeleteFolder: (folder: KnowledgeFolderDto) => void;
  onCreateDoc: (folderId: string | null) => void;
  onDeleteDoc: (doc: KnowledgeDocumentSummaryDto) => void;
}

function TreeNodeRow({
  node,
  depth,
  expanded,
  onToggle,
  selectedDocId,
  onSelectDoc,
  menuFolderId,
  setMenuFolderId,
  menuDocId,
  setMenuDocId,
  canEditFolder,
  canDeleteFolder,
  canDeleteDoc,
  folders,
  documents,
  onRenameFolder,
  onDeleteFolder,
  onDeleteDoc,
  onCreateFolder,
  onCreateDoc,
  canCreateFolder,
  canCreateDoc,
  canMoveDoc,
  canMoveFolder,
  dropHint,
}: {
  node: KnowledgeTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedDocId: string | null;
  onSelectDoc: (id: string) => void;
  menuFolderId: string | null;
  setMenuFolderId: (id: string | null) => void;
  menuDocId: string | null;
  setMenuDocId: (id: string | null) => void;
  canEditFolder: boolean;
  canDeleteFolder: boolean;
  canDeleteDoc: boolean;
  folders: KnowledgeFolderDto[];
  documents: KnowledgeDocumentSummaryDto[];
  onRenameFolder: (folder: KnowledgeFolderDto) => void;
  onDeleteFolder: (folder: KnowledgeFolderDto) => void;
  onDeleteDoc: (doc: KnowledgeDocumentSummaryDto) => void;
  onCreateFolder: (parentId: string | null) => void;
  onCreateDoc: (folderId: string | null) => void;
  canCreateFolder: boolean;
  canCreateDoc: boolean;
  canMoveDoc: boolean;
  canMoveFolder: boolean;
  dropHint: DropHint | null;
}) {
  const isFolder = node.type === 'folder';
  const isExpanded = isFolder && expanded.has(node.id);
  const folderDto = isFolder ? folders.find(f => f.id === node.id) : undefined;
  const canDrag = isFolder ? canMoveFolder : canMoveDoc;

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: dragDndId(node),
    disabled: !canDrag,
    data: isFolder
      ? { type: 'folder' as const, folderId: node.id, parentId: folderDto?.parentId ?? null }
      : { type: 'document' as const, docId: node.id, folderId: node.doc?.folderId ?? null },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: rowDndId(node),
  });

  const setRowRef = (el: HTMLDivElement | null) => {
    setDropRef(el);
    if (canDrag) setDragRef(el);
  };

  const showInsideHighlight = isFolder && (
    (dropHint?.rowId === node.id && dropHint.position === 'inside')
    || (isOver && !dropHint)
  );

  return (
    <>
      <div className="relative" style={{ paddingLeft: `${8 + depth * 14}px` }}>
        {dropHint?.rowId === node.id && dropHint.position === 'before' && (
          <div className="absolute left-2 right-2 top-0 z-10 h-0.5 -translate-y-0.5 rounded-full bg-indigo-500" />
        )}
        <div
          ref={setRowRef}
          {...(canDrag ? { ...listeners, ...attributes } : {})}
          className={`group flex items-center gap-1 rounded-lg pr-1 text-sm ${
            !isFolder && selectedDocId === node.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
          } ${showInsideHighlight ? 'bg-indigo-100/80 ring-2 ring-inset ring-indigo-300' : ''} ${
            canDrag ? 'cursor-grab active:cursor-grabbing' : ''
          } ${isDragging ? 'opacity-40' : ''}`}
        >
          {isFolder ? (
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              className="flex h-7 w-5 shrink-0 items-center justify-center text-slate-400"
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
            onClick={() => {
              if (isFolder) onToggle(node.id);
              else onSelectDoc(node.id);
            }}
          >
            {isFolder ? (
              <Folder className="h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
            )}
            <span className="truncate font-medium">{node.name}</span>
          </button>
          {(isFolder ? canEditFolder || canDeleteFolder || canCreateFolder || canCreateDoc : canDeleteDoc) && (
            <div className="relative">
              <button
                type="button"
                className="rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-slate-100"
                onClick={e => {
                  e.stopPropagation();
                  if (isFolder) {
                    setMenuDocId(null);
                    setMenuFolderId(menuFolderId === node.id ? null : node.id);
                  } else {
                    setMenuFolderId(null);
                    setMenuDocId(menuDocId === node.id ? null : node.id);
                  }
                }}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {((isFolder && menuFolderId === node.id) || (!isFolder && menuDocId === node.id)) && (
                <div className="absolute right-0 top-7 z-20 min-w-[140px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  {isFolder && canCreateDoc && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                      onClick={() => { onCreateDoc(node.id); setMenuFolderId(null); }}
                    >
                      <Plus className="h-3.5 w-3.5" /> 新建文档
                    </button>
                  )}
                  {isFolder && canCreateFolder && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                      onClick={() => { onCreateFolder(node.id); setMenuFolderId(null); }}
                    >
                      <FolderPlus className="h-3.5 w-3.5" /> 子文件夹
                    </button>
                  )}
                  {isFolder && canEditFolder && folderDto && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                      onClick={() => { onRenameFolder(folderDto); setMenuFolderId(null); }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> 重命名
                    </button>
                  )}
                  {isFolder && canDeleteFolder && folderDto && !folderHasChildren(node.id, folders, documents) && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50"
                      onClick={() => { onDeleteFolder(folderDto!); setMenuFolderId(null); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> 删除
                    </button>
                  )}
                  {!isFolder && canDeleteDoc && node.doc && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50"
                      onClick={() => { onDeleteDoc(node.doc!); setMenuDocId(null); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> 删除
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {dropHint?.rowId === node.id && dropHint.position === 'after' && (
          <div className="absolute left-2 right-2 bottom-0 z-10 h-0.5 translate-y-0.5 rounded-full bg-indigo-500" />
        )}
      </div>
      {isFolder && isExpanded && node.children.map(child => (
        <TreeNodeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          selectedDocId={selectedDocId}
          onSelectDoc={onSelectDoc}
          menuFolderId={menuFolderId}
          setMenuFolderId={setMenuFolderId}
          menuDocId={menuDocId}
          setMenuDocId={setMenuDocId}
          canEditFolder={canEditFolder}
          canDeleteFolder={canDeleteFolder}
          canDeleteDoc={canDeleteDoc}
          folders={folders}
          documents={documents}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onDeleteDoc={onDeleteDoc}
          onCreateFolder={onCreateFolder}
          onCreateDoc={onCreateDoc}
          canCreateFolder={canCreateFolder}
          canCreateDoc={canCreateDoc}
          canMoveDoc={canMoveDoc}
          canMoveFolder={canMoveFolder}
          dropHint={dropHint}
        />
      ))}
    </>
  );
}

function RootDropArea({
  children,
  active,
}: {
  children: React.ReactNode;
  active: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID, disabled: !active });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-full rounded-lg transition-colors ${
        active && isOver ? 'bg-indigo-50/80 ring-2 ring-inset ring-indigo-200' : ''
      }`}
    >
      {children}
    </div>
  );
}

const KnowledgeTreeSidebar: React.FC<KnowledgeTreeSidebarProps> = ({
  folders,
  documents,
  selectedDocId,
  canCreateFolder,
  canEditFolder,
  canDeleteFolder,
  canCreateDoc,
  canDeleteDoc,
  canMoveDoc,
  canMoveFolder,
  onSelectDoc,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onCreateDoc,
  onDeleteDoc,
  onMoveDocument,
  onMoveFolder,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [menuDocId, setMenuDocId] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<DragItem | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [search, setSearch] = useState('');

  const searchQuery = search.trim();
  const { data: searchResults = [], isFetching: searchLoading } = useKnowledgeDocumentSearch(searchQuery);
  const isSearchMode = searchQuery.length >= 1;

  const dndEnabled = (canMoveDoc || canMoveFolder) && !isSearchMode;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const tree = useMemo(() => buildKnowledgeTree(folders, documents), [folders, documents]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandFolder = (folderId: string) => {
    setExpanded(prev => {
      if (prev.has(folderId)) return prev;
      const next = new Set(prev);
      next.add(folderId);
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    setMenuFolderId(null);
    setMenuDocId(null);

    if (data?.type === 'document' && typeof data.docId === 'string') {
      const doc = documents.find(d => d.id === data.docId);
      setDraggingItem({
        type: 'document',
        id: data.docId,
        folderId: doc?.folderId ?? null,
        name: doc?.title.trim() || '无标题',
      });
      return;
    }

    if (data?.type === 'folder' && typeof data.folderId === 'string') {
      const folder = folders.find(f => f.id === data.folderId);
      setDraggingItem({
        type: 'folder',
        id: data.folderId,
        parentId: folder?.parentId ?? null,
        name: folder?.name ?? '文件夹',
      });
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const position = getDropPosition(event);
    const overId = event.over?.id != null ? String(event.over.id) : null;

    if (!overId || !position) {
      setDropHint(null);
      return;
    }

    if (overId === ROOT_DROP_ID) {
      setDropHint(null);
      return;
    }

    const row = parseRowDndId(overId);
    if (!row) {
      setDropHint(null);
      return;
    }

    if (draggingItem?.type === 'document' && row.kind === 'folder' && position === 'inside') {
      expandFolder(row.itemId);
      setDropHint({ rowId: row.itemId, position: 'inside' });
      return;
    }

    if (draggingItem?.type === 'document') {
      setDropHint({ rowId: row.itemId, position });
      return;
    }

    if (draggingItem?.type === 'folder' && row.kind === 'folder' && position === 'inside') {
      expandFolder(row.itemId);
    }

    setDropHint({ rowId: row.itemId, position });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeItem = draggingItem;
    setDraggingItem(null);
    setDropHint(null);

    const data = event.active.data.current;
    const position = getDropPosition(event);
    const overId = event.over?.id != null ? String(event.over.id) : null;

    if (!overId || !position || !data || !activeItem) return;

    if (data.type === 'document' && typeof data.docId === 'string') {
      const docId = data.docId;
      const current = documents.find(d => d.id === docId);
      if (!current) return;

      let plan: ReturnType<typeof planDocumentMove> = null;
      if (overId === ROOT_DROP_ID) {
        plan = planDocumentMove(docId, { type: 'root' }, folders, documents);
      } else {
        const row = parseRowDndId(overId);
        if (!row) return;
        plan = planDocumentMove(
          docId,
          { type: 'row', kind: row.kind, itemId: row.itemId, position },
          folders,
          documents,
        );
      }
      if (!plan) return;
      if (current.folderId === plan.folderId && current.sortOrder === plan.sortOrder) return;

      const body: { folderId?: string | null; sortOrder: number } = { sortOrder: plan.sortOrder };
      if (current.folderId !== plan.folderId) body.folderId = plan.folderId;
      onMoveDocument(docId, body);
      return;
    }

    if (data.type === 'folder' && typeof data.folderId === 'string') {
      const folderId = data.folderId;
      const current = folders.find(f => f.id === folderId);
      if (!current) return;

      let plan: ReturnType<typeof planFolderMove> = null;
      if (overId === ROOT_DROP_ID) {
        plan = planFolderMove(folderId, { type: 'root' }, folders, documents);
      } else {
        const row = parseRowDndId(overId);
        if (!row) return;
        plan = planFolderMove(
          folderId,
          { type: 'row', kind: row.kind, itemId: row.itemId, position },
          folders,
          documents,
        );
      }
      if (!plan) return;
      if (current.parentId === plan.parentId && current.sortOrder === plan.sortOrder) return;

      const body: { parentId?: string | null; sortOrder: number } = { sortOrder: plan.sortOrder };
      if (current.parentId !== plan.parentId) body.parentId = plan.parentId;
      onMoveFolder(folderId, body);
    }
  };

  const handleDragCancel = () => {
    setDraggingItem(null);
    setDropHint(null);
  };

  const treeRows = tree.map(node => (
      <TreeNodeRow
        key={node.id}
        node={node}
        depth={0}
        expanded={expanded}
        onToggle={toggle}
        selectedDocId={selectedDocId}
        onSelectDoc={onSelectDoc}
        menuFolderId={menuFolderId}
        setMenuFolderId={setMenuFolderId}
        menuDocId={menuDocId}
        setMenuDocId={setMenuDocId}
        canEditFolder={canEditFolder}
        canDeleteFolder={canDeleteFolder}
        canDeleteDoc={canDeleteDoc}
        folders={folders}
        documents={documents}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onDeleteDoc={onDeleteDoc}
        onCreateFolder={onCreateFolder}
        onCreateDoc={onCreateDoc}
        canCreateFolder={canCreateFolder}
        canCreateDoc={canCreateDoc}
        canMoveDoc={canMoveDoc}
        canMoveFolder={canMoveFolder}
        dropHint={dropHint}
      />
  ));

  const treeContent = tree.length === 0 ? (
    <p className="px-3 py-8 text-center text-xs text-slate-400">暂无文件夹或文档</p>
  ) : (
    treeRows
  );

  const scrollArea = (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" onClick={() => { setMenuFolderId(null); setMenuDocId(null); }}>
      {isSearchMode ? (
        searchLoading ? (
          <p className="px-3 py-8 text-center text-xs text-slate-400">搜索中…</p>
        ) : searchResults.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-slate-400">没有匹配的文档</p>
        ) : (
          searchResults.map(doc => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onSelectDoc(doc.id)}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                selectedDocId === doc.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate font-medium">{doc.title.trim() || '无标题'}</span>
            </button>
          ))
        )
      ) : dndEnabled ? (
        <RootDropArea active={Boolean(draggingItem)}>
          {treeContent}
        </RootDropArea>
      ) : (
        treeContent
      )}
    </div>
  );

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/60">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <BookOpen className="h-4 w-4 text-sky-500" />
          资料库
        </div>
        <div className="flex items-center gap-1">
          {canCreateFolder && (
            <button
              type="button"
              title="新建文件夹"
              onClick={() => onCreateFolder(null)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          )}
          {canCreateDoc && (
            <button
              type="button"
              title="新建文档"
              onClick={() => onCreateDoc(null)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="border-b border-slate-200 px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索文档…"
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
      {dndEnabled ? (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {scrollArea}
          <DragOverlay dropAnimation={null}>
            {draggingItem ? (
              <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-lg">
                {draggingItem.type === 'folder' ? (
                  <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                )}
                <span className="max-w-[180px] truncate">{draggingItem.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        scrollArea
      )}
    </aside>
  );
};

export default KnowledgeTreeSidebar;
