import { AppError } from '../middleware/errorHandler.js';

/** 产品分类：颜色尺码与批次管理互斥（与设置页、shared/types categoryUsesBatchManagement 语义一致） */
export function assertCategoryBatchColorMutex(data: { hasColorSize?: unknown; hasBatchManagement?: unknown }) {
  const hasColor = Boolean(data.hasColorSize);
  const hasBatch = Boolean(data.hasBatchManagement);
  if (hasColor && hasBatch) {
    throw new AppError(400, '颜色尺码与批次管理不可同时启用');
  }
}

/**
 * 将分类的 hasColorSize 升为 true 前调用：若分类已启用批次管理则拒绝。
 */
export function assertCategoryColorSizeUpgradeAllowed(
  category: { hasBatchManagement?: boolean | null; hasColorSize?: boolean | null } | null | undefined,
) {
  if (!category) return;
  assertCategoryBatchColorMutex({ hasColorSize: true, hasBatchManagement: category.hasBatchManagement });
}
