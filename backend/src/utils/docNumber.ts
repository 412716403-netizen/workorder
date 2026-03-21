import { prisma } from '../lib/prisma.js';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export async function generateReportNo(prefix: string): Promise<string> {
  const dateStr = todayStr();
  const pattern = `${prefix}${dateStr}-%`;

  const latest = await prisma.$queryRaw<Array<{ doc: string }>>`
    SELECT COALESCE(
      (SELECT report_no FROM milestone_reports WHERE report_no LIKE ${pattern} ORDER BY report_no DESC LIMIT 1),
      (SELECT report_no FROM product_progress_reports WHERE report_no LIKE ${pattern} ORDER BY report_no DESC LIMIT 1)
    ) as doc
  `;

  let seq = 1;
  const latestDoc = latest?.[0]?.doc;
  if (latestDoc) {
    const match = latestDoc.match(/-(\d+)$/);
    if (match) seq = parseInt(match[1]) + 1;
  }

  return `${prefix}${dateStr}-${String(seq).padStart(4, '0')}`;
}

export async function generateDocNo(prefix: string, tableName: 'production_op_records' | 'finance_records' | 'psi_records', column: string): Promise<string> {
  const dateStr = todayStr();
  const pattern = `${prefix}${dateStr}-%`;

  const result = await prisma.$queryRawUnsafe<Array<{ doc: string }>>(
    `SELECT ${column} as doc FROM ${tableName} WHERE ${column} LIKE $1 ORDER BY ${column} DESC LIMIT 1`,
    pattern,
  );

  let seq = 1;
  const latestDoc = result?.[0]?.doc;
  if (latestDoc) {
    const match = latestDoc.match(/-(\d+)$/);
    if (match) seq = parseInt(match[1]) + 1;
  }

  return `${prefix}${dateStr}-${String(seq).padStart(4, '0')}`;
}

export async function getNextPlanNumber(plans?: Array<{ planNumber: string }>): Promise<string> {
  if (!plans) {
    const allPlans = await prisma.planOrder.findMany({ select: { planNumber: true } });
    plans = allPlans;
  }
  let maxNum = 0;
  for (const p of plans) {
    const m = p.planNumber.match(/^PLN-?(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  }
  return `PLN${maxNum + 1}`;
}

export async function getNextOrderNumber(plans?: Array<{ orderNumber: string }>): Promise<string> {
  if (!plans) {
    const allOrders = await prisma.productionOrder.findMany({ select: { orderNumber: true } });
    plans = allOrders;
  }
  let maxNum = 0;
  for (const p of plans) {
    const m = p.orderNumber.match(/^WO-?(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  }
  return `WO${maxNum + 1}`;
}
