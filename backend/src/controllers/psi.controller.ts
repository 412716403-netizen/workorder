import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as psiService from '../services/psi.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const listRecords = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await psiService.listRecords(db, {
    type: optStr(req.query.type),
    productId: optStr(req.query.productId),
    docNumber: optStr(req.query.docNumber),
    partnerId: optStr(req.query.partnerId),
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
