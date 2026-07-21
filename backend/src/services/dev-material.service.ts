import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  BATCH_NO_UNTAGGED,
  DevStyleStatus,
  PROD_OP_REASON_FROM_DEV,
  isUntaggedBatch,
  type DevMaterialBatchRequest,
  type DevMaterialBatchResult,
  type DevMaterialRecordsResponse,
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

async function assertStyle(db: TenantPrismaClient, styleId: string) {
  const style = await db.devStyle.findUnique({
    where: { id: styleId },
    select: { id: true, status: true, code: true, name: true },
  });
  if (!style) throw new AppError(404, '款式不存在');
  return style;
}

async function loadBomProductIds(db: TenantPrismaClient, styleId: string): Promise<string[]> {
  const boms = await db.devBom.findMany({
    where: { parentStyleId: styleId },
    include: { items: { select: { productId: true } } },
  });
  const ids = new Set<string>();
  for (const bom of boms) {
    for (const item of bom.items) {
      const pid = String(item.productId ?? '').trim();
      if (pid) ids.add(pid);
    }
  }
  return [...ids];
}

async function listDevMaterialOpRows(db: TenantPrismaClient, styleId: string): Promise<RawOpRow[]> {
  const rows = await db.productionOpRecord.findMany({
    where: {
      reason: PROD_OP_REASON_FROM_DEV,
      type: { in: ['STOCK_OUT', 'STOCK_RETURN'] },
      customData: { path: ['devStyleId'], equals: styleId },
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

export async function countDevMaterialRecords(db: TenantPrismaClient, styleId: string): Promise<number> {
  return db.productionOpRecord.count({
    where: {
      reason: PROD_OP_REASON_FROM_DEV,
      customData: { path: ['devStyleId'], equals: styleId },
    },
  });
}

export async function listDevMaterialRecords(
  db: TenantPrismaClient,
  styleId: string,
): Promise<DevMaterialRecordsResponse> {
  const style = await assertStyle(db, styleId);
  const [rows, bomProductIds] = await Promise.all([
    listDevMaterialOpRows(db, styleId),
    loadBomProductIds(db, styleId),
  ]);
  const productIds = [
    ...bomProductIds,
    ...rows.map((r) => r.productId),
  ];
  const productMeta = await loadProductMeta(db, productIds);
  const { summary, returnable } = buildSummaryAndReturnable(rows, productMeta);
  const docs = buildDocGroups(rows, productMeta);
  return {
    summary,
    returnable,
    docs,
    bomProductIds,
    canIssue: style.status === DevStyleStatus.DEVELOPING,
    canReturn: returnable.length > 0,
  };
}

async function createDevMaterialBatch(
  db: TenantPrismaClient,
  tenantId: string,
  styleId: string,
  body: DevMaterialBatchRequest,
  type: MaterialOpType,
  creatorUserId?: string,
): Promise<DevMaterialBatchResult> {
  const style = await assertStyle(db, styleId);
  const lines = normalizeLines(body.lines);

  if (type === 'STOCK_OUT' && style.status !== DevStyleStatus.DEVELOPING) {
    throw new AppError(409, '仅开发中的款式可继续领料；归档/已发布仅可退料');
  }

  const bomProductIds = new Set(await loadBomProductIds(db, styleId));
  if (type === 'STOCK_OUT') {
    if (bomProductIds.size === 0) {
      throw new AppError(400, '请先配置试制 BOM 后再领料');
    }
    for (const line of lines) {
      if (!bomProductIds.has(line.productId)) {
        throw new AppError(400, `物料不在该款式试制 BOM 中：${line.productId}`);
      }
    }
  }

  if (type === 'STOCK_RETURN') {
    const existing = await listDevMaterialOpRows(db, styleId);
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
      orderId: null,
      sourceProductId: null,
      partner: null,
      reason: PROD_OP_REASON_FROM_DEV,
      status: '已完成',
      operator,
      timestamp,
      customData: { devStyleId: styleId },
    };
  });

  const result = await createRecordBatch(db, records, tenantId, creatorUserId);
  const created = (result.records ?? []) as Array<{ id?: string; docNo?: string | null }>;
  const docNo = String(created[0]?.docNo ?? '').trim();
  if (!docNo) {
    throw new AppError(500, '开发物料单据号生成失败');
  }
  return {
    docNo,
    type,
    recordIds: created.map((r) => String(r.id ?? '')).filter(Boolean),
  };
}

export async function createDevMaterialIssueBatch(
  db: TenantPrismaClient,
  tenantId: string,
  styleId: string,
  body: DevMaterialBatchRequest,
  creatorUserId?: string,
): Promise<DevMaterialBatchResult> {
  return createDevMaterialBatch(db, tenantId, styleId, body, 'STOCK_OUT', creatorUserId);
}

export async function createDevMaterialReturnBatch(
  db: TenantPrismaClient,
  tenantId: string,
  styleId: string,
  body: DevMaterialBatchRequest,
  creatorUserId?: string,
): Promise<DevMaterialBatchResult> {
  return createDevMaterialBatch(db, tenantId, styleId, body, 'STOCK_RETURN', creatorUserId);
}
