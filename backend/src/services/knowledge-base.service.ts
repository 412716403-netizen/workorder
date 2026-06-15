import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';
import { sanitizeCreate, sanitizeUpdate } from '../utils/request.js';
import { extractKnowledgeAssetIdsFromHtml } from '../../../shared/knowledgeAssetRefs.js';
import {
  KNOWLEDGE_DOCUMENT_CONTENT_MAX_CHARS,
  type KnowledgeDocumentDto,
  type KnowledgeDocumentReferencesResponse,
  type KnowledgeDocumentSummaryDto,
  type KnowledgeFolderDto,
  type KnowledgeTreeResponse,
} from '../../../shared/types.js';
import { sanitizeKnowledgeHtml } from '../utils/sanitizeKnowledgeHtml.js';
import { gcKnowledgeAssets } from '../utils/knowledgeAssetGc.js';
import {
  findKnowledgeDocumentReferences,
  formatKnowledgeDocumentReferencesMessage,
  hasKnowledgeDocumentReferences,
} from '../utils/knowledgeDocReferences.js';

const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const DOCUMENT_SUMMARY_SELECT = {
  id: true,
  folderId: true,
  title: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

function mapFolder(row: {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeFolderDto {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapDocumentSummary(row: {
  id: string;
  folderId: string | null;
  title: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeDocumentSummaryDto {
  return {
    id: row.id,
    folderId: row.folderId,
    title: row.title,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapDocument(row: {
  id: string;
  folderId: string | null;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeDocumentDto {
  return {
    ...mapDocumentSummary(row),
    content: sanitizeKnowledgeHtml(row.content),
  };
}

function normalizeContent(raw: unknown): string {
  const content = typeof raw === 'string' ? raw : '';
  if (content.length > KNOWLEDGE_DOCUMENT_CONTENT_MAX_CHARS) {
    throw new AppError(
      400,
      `正文不能超过 ${Math.floor(KNOWLEDGE_DOCUMENT_CONTENT_MAX_CHARS / 1024)}KB`,
    );
  }
  return sanitizeKnowledgeHtml(content);
}

function assertExpectedUpdatedAt(
  existingUpdatedAt: Date,
  expectedUpdatedAt: unknown,
): void {
  if (expectedUpdatedAt == null || expectedUpdatedAt === '') return;
  const expected = String(expectedUpdatedAt).trim();
  if (!expected) return;
  const existingMs = existingUpdatedAt.getTime();
  const expectedMs = Date.parse(expected);
  if (Number.isNaN(expectedMs) || existingMs !== expectedMs) {
    throw new AppError(409, '文档已被他人修改，请刷新后重试');
  }
}

async function assertFolderExists(db: TenantPrismaClient, folderId: string | null | undefined) {
  if (!folderId) return;
  const folder = await db.knowledgeFolder.findFirst({ where: { id: folderId } });
  if (!folder) throw new AppError(404, '文件夹不存在');
}

export async function getTree(db: TenantPrismaClient): Promise<KnowledgeTreeResponse> {
  const [folders, documents] = await Promise.all([
    db.knowledgeFolder.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    db.knowledgeDocument.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: DOCUMENT_SUMMARY_SELECT,
    }),
  ]);
  return {
    folders: folders.map(mapFolder),
    documents: documents.map(mapDocumentSummary),
  };
}

export async function listFolders(
  db: TenantPrismaClient,
  opts: { parentId?: string | null },
) {
  const parentId = opts.parentId ?? null;
  const rows = await db.knowledgeFolder.findMany({
    where: { parentId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(mapFolder);
}

export async function createFolder(db: TenantPrismaClient, tenantId: string, body: unknown) {
  const data = sanitizeCreate(body as Record<string, unknown>);
  const name = String(data.name ?? '').trim();
  if (!name) throw new AppError(400, '文件夹名称不能为空');
  const parentId = data.parentId == null || data.parentId === ''
    ? null
    : String(data.parentId);
  await assertFolderExists(db, parentId);
  const row = await db.knowledgeFolder.create({
    data: {
      id: genId('kf'),
      tenantId,
      name,
      parentId,
      sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
    },
  });
  return mapFolder(row);
}

export async function updateFolder(db: TenantPrismaClient, id: string, body: unknown) {
  const existing = await db.knowledgeFolder.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, '文件夹不存在');
  const data = sanitizeUpdate(body as Record<string, unknown>);
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw new AppError(400, '文件夹名称不能为空');
    patch.name = name;
  }
  if (data.parentId !== undefined) {
    const parentId = data.parentId == null || data.parentId === ''
      ? null
      : String(data.parentId);
    if (parentId === id) throw new AppError(400, '不能将文件夹移动到自身');
    if (parentId) {
      const allFolders = await db.knowledgeFolder.findMany({
        select: { id: true, parentId: true },
      });
      let cursor: string | null = parentId;
      const visited = new Set<string>();
      while (cursor) {
        if (cursor === id) {
          throw new AppError(400, '不能将文件夹移动到其子文件夹中');
        }
        if (visited.has(cursor)) break;
        visited.add(cursor);
        const parent = allFolders.find(f => f.id === cursor);
        cursor = parent?.parentId ?? null;
      }
    }
    await assertFolderExists(db, parentId);
    patch.parentId = parentId;
  }
  if (typeof data.sortOrder === 'number') patch.sortOrder = data.sortOrder;
  const row = await db.knowledgeFolder.update({ where: { id }, data: patch });
  return mapFolder(row);
}

export async function deleteFolder(db: TenantPrismaClient, id: string) {
  const existing = await db.knowledgeFolder.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, '文件夹不存在');
  const [childCount, docCount] = await Promise.all([
    db.knowledgeFolder.count({ where: { parentId: id } }),
    db.knowledgeDocument.count({ where: { folderId: id } }),
  ]);
  if (childCount > 0 || docCount > 0) {
    throw new AppError(400, '请先删除子文件夹与文档后再删除该文件夹');
  }
  await db.knowledgeFolder.delete({ where: { id } });
  return { ok: true };
}

export async function listDocuments(
  db: TenantPrismaClient,
  opts: { folderId?: string | null; search?: string },
): Promise<KnowledgeDocumentSummaryDto[]> {
  const where: Record<string, unknown> = {};
  if (opts.folderId !== undefined) {
    where.folderId = opts.folderId ?? null;
  }
  if (opts.search?.trim()) {
    const q = opts.search.trim();
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { content: { contains: q, mode: 'insensitive' } },
    ];
  }
  const rows = await db.knowledgeDocument.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    select: DOCUMENT_SUMMARY_SELECT,
  });
  return rows.map(mapDocumentSummary);
}

export async function getDocument(db: TenantPrismaClient, id: string) {
  const row = await db.knowledgeDocument.findFirst({ where: { id } });
  if (!row) throw new AppError(404, '文档不存在');
  return mapDocument(row);
}

export async function getDocumentReferences(
  db: TenantPrismaClient,
  id: string,
): Promise<KnowledgeDocumentReferencesResponse> {
  const existing = await db.knowledgeDocument.findFirst({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError(404, '文档不存在');
  return findKnowledgeDocumentReferences(db, id);
}

export async function createDocument(db: TenantPrismaClient, tenantId: string, body: unknown) {
  const data = sanitizeCreate(body as Record<string, unknown>);
  const title = String(data.title ?? '').trim();
  if (!title) throw new AppError(400, '文档标题不能为空');
  const folderId = data.folderId == null || data.folderId === ''
    ? null
    : String(data.folderId);
  await assertFolderExists(db, folderId);
  const content = data.content !== undefined ? normalizeContent(data.content) : '';
  const row = await db.knowledgeDocument.create({
    data: {
      id: genId('kd'),
      tenantId,
      title,
      folderId,
      content,
      sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
    },
  });
  return mapDocument(row);
}

export async function updateDocument(db: TenantPrismaClient, id: string, body: unknown) {
  const existing = await db.knowledgeDocument.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, '文档不存在');
  const data = sanitizeUpdate(body as Record<string, unknown>);
  assertExpectedUpdatedAt(existing.updatedAt, data.expectedUpdatedAt);

  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) {
    const title = String(data.title).trim();
    if (!title) throw new AppError(400, '文档标题不能为空');
    patch.title = title;
  }
  let contentChanged = false;
  let newContent = existing.content;
  if (data.content !== undefined) {
    newContent = normalizeContent(data.content);
    patch.content = newContent;
    contentChanged = newContent !== existing.content;
  }
  if (data.folderId !== undefined) {
    const folderId = data.folderId == null || data.folderId === ''
      ? null
      : String(data.folderId);
    await assertFolderExists(db, folderId);
    patch.folderId = folderId;
  }
  if (typeof data.sortOrder === 'number') patch.sortOrder = data.sortOrder;
  const row = await db.knowledgeDocument.update({ where: { id }, data: patch });

  if (contentChanged) {
    const oldIds = new Set(extractKnowledgeAssetIdsFromHtml(existing.content));
    const newIds = new Set(extractKnowledgeAssetIdsFromHtml(newContent));
    const removed = [...oldIds].filter(aid => !newIds.has(aid));
    if (removed.length > 0) {
      await gcKnowledgeAssets(db, removed);
    }
  }

  return mapDocument(row);
}

export async function deleteDocument(db: TenantPrismaClient, id: string) {
  const existing = await db.knowledgeDocument.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, '文档不存在');

  const refs = await findKnowledgeDocumentReferences(db, id);
  if (hasKnowledgeDocumentReferences(refs)) {
    const detail = formatKnowledgeDocumentReferencesMessage(refs);
    throw new AppError(409, `文档仍被引用，无法删除：${detail}`);
  }

  const assetIds = extractKnowledgeAssetIdsFromHtml(existing.content);
  await db.knowledgeDocument.delete({ where: { id } });
  if (assetIds.length > 0) {
    await gcKnowledgeAssets(db, assetIds);
  }
  return { ok: true };
}

function decodeBase64Payload(data: string): Buffer {
  const trimmed = data.trim();
  const base64 = trimmed.includes(',') ? trimmed.split(',').pop()! : trimmed;
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    throw new AppError(400, '图片数据格式无效');
  }
  if (!buf.length) throw new AppError(400, '图片数据为空');
  if (buf.length > MAX_ASSET_BYTES) {
    throw new AppError(400, `图片不能超过 ${MAX_ASSET_BYTES / 1024 / 1024}MB`);
  }
  return buf;
}

export async function uploadAsset(
  db: TenantPrismaClient,
  tenantId: string,
  body: { data?: string; mimeType?: string },
) {
  const mimeType = String(body.mimeType ?? '').trim().toLowerCase();
  if (!mimeType || !ALLOWED_IMAGE_MIME.has(mimeType)) {
    throw new AppError(400, '不支持的图片格式');
  }
  const dataStr = body.data;
  if (!dataStr) throw new AppError(400, '缺少图片数据');
  const buf = decodeBase64Payload(dataStr);
  const id = genId('ka');
  await db.knowledgeAsset.create({
    data: {
      id,
      tenantId,
      mimeType,
      sizeBytes: buf.length,
      data: buf,
    },
  });
  return {
    id,
    url: `/api/knowledge-base/assets/${id}`,
    mimeType,
    sizeBytes: buf.length,
  };
}

export async function getAsset(db: TenantPrismaClient, id: string) {
  const row = await db.knowledgeAsset.findFirst({
    where: { id },
    select: { mimeType: true, data: true },
  });
  if (!row) throw new AppError(404, '资源不存在');
  return { mimeType: row.mimeType, data: row.data };
}
