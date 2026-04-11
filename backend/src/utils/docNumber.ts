import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export async function generateReportNo(prefix: string, tenantId?: string): Promise<string> {
  const dateStr = todayStr();
  const pattern = `${prefix}${dateStr}-%`;

  const params: string[] = [pattern];
  if (tenantId) params.push(tenantId);

  const msFilter = tenantId
    ? ` AND mr.milestone_id IN (SELECT m.id FROM milestones m JOIN production_orders po ON m.production_order_id = po.id WHERE po.tenant_id = $2::uuid)`
    : '';
  const pprFilter = tenantId
    ? ` AND ppr.progress_id IN (SELECT pmp.id FROM product_milestone_progresses pmp WHERE pmp.tenant_id = $2::uuid)`
    : '';

  const latest = await prisma.$queryRawUnsafe<Array<{ doc: string }>>(
    `SELECT COALESCE(
      (SELECT mr.report_no FROM milestone_reports mr WHERE mr.report_no LIKE $1${msFilter} ORDER BY mr.report_no DESC LIMIT 1),
      (SELECT ppr.report_no FROM product_progress_reports ppr WHERE ppr.report_no LIKE $1${pprFilter} ORDER BY ppr.report_no DESC LIMIT 1)
    ) as doc`,
    ...params,
  );

  let seq = 1;
  const latestDoc = latest?.[0]?.doc;
  if (latestDoc) {
    const match = latestDoc.match(/-(\d+)$/);
    if (match) seq = parseInt(match[1]) + 1;
  }

  return `${prefix}${dateStr}-${String(seq).padStart(4, '0')}`;
}

const ALLOWED_TABLES = new Set(['production_op_records', 'finance_records', 'psi_records']);
const ALLOWED_COLUMNS = new Set(['doc_no']);

export async function generateDocNo(
  prefix: string,
  tableName: 'production_op_records' | 'finance_records' | 'psi_records',
  column: 'doc_no',
  tenantId?: string,
): Promise<string> {
  if (!ALLOWED_TABLES.has(tableName) || !ALLOWED_COLUMNS.has(column)) {
    throw new Error('Invalid table/column');
  }

  const dateStr = todayStr();
  const pattern = `${prefix}${dateStr}-%`;
  const tenantFilter = tenantId ? ` AND tenant_id = $2::uuid` : '';

  const params: string[] = [pattern];
  if (tenantId) params.push(tenantId);

  const result = await prisma.$queryRawUnsafe<Array<{ doc: string }>>(
    `SELECT ${column} as doc FROM ${tableName} WHERE ${column} LIKE $1${tenantFilter} ORDER BY ${column} DESC LIMIT 1`,
    ...params,
  );

  let seq = 1;
  const latestDoc = result?.[0]?.doc;
  if (latestDoc) {
    const match = latestDoc.match(/-(\d+)$/);
    if (match) seq = parseInt(match[1]) + 1;
  }

  return `${prefix}${dateStr}-${String(seq).padStart(4, '0')}`;
}

/**
 * @param db 默认用全局 prisma；在事务内批量生成单号时必须传入事务 client（tx），否则读不到本事务内已插入的行，会重复单号并触发唯一约束。
 */
export async function getNextPlanNumber(
  tenantId?: string,
  db: Pick<PrismaClient, 'planOrder'> = prisma,
): Promise<string> {
  const where = tenantId ? { tenantId } : {};
  const rows = await db.planOrder.findMany({
    where,
    select: { planNumber: true },
  });
  let maxNum = 0;
  for (const r of rows) {
    const m = r.planNumber.match(/^PLN-?(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  return `PLN${maxNum + 1}`;
}

export async function getNextOrderNumber(tenantId?: string): Promise<string> {
  const where = tenantId ? { tenantId } : {};
  const rows = await prisma.productionOrder.findMany({
    where,
    select: { orderNumber: true },
  });
  let maxNum = 0;
  for (const r of rows) {
    const m = r.orderNumber.match(/^WO-?(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  return `WO${maxNum + 1}`;
}

/**
 * 扫描租户下全部工单号，取 WO 后第一段数字的最大值 +1（与计划转工单 WO2-1-2 等规则一致，忽略 CO- 等前缀）
 */
export async function getNextWorkOrderNumber(tenantId: string): Promise<string> {
  const rows = await prisma.productionOrder.findMany({
    where: { tenantId },
    select: { orderNumber: true },
  });
  let maxNum = 0;
  for (const o of rows) {
    const m = o.orderNumber.match(/^WO(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  return `WO${maxNum + 1}`;
}
