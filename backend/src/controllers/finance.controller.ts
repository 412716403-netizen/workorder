import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as financeService from '../services/finance.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listQueryFromRequest, warnListAllFromRequest } from '../utils/listQuery.js';

function parseFinanceFilter(req: { query: Record<string, unknown> }) {
  return {
    type: optStr(req.query.type),
    status: optStr(req.query.status),
    categoryId: optStr(req.query.categoryId),
    partner: optStr(req.query.partner),
    operator: optStr(req.query.operator),
    workerId: optStr(req.query.workerId),
    productId: optStr(req.query.productId),
    accountTypeId: optStr(req.query.accountTypeId),
    startDate: optStr(req.query.startDate),
    endDate: optStr(req.query.endDate),
    search: optStr(req.query.search),
  };
}

export const listRecords = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('finance.listRecords', req);
  res.json(await financeService.listRecords(db, {
    ...parseFinanceFilter(req),
    all,
    page,
    pageSize,
  }));
});

export const summary = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const topPartners = req.query.topPartners ? Number(req.query.topPartners) : undefined;
  res.json(await financeService.summarize(db, {
    ...parseFinanceFilter(req),
    topPartners,
  }));
});

export const accountBalances = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await financeService.getAccountBalances(db, {
    startDate: optStr(req.query.startDate),
    endDate: optStr(req.query.endDate),
  }));
});

export const createTransfer = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const result = await financeService.createTransfer(db, tenantId, {
    fromAccountId: str(req.body.fromAccountId),
    toAccountId: str(req.body.toAccountId),
    amount: Number(req.body.amount),
    timestamp: optStr(req.body.timestamp),
    note: optStr(req.body.note),
    operator: optStr(req.body.operator),
  });
  res.status(201).json(result);
});

export const getRecord = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const record = await financeService.getRecord(db, str(req.params.id));
  if (!record) { res.status(404).json({ error: '记录不存在' }); return; }
  res.json(record);
});

export const createRecord = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const record = await financeService.createRecord(db, req.body, req.tenantId);
  res.status(201).json(record);
});

export const updateRecord = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await financeService.updateRecord(db, str(req.params.id), req.body));
});

export const deleteRecord = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await financeService.deleteRecord(db, str(req.params.id)));
});

/** Phase 3.D follow-up：销售单打印「上次结余」窄查端点 */
export const partnerReceivable = asyncHandler(async (req, res) => {
  const partnerName = optStr(req.query.partnerName) ?? '';
  const partnerId = optStr(req.query.partnerId);
  const before = optStr(req.query.before);
  if (!before) {
    res.status(400).json({ error: '缺少 before（ISO 时间）' });
    return;
  }
  if (!partnerName && !partnerId) {
    res.json({ previousBalance: 0, anchorTimeMs: Date.parse(before) || Date.now() });
    return;
  }
  res.json(
    await financeService.getPartnerReceivableBefore(getTenantPrisma(req.tenantId!), {
      partnerName,
      partnerId,
      before,
      excludeSalesBillDocNumber: optStr(req.query.excludeSalesBillDocNumber),
    }),
  );
});
