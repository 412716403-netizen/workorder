import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { withDocNoAdvisoryLock, withDocNoAdvisoryLockTx } from './docNumberLock.js';
import { PLAN_DOC_NO_PREFIX, WORK_ORDER_DOC_NO_PREFIX } from '../types/index.js';

export { PLAN_DOC_NO_PREFIX, WORK_ORDER_DOC_NO_PREFIX };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

type TxClient = Prisma.TransactionClient;

export async function generateReportNo(prefix: string, tenantId?: string): Promise<string> {
  // 跨进程串行化报工号取号（与 docNo 同一套 advisory lock 体系，scope 区分）。
  return withDocNoAdvisoryLock(tenantId, `report_no:${prefix}`, async tx => {
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

    const latest = await tx.$queryRawUnsafe<Array<{ doc: string }>>(
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
      if (match) seq = parseInt(match[1], 10) + 1;
    }

    return `${prefix}${dateStr}-${String(seq).padStart(4, '0')}`;
  });
}

const ALLOWED_TABLES = new Set(['production_op_records', 'finance_records', 'psi_records']);
const ALLOWED_COLUMNS = new Set(['doc_no']);

/**
 * 跨进程并发安全的单号生成。
 *
 * - **必须**在一个持有「同一个 (tenantId, prefix) advisory lock」的事务内被调用，
 *   否则两个并发请求会取到相同 max+1。
 * - 推荐入口：`generateDocNo(...)`，会自动开启一个最小事务并持锁；
 *   如果调用方已经在事务里，传入 `tx` 参数走 `generateDocNoTx(...)` 复用同一事务，
 *   避免锁被提前释放（advisory_xact_lock 在事务结束才释放）。
 */
