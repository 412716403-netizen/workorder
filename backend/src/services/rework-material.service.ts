/**
 * 返工物料领退料：以生产工单为锚点（orderId + reason=来自于返工），
 * 数据仍落 ProductionOpRecord（STOCK_OUT / STOCK_RETURN），单号沿用 LL / TL 前缀。
 * BOM 选料在前端按工单变体/工序 BOM 解析；服务端只强制 reason/orderId 并做退料超额校验。
 */
import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  BATCH_NO_UNTAGGED,
  PROD_OP_REASON_FROM_REWORK,
  isUntaggedBatch,
  type ReworkMaterialBatchRequest,
  type ReworkMaterialBatchResult,
  type ReworkMaterialRecordsResponse,
} from '../../../shared/types.js';
import { createRecordBatch } from './production.service.js';
import {
  assertReturnWithinReturnable,
  buildDocGroups,
  buildSummaryAndReturnable,
  loadProductMeta,
  normalizeLines,
  type MaterialOpType,
  type RawOpRow,
} from './material-op-shared.js';

async function assertOrder(db: TenantPrismaClient, orderId: string) {
  const order = await db.productionOrder.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true },
  });
  if (!order) throw new AppError(404, '工单不存在');
  return order;
}

async function listReworkMaterialOpRows(db: TenantPrismaClient, orderId: string): Promise<RawOpRow[]> {
  const rows = await db.productionOpRecord.findMany({
    where: {
      reason: PROD_OP_REASON_FROM_REWORK,
      type: { in: ['STOCK_OUT', 'STOCK_RETURN'] },
      orderId,
    },
    orderBy: [{ timestamp: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      type: true,
      productId: true,
      quantity: true,
      warehouseId: true,
      batchNo: true,
      docNo: true,
      operator: true,
      timestamp: true,
    },
  });
  return rows as RawOpRow[];
}

export async function listReworkMaterialRecords(
  db: TenantPrismaClient,
  orderId: string,
): Promise<ReworkMaterialRecordsResponse> {
  await assertOrder(db, orderId);
  const rows = await listReworkMaterialOpRows(db, orderId);
  const productMeta = await loadProductMeta(db, rows.map((r) => r.productId));
  const { summary, returnable } = buildSummaryAndReturnable(rows, productMeta);
  const docs = buildDocGroups(rows, productMeta);
  return {
    summary,
    returnable,
    docs,
    canReturn: returnable.length > 0,
  };
}

async function createReworkMaterialBatch(
  db: TenantPrismaClient,
  tenantId: string,
  orderId: string,
  body: ReworkMaterialBatchRequest,
  type: MaterialOpType,
  creatorUserId?: string,
): Promise<ReworkMaterialBatchResult> {
  const order = await assertOrder(db, orderId);
  const lines = normalizeLines(body.lines);

  if (type === 'STOCK_RETURN') {
    const existing = await listReworkMaterialOpRows(db, orderId);
    const productMeta = await loadProductMeta(db, existing.map((r) => r.productId));
    const { returnable } = buildSummaryAndReturnable(existing, productMeta);
    assertReturnWithinReturnable(lines, returnable);
  }

  const operator = String(body.operator ?? '').trim() || undefined;
  const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    throw new AppError(400, '单据时间无效');
  }

  const records = lines.map((line) => {
    const batchNo =
      line.batchNo == null || isUntaggedBatch(line.batchNo)
        ? type === 'STOCK_RETURN'
          ? BATCH_NO_UNTAGGED
          : null
        : String(line.batchNo).trim();
    return {
      type,
      productId: line.productId,
      quantity: line.quantity,
      warehouseId: line.warehouseId,
      batchNo,
      orderId: order.id,
      partner: null,
      reason: PROD_OP_REASON_FROM_REWORK,
      status: '已完成',
      operator,
      timestamp,
    };
  });

  const result = await createRecordBatch(db, records, tenantId, creatorUserId);
  const created = (result.records ?? []) as Array<{ id?: string; docNo?: string | null }>;
  const docNo = String(created[0]?.docNo ?? '').trim();
  if (!docNo) {
    throw new AppError(500, '返工物料单据号生成失败');
  }
  return {
    docNo,
    type,
    recordIds: created.map((r) => String(r.id ?? '')).filter(Boolean),
  };
}

export async function createReworkMaterialIssueBatch(
  db: TenantPrismaClient,
  tenantId: string,
  orderId: string,
  body: ReworkMaterialBatchRequest,
  creatorUserId?: string,
): Promise<ReworkMaterialBatchResult> {
  return createReworkMaterialBatch(db, tenantId, orderId, body, 'STOCK_OUT', creatorUserId);
}

export async function createReworkMaterialReturnBatch(
  db: TenantPrismaClient,
  tenantId: string,
  orderId: string,
  body: ReworkMaterialBatchRequest,
  creatorUserId?: string,
): Promise<ReworkMaterialBatchResult> {
  return createReworkMaterialBatch(db, tenantId, orderId, body, 'STOCK_RETURN', creatorUserId);
}
