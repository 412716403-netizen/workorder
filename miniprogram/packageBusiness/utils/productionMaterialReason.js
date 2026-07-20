/** 与 shared/types.ts PROD_OP_REASON_* / is*MaterialOpReason 对齐 */
const PROD_OP_REASON_FROM_DEV = '来自于开发';
const PROD_OP_REASON_FROM_REWORK = '来自于返工';

function isDevMaterialOpReason(reason) {
  return reason === PROD_OP_REASON_FROM_DEV;
}

function isReworkMaterialOpReason(reason) {
  return reason === PROD_OP_REASON_FROM_REWORK;
}

/** 生产物料统计是否应忽略该流水（开发领退 / 返工领料） */
function shouldExcludeFromProductionMaterialStats(reason) {
  return isDevMaterialOpReason(reason) || isReworkMaterialOpReason(reason);
}

module.exports = {
  PROD_OP_REASON_FROM_DEV,
  PROD_OP_REASON_FROM_REWORK,
  isDevMaterialOpReason,
  isReworkMaterialOpReason,
  shouldExcludeFromProductionMaterialStats,
};
