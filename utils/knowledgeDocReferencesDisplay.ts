import { knowledgeBase } from '../services/api';
import type { KnowledgeDocumentReferencesResponse } from '../types';

export function formatKnowledgeReferencesForDisplay(
  refs: KnowledgeDocumentReferencesResponse,
): string {
  const parts: string[] = [];
  if (refs.products.length > 0) {
    parts.push(`产品：${refs.products.map(p => `${p.name}(${p.sku})`).join('、')}`);
  }
  if (refs.devStyles.length > 0) {
    parts.push(`开发款：${refs.devStyles.map(s => s.name).join('、')}`);
  }
  return parts.join('；');
}

export function hasKnowledgeReferences(refs: KnowledgeDocumentReferencesResponse): boolean {
  return refs.products.length > 0 || refs.devStyles.length > 0;
}

export async function fetchKnowledgeDocumentReferences(docId: string) {
  return knowledgeBase.getDocumentReferences(docId);
}
