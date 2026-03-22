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

export async function generateDocNo(prefix: string, tableName: 'production_op_records' | 'finance_records' | 'psi_records', column: string, tenantId?: string): Promise<string> {
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

export async function getNextPlanNumber(tenantId?: string): Promise<string> {
  const where = tenantId ? { tenantId } : {};
  const plans = await prisma.planOrder.findMany({ where, select: { planNumber: true } });
  let maxNum = 0;
  for (const p of plans) {
    const m = p.planNumber.match(/^PLN-?(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  }
  return `PLN${maxNum + 1}`;
}

export async function getNextOrderNumber(tenantId?: string): Promise<string> {
  const where = tenantId ? { tenantId } : {};
  const orders = await prisma.productionOrder.findMany({ where, select: { orderNumber: true } });
  let maxNum = 0;
  for (const o of orders) {
    const m = o.orderNumber.match(/^WO-?(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  }
  return `WO${maxNum + 1}`;
}
