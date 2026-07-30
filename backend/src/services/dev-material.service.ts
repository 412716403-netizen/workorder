import type { TenantPrismaClient } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';
import {
  BATCH_NO_UNTAGGED,
  DEV_MATERIAL_BOM_MAX_DEPTH,
  DevStyleStatus,
  PROD_OP_REASON_FROM_DEV,
  isUntaggedBatch,
  type DevMaterialBatchRequest,
  type DevMaterialBatchResult,
  type DevMaterialDocMutationResult,
  type DevMaterialDocUpdateRequest,
  type DevMaterialRecordsResponse,
} from '../../../shared/types.js';
import { createRecordBatch } from './production.service.js';
import {
  assertNoNegativeIssuedNet,
  assertReturnWithinReturnable,
  buildDocGroups,
  buildSummaryAndReturnable,
  loadProductMeta,
  normalizeLines,
  toQty,
  type MaterialOpType,
  type RawOpRow,
} from './material-op-shared.js';
import {
  validateStockOutBatchOnWrite,
  validateStockReturnBatchOnWrite,
} from './productionStockBatchWriteValidation.js';
import { withSerializableRetry } from '../utils/withSerializableRetry.js';

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

/**
 * 可领物料 = 试制 BOM 顶层 ∪ 产品档案 BOM 下级（BFS，深度上限 + visited 防环）
 */
