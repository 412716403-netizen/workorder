import { Prisma } from '@prisma/client';
import type { TenantPrismaClient } from '../lib/prisma.js';
import { normalizeBatchNo, BATCH_NO_UNTAGGED } from '../../../shared/types.js';
import { genId } from '../utils/genId.js';
import { withSerializableRetry } from '../utils/withSerializableRetry.js';
import { sanitizeUpdate, sanitizeCreate, normalizeDates } from '../utils/request.js';

const PSI_STRIP_KEYS = new Set(['_savedAtMs', 'receivedQty', 'remainingQty', 'productName', 'productSku']);

/** 列表/详情展示用：不依赖「产品档案」接口权限，由服务端按 tenant 关联 Product 表补全名称 */
async function enrichPsiRecordsWithProductMeta(db: TenantPrismaClient, records: { productId?: string | null }[]) {
  const ids = [...new Set(records.map(r => r.productId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, sku: true },
  });
  const m = new Map(products.map(p => [p.id, p]));
  for (const r of records as any[]) {
    if (!r.productId) continue;
    const p = m.get(r.productId);
    if (p) {
      r.productName = p.name || p.sku || undefined;
      r.productSku = p.sku || undefined;
    }
  }
}

function cleanPsi(data: Record<string, unknown>) {
  for (const k of PSI_STRIP_KEYS) delete data[k];
  // 前端常写 `batch`；库表为 `batchNo`。若来源行已带 `batchNo: null`（仍算 in 对象），
  // 旧逻辑会跳过复制导致用户输入的 `batch` 被删且未落库（如采购订单转采购单）。
  if ('batch' in data) {
    const fromBatch = normalizeBatchNo(data.batch);
    delete data.batch;
    if (fromBatch) {
      data.batchNo = fromBatch;
    }
  }
  const bn = normalizeBatchNo(data.batchNo);
  // 哨兵字符串「无批号」视同未填：DB 一律存 NULL，避免与真实业务批号混淆。
  if (bn && bn !== BATCH_NO_UNTAGGED) data.batchNo = bn;
  else delete data.batchNo;
  return data;
}

export async function listRecords(
  db: TenantPrismaClient,
  opts: { type?: string; productId?: string; docNumber?: string; partnerId?: string; page?: number; pageSize?: number },
) {
  const where: Record<string, unknown> = {};
  if (opts.type) where.type = opts.type;
  if (opts.productId) where.productId = opts.productId;
  if (opts.docNumber) where.docNumber = opts.docNumber;
  if (opts.partnerId) where.partnerId = opts.partnerId;
  const orderBy: any = [{ createdAt: 'desc' }, { id: 'asc' }];

  if (opts.page != null && opts.pageSize != null) {
    const [data, total] = await Promise.all([
      db.psiRecord.findMany({ where, orderBy, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize }),
      db.psiRecord.count({ where }),
    ]);
    await enrichPsiRecordsWithProductMeta(db, data);
    return { data, total, page: opts.page, pageSize: opts.pageSize };
  }
  const data = await db.psiRecord.findMany({ where, orderBy });
  await enrichPsiRecordsWithProductMeta(db, data);
  return data;
}

export async function createRecord(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = cleanPsi(sanitizeCreate(body));
  if (!data.id) data.id = genId('psi');
  normalizeDates(data);
  const created = await db.psiRecord.create({ data: data as any });
  await enrichPsiRecordsWithProductMeta(db, [created]);
  return created;
}

export async function createBatchRecords(
  db: TenantPrismaClient,
  records: Record<string, unknown>[],
) {
  const prepared = records.map(r => {
    const data = cleanPsi(sanitizeCreate(r));
    if (!data.id) data.id = genId('psi');
    normalizeDates(data);
    return data as any;
  });
  const ids = prepared.map((d: any) => d.id as string);
  await db.psiRecord.createMany({ data: prepared });
  const createdRows = await db.psiRecord.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: 'desc' } });
  await enrichPsiRecordsWithProductMeta(db, createdRows);
  return createdRows;
}

export async function updateRecord(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const data = cleanPsi(sanitizeUpdate(body));
  normalizeDates(data);
  const updated = await db.psiRecord.update({ where: { id }, data });
  await enrichPsiRecordsWithProductMeta(db, [updated]);
  return updated;
}

