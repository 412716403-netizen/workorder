import { request, buildQs } from './_client';
import type {
  KnowledgeFolderDto,
  KnowledgeDocumentDto,
  KnowledgeTreeResponse,
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
    request<KnowledgeDocumentDto[]>(`/knowledge-base/documents${buildQs(params ?? {})}`),

  getDocument: (id: string) =>
    request<KnowledgeDocumentDto>(`/knowledge-base/documents/${encodeURIComponent(id)}`),

  createDocument: (body: { title: string; folderId?: string | null; content?: string; sortOrder?: number }) =>
    request<KnowledgeDocumentDto>('/knowledge-base/documents', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateDocument: (
    id: string,
    body: { title?: string; folderId?: string | null; content?: string; sortOrder?: number },
  ) =>
    request<KnowledgeDocumentDto>(`/knowledge-base/documents/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteDocument: (id: string) =>
    request<{ ok: boolean }>(`/knowledge-base/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  uploadAsset: (body: { data: string; mimeType: string }) =>
    request<KnowledgeAssetUploadResponse>('/knowledge-base/assets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export type { KnowledgeTreeResponse };