async function loadIssuableProductIds(
  db: TenantPrismaClient,
  rootIds: string[],
): Promise<Set<string>> {
  const issuable = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [];
  for (const raw of rootIds) {
    const id = String(raw ?? '').trim();
    if (!id || issuable.has(id)) continue;
    issuable.add(id);
    queue.push({ id, depth: 1 });
  }

  while (queue.length > 0) {
    // 入队时已保证 depth < DEV_MATERIAL_BOM_MAX_DEPTH，这里整层取出即可
    const frontier = queue.splice(0, queue.length);
    const parentIds = frontier.map((q) => q.id);
    const depthByParent = new Map(frontier.map((q) => [q.id, q.depth]));
    const archiveBoms = await db.bom.findMany({
      where: { parentProductId: { in: parentIds } },
      select: {
        parentProductId: true,
        items: { select: { productId: true } },
      },
    });
    for (const bom of archiveBoms) {
      const parentDepth = depthByParent.get(bom.parentProductId) ?? 1;
      const childDepth = parentDepth + 1;
      for (const item of bom.items) {
        const childId = String(item.productId ?? '').trim();
        if (!childId || issuable.has(childId)) continue;
        issuable.add(childId);
        if (childDepth < DEV_MATERIAL_BOM_MAX_DEPTH) {
          queue.push({ id: childId, depth: childDepth });
        }
      }
    }
  }

  return issuable;
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

  const bomProductIds = await loadBomProductIds(db, styleId);
  if (type === 'STOCK_OUT') {
    if (bomProductIds.length === 0) {
      throw new AppError(400, '请先配置试制 BOM 后再领料');
    }
    const issuable = await loadIssuableProductIds(db, bomProductIds);
    for (const line of lines) {
      if (!issuable.has(line.productId)) {
        throw new AppError(400, `物料不在该款式试制 BOM（含下级 BOM）中：${line.productId}`);
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

type DocRow = RawOpRow & { productId: string };

async function loadDevMaterialDocRows(
  db: TenantPrismaClient,
  styleId: string,
  docNo: string,
): Promise<DocRow[]> {
  const trimmed = String(docNo ?? '').trim();
  if (!trimmed) throw new AppError(400, '单据号不能为空');
  const rows = await db.productionOpRecord.findMany({
    where: {
      docNo: trimmed,
      reason: PROD_OP_REASON_FROM_DEV,
      type: { in: ['STOCK_OUT', 'STOCK_RETURN'] },
      customData: { path: ['devStyleId'], equals: styleId },
    },
    orderBy: [{ id: 'asc' }],
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
  if (rows.length === 0) {
    throw new AppError(404, '开发领退料单据不存在');
  }
  return rows as DocRow[];
}

function normalizeDocBatchNo(
  type: MaterialOpType,
  batchNo: string | null | undefined,
): string | null {
  if (batchNo == null || isUntaggedBatch(batchNo)) {
    return type === 'STOCK_RETURN' ? BATCH_NO_UNTAGGED : null;
  }
  return String(batchNo).trim() || null;
}

function assertStyleAllowsDocMutation(status: string, action: '修改' | '删除'): void {
  if (status !== DevStyleStatus.DEVELOPING) {
    throw new AppError(409, `仅开发中的款式可${action}领退料单据`);
  }
}

export async function updateDevMaterialDoc(
  db: TenantPrismaClient,
  styleId: string,
  docNo: string,
  body: DevMaterialDocUpdateRequest,
): Promise<DevMaterialDocMutationResult> {
  const style = await assertStyle(db, styleId);
  assertStyleAllowsDocMutation(style.status, '修改');

  const existing = await loadDevMaterialDocRows(db, styleId, docNo);
  const docType = (existing[0].type === 'STOCK_RETURN' ? 'STOCK_RETURN' : 'STOCK_OUT') as MaterialOpType;
  const existingById = new Map(existing.map((r) => [r.id, r]));

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (rawLines.length === 0) {
    throw new AppError(400, '至少保留一条明细；清空请删除整张单据');
  }

  const keepIds = new Set<string>();
  const normalizedLines: Array<{
    id: string;
    quantity: number;
    warehouseId: string;
    batchNo: string | null;
  }> = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] ?? {};
    const id = String((line as { id?: unknown }).id ?? '').trim();
    if (!id) throw new AppError(400, `第 ${i + 1} 行缺少明细 id`);
    if (!existingById.has(id)) {
      throw new AppError(400, `明细不属于本单据：${id}`);
    }
    if (keepIds.has(id)) {
      throw new AppError(400, `明细 id 重复：${id}`);
    }
    keepIds.add(id);
    const warehouseId = String((line as { warehouseId?: unknown }).warehouseId ?? '').trim();
    const quantity = toQty((line as { quantity?: unknown }).quantity);
    if (!warehouseId) throw new AppError(400, `第 ${i + 1} 行缺少仓库`);
    if (!(quantity > 0)) throw new AppError(400, `第 ${i + 1} 行数量须大于 0`);
    const batchRaw = (line as { batchNo?: unknown }).batchNo;
    const batchNo = batchRaw == null ? null : String(batchRaw);
    normalizedLines.push({
      id,
      quantity,
      warehouseId,
      batchNo: normalizeDocBatchNo(docType, batchNo),
    });
  }

  const deletedIds = existing.filter((r) => !keepIds.has(r.id)).map((r) => r.id);

  const operator =
    body.operator !== undefined
      ? String(body.operator ?? '').trim() || null
      : undefined;
  let timestamp: Date | undefined;
  if (body.timestamp !== undefined) {
    if (body.timestamp) {
      timestamp = new Date(body.timestamp);
      if (Number.isNaN(timestamp.getTime())) {
        throw new AppError(400, '单据时间无效');
      }
    }
  }

  const updatedIds = await withSerializableRetry(() =>
    db.$transaction(
      async (tx) => {
        const txDb = tx as unknown as TenantPrismaClient;
        const ids: string[] = [];

        for (const line of normalizedLines) {
          const old = existingById.get(line.id)!;
          const merged: Record<string, unknown> = {
            type: docType,
            productId: old.productId,
            warehouseId: line.warehouseId,
            batchNo: line.batchNo,
            quantity: line.quantity,
          };
          if (docType === 'STOCK_OUT') {
            await validateStockOutBatchOnWrite(txDb, merged, line.id);
          } else {
            await validateStockReturnBatchOnWrite(txDb, merged);
          }
          const data: Record<string, unknown> = {
            quantity: line.quantity,
            warehouseId: line.warehouseId,
            batchNo:
              typeof merged.batchNo === 'string' && merged.batchNo
                ? merged.batchNo
                : line.batchNo === BATCH_NO_UNTAGGED
                  ? null
                  : line.batchNo,
          };
          if (operator !== undefined) data.operator = operator;
          if (timestamp !== undefined) data.timestamp = timestamp;
          await tx.productionOpRecord.update({ where: { id: line.id }, data });
          ids.push(line.id);
        }

        if (deletedIds.length > 0) {
          await tx.productionOpRecord.deleteMany({
            where: { id: { in: deletedIds } },
          });
        }

        const remaining = await listDevMaterialOpRows(txDb, styleId);
        assertNoNegativeIssuedNet(remaining);
        return ids;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 60_000,
      },
    ),
  );

  return {
    docNo: String(docNo).trim(),
    type: docType,
    updatedIds,
    deletedIds,
  };
}

export async function deleteDevMaterialDoc(
  db: TenantPrismaClient,
  styleId: string,
  docNo: string,
): Promise<DevMaterialDocMutationResult> {
  const style = await assertStyle(db, styleId);
  assertStyleAllowsDocMutation(style.status, '删除');

  const existing = await loadDevMaterialDocRows(db, styleId, docNo);
  const docType = (existing[0].type === 'STOCK_RETURN' ? 'STOCK_RETURN' : 'STOCK_OUT') as MaterialOpType;
  const deletedIds = existing.map((r) => r.id);
  const trimmedDocNo = String(docNo).trim();

  await withSerializableRetry(() =>
    db.$transaction(
      async (tx) => {
        const txDb = tx as unknown as TenantPrismaClient;
        await tx.productionOpRecord.deleteMany({
          where: {
            docNo: trimmedDocNo,
            reason: PROD_OP_REASON_FROM_DEV,
            customData: { path: ['devStyleId'], equals: styleId },
          },
        });
        const remaining = await listDevMaterialOpRows(txDb, styleId);
        assertNoNegativeIssuedNet(remaining);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 60_000,
      },
    ),
  );

  return {
    docNo: trimmedDocNo,
    type: docType,
    updatedIds: [],
    deletedIds,
  };
}
