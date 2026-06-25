import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { generateDocNo, generateDocNoWithLock } from '../utils/docNumber.js';
import { genId } from '../utils/genId.js';
import { FINANCE_DOC_NO_PREFIX, FINANCE_TRANSFER_DOC_NO_PREFIX, FINANCE_UNASSIGNED_ACCOUNT_KEY, type FinanceOpType } from '../types/index.js';
import { sanitizeUpdate, sanitizeCreate, normalizeDates } from '../utils/request.js';
import { AppError } from '../middleware/errorHandler.js';

export interface FinanceListFilter {
  type?: string;
  status?: string;
  categoryId?: string;
  partner?: string;
  operator?: string;
  workerId?: string;
  productId?: string;
  accountTypeId?: string;
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
  if (opts.accountTypeId) {
    if (opts.accountTypeId === FINANCE_UNASSIGNED_ACCOUNT_KEY) {
      // 「未归账」：accountTypeId 为空且仅看收/付款（与余额聚合的 unassigned 口径一致）
      where.accountTypeId = null;
      if (!opts.type) where.type = { in: ['RECEIPT', 'PAYMENT'] };
    } else {
      where.accountTypeId = opts.accountTypeId;
    }
  }
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

/**
 * 由 `paymentAccount`（账户名）解析对应的 `accountTypeId` 外键。
 * 账户名一一对应账户类型；解析不到（空名/已删除账户）则置空，落入「未归账」。
 * paymentAccount 仍按字符串原样保存，账户改名时由历史回填/外键各司其职。
 */
async function resolveAccountTypeId(
  db: TenantPrismaClient,
  paymentAccount: unknown,
): Promise<string | null> {
  if (typeof paymentAccount !== 'string' || paymentAccount.trim() === '') return null;
  const acc = await db.financeAccountType.findFirst({
    where: { name: paymentAccount },
    select: { id: true },
  });
  return acc?.id ?? null;
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

  // 收/付款记录按账户名解析账户外键，保证写入即归账（否则全部落到「未归账」）。
  if (data.accountTypeId == null) {
    data.accountTypeId = await resolveAccountTypeId(db, data.paymentAccount);
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
  // paymentAccount 变更时同步刷新账户外键（含改成空 → 归为未归账）。
  if ('paymentAccount' in data && data.accountTypeId == null) {
    data.accountTypeId = await resolveAccountTypeId(db, data.paymentAccount);
  }
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

// ── 资金账户余额 ──

export interface AccountBalanceRow {
  accountTypeId: string;
  name: string;
  accountKind: string | null;
  initialBalance: number;
  /** 期初余额：全部时 = initialBalance；选期间时 = initialBalance + 期间开始日之前的净流水 */
  openingBalance: number;
  /** Σ RECEIPT（流入，展示口径） */
  inflow: number;
  /** Σ PAYMENT（流出，展示口径） */
  outflow: number;
  /** 当前余额：initialBalance + 全量Σ(RECEIPT) - 全量Σ(PAYMENT) */
  balance: number;
}

export interface AccountBalancesResult {
  accounts: AccountBalanceRow[];
  totals: { initialBalance: number; openingBalance: number; inflow: number; outflow: number; balance: number };
  /** 未归账：accountTypeId 为空的历史流水合计，供前端给出提示 */
  unassigned: { inflow: number; outflow: number };
}

/** 把分组聚合行拆成「按账户的流入/流出」两张表 + 未归账合计 */
function splitGroupedFlows(
  grouped: Array<{ accountTypeId: string | null; type: string; amount: number }>,
) {
  const inflowMap = new Map<string, number>();
  const outflowMap = new Map<string, number>();
  const unassigned = { inflow: 0, outflow: 0 };
  for (const row of grouped) {
    const amount = Number(row.amount ?? 0);
    const isReceipt = row.type === 'RECEIPT';
    if (row.accountTypeId == null) {
      if (isReceipt) unassigned.inflow += amount;
      else unassigned.outflow += amount;
      continue;
    }
    const target = isReceipt ? inflowMap : outflowMap;
    target.set(row.accountTypeId, (target.get(row.accountTypeId) ?? 0) + amount);
  }
  return { inflowMap, outflowMap, unassigned };
}

/**
 * 纯函数：把账户主数据 + 分组聚合行汇总成各账户余额。
 * - `grouped`：展示口径（可被「今日/本周/本月」期间筛选）的流入/流出 + 未归账；
 * - `balanceGrouped`：余额口径（始终全量、不受期间影响），默认与 `grouped` 相同（即「全部」）；
 * - `openingGrouped`：期间开始日**之前**的净流水；用于期初余额，默认空（即「全部」时期初 = initialBalance）。
 * 口径：inflow/outflow 取展示口径；balance = initialBalance + 全量净流水；
 * openingBalance = initialBalance + 期初前净流水（全部时退化为 initialBalance）。
 * 抽成纯函数便于单测，不依赖 Prisma / req。
 */
export function accumulateAccountBalances(
  accountTypes: Array<{ id: string; name: string; accountKind: string | null; initialBalance: unknown }>,
  grouped: Array<{ accountTypeId: string | null; type: string; amount: number }>,
  balanceGrouped: Array<{ accountTypeId: string | null; type: string; amount: number }> = grouped,
  openingGrouped: Array<{ accountTypeId: string | null; type: string; amount: number }> = [],
): AccountBalancesResult {
  const { inflowMap, outflowMap, unassigned } = splitGroupedFlows(grouped);
  const { inflowMap: balInflowMap, outflowMap: balOutflowMap } = splitGroupedFlows(balanceGrouped);
  const { inflowMap: openInflowMap, outflowMap: openOutflowMap } = splitGroupedFlows(openingGrouped);

  const accounts: AccountBalanceRow[] = accountTypes.map(acc => {
    const initialBalance = Number(acc.initialBalance ?? 0);
    const inflow = inflowMap.get(acc.id) ?? 0;
    const outflow = outflowMap.get(acc.id) ?? 0;
    const balInflow = balInflowMap.get(acc.id) ?? 0;
    const balOutflow = balOutflowMap.get(acc.id) ?? 0;
    const openInflow = openInflowMap.get(acc.id) ?? 0;
    const openOutflow = openOutflowMap.get(acc.id) ?? 0;
    return {
      accountTypeId: acc.id,
      name: acc.name,
      accountKind: acc.accountKind ?? null,
      initialBalance,
      openingBalance: initialBalance + openInflow - openOutflow,
      inflow,
      outflow,
      balance: initialBalance + balInflow - balOutflow,
    };
  });

  const totals = accounts.reduce(
    (acc, r) => ({
      initialBalance: acc.initialBalance + r.initialBalance,
      openingBalance: acc.openingBalance + r.openingBalance,
      inflow: acc.inflow + r.inflow,
      outflow: acc.outflow + r.outflow,
      balance: acc.balance + r.balance,
    }),
    { initialBalance: 0, openingBalance: 0, inflow: 0, outflow: 0, balance: 0 },
  );

  return { accounts, totals, unassigned };
}

export interface CreateTransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  timestamp?: string;
  note?: string;
  operator?: string;
}

/**
 * 账户间转账（内部调拨）：在一个事务内落两条流水——
 * - PAYMENT（转出账户）+ RECEIPT（转入账户），共享同一 ZZD 转账单号与 transferGroupId；
 * - 两条流水保持 RECEIPT/PAYMENT 类型，天然复用账户余额聚合；
 * - customData.transfer=true 用于报表区分内部调拨与真实收付。
 */
export async function createTransfer(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateTransferInput,
) {
  const amount = Number(input.amount);
  if (!input.fromAccountId || !input.toAccountId) throw new AppError(400, '转出/转入账户不能为空');
  if (input.fromAccountId === input.toAccountId) throw new AppError(400, '转出与转入账户不能相同');
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, '转账金额必须大于 0');

  // 事务内的 tx 不经 getTenantPrisma 扩展（见 lib/prisma.ts 说明），
  // 因此读侧须显式带 tenantId 过滤、写侧须显式写入 tenantId。
  return basePrisma.$transaction(async tx => {
    const [fromAcc, toAcc] = await Promise.all([
      tx.financeAccountType.findFirst({ where: { id: input.fromAccountId, tenantId } }),
      tx.financeAccountType.findFirst({ where: { id: input.toAccountId, tenantId } }),
    ]);
    if (!fromAcc) throw new AppError(404, '转出账户不存在');
    if (!toAcc) throw new AppError(404, '转入账户不存在');

    const docNo = await generateDocNoWithLock(
      tx,
      FINANCE_TRANSFER_DOC_NO_PREFIX,
      'finance_records',
      'doc_no',
      tenantId,
    );
    const transferGroupId = genId('xfer');
    const timestamp = input.timestamp ? new Date(input.timestamp) : new Date();
    const note = input.note?.trim() || `账户转账：${fromAcc.name} → ${toAcc.name}`;
    const operator = input.operator?.trim() || null;

    const outRecord = await tx.financeRecord.create({
      data: {
        id: genId('fin'),
        tenantId,
        type: 'PAYMENT',
        docNo,
        amount,
        timestamp,
        note,
        operator,
        relatedId: transferGroupId,
        status: 'COMPLETED',
        accountTypeId: fromAcc.id,
        paymentAccount: fromAcc.name,
        customData: {
          transfer: true,
          transferGroupId,
          direction: 'out',
          counterpartAccountId: toAcc.id,
          counterpartAccountName: toAcc.name,
        },
      },
    });

    const inRecord = await tx.financeRecord.create({
      data: {
        id: genId('fin'),
        tenantId,
        type: 'RECEIPT',
        docNo,
        amount,
        timestamp,
        note,
        operator,
        relatedId: transferGroupId,
        status: 'COMPLETED',
        accountTypeId: toAcc.id,
        paymentAccount: toAcc.name,
        customData: {
          transfer: true,
          transferGroupId,
          direction: 'in',
          counterpartAccountId: fromAcc.id,
          counterpartAccountName: fromAcc.name,
        },
      },
    });

    return { transferGroupId, docNo, outRecord, inRecord };
  });
}

/** 由 startDate/endDate 生成 timestamp 范围过滤（gte/lte）；无有效边界返回 null */
function timestampRange(startDate?: string, endDate?: string): { gte?: Date; lte?: Date } | null {
  const ts: { gte?: Date; lte?: Date } = {};
  if (startDate) {
    const d = new Date(startDate);
    if (!Number.isNaN(d.getTime())) ts.gte = d;
  }
  if (endDate) {
    const d = new Date(endDate);
    if (!Number.isNaN(d.getTime())) ts.lte = d;
  }
  return ts.gte || ts.lte ? ts : null;
}

/**
 * 资金账户余额：按 accountTypeId 实时聚合（期初 + 收 - 付），不落库存量值。
 * 仅统计 RECEIPT / PAYMENT 且未作废（status != CANCELLED）的流水。
 * `startDate/endDate` 仅约束「流入/流出」展示口径（今日/本周/本月）；
 * 「当前余额」始终按全量聚合，不随期间变化。
 */
export async function getAccountBalances(
  db: TenantPrismaClient,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<AccountBalancesResult> {
  const baseWhere = { type: { in: ['RECEIPT', 'PAYMENT'] }, status: { not: 'CANCELLED' } };
  const range = timestampRange(opts.startDate, opts.endDate);
  // 期初余额口径：统计「期间开始日（range.gte）之前」的净流水；无开始日（全部）则不查。
  const openingBefore = range?.gte ?? null;

  const mapGrouped = (rows: Array<{ accountTypeId: string | null; type: string; _sum: { amount: unknown } }>) =>
    rows.map(g => ({ accountTypeId: g.accountTypeId, type: g.type, amount: Number(g._sum.amount ?? 0) }));

  const [accountTypes, allTimeGrouped, periodGroupedRaw, openingGroupedRaw] = await Promise.all([
    db.financeAccountType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, accountKind: true, initialBalance: true },
    }),
    db.financeRecord.groupBy({
      by: ['accountTypeId', 'type'],
      where: baseWhere,
      _sum: { amount: true },
    }),
    range
      ? db.financeRecord.groupBy({
          by: ['accountTypeId', 'type'],
          where: { ...baseWhere, timestamp: range },
          _sum: { amount: true },
        })
      : Promise.resolve(null),
    openingBefore
      ? db.financeRecord.groupBy({
          by: ['accountTypeId', 'type'],
          where: { ...baseWhere, timestamp: { lt: openingBefore } },
          _sum: { amount: true },
        })
      : Promise.resolve(null),
  ]);

  const allTime = mapGrouped(allTimeGrouped);
  const period = periodGroupedRaw ? mapGrouped(periodGroupedRaw) : allTime;
  const opening = openingGroupedRaw ? mapGrouped(openingGroupedRaw) : [];

  return accumulateAccountBalances(accountTypes, period, allTime, opening);
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
