import type { ProductCategory } from '../types';
import type { CollabAcceptCategoryDecision } from '../shared/types';
import { categoryUsesBatchManagement } from '../shared/types';

/** 甲方派发含颜色/尺码时，该分类是否不可选（未启用色码或批次-only 与矩阵互斥） */
export function collabAcceptCategoryDisabledForIncomingMatrix(
  cat: ProductCategory,
  hasIncomingMatrixSpec: boolean,
): boolean {
  if (!hasIncomingMatrixSpec) return false;
  if (!cat.hasColorSize) return true;
  return categoryUsesBatchManagement(cat);
}

export function initCollabAcceptCategoryFromPayload(
  payloadCategoryName: string | null | undefined,
  categories: ProductCategory[],
  opts?: { hasIncomingMatrixSpec?: boolean },
): {
  categoryDecision: CollabAcceptCategoryDecision;
  categoryId: string;
  categoryNameToCreate: string;
} {
  const hasSpec = Boolean(opts?.hasIncomingMatrixSpec);
  const trim = (payloadCategoryName ?? '').trim();
  if (!trim) {
    return { categoryDecision: 'existing', categoryId: '', categoryNameToCreate: '' };
  }
  const hit = categories.find(c => (c.name ?? '').trim() === trim);
  if (hit) {
    if (hasSpec && collabAcceptCategoryDisabledForIncomingMatrix(hit, true)) {
      return { categoryDecision: 'create', categoryId: '', categoryNameToCreate: trim };
    }
    return { categoryDecision: 'existing', categoryId: hit.id, categoryNameToCreate: trim };
  }
  return { categoryDecision: 'create', categoryId: '', categoryNameToCreate: trim };
}
