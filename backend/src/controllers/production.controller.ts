import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as productionService from '../services/production.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export { applyOutsourceProgress } from '../services/production.service.js';

export const listRecords = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await productionService.listRecords(db, {
    type: optStr(req.query.type),
    orderId: optStr(req.query.orderId),
    productId: optStr(req.query.productId),
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
