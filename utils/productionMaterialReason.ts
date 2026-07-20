import { isDevMaterialOpReason, isReworkMaterialOpReason } from '../shared/types';

/** 生产物料统计是否应忽略该流水（开发领退 / 返工领料） */
export function shouldExcludeFromProductionMaterialStats(reason?: string | null): boolean {
  return isDevMaterialOpReason(reason) || isReworkMaterialOpReason(reason);
}

export { isDevMaterialOpReason, isReworkMaterialOpReason };