export async function replaceRecords(
  db: TenantPrismaClient,
  deleteIds: string[] | undefined,
  newRecords: Record<string, unknown>[] | undefined,
) {
  const toInsert = (newRecords || []).map(r => {
    const data = cleanPsi(sanitizeCreate(r));
    if (!data.id) data.id = genId('psi');
    normalizeDates(data);
    return data as any;
  });
  return withSerializableRetry(() =>
    db.$transaction(
      async tx => {
        if (deleteIds?.length) {
          await tx.psiRecord.deleteMany({ where: { id: { in: deleteIds } } });
        }
        if (toInsert.length) {
          await tx.psiRecord.createMany({ data: toInsert });
        }
        return { message: '已替换' };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 120_000,
      },
    ),
  );
}

export async function deleteRecord(db: TenantPrismaClient, id: string) {
  await db.psiRecord.delete({ where: { id } });
  return { message: '已删除' };
}

export async function deleteBatchRecords(db: TenantPrismaClient, ids: string[]) {
  await db.psiRecord.deleteMany({ where: { id: { in: ids } } });
  return { message: '已删除' };
}

export async function getStock(
  db: TenantPrismaClient,
  opts: { productId?: string; warehouseId?: string },
) {
  const productFilter = opts.productId ? { productId: opts.productId } : { productId: { not: null } };
  const warehouseFilter = opts.warehouseId ? { warehouseId: opts.warehouseId } : {};

  const [inboundAgg, outboundAgg, transferIn, transferOut, stocktakeAgg, prodStockIn] = await Promise.all([
    db.psiRecord.groupBy({
      by: ['productId'],
      where: { type: { in: ['PURCHASE_BILL', 'STOCK_IN'] }, ...productFilter, ...warehouseFilter },
      _sum: { quantity: true },
    }),
    db.psiRecord.groupBy({
      by: ['productId'],
      where: { type: 'SALES_BILL', ...productFilter, ...warehouseFilter },
      _sum: { quantity: true },
    }),
    opts.warehouseId
      ? db.psiRecord.groupBy({
          by: ['productId'],
          where: { type: 'TRANSFER', toWarehouseId: opts.warehouseId, ...productFilter },
          _sum: { quantity: true },
        })
      : Promise.resolve([]),
    opts.warehouseId
      ? db.psiRecord.groupBy({
          by: ['productId'],
          where: { type: 'TRANSFER', fromWarehouseId: opts.warehouseId, ...productFilter },
          _sum: { quantity: true },
        })
      : Promise.resolve([]),
    /** 盘点：实盘与系统数的差额在 `diffQuantity`，与 `getStockBatches` / 前端 `usePsiStockIndex` 一致 */
    db.psiRecord.groupBy({
      by: ['productId'],
      where: { type: 'STOCKTAKE', ...productFilter, ...warehouseFilter },
      _sum: { diffQuantity: true },
    }),
    db.productionOpRecord.groupBy({
      by: ['productId'],
      where: { type: 'STOCK_IN', ...(opts.productId ? { productId: opts.productId } : {}) },
      _sum: { quantity: true },
    }),
  ]);

  const stockMap: Record<string, number> = {};
  const stocktakeSet = new Set<string>();

  for (const r of stocktakeAgg) {
    if (r.productId) {
      stockMap[r.productId] = Number(r._sum?.diffQuantity || 0);
      stocktakeSet.add(r.productId);
    }
  }
  for (const r of inboundAgg) {
    if (r.productId) stockMap[r.productId] = (stockMap[r.productId] || 0) + Number(r._sum?.quantity || 0);
  }
  for (const r of outboundAgg) {
    if (r.productId) stockMap[r.productId] = (stockMap[r.productId] || 0) - Number(r._sum?.quantity || 0);
  }
  for (const r of transferIn) {
    if (r.productId) stockMap[r.productId] = (stockMap[r.productId] || 0) + Number(r._sum?.quantity || 0);
  }
  for (const r of transferOut) {
    if (r.productId) stockMap[r.productId] = (stockMap[r.productId] || 0) - Number(r._sum?.quantity || 0);
  }
  for (const r of prodStockIn) {
    stockMap[r.productId] = (stockMap[r.productId] || 0) + Number(r._sum?.quantity || 0);
  }

  return Object.entries(stockMap).map(([pid, qty]) => ({
    productId: pid,
    stock: Math.max(0, qty),
  }));
}

type BatchAggRow = { batchNo: string | null; _sum: { quantity?: unknown; diffQuantity?: unknown } | null };

function addBatchAgg(map: Map<string, number>, rows: BatchAggRow[], sign: 1 | -1, field: 'quantity' | 'diffQuantity') {
  for (const r of rows) {
    // NULL/空 → 哨兵字符串 BATCH_NO_UNTAGGED，与"已填批号"一并参与按批次汇总。
    const key = normalizeBatchNo(r.batchNo) ?? BATCH_NO_UNTAGGED;
    const raw = field === 'quantity' ? r._sum?.quantity : r._sum?.diffQuantity;
    const q = Number(raw ?? 0) || 0;
    if (!q) continue;
    map.set(key, (map.get(key) || 0) + sign * q);
  }
}

