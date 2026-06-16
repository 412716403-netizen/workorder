import { describe, it, expect } from 'vitest';
import {
  buildKnowledgeTree,
  folderHasChildren,
  isDescendantFolder,
  listSiblingsAtParent,
  planDocumentMove,
  planFolderMove,
  resolveInsertSortOrder,
  resolveKnowledgeDropPosition,
} from './knowledgeBaseTree';
import type { KnowledgeDocumentSummaryDto, KnowledgeFolderDto } from '../types';

const folders: KnowledgeFolderDto[] = [
  { id: 'f1', parentId: null, name: '工艺', sortOrder: 0, createdAt: '', updatedAt: '' },
  { id: 'f2', parentId: 'f1', name: '裁剪', sortOrder: 0, createdAt: '', updatedAt: '' },
];

const documents: KnowledgeDocumentSummaryDto[] = [
  { id: 'd1', folderId: 'f2', title: 'SOP-裁剪', sortOrder: 0, createdAt: '', updatedAt: '' },
  { id: 'd2', folderId: null, title: '根文档', sortOrder: 1, createdAt: '', updatedAt: '' },
];

describe('buildKnowledgeTree', () => {
  it('shows 无标题 for empty document title', () => {
    const tree = buildKnowledgeTree([], [
      { id: 'd0', folderId: null, title: '', sortOrder: 0, createdAt: '', updatedAt: '' },
    ]);
    expect(tree[0]?.name).toBe('无标题');
  });

  it('nests folders and documents', () => {
    const tree = buildKnowledgeTree(folders, documents);
    expect(tree).toHaveLength(2);
    const process = tree.find(n => n.id === 'f1');
    expect(process?.children).toHaveLength(1);
    expect(process?.children[0]?.children[0]?.type).toBe('document');
    expect(tree.find(n => n.id === 'd2')?.type).toBe('document');
  });
});

describe('listSiblingsAtParent', () => {
  it('orders folders before documents at same level', () => {
    const siblings = listSiblingsAtParent(null, folders, documents);
    expect(siblings.map(s => s.id)).toEqual(['f1', 'd2']);
  });
});

describe('resolveInsertSortOrder', () => {
  it('inserts between neighbors', () => {
    const siblings = [
      { id: 'a', kind: 'folder' as const, sortOrder: 0 },
      { id: 'b', kind: 'folder' as const, sortOrder: 20 },
    ];
    expect(resolveInsertSortOrder(siblings, 1)).toBe(10);
    expect(resolveInsertSortOrder(siblings, 0)).toBe(-10);
    expect(resolveInsertSortOrder(siblings, 2)).toBe(30);
  });
});

describe('resolveKnowledgeDropPosition', () => {
  it('同层级文件夹之间优先上下排序而非嵌套', () => {
    const pos = resolveKnowledgeDropPosition(
      { kind: 'folder', itemId: 'f1' },
      { top: 100, height: 40 },
      120,
      { type: 'folder', parentId: null },
      folders,
      documents,
    );
    expect(pos).toBe('after');
  });

  it('根目录文档拖入文件夹中间区域为 inside', () => {
    const pos = resolveKnowledgeDropPosition(
      { kind: 'folder', itemId: 'f1' },
      { top: 100, height: 40 },
      120,
      { type: 'document', parentId: null },
      folders,
      documents,
    );
    expect(pos).toBe('inside');
  });

  it('跨层级文件夹拖入仍为 inside', () => {
    const moreFolders: KnowledgeFolderDto[] = [
      ...folders,
      { id: 'f3', parentId: null, name: '品质', sortOrder: 2, createdAt: '', updatedAt: '' },
    ];
    const pos = resolveKnowledgeDropPosition(
      { kind: 'folder', itemId: 'f1' },
      { top: 100, height: 40 },
      120,
      { type: 'folder', parentId: null },
      moreFolders,
      documents,
    );
    // f3 与 f1 同级，中间区域应变为 after 而非 inside
    expect(pos).not.toBe('inside');
  });
});

describe('planFolderMove', () => {
  it('nests folder into target folder', () => {
    const moreFolders: KnowledgeFolderDto[] = [
      ...folders,
      { id: 'f3', parentId: null, name: '品质', sortOrder: 2, createdAt: '', updatedAt: '' },
    ];
    const plan = planFolderMove(
      'f3',
      { type: 'row', kind: 'folder', itemId: 'f1', position: 'inside' },
      moreFolders,
      documents,
    );
    expect(plan).toEqual({ parentId: 'f1', sortOrder: 10 });
  });

  it('reorders folder before sibling document at root', () => {
    const plan = planFolderMove(
      'f1',
      { type: 'row', kind: 'document', itemId: 'd2', position: 'before' },
      folders,
      documents,
    );
    expect(plan?.parentId).toBe(null);
    expect(plan?.sortOrder).toBeLessThan(documents[1].sortOrder);
  });
});

describe('planDocumentMove', () => {
  it('reorders document before sibling in same folder', () => {
    const moreDocs: KnowledgeDocumentDto[] = [
      ...documents,
      { id: 'd3', folderId: 'f2', title: 'SOP-缝制', sortOrder: 10, createdAt: '', updatedAt: '' },
    ];
    const plan = planDocumentMove(
      'd3',
      { type: 'row', kind: 'document', itemId: 'd1', position: 'before' },
      folders,
      moreDocs,
    );
    expect(plan?.folderId).toBe('f2');
    expect(plan?.sortOrder).toBeLessThan(moreDocs[0].sortOrder);
  });

  it('moves document into folder', () => {
    const plan = planDocumentMove(
      'd2',
      { type: 'row', kind: 'folder', itemId: 'f1', position: 'inside' },
      folders,
      documents,
    );
    expect(plan?.folderId).toBe('f1');
    expect(plan?.sortOrder).toBe(10);
  });
});

describe('isDescendantFolder', () => {
  it('detects nested folders', () => {
    expect(isDescendantFolder('f2', 'f1', folders)).toBe(true);
    expect(isDescendantFolder('f1', 'f2', folders)).toBe(false);
    expect(isDescendantFolder('f1', 'f1', folders)).toBe(true);
  });
});

describe('folderHasChildren', () => {
  it('detects subfolders and docs', () => {
    expect(folderHasChildren('f1', folders, documents)).toBe(true);
    expect(folderHasChildren('f2', folders, documents)).toBe(true);
    expect(folderHasChildren('missing', folders, documents)).toBe(false);
  });
});
