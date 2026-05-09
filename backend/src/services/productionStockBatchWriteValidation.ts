import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  BATCH_NO_UNTAGGED,
  categoryUsesBatchManagement,
  normalizeBatchNo,
} from '../types/index.js';
import * as psiService from './psi.service.js';

/**
 * 区分「显式选了无批号」与「压根没填」：
 * - 显式：调用方传入哨兵 {@link BATCH_NO_UNTAGGED}（"无批号"）→ 视为合法选择，写入归 NULL。
 * - 未填：null / undefined / 空串 / 仅空白 → 视为漏填，校验失败。
 *
 * 返回 'untagged' 表示走 NULL 路径；返回 string 表示已归一的真实批号；
 * 返回 'missing' 表示需要拒绝。
 */
function classifyBatchInput(raw: unknown): 'untagged' | 'missing' | string {
  if (raw === BATCH_NO_UNTAGGED) return 'untagged';
  const bn = normalizeBatchNo(raw);
  if (!bn) return 'missing';
  if (bn === BATCH_NO_UNTAGGED) return 'untagged';
  return bn;
}

/** 分类启用批次管理时：退料必须带批次号（与领料对称；不做「曾发货」校验）。
 * 哨兵 {@link BATCH_NO_UNTAGGED} 视同"明确选择无批号"：通过必填校验、最终落 NULL。
 */
export async function validateStockReturnBatchOnWrite(
  db: TenantPrismaClient,
  data: Record<string, unknown>,
): Promise<void> {
  if (data.type !== 'STOCK_RETURN') return;
  const productId = typeof data.productId === 'string' ? data.productId : '';
  const warehouseId = typeof data.warehouseId === 'string' ? data.warehouseId : '';
  if (!productId || !warehouseId) return;

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { categoryId: true },
  });
  if (!product?.categoryId) return;

  const cat = await db.productCategory.findUnique({
    where: { id: product.categoryId },
    select: { hasBatchManagement: true, hasColorSize: true },
  });
  if (!categoryUsesBatchManagement(cat)) return;

  const verdict = classifyBatchInput(data.batchNo);
  if (verdict === 'missing') {
    throw new AppError(400, '该产品分类已启用批次管理，退料必须选择或填写批次号');
  }
  if (verdict === 'untagged') {
    delete data.batchNo;
    return;
  }
  data.batchNo = verdict;
}

/** 分类启用批次管理时：领料/外协物料出库必须带批次号且不超过按批次可用库存。
 * 哨兵 {@link BATCH_NO_UNTAGGED}（"无批号"）按 NULL 流水的可用余量校验，最终落 NULL。
 */
export async function validateStockOutBatchOnWrite(
  db: TenantPrismaClient,
  data: Record<string, unknown>,
  excludeProductionOpRecordId?: string,
): Promise<void> {
  if (data.type !== 'STOCK_OUT') return;
  const productId = typeof data.productId === 'string' ? data.productId : '';
  const warehouseId = typeof data.warehouseId === 'string' ? data.warehouseId : '';
  if (!productId || !warehouseId) return;

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { categoryId: true },
  });
  if (!product?.categoryId) return;

  const cat = await db.productCategory.findUnique({
    where: { id: product.categoryId },
    select: { hasBatchManagement: true, hasColorSize: true },
  });
  if (!categoryUsesBatchManagement(cat)) return;

  const verdict = classifyBatchInput(data.batchNo);
  if (verdict === 'missing') {
    throw new AppError(400, '该产品分类已启用批次管理，出库必须选择或填写批次号');
  }
  // batchKey 用于在 getStockBatches 返回数组中匹配可用余量；DB 写入时哨兵需删字段（落 NULL）。
  const batchKey = verdict === 'untagged' ? BATCH_NO_UNTAGGED : verdict;
  if (verdict === 'untagged') delete data.batchNo;
  else data.batchNo = verdict;

  const qty = Number(data.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return;

  const rows = await psiService.getStockBatches(db, {
    productId,
    warehouseId,
    excludeProductionOpRecordId,
  });
  const available = rows.find(r => r.batchNo === batchKey)?.stock ?? 0;
  if (qty > available) {
    throw new AppError(400, `批次「${batchKey}」可用库存不足（当前 ${available}）`);
  }
}
