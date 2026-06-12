import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as productionService from '../services/production.service.js';
import { getReceiveUnitWeightAverages } from '../services/receiveUnitWeightAverages.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { warnListAllFromRequest, listQueryFromRequest } from '../utils/listQuery.js';

export { applyOutsourceProgress } from '../services/production.service.js';

function parseTypes(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const arr = value.map(v => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    const arr = value.split(',').map(s => s.trim()).filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  }
  return undefined;
}

function parseIdList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const arr = value.map(v => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
    return arr.length > 0 ? arr.slice(0, 500) : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    const arr = value.split(',').map(s => s.trim()).filter(Boolean);
    return arr.length > 0 ? arr.slice(0, 500) : undefined;
  }
  return undefined;
}

function parseProductionFilter(req: { query: Record<string, unknown> }) {
  return {
    type: optStr(req.query.type),
    types: parseTypes(req.query.types),
    orderId: optStr(req.query.orderId),
    orderIds: parseIdList(req.query.orderIds),
    productId: optStr(req.query.productId),
    productIds: parseIdList(req.query.productIds),
    sourceProductIds: parseIdList(req.query.sourceProductIds),
    workerId: optStr(req.query.workerId),
    partner: optStr(req.query.partner),
    status: optStr(req.query.status),
    docNo: optStr(req.query.docNo),
    startDate: optStr(req.query.startDate),
    endDate: optStr(req.query.endDate),
    search: optStr(req.query.search),
  };
}

export const listRecords = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('production.listRecords', req);
  res.json(await productionService.listRecords(db, {
    ...parseProductionFilter(req),
    all,
    page,
    pageSize,
  }));
});

export const summary = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const topWorkers = req.query.topWorkers ? Number(req.query.topWorkers) : undefined;
  const topPartners = req.query.topPartners ? Number(req.query.topPartners) : undefined;
  res.json(await productionService.summarize(db, {
    ...parseProductionFilter(req),
    topWorkers,
    topPartners,
  }));
});

export const getRecord = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const record = await productionService.getRecord(db, str(req.params.id));
  if (!record) { res.status(404).json({ error: '记录不存在' }); return; }
  res.json(record);
});

export const createRecord = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.status(201).json(await productionService.createRecord(db, req.body, req.tenantId));
});

export const createRecordBatch = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  res.status(201).json(await productionService.createRecordBatch(db, records, req.tenantId));
});

export const updateRecord = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const record = await productionService.updateRecord(db, str(req.params.id), req.body);
  if (!record) { res.status(404).json({ error: '记录不存在' }); return; }
  res.json(record);
});

export const deleteRecord = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const result = await productionService.deleteRecord(db, str(req.params.id));
  if (!result) { res.status(404).json({ error: '记录不存在' }); return; }
  res.json(result);
});

export const getDefectiveRework = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await productionService.getDefectiveRework(db));
});

export const receiveUnitWeightAverages = asyncHandler(async (req, res) => {
  const productId = optStr(req.query.productId);
  if (!productId) {
    res.status(400).json({ error: '缺少 productId' });
    return;
  }
  const db = getTenantPrisma(req.tenantId!);
  res.json(await getReceiveUnitWeightAverages(db, productId));
});