async function readMaxDocSeq(
  db: TxClient | PrismaClient,
  prefix: string,
  tableName: 'production_op_records' | 'finance_records' | 'psi_records',
  column: 'doc_no',
  tenantId?: string,
): Promise<number> {
  const dateStr = todayStr();
  const pattern = `${prefix}${dateStr}-%`;
  const tenantFilter = tenantId ? ` AND tenant_id = $2::uuid` : '';
  const params: string[] = [pattern];
  if (tenantId) params.push(tenantId);

  const result = await db.$queryRawUnsafe<Array<{ doc: string }>>(
    `SELECT ${column} as doc FROM ${tableName} WHERE ${column} LIKE $1${tenantFilter} ORDER BY ${column} DESC LIMIT 1`,
    ...params,
  );

  const latestDoc = result?.[0]?.doc;
  if (!latestDoc) return 0;
  const match = latestDoc.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function buildDocNo(prefix: string, seq: number): string {
  return `${prefix}${todayStr()}-${String(seq).padStart(4, '0')}`;
}

/** 已在事务里时使用，复用 outer tx；调用方负责持有 advisory lock。 */
export async function generateDocNoTx(
  tx: TxClient,
  prefix: string,
  tableName: 'production_op_records' | 'finance_records' | 'psi_records',
  column: 'doc_no',
  tenantId?: string,
): Promise<string> {
  if (!ALLOWED_TABLES.has(tableName) || !ALLOWED_COLUMNS.has(column)) {
    throw new Error('Invalid table/column');
  }
  const maxSeq = await readMaxDocSeq(tx, prefix, tableName, column, tenantId);
  return buildDocNo(prefix, maxSeq + 1);
}

/**
 * 独立取号入口：自动起一个最小事务并持 advisory lock，保证 PM2 cluster / 多副本下
 * 同 (tenantId, prefix) 的取号串行化。
 *
 * **注意**：取号事务在本函数返回时即提交，advisory lock 也随之释放。
 * 因此从"取号"到"实际 db.create"之间仍存在 race window；
 * 若两个并发请求在 race window 内都拿到相同 maxSeq+1，会重号。
 *
 * 安全用法（强烈推荐）：在调用方自身的更大事务里用 `generateDocNoTx`，
 * 配合 `withDocNoAdvisoryLockTx` 把 advisory lock 延伸到 db.create 完成。
 */
export async function generateDocNo(
  prefix: string,
  tableName: 'production_op_records' | 'finance_records' | 'psi_records',
  column: 'doc_no',
  tenantId?: string,
): Promise<string> {
  return withDocNoAdvisoryLock(tenantId, `${tableName}:${column}:${prefix}`, async tx => {
    return generateDocNoTx(tx, prefix, tableName, column, tenantId);
  });
}

/** 给在外层事务里的调用方用：自行持锁 + 取号一体的便捷封装。 */
export async function generateDocNoWithLock(
  tx: TxClient,
  prefix: string,
  tableName: 'production_op_records' | 'finance_records' | 'psi_records',
  column: 'doc_no',
  tenantId?: string,
): Promise<string> {
  return withDocNoAdvisoryLockTx(tx, tenantId, `${tableName}:${column}:${prefix}`, async () =>
    generateDocNoTx(tx, prefix, tableName, column, tenantId),
  );
}

/**
 * 解析计划单号 / 工单号的主序号（PLN40、PLN-40、WO40、PLN40-S1 均取 40）。
 */
export function parsePlnWoPrimarySeq(docNo: string): number | null {
  const m = (docNo || '').trim().match(/^(?:PLN|WO)-?(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** 计划单号 → 工单号：PLN40 → WO40，PLN40-S1 → WO40-S1 */
export function planNumberToOrderNumber(planNumber: string): string {
  return planNumber.replace(/^PLN-?/i, WORK_ORDER_DOC_NO_PREFIX);
}

type PlnWoSeqDb = Pick<PrismaClient, 'planOrder' | 'productionOrder'>;

/**
 * 租户下计划单与工单主序号的最大值（共用取号池，含协作接单自动建单）。
 * @param db 事务内须传入 tx，否则读不到本事务内已插入的行。
 */
export async function getMaxPlnWoPrimarySeq(
  tenantId: string,
  db: PlnWoSeqDb = prisma,
): Promise<number> {
  const where = { tenantId };
  const [planRows, orderRows] = await Promise.all([
    db.planOrder.findMany({ where, select: { planNumber: true } }),
    db.productionOrder.findMany({ where, select: { orderNumber: true } }),
  ]);
  let maxNum = 0;
  for (const r of planRows) {
    const seq = parsePlnWoPrimarySeq(r.planNumber);
    if (seq != null) maxNum = Math.max(maxNum, seq);
  }
  for (const r of orderRows) {
    const seq = parsePlnWoPrimarySeq(r.orderNumber);
    if (seq != null) maxNum = Math.max(maxNum, seq);
  }
  return maxNum;
}

/**
 * @param db 默认用全局 prisma；在事务内批量生成单号时必须传入事务 client（tx），否则读不到本事务内已插入的行，会重复单号并触发唯一约束。
 */
export async function getNextPlanNumber(
  tenantId: string,
  db: Pick<PrismaClient, 'planOrder' | 'productionOrder'> = prisma,
): Promise<string> {
  const maxNum = await getMaxPlnWoPrimarySeq(tenantId, db);
  return `${PLAN_DOC_NO_PREFIX}${maxNum + 1}`;
}

/** @deprecated 使用 getNextWorkOrderNumber(tenantId) */
export async function getNextOrderNumber(tenantId: string): Promise<string> {
  return getNextWorkOrderNumber(tenantId);
}

/**
 * 扫描租户下计划单 + 工单主序号取 max+1（与计划转工单 WO2-1-2 等后缀规则一致）。
 * @param db 事务内须传入 tx，否则读不到本事务内已插入的工单号、会重复单号。
 */
export async function getNextWorkOrderNumber(
  tenantId: string,
  db: Pick<PrismaClient, 'planOrder' | 'productionOrder'> = prisma,
): Promise<string> {
  const maxNum = await getMaxPlnWoPrimarySeq(tenantId, db);
  return `${WORK_ORDER_DOC_NO_PREFIX}${maxNum + 1}`;
}
