import type { TenantPrismaClient } from '../lib/prisma.js';
import { generateDocNo } from '../utils/docNumber.js';
import { genId } from '../utils/genId.js';
import { FINANCE_DOC_NO_PREFIX, type FinanceOpType } from '../types/index.js';
import { sanitizeUpdate, sanitizeCreate, normalizeDates } from '../utils/request.js';

export async function listRecords(
  db: TenantPrismaClient,
  opts: { type?: string; status?: string; categoryId?: string },
) {
  const where: Record<string, unknown> = {};
  if (opts.type) where.type = opts.type;
  if (opts.status) where.status = opts.status;
  if (opts.categoryId) where.categoryId = opts.categoryId;
  return db.financeRecord.findMany({
    where,
    include: { category: true },
    orderBy: [{ timestamp: 'desc' }, { id: 'asc' }],
  });
}

export async function getRecord(db: TenantPrismaClient, id: string) {
  return db.financeRecord.findUnique({
    where: { id },
    include: { category: true },
  });
}

export async function createRecord(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
  tenantId?: string,
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('fin');
  normalizeDates(data);
  if (!data.timestamp) data.timestamp = new Date();

  if (!data.docNo && FINANCE_DOC_NO_PREFIX[data.type as FinanceOpType]) {
    data.docNo = await generateDocNo(
      FINANCE_DOC_NO_PREFIX[data.type as FinanceOpType],
      'finance_records',
      'doc_no',
      tenantId,
    );
  }

  return db.financeRecord.create({ data });
}

export async function updateRecord(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const data = sanitizeUpdate(body);
  normalizeDates(data);
  return db.financeRecord.update({ where: { id }, data });
}

export async function deleteRecord(db: TenantPrismaClient, id: string) {
  await db.financeRecord.delete({ where: { id } });
  return { message: '已删除' };
}
