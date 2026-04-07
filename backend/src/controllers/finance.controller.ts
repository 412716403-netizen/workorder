import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as financeService from '../services/finance.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const listRecords = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const page = req.query.page ? Number(req.query.page) : undefined;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
  res.json(await financeService.listRecords(db, {
    type: optStr(req.query.type),
    status: optStr(req.query.status),
    categoryId: optStr(req.query.categoryId),
    page,
    pageSize,
  }));
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