/** `production_op_records` 的 `groupBy({ by: ['batchNo'] })` 在部分 Prisma/客户端组合下会报 Unknown argument 'batchNo'，故用 findMany 后在内存按批号汇总。 */
function addProdOpRowsToMap(
  map: Map<string, number>,
  rows: { batchNo: string | null; quantity: unknown }[],
  sign: 1 | -1,
) {
  for (const r of rows) {
    // NULL/空 → 哨兵字符串 BATCH_NO_UNTAGGED，让"未填批号"的生产流水也被纳入按批次余量。
    const bn = normalizeBatchNo(r.batchNo) ?? BATCH_NO_UNTAGGED;
    const q = Number(r.quantity ?? 0) || 0;
    if (!q) continue;
    map.set(bn, (map.get(bn) || 0) + sign * q);
  }
}

/**
 * 按「产品 + 仓库 + 批次号」汇总可用库存（与前端 `usePsiStockIndex` 中批次桶语义对齐）。
 * 为支持「未填批号」（如采购入库未输入批号、历史数据空）的物料同样能在领料/退料下拉中被选择，
 * 这里**不再**过滤 `batchNo IS NULL`：所有 NULL/空批号的流水都归一为哨兵 {@link BATCH_NO_UNTAGGED}。
 * `excludeProductionOpRecordId`：更新领料单某行时排除自身，避免把当前行已扣数量算进可用量。
 */
export async function getStockBatches(
  db: TenantPrismaClient,
  opts: { productId: string; warehouseId: string; excludeProductionOpRecordId?: string },
): Promise<{ batchNo: string; stock: number }[]> {
  const { productId, warehouseId, excludeProductionOpRecordId: exId } = opts;
  const map = new Map<string, number>();

  const prodEx = exId ? { id: { not: exId } } : {};

  const [psiIn, psiOut, transferIn, transferOut, stocktakeRows, prodInRows, prodRetRows, prodOutRows] =
    await Promise.all([
      db.psiRecord.groupBy({
        by: ['batchNo'],
        where: {
          productId,
          warehouseId,
          type: { in: ['PURCHASE_BILL', 'STOCK_IN'] },
        },
        _sum: { quantity: true },
      }),
      db.psiRecord.groupBy({
        by: ['batchNo'],
        where: { productId, warehouseId, type: 'SALES_BILL' },
        _sum: { quantity: true },
      }),
      db.psiRecord.groupBy({
        by: ['batchNo'],
        where: { productId, toWarehouseId: warehouseId, type: 'TRANSFER' },
        _sum: { quantity: true },
      }),
      db.psiRecord.groupBy({
        by: ['batchNo'],
        where: { productId, fromWarehouseId: warehouseId, type: 'TRANSFER' },
        _sum: { quantity: true },
      }),
      db.psiRecord.groupBy({
        by: ['batchNo'],
        where: { productId, warehouseId, type: 'STOCKTAKE' },
        _sum: { diffQuantity: true },
      }),
      db.productionOpRecord.findMany({
        where: { productId, warehouseId, type: 'STOCK_IN', ...prodEx },
        select: { batchNo: true, quantity: true },
      }),
      db.productionOpRecord.findMany({
        where: { productId, warehouseId, type: 'STOCK_RETURN', ...prodEx },
        select: { batchNo: true, quantity: true },
      }),
      db.productionOpRecord.findMany({
        where: { productId, warehouseId, type: 'STOCK_OUT', ...prodEx },
        select: { batchNo: true, quantity: true },
      }),
    ]);

  addBatchAgg(map, psiIn, 1, 'quantity');
  addBatchAgg(map, transferIn, 1, 'quantity');
  addBatchAgg(map, stocktakeRows, 1, 'diffQuantity');
  addProdOpRowsToMap(map, prodInRows, 1);
  addProdOpRowsToMap(map, prodRetRows, 1);

  addBatchAgg(map, psiOut, -1, 'quantity');
  addBatchAgg(map, transferOut, -1, 'quantity');
  addProdOpRowsToMap(map, prodOutRows, -1);

  return [...map.entries()]
    .map(([batchNo, stock]) => ({ batchNo, stock: Math.max(0, stock) }))
    .filter(r => r.stock > 0)
    .sort((a, b) => a.batchNo.localeCompare(b.batchNo, 'zh-CN'));
}
