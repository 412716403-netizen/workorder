import type { TenantPrismaClient } from '../lib/prisma.js';
import { generateDocNo } from '../utils/docNumber.js';
import { genId } from '../utils/genId.js';
import { FINANCE_DOC_NO_PREFIX, type FinanceOpType } from '../types/index.js';
import { sanitizeUpdate, sanitizeCreate, normalizeDates } from '../utils/request.js';

export interface FinanceListFilter {
  type?: string;
  status?: string;
  categoryId?: string;
  partner?: string;
  operator?: string;
  workerId?: string;
  productId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

/** Phase 3.A：把过滤参数从 controller 透传到 where 子句 */
function buildFinanceWhere(opts: FinanceListFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (opts.type) where.type = opts.type;
  if (opts.status) where.status = opts.status;
  if (opts.categoryId) where.categoryId = opts.categoryId;
  if (opts.workerId) where.workerId = opts.workerId;
  if (opts.productId) where.productId = opts.productId;
  if (opts.partner) where.partner = { contains: opts.partner, mode: 'insensitive' };
  // 注意：`FinanceRecord` 当前 schema 无 `partnerId` 列，仅有 `partner`（合作单位 name）。
  // 历史曾写 `where.partner = opts.partnerId` 形如 "拿 id 当 name 精确匹配"，永远查不到，
  // 且会覆盖上一行的模糊匹配；前端实际也未传该参数，统一去掉以免误用。
  if (opts.operator) where.operator = { contains: opts.operator, mode: 'insensitive' };

  if (opts.startDate || opts.endDate) {
    const ts: Record<string, Date> = {};
    if (opts.startDate) {
      const d = new Date(opts.startDate);
      if (!Number.isNaN(d.getTime())) ts.gte = d;
    }
    if (opts.endDate) {
      const d = new Date(opts.endDate);
      if (!Number.isNaN(d.getTime())) ts.lte = d;
    }
    if (Object.keys(ts).length) where.timestamp = ts;
  }

  if (opts.search) {
    where.OR = [
      { docNo: { contains: opts.search, mode: 'insensitive' } },
      { partner: { contains: opts.search, mode: 'insensitive' } },
      { operator: { contains: opts.search, mode: 'insensitive' } },
      { note: { contains: opts.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export async function listRecords(
  db: TenantPrismaClient,
  opts: FinanceListFilter & {
    all?: boolean;
    page?: number;
    pageSize?: number;
  },
) {
  const where = buildFinanceWhere(opts);
  const include = { category: true };
  const orderBy: any = [{ timestamp: 'desc' }, { id: 'asc' }];

  if (opts.all) {
    return db.financeRecord.findMany({ where, include, orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.financeRecord.findMany({ where, include, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.financeRecord.count({ where }),
  ]);
  return { data, total, page, pageSize };
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

/**
 * Phase 3.A：财务对账聚合下沉。
 * 一次往返返回：
 * - 总计：按 `type` 分组的金额合计与笔数；
 * - 按状态：`status` × `type` 的金额合计与笔数；
 * - 按类别：`categoryId` 分组的金额合计；
 * - 按合作单位：`partner` 分组前 N 名金额合计。
 * 全部受 `filter`（startDate/endDate/type/...）约束，与列表口径完全一致。
 */
export async function summarize(
  db: TenantPrismaClient,
  opts: FinanceListFilter & { topPartners?: number },
) {
  const where = buildFinanceWhere(opts);
  const topPartners = Math.min(Math.max(1, opts.topPartners ?? 10), 50);

  const [byType, byStatus, byCategory, byPartnerRaw] = await Promise.all([
    db.financeRecord.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.financeRecord.groupBy({
      by: ['type', 'status'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.financeRecord.groupBy({
      by: ['categoryId'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.financeRecord.groupBy({
      by: ['partner'],
      where,
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: topPartners,
    }),
  ]);

  return {
    byType: byType.map(r => ({
      type: r.type,
      amount: r._sum.amount ?? 0,
      count: r._count._all,
    })),
    byStatus: byStatus.map(r => ({
      type: r.type,
      status: r.status,
      amount: r._sum.amount ?? 0,
      count: r._count._all,
    })),
    byCategory: byCategory.map(r => ({
      categoryId: r.categoryId,
      amount: r._sum.amount ?? 0,
      count: r._count._all,
    })),
    topPartners: byPartnerRaw.map(r => ({
      partner: r.partner,
      amount: r._sum.amount ?? 0,
    })),
  };
}

/**
 * Phase 3.D follow-up：销售单打印「上次结余 / 累计应收」窄查接口。
 * 与 `utils/partnerReceivableLedger.computePartnerReceivableBeforeDoc` 同口径：
 * - PSI: SALES_BILL（应收+）、PURCHASE_BILL（应收-）；
 * - 财务: RECEIPT（应收-）、PAYMENT（应收+）；
 * - 生产: OUTSOURCE 已收回（应收-）；
 * 仅返回截至 `before`（不含本单）的余额，本单签名净额由前端 builder 加上。
 *
 * 调用方：`GET /api/finance/partner-receivable?partnerName=...&partnerId=...&before=2025-01-01T00:00:00.000Z&excludeSalesBillDocNumber=...`
 * - `excludeSalesBillDocNumber`：编辑销售单时排除自身（避免把本单算进 previous）。
 */
export async function getPartnerReceivableBefore(
  db: TenantPrismaClient,
  opts: {
    partnerName: string;
    partnerId?: string | null;
    /** ISO 时间字符串；表示「锚点时刻」，结余只算严格早于该时刻的单据 */
    before: string;
    /** 编辑销售单时排除自身 docNumber，避免把本单计入 previous */
    excludeSalesBillDocNumber?: string | null;
  },
): Promise<{ previousBalance: number; anchorTimeMs: number }> {
  const name = (opts.partnerName ?? '').trim();
  const partnerId = (opts.partnerId ?? '').trim();
  if (!name && !partnerId) {
    return { previousBalance: 0, anchorTimeMs: Date.now() };
  }
  const beforeTime = Date.parse(opts.before);
  if (Number.isNaN(beforeTime)) {
    return { previousBalance: 0, anchorTimeMs: Date.now() };
  }
  const beforeDate = new Date(beforeTime);

  const exclude = (opts.excludeSalesBillDocNumber ?? '').trim();

  // PSI: 同合作单位（id 优先、name 回退）的 SALES_BILL + PURCHASE_BILL，时间严格早于 before
  const psiPartnerOr: Array<Record<string, unknown>> = [];
  if (partnerId) psiPartnerOr.push({ partnerId });
  if (name) psiPartnerOr.push({ partner: name });

  const [psiSales, psiPurchase] = await Promise.all([
    db.psiRecord.findMany({
      where: {
        type: 'SALES_BILL',
        OR: psiPartnerOr,
        // 与前端口径一致：用 line 最早时间，但 DB 没存「按 doc 的最早时间」，这里近似用 createdAt（与 PSI 单据行的 createdAt 同义）严格早于 before。
        createdAt: { lt: beforeDate },
        ...(exclude ? { NOT: { docNumber: exclude } } : {}),
      },
      select: { docNumber: true, amount: true, createdAt: true, id: true },
    }),
    db.psiRecord.findMany({
      where: {
        type: 'PURCHASE_BILL',
        OR: psiPartnerOr,
        createdAt: { lt: beforeDate },
      },
      select: { docNumber: true, amount: true, createdAt: true, id: true },
    }),
  ]);

  // Finance: RECEIPT / PAYMENT（partner name 精确匹配，与前端口径一致）
  const fin = name
    ? await db.financeRecord.findMany({
        where: {
          type: { in: ['RECEIPT', 'PAYMENT'] },
          partner: name,
          timestamp: { lt: beforeDate },
        },
        select: { docNo: true, type: true, amount: true, timestamp: true, id: true },
      })
    : [];

  // 生产: OUTSOURCE 已收回（partner name 精确匹配）
  const prod = name
    ? await db.productionOpRecord.findMany({
        where: {
          type: 'OUTSOURCE',
          status: '已收回',
          partner: name,
          timestamp: { lt: beforeDate },
        },
        select: { docNo: true, amount: true, timestamp: true, id: true },
      })
    : [];

  // 按 doc 维度聚合 inc/dec
  type LedgerDoc = { key: string; inc: number; dec: number };
  const docs: LedgerDoc[] = [];

  const groupByDoc = <T extends { docNumber?: string | null; id: string }>(rows: T[], typeKey: string) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const key = `${typeKey}|${r.docNumber || r.id}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return m;
  };

  const sumAmount = (rows: Array<{ amount: unknown }>) =>
    rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  // SALES_BILL：金额≥0 视为应收增；<0 退货视为应收减
  for (const [key, rows] of groupByDoc(psiSales, 'SALES_BILL')) {
    const amount = sumAmount(rows);
    if (amount >= 0) docs.push({ key, inc: amount, dec: 0 });
    else docs.push({ key, inc: 0, dec: Math.abs(amount) });
  }
  // PURCHASE_BILL：金额≥0 减应收；<0 退货视为应收增
  for (const [key, rows] of groupByDoc(psiPurchase, 'PURCHASE_BILL')) {
    const amount = sumAmount(rows);
    if (amount >= 0) docs.push({ key, inc: 0, dec: Math.abs(amount) });
    else docs.push({ key, inc: Math.abs(amount), dec: 0 });
  }

  // 财务
  const finByDoc = new Map<string, typeof fin>();
  for (const r of fin) {
    const dk = `${r.type}|${r.docNo || r.id}`;
    if (!finByDoc.has(dk)) finByDoc.set(dk, []);
    finByDoc.get(dk)!.push(r);
  }
  for (const [key, rows] of finByDoc) {
    const amount = sumAmount(rows);
    if (key.startsWith('RECEIPT|')) docs.push({ key, inc: 0, dec: Math.abs(amount) });
    else docs.push({ key, inc: Math.abs(amount), dec: 0 });
  }

  // 外协收回（减应收）
  const prodByDoc = new Map<string, typeof prod>();
  for (const r of prod) {
    const dk = `OUTSOURCE|${r.docNo || r.id}`;
    if (!prodByDoc.has(dk)) prodByDoc.set(dk, []);
    prodByDoc.get(dk)!.push(r);
  }
  for (const [key, rows] of prodByDoc) {
    docs.push({ key, inc: 0, dec: Math.abs(sumAmount(rows)) });
  }

  const previous = docs.reduce((s, d) => s + d.inc - d.dec, 0);
  return { previousBalance: previous, anchorTimeMs: beforeTime };
}
