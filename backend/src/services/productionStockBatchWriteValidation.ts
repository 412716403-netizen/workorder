import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { categoryUsesBatchManagement, normalizeBatchNo } from '../types/index.js';
import * as psiService from './psi.service.js';

/** 分类启用批次管理时：退料必须带批次号（与领料对称；不做「曾发货」校验） */
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

  const batchNo = normalizeBatchNo(data.batchNo);
  if (!batchNo) {
    throw new AppError(400, '该产品分类已启用批次管理，退料必须选择或填写批次号');
  }
  data.batchNo = batchNo;
}

/** 分类启用批次管理时：领料/外协物料出库必须带批次号且不超过按批次可用库存 */
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

  const batchNo = normalizeBatchNo(data.batchNo);
  if (!batchNo) {
    throw new AppError(400, '该产品分类已启用批次管理，出库必须选择或填写批次号');
  }
  data.batchNo = batchNo;

  const qty = Number(data.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return;

  const rows = await psiService.getStockBatches(db, {
    productId,
    warehouseId,
    excludeProductionOpRecordId,
  });
  const available = rows.find(r => r.batchNo === batchNo)?.stock ?? 0;
  if (qty > available) {
    throw new AppError(400, `批次「${batchNo}」可用库存不足（当前 ${available}）`);
  }
}
