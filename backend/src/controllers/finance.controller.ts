import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma, prisma as basePrisma } from '../lib/prisma.js';
import { generateDocNo } from '../utils/docNumber.js';
import { FINANCE_DOC_NO_PREFIX, type FinanceOpType } from '../types/index.js';
import { str, optStr, sanitizeUpdate, sanitizeCreate, normalizeDates } from '../utils/request.js';

export async function listRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const type = optStr(req.query.type);
    const status = optStr(req.query.status);
    const categoryId = optStr(req.query.categoryId);
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    res.json(await db.financeRecord.findMany({
      where,
      include: { category: true },
      orderBy: { timestamp: 'desc' },
    }));
  } catch (e) { next(e); }
}

export async function getRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await basePrisma.financeRecord.findUnique({
      where: { id: str(req.params.id) },
      include: { category: true },
    });
    if (!record) { res.status(404).json({ error: '记录不存在' }); return; }
    res.json(record);
  } catch (e) { next(e); }
}

export async function createRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = sanitizeCreate(req.body);
    if (!data.id) data.id = `fin-${Date.now()}`;
    normalizeDates(data);
    if (!data.timestamp) data.timestamp = new Date();

    if (!data.docNo && FINANCE_DOC_NO_PREFIX[data.type as FinanceOpType]) {
      data.docNo = await generateDocNo(
        FINANCE_DOC_NO_PREFIX[data.type as FinanceOpType],
        'finance_records',
        'doc_no',
      );
    }

    const record = await db.financeRecord.create({ data });
    res.status(201).json(record);
  } catch (e) { next(e); }
}

export async function updateRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const data = sanitizeUpdate(req.body);
    normalizeDates(data);
    const record = await basePrisma.financeRecord.update({ where: { id: str(req.params.id) }, data });
    res.json(record);
  } catch (e) { next(e); }
}

export async function deleteRecord(req: Request, res: Response, next: NextFunction) {
  try {
    await basePrisma.financeRecord.delete({ where: { id: str(req.params.id) } });
    res.json({ message: '已删除' });
  } catch (e) { next(e); }
}
