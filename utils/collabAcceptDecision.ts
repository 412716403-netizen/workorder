import type { ProductCategory } from '../types';
import type { CollabAcceptCategoryDecision } from '../shared/types';

export function initCollabAcceptCategoryFromPayload(
  payloadCategoryName: string | null | undefined,
  categories: ProductCategory[],
): {
  categoryDecision: CollabAcceptCategoryDecision;
  categoryId: string;
  categoryNameToCreate: string;
} {
  const trim = (payloadCategoryName ?? '').trim();
  if (!trim) {
    return { categoryDecision: 'none', categoryId: '', categoryNameToCreate: '' };
  }
  const hit = categories.find(c => (c.name ?? '').trim() === trim);
  if (hit) {
    return { categoryDecision: 'existing', categoryId: hit.id, categoryNameToCreate: trim };
  }
  return { categoryDecision: 'create', categoryId: '', categoryNameToCreate: trim };
}
