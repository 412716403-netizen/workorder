import { request, buildQs, authorizedFetch, BINARY_FETCH_TIMEOUT_MS } from './_client';
import type {
  KnowledgeFolderDto,
  KnowledgeDocumentSummaryDto,
  KnowledgeDocumentDto,
  KnowledgeTreeResponse,
  KnowledgeDocumentReferencesResponse,
  KnowledgeAssetUploadResponse,
} from '../../types';

export const knowledgeBase = {
  getTree: () => request<KnowledgeTreeResponse>('/knowledge-base/tree'),

  listFolders: (params?: { parentId?: string | null }) =>
    request<KnowledgeFolderDto[]>(`/knowledge-base/folders${buildQs(params ?? {})}`),

  createFolder: (body: { name: string; parentId?: string | null; sortOrder?: number }) =>
    request<KnowledgeFolderDto>('/knowledge-base/folders', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateFolder: (id: string, body: { name?: string; parentId?: string | null; sortOrder?: number }) =>
    request<KnowledgeFolderDto>(`/knowledge-base/folders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteFolder: (id: string) =>
    request<{ ok: boolean }>(`/knowledge-base/folders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  listDocuments: (params?: { folderId?: string | null; search?: string }) =>
    request<KnowledgeDocumentSummaryDto[]>(`/knowledge-base/documents${buildQs(params ?? {})}`),

  getDocument: (id: string) =>
    request<KnowledgeDocumentDto>(`/knowledge-base/documents/${encodeURIComponent(id)}`),

  getDocumentReferences: (id: string) =>
    request<KnowledgeDocumentReferencesResponse>(
      `/knowledge-base/documents/${encodeURIComponent(id)}/references`,
    ),

  createDocument: (body: { title: string; folderId?: string | null; content?: string; sortOrder?: number }) =>
    request<KnowledgeDocumentDto>('/knowledge-base/documents', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateDocument: (
    id: string,
    body: {
      title?: string;
      folderId?: string | null;
      content?: string;
      sortOrder?: number;
      expectedUpdatedAt?: string;
    },
  ) =>
    request<KnowledgeDocumentDto>(`/knowledge-base/documents/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteDocument: (id: string) =>
    request<{ ok: boolean }>(`/knowledge-base/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  uploadAsset: (body: { data: string; mimeType: string; fileName?: string }) =>
    request<KnowledgeAssetUploadResponse>('/knowledge-base/assets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

/** 资源 URL 形如 `/api/knowledge-base/assets/{id}`，转换为相对 API_BASE 的路径 */
function assetUrlToApiPath(assetUrl: string): string {
  return assetUrl.replace(/^\/api(?=\/)/, '');
}

/** 带鉴权拉取附件二进制（供 Excel/Word 解析）；data:/blob: 直转 Blob，供开发节点等本地附件预览。 */
export async function fetchKnowledgeAssetBlob(assetUrl: string): Promise<Blob> {
  const raw = String(assetUrl ?? '').trim();
  if (raw.startsWith('data:') || raw.startsWith('blob:')) {
    const res = await fetch(raw);
    if (!res.ok) throw new Error('加载附件失败');
    return res.blob();
  }
  const res = await authorizedFetch(assetUrlToApiPath(raw), { timeoutMs: BINARY_FETCH_TIMEOUT_MS });
  if (!res.ok) throw new Error('加载附件失败');
  return res.blob();
}

/** 下载附件：拉取 Blob 后以原始文件名触发保存（避免依赖跨站 Cookie）。 */
export async function downloadKnowledgeAsset(assetUrl: string, fileName: string): Promise<void> {
  const blob = await fetchKnowledgeAssetBlob(assetUrl);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName || 'attachment';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

export type { KnowledgeTreeResponse };
