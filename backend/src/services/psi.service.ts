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
  opts: { type?: string; productId?: string; docNumber?: string; partnerId?: string },
) {
  const where: Record<string, unknown> = {};
  if (opts.type) where.type = opts.type;
  if (opts.productId) where.productId = opts.productId;
  if (opts.docNumber) where.docNumber = opts.docNumber;
  if (opts.partnerId) where.partnerId = opts.partnerId;
  return db.psiRecord.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
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
  const created = [];
  for (const r of records) {
    const data = cleanPsi(sanitizeCreate(r));
    if (!data.id) data.id = genId('psi');
    normalizeDates(data);
    created.push(await db.psiRecord.create({ data: data as any }));
  }
  return created;
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
  for (const r of newRecords || []) {
    const data = cleanPsi(sanitizeCreate(r));
    if (!data.id) data.id = genId('psi');
    normalizeDates(data);
    await db.psiRecord.create({ data: data as any });
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
  const whereClause: Record<string, unknown> = {
    type: { in: ['PURCHASE_BILL', 'SALES_BILL', 'TRANSFER', 'STOCKTAKE', 'STOCK_IN'] },
  };
  if (opts.productId) whereClause.productId = opts.productId;

  const records = await db.psiRecord.findMany({ where: whereClause });
  const stockMap: Record<string, number> = {};

  for (const r of records) {
    const pid = r.productId;
    if (!pid) continue;

    if (r.type === 'PURCHASE_BILL' || r.type === 'STOCK_IN') {
      if (!opts.warehouseId || r.warehouseId === opts.warehouseId) {
        stockMap[pid] = (stockMap[pid] || 0) + Number(r.quantity || 0);
      }
    } else if (r.type === 'SALES_BILL') {
      if (!opts.warehouseId || r.warehouseId === opts.warehouseId) {
        stockMap[pid] = (stockMap[pid] || 0) - Number(r.quantity || 0);
      }
    } else if (r.type === 'TRANSFER') {
      if (opts.warehouseId) {
        if ((r as any).toWarehouseId === opts.warehouseId)
          stockMap[pid] = (stockMap[pid] || 0) + Number(r.quantity || 0);
        if ((r as any).fromWarehouseId === opts.warehouseId)
          stockMap[pid] = (stockMap[pid] || 0) - Number(r.quantity || 0);
      }
    } else if (r.type === 'STOCKTAKE') {
      if (!opts.warehouseId || r.warehouseId === opts.warehouseId) {
        stockMap[pid] = Number(r.quantity || 0);
      }
    }
  }

  const prodRecords = await db.productionOpRecord.findMany({
    where: { type: 'STOCK_IN', ...(opts.productId ? { productId: opts.productId } : {}) },
  });
  for (const r of prodRecords) {
    stockMap[r.productId] = (stockMap[r.productId] || 0) + Number(r.quantity);
  }

  return Object.entries(stockMap).map(([pid, qty]) => ({
    productId: pid,
    stock: Math.max(0, qty),
  }));
}
