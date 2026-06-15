import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { knowledgeBase } from '../services/api';
import { useAuthOptional } from '../contexts/AuthContext';
import { knowledgeBaseQueryKeys } from './knowledgeBaseQueryKeys';
import type {
  KnowledgeDocumentDto,
  KnowledgeDocumentSummaryDto,
  KnowledgeFolderDto,
  KnowledgeTreeResponse,
} from '../types';

export function useKnowledgeBaseTree() {
  const auth = useAuthOptional();
  const tenantId = auth?.tenantCtx?.tenantId;
  return useQuery({
    queryKey: knowledgeBaseQueryKeys.tree(tenantId),
    queryFn: () => knowledgeBase.getTree(),
    enabled: !!tenantId,
  });
}

export function useKnowledgeDocument(docId: string | null) {
  const auth = useAuthOptional();
  const tenantId = auth?.tenantCtx?.tenantId;
  return useQuery({
    queryKey: knowledgeBaseQueryKeys.document(tenantId, docId),
    queryFn: () => knowledgeBase.getDocument(docId!),
    enabled: !!tenantId && !!docId,
  });
}

export function useKnowledgeDocumentSearch(search: string) {
  const auth = useAuthOptional();
  const tenantId = auth?.tenantCtx?.tenantId;
  const q = search.trim();
  return useQuery({
    queryKey: knowledgeBaseQueryKeys.search(tenantId, q),
    queryFn: () => knowledgeBase.listDocuments({ search: q }),
    enabled: !!tenantId && q.length >= 1,
  });
}

export function useKnowledgeBaseMutations() {
  const auth = useAuthOptional();
  const tenantId = auth?.tenantCtx?.tenantId;
  const qc = useQueryClient();
  const treeKey = knowledgeBaseQueryKeys.tree(tenantId);

  const invalidateTree = () => qc.invalidateQueries({ queryKey: treeKey });
  const invalidateDoc = (id: string) =>
    qc.invalidateQueries({ queryKey: knowledgeBaseQueryKeys.document(tenantId, id) });

  const patchTreeDocumentSummary = (doc: KnowledgeDocumentSummaryDto) => {
    qc.setQueryData<KnowledgeTreeResponse | undefined>(treeKey, old => {
      if (!old) return old;
      return {
        ...old,
        documents: old.documents.map(d =>
          d.id === doc.id
            ? {
                ...d,
                title: doc.title,
                folderId: doc.folderId,
                sortOrder: doc.sortOrder,
                updatedAt: doc.updatedAt,
              }
            : d,
        ),
      };
    });
  };

  const createFolder = useMutation({
    mutationFn: knowledgeBase.createFolder,
    onSuccess: invalidateTree,
  });

  const updateFolder = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof knowledgeBase.updateFolder>[1] }) =>
      knowledgeBase.updateFolder(id, body),
    onSuccess: invalidateTree,
  });

  const deleteFolder = useMutation({
    mutationFn: knowledgeBase.deleteFolder,
    onSuccess: invalidateTree,
  });

  const createDocument = useMutation({
    mutationFn: knowledgeBase.createDocument,
    onSuccess: (doc: KnowledgeDocumentDto) => {
      invalidateTree();
      qc.setQueryData(knowledgeBaseQueryKeys.document(tenantId, doc.id), doc);
    },
  });

  const updateDocument = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof knowledgeBase.updateDocument>[1] }) =>
      knowledgeBase.updateDocument(id, body),
    onSuccess: (doc: KnowledgeDocumentDto) => {
      patchTreeDocumentSummary(doc);
      qc.setQueryData(knowledgeBaseQueryKeys.document(tenantId, doc.id), doc);
    },
  });

  const deleteDocument = useMutation({
    mutationFn: knowledgeBase.deleteDocument,
    onSuccess: (_res, docId) => {
      invalidateTree();
      qc.removeQueries({ queryKey: knowledgeBaseQueryKeys.document(tenantId, docId) });
    },
  });

  const uploadAsset = useMutation({
    mutationFn: knowledgeBase.uploadAsset,
  });

  return {
    createFolder,
    updateFolder,
    deleteFolder,
    createDocument,
    updateDocument,
    deleteDocument,
    uploadAsset,
    invalidateDoc,
  };
}

export type { KnowledgeFolderDto, KnowledgeDocumentDto, KnowledgeDocumentSummaryDto };
