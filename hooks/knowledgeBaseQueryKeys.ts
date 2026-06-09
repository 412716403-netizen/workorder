export const knowledgeBaseQueryKeys = {
  all: ['knowledge-base'] as const,
  tree: (tenantId: string | undefined) => [...knowledgeBaseQueryKeys.all, tenantId, 'tree'] as const,
  document: (tenantId: string | undefined, id: string | null) =>
    [...knowledgeBaseQueryKeys.all, tenantId, 'document', id] as const,
};
