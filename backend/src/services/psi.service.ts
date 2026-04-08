import type { TenantPrismaClient } from '../lib/prisma.js';
import { genId } from '../utils/genId.js';
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
  if ('batch' in data) {
    if (!('batchNo' in data)) data.batchNo = data.batch;
    delete data.batch;
  }
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
  if (deleteIds?.length) {
    await db.psiRecord.deleteMany({ where: { id: { in: deleteIds } } });
  }
  const toInsert = (newRecords || []).map(r => {
    const data = cleanPsi(sanitizeCreate(r));
    if (!data.id) data.id = genId('psi');
    normalizeDates(data);
    return data as any;
  });
  if (toInsert.length) {
    await db.psiRecord.createMany({ data: toInsert });
  }
  return { message: '已替换' };
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
    db.psiRecord.groupBy({
      by: ['productId'],
      where: { type: 'STOCKTAKE', ...productFilter, ...warehouseFilter },
      _sum: { quantity: true },
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
    if (r.productId) { stockMap[r.productId] = Number(r._sum?.quantity || 0); stocktakeSet.add(r.productId); }
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
