import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma, prisma as basePrisma } from '../lib/prisma.js';
import { str, optStr, sanitizeUpdate, sanitizeCreate, normalizeDates } from '../utils/request.js';

const PSI_STRIP_KEYS = new Set([
  '_savedAtMs', 'receivedQty', 'remainingQty',
]);
function cleanPsi(data: Record<string, unknown>) {
  for (const k of PSI_STRIP_KEYS) delete data[k];
  if ('batch' in data) {
    if (!('batchNo' in data)) data.batchNo = data.batch;
    delete data.batch;
  }
  return data;
}

export async function listRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const type = optStr(req.query.type);
    const productId = optStr(req.query.productId);
    const docNumber = optStr(req.query.docNumber);
    const partnerId = optStr(req.query.partnerId);
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (productId) where.productId = productId;
    if (docNumber) where.docNumber = docNumber;
    if (partnerId) where.partnerId = partnerId;
    res.json(await db.psiRecord.findMany({ where, orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
}

export async function createRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = cleanPsi(sanitizeCreate(req.body));
    if (!data.id) data.id = `psi-${Date.now()}`;
    normalizeDates(data);
    const record = await db.psiRecord.create({ data });
    res.status(201).json(record);
  } catch (e) { next(e); }
}

export async function createBatchRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const { records } = req.body;
    const created = [];
    for (const r of records) {
      const data = cleanPsi(sanitizeCreate(r));
      if (!data.id) data.id = `psi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      normalizeDates(data);
      data.tenantId = tenantId;
      created.push(await basePrisma.psiRecord.create({ data }));
    }
    res.status(201).json(created);
  } catch (e) { next(e); }
}

export async function updateRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const data = cleanPsi(sanitizeUpdate(req.body));
    normalizeDates(data);
    const record = await basePrisma.psiRecord.update({ where: { id: str(req.params.id) }, data });
    res.json(record);
  } catch (e) { next(e); }
}

export async function replaceRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const { deleteIds, newRecords } = req.body;
    await basePrisma.$transaction(async (tx) => {
      if (deleteIds?.length) {
        await tx.psiRecord.deleteMany({ where: { id: { in: deleteIds } } });
      }
      for (const r of newRecords || []) {
        const data = cleanPsi(sanitizeCreate(r));
        if (!data.id) data.id = `psi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        normalizeDates(data);
        data.tenantId = tenantId;
        await tx.psiRecord.create({ data });
      }
    });
    res.json({ message: '已替换' });
  } catch (e) { next(e); }
}

export async function deleteRecord(req: Request, res: Response, next: NextFunction) {
  try {
    await basePrisma.psiRecord.delete({ where: { id: str(req.params.id) } });
    res.json({ message: '已删除' });
  } catch (e) { next(e); }
}

export async function deleteBatchRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const { ids } = req.body;
    await basePrisma.psiRecord.deleteMany({ where: { id: { in: ids } } });
    res.json({ message: '已删除' });
  } catch (e) { next(e); }
}

export async function getStock(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const productId = optStr(req.query.productId);
    const warehouseId = optStr(req.query.warehouseId);

    const whereClause: Record<string, unknown> = {
      type: { in: ['PURCHASE_BILL', 'SALES_BILL', 'TRANSFER', 'STOCKTAKE', 'STOCK_IN'] },
    };
    if (productId) whereClause.productId = productId;

    const records = await db.psiRecord.findMany({ where: whereClause });

    const stockMap: Record<string, number> = {};

    for (const r of records) {
      const pid = r.productId;
      if (!pid) continue;

      if (r.type === 'PURCHASE_BILL' || r.type === 'STOCK_IN') {
        if (!warehouseId || r.warehouseId === warehouseId) {
          stockMap[pid] = (stockMap[pid] || 0) + Number(r.quantity || 0);
        }
      } else if (r.type === 'SALES_BILL') {
        if (!warehouseId || r.warehouseId === warehouseId) {
          stockMap[pid] = (stockMap[pid] || 0) - Number(r.quantity || 0);
        }
      } else if (r.type === 'TRANSFER') {
        if (warehouseId) {
          if (r.toWarehouseId === warehouseId) stockMap[pid] = (stockMap[pid] || 0) + Number(r.quantity || 0);
          if (r.fromWarehouseId === warehouseId) stockMap[pid] = (stockMap[pid] || 0) - Number(r.quantity || 0);
        }
      }
    }

    const prodRecords = await db.productionOpRecord.findMany({
      where: { type: 'STOCK_IN', ...(productId ? { productId } : {}) },
    });
    for (const r of prodRecords) {
      stockMap[r.productId] = (stockMap[r.productId] || 0) + Number(r.quantity);
    }

    const result = Object.entries(stockMap).map(([pid, qty]) => ({
      productId: pid,
      stock: Math.max(0, qty),
    }));

    res.json(result);
  } catch (e) { next(e); }
}
