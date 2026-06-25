import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as psiService from '../services/psi.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listQueryFromRequest, warnListAllFromRequest } from '../utils/listQuery.js';

export const listRecords = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('psi.listRecords', req);
  const typesCsv = optStr(req.query.types);
  const types = typesCsv
    ? typesCsv.split(',').map(s => s.trim()).filter(Boolean)
    : undefined;
  res.json(await psiService.listRecords(db, {
    type: optStr(req.query.type),
    types,
    productId: optStr(req.query.productId),
    docNumber: optStr(req.query.docNumber),
    partnerId: optStr(req.query.partnerId),
    startDate: optStr(req.query.startDate),
    endDate: optStr(req.query.endDate),
    search: optStr(req.query.search),
    all,
    page,
    pageSize,
  }));
});

export const createRecord = asyncHandler(async (req, res) => {
  res.status(201).json(await psiService.createRecord(getTenantPrisma(req.tenantId!), req.body));
});

export const createBatchRecords = asyncHandler(async (req, res) => {
  res.status(201).json(await psiService.createBatchRecords(getTenantPrisma(req.tenantId!), req.body.records));
});

export const updateRecord = asyncHandler(async (req, res) => {
  res.json(await psiService.updateRecord(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});

export const replaceRecords = asyncHandler(async (req, res) => {
  res.json(await psiService.replaceRecords(getTenantPrisma(req.tenantId!), req.body.deleteIds, req.body.newRecords));
});

export const deleteRecord = asyncHandler(async (req, res) => {
  res.json(await psiService.deleteRecord(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

export const deleteBatchRecords = asyncHandler(async (req, res) => {
  res.json(await psiService.deleteBatchRecords(getTenantPrisma(req.tenantId!), req.body.ids));
});

export const getStock = asyncHandler(async (req, res) => {
  res.json(await psiService.getStock(getTenantPrisma(req.tenantId!), {
    productId: optStr(req.query.productId),
    warehouseId: optStr(req.query.warehouseId),
  }));
});

export const getStockSnapshot = asyncHandler(async (req, res) => {
  res.json(await psiService.getStockSnapshot(getTenantPrisma(req.tenantId!), {
    productId: optStr(req.query.productId),
    warehouseId: optStr(req.query.warehouseId),
  }));
});

export const getStockBatches = asyncHandler(async (req, res) => {
  const productId = optStr(req.query.productId);
  const warehouseId = optStr(req.query.warehouseId);
  if (!productId || !warehouseId) {
    res.status(400).json({ error: '缺少 productId 或 warehouseId' });
    return;
  }
  res.json(
    await psiService.getStockBatches(getTenantPrisma(req.tenantId!), {
      productId,
      warehouseId,
      excludeProductionOpRecordId: optStr(req.query.excludeProductionOpRecordId) ?? undefined,
    }),
  );
});

/** Phase 3.D follow-up：计划详情面板"计划相关 PSI" 窄查端点 */
export const listPlanRelated = asyncHandler(async (req, res) => {
  const planId = optStr(req.query.planId) ?? '';
  const planNumbersRaw = req.query.planNumbers;
  let planNumbers: string[] = [];
  if (typeof planNumbersRaw === 'string') {
    planNumbers = planNumbersRaw.split(',').map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(planNumbersRaw)) {
    planNumbers = planNumbersRaw.map(v => String(v).trim()).filter(Boolean);
  }
  // 单次最多 100 个 planNumber，避免被恶意构造大查询
  if (planNumbers.length > 100) planNumbers = planNumbers.slice(0, 100);
  res.json(
    await psiService.listPlanRelatedPsi(getTenantPrisma(req.tenantId!), {
      planId,
      planNumbers,
    }),
  );
});

/** 计划单列表「采购订单进度」批量汇总端点（POST，body: { plans: [{ planId, planNumbers }] }） */
export const listPlansPurchaseProgress = asyncHandler(async (req, res) => {
  const rawPlans = Array.isArray(req.body?.plans) ? req.body.plans : [];
  // 单次最多 100 个计划、每计划最多 100 个 planNumber，避免被构造大查询
  const plans = rawPlans.slice(0, 100).map((p: { planId?: unknown; planNumbers?: unknown }) => ({
    planId: String(p?.planId ?? '').trim(),
    planNumbers: (Array.isArray(p?.planNumbers) ? p.planNumbers : [])
      .slice(0, 100)
      .map((n: unknown) => String(n ?? '').trim())
      .filter(Boolean),
  }));
  res.json(await psiService.listPlansPurchaseProgress(getTenantPrisma(req.tenantId!), plans));
});

/** Phase 3.D follow-up：按合作单位预生成 PSI 单号（PO/PB/SO/SB 等） */
export const nextDocNumber = asyncHandler(async (req, res) => {
  const prefix = optStr(req.query.prefix) ?? '';
  const psiType = optStr(req.query.psiType) ?? '';
  if (!prefix || !psiType) {
    res.status(400).json({ error: '缺少 prefix 或 psiType' });
    return;
  }
  const partnerId = optStr(req.query.partnerId);
  const partnerName = optStr(req.query.partnerName);
  const legacyPrefixesRaw = req.query.legacyPrefixes;
  let legacyPrefixes: string[] = [];
  if (typeof legacyPrefixesRaw === 'string') {
    legacyPrefixes = legacyPrefixesRaw.split(',').map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(legacyPrefixesRaw)) {
    legacyPrefixes = legacyPrefixesRaw.map(v => String(v).trim()).filter(Boolean);
  }
  res.json(
    await psiService.nextDocNumberForPartner(getTenantPrisma(req.tenantId!), {
      prefix,
      psiType,
      partnerId,
      partnerName,
      legacyPrefixes,
    }),
  );
});

/** Phase 3.D follow-up：批量查 (partner, product) 的上次采购单价 */
export const batchLastPurchasePrices = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length > 500) {
    res.status(400).json({ error: 'items 一次最多 500 项' });
    return;
  }
  res.json(
    await psiService.batchLastPurchasePrices(getTenantPrisma(req.tenantId!), items),
  );
});
