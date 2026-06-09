import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';
import { sanitizeCreate, sanitizeUpdate } from '../utils/request.js';
import type {
  KnowledgeDocumentDto,
  KnowledgeFolderDto,
  KnowledgeTreeResponse,
} from '../../../shared/types.js';

const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

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
    id: row.id,
    folderId: row.folderId,
    title: row.title,
    content: row.content,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
      select: {
        id: true,
        folderId: true,
        title: true,
        content: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  return {
    folders: folders.map(mapFolder),
    documents: documents.map(mapDocument),
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
) {
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
  });
  return rows.map(mapDocument);
}

export async function getDocument(db: TenantPrismaClient, id: string) {
  const row = await db.knowledgeDocument.findFirst({ where: { id } });
  if (!row) throw new AppError(404, '文档不存在');
  return mapDocument(row);
}

export async function createDocument(db: TenantPrismaClient, tenantId: string, body: unknown) {
  const data = sanitizeCreate(body as Record<string, unknown>);
  const title = String(data.title ?? '').trim();
  if (!title) throw new AppError(400, '文档标题不能为空');
  const folderId = data.folderId == null || data.folderId === ''
    ? null
    : String(data.folderId);
  await assertFolderExists(db, folderId);
  const row = await db.knowledgeDocument.create({
    data: {
      id: genId('kd'),
      tenantId,
      title,
      folderId,
      content: typeof data.content === 'string' ? data.content : '',
      sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
    },
  });
  return mapDocument(row);
}

export async function updateDocument(db: TenantPrismaClient, id: string, body: unknown) {
  const existing = await db.knowledgeDocument.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, '文档不存在');
  const data = sanitizeUpdate(body as Record<string, unknown>);
  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) {
    patch.title = String(data.title).trim();
  }
  if (data.content !== undefined) {
    patch.content = typeof data.content === 'string' ? data.content : '';
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
  return mapDocument(row);
}

export async function deleteDocument(db: TenantPrismaClient, id: string) {
  const existing = await db.knowledgeDocument.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, '文档不存在');
  await db.knowledgeDocument.delete({ where: { id } });
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
