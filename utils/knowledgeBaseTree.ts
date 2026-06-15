import type { KnowledgeDocumentSummaryDto, KnowledgeFolderDto } from '../types';

export interface KnowledgeTreeNode {
  id: string;
  type: 'folder' | 'document';
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: KnowledgeTreeNode[];
  /** 仅 document（摘要，树节点不含正文） */
  doc?: KnowledgeDocumentSummaryDto;
}

export function buildKnowledgeTree(
  folders: KnowledgeFolderDto[],
  documents: KnowledgeDocumentSummaryDto[],
): KnowledgeTreeNode[] {
  const folderMap = new Map<string, KnowledgeTreeNode>();
  for (const f of folders) {
    folderMap.set(f.id, {
      id: f.id,
      type: 'folder',
      name: f.name,
      parentId: f.parentId,
      sortOrder: f.sortOrder,
      children: [],
    });
  }
  const roots: KnowledgeTreeNode[] = [];
  for (const node of folderMap.values()) {
    if (node.parentId && folderMap.has(node.parentId)) {
      folderMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  for (const doc of documents) {
    const docNode: KnowledgeTreeNode = {
      id: doc.id,
      type: 'document',
      name: doc.title.trim() || '无标题',
      parentId: doc.folderId,
      sortOrder: doc.sortOrder,
      children: [],
      doc,
    };
    if (doc.folderId && folderMap.has(doc.folderId)) {
      folderMap.get(doc.folderId)!.children.push(docNode);
    } else {
      roots.push(docNode);
    }
  }
  const sortNodes = (nodes: KnowledgeTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);
  return roots;
}

export function folderHasChildren(
  folderId: string,
  folders: KnowledgeFolderDto[],
  documents: KnowledgeDocumentSummaryDto[],
): boolean {
  return (
    folders.some(f => f.parentId === folderId)
    || documents.some(d => d.folderId === folderId)
  );
}

export interface KnowledgeTreeSibling {
  id: string;
  kind: 'folder' | 'document';
  sortOrder: number;
}

/** 同一父级下的文件夹与文档（与 buildKnowledgeTree 排序一致） */
export function listSiblingsAtParent(
  parentId: string | null,
  folders: KnowledgeFolderDto[],
  documents: KnowledgeDocumentSummaryDto[],
): KnowledgeTreeSibling[] {
  const items: KnowledgeTreeSibling[] = [];
  for (const f of folders) {
    if (f.parentId === parentId) {
      items.push({ id: f.id, kind: 'folder', sortOrder: f.sortOrder });
    }
  }
  for (const d of documents) {
    if (d.folderId === parentId) {
      items.push({ id: d.id, kind: 'document', sortOrder: d.sortOrder });
    }
  }
  items.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return 0;
  });
  return items;
}

export function resolveInsertSortOrder(
  siblings: KnowledgeTreeSibling[],
  insertIndex: number,
): number {
  if (siblings.length === 0) return 0;
  if (insertIndex <= 0) return siblings[0].sortOrder - 10;
  if (insertIndex >= siblings.length) return siblings[siblings.length - 1].sortOrder + 10;
  const prev = siblings[insertIndex - 1].sortOrder;
  const next = siblings[insertIndex].sortOrder;
  if (prev === next) return prev + 1;
  return Math.floor((prev + next) / 2);
}

/** folderId 是否为 ancestorId 的子孙文件夹 */
export type KnowledgeDropPosition = 'before' | 'after' | 'inside';

export function planFolderMove(
  folderId: string,
  target:
    | { type: 'root' }
    | { type: 'row'; kind: 'folder' | 'document'; itemId: string; position: KnowledgeDropPosition },
  folders: KnowledgeFolderDto[],
  documents: KnowledgeDocumentSummaryDto[],
): { parentId: string | null; sortOrder: number } | null {
  const excludeSelf = (items: KnowledgeTreeSibling[]) =>
    items.filter(s => !(s.kind === 'folder' && s.id === folderId));

  if (target.type === 'root') {
    const siblings = excludeSelf(listSiblingsAtParent(null, folders, documents));
    return { parentId: null, sortOrder: resolveInsertSortOrder(siblings, siblings.length) };
  }

  const { kind, itemId, position } = target;

  if (position === 'inside') {
    if (kind !== 'folder') return null;
    if (itemId === folderId) return null;
    if (isDescendantFolder(itemId, folderId, folders)) return null;
    const siblings = excludeSelf(listSiblingsAtParent(itemId, folders, documents));
    return {
      parentId: itemId,
      sortOrder: resolveInsertSortOrder(siblings, siblings.length),
    };
  }

  const parentId = kind === 'folder'
    ? (folders.find(f => f.id === itemId)?.parentId ?? null)
    : (documents.find(d => d.id === itemId)?.folderId ?? null);

  const siblings = excludeSelf(listSiblingsAtParent(parentId, folders, documents));
  const targetIndex = siblings.findIndex(s => s.id === itemId);
  if (targetIndex < 0) return null;
  const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
  return {
    parentId,
    sortOrder: resolveInsertSortOrder(siblings, insertIndex),
  };
}

export function planDocumentMove(
  docId: string,
  target:
    | { type: 'root' }
    | { type: 'row'; kind: 'folder' | 'document'; itemId: string; position: KnowledgeDropPosition },
  folders: KnowledgeFolderDto[],
  documents: KnowledgeDocumentSummaryDto[],
): { folderId: string | null; sortOrder: number } | null {
  const excludeSelf = (items: KnowledgeTreeSibling[]) =>
    items.filter(s => !(s.kind === 'document' && s.id === docId));

  if (target.type === 'root') {
    const siblings = excludeSelf(listSiblingsAtParent(null, folders, documents));
    return { folderId: null, sortOrder: resolveInsertSortOrder(siblings, siblings.length) };
  }

  const { kind, itemId, position } = target;

  if (position === 'inside') {
    if (kind !== 'folder') return null;
    const siblings = excludeSelf(listSiblingsAtParent(itemId, folders, documents));
    return {
      folderId: itemId,
      sortOrder: resolveInsertSortOrder(siblings, siblings.length),
    };
  }

  const folderId = kind === 'folder'
    ? (folders.find(f => f.id === itemId)?.parentId ?? null)
    : (documents.find(d => d.id === itemId)?.folderId ?? null);

  const siblings = excludeSelf(listSiblingsAtParent(folderId, folders, documents));
  const targetIndex = siblings.findIndex(s => s.id === itemId);
  if (targetIndex < 0) return null;
  const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
  return {
    folderId,
    sortOrder: resolveInsertSortOrder(siblings, insertIndex),
  };
}

export function isDescendantFolder(
  folderId: string,
  ancestorId: string,
  folders: KnowledgeFolderDto[],
): boolean {
  if (folderId === ancestorId) return true;
  const parentById = new Map(folders.map(f => [f.id, f.parentId]));
  let current = parentById.get(folderId) ?? null;
  const visited = new Set<string>();
  while (current) {
    if (current === ancestorId) return true;
    if (visited.has(current)) break;
    visited.add(current);
    current = parentById.get(current) ?? null;
  }
  return false;
}

export function collectFolderIds(folders: KnowledgeFolderDto[], parentId: string | null): string[] {
  const ids: string[] = [];
  for (const f of folders) {
    if (f.parentId === parentId) {
      ids.push(f.id);
      ids.push(...collectFolderIds(folders, f.id));
    }
  }
  return ids;
}
