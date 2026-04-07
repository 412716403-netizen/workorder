import type { TenantPrismaClient } from '../lib/prisma.js';
import { genId } from '../utils/genId.js';
import { sanitizeUpdate, sanitizeCreate, normalizeDates } from '../utils/request.js';

const PSI_STRIP_KEYS = new Set(['_savedAtMs', 'receivedQty', 'remainingQty']);

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
    return { data, total, page: opts.page, pageSize: opts.pageSize };
  }
  return db.psiRecord.findMany({ where, orderBy });
}

export async function createRecord(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = cleanPsi(sanitizeCreate(body));
  if (!data.id) data.id = genId('psi');
  normalizeDates(data);
  return db.psiRecord.create({ data: data as any });
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
  return db.psiRecord.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: 'desc' } });
}

export async function updateRecord(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const data = cleanPsi(sanitizeUpdate(body));
  normalizeDates(data);
  return db.psiRecord.update({ where: { id }, data });
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
