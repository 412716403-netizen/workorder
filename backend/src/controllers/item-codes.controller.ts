import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as itemCodeService from '../services/itemCodes.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const generate = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const result = await itemCodeService.generateItemCodes(db, tenantId, str(req.body.planOrderId));
  res.json(result);
});

export const list = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const result = await itemCodeService.listItemCodes(db, {
    planOrderId: optStr(req.query.planOrderId),
    variantId: optStr(req.query.variantId),
    batchId: optStr(req.query.batchId),
    status: optStr(req.query.status),
    page: Math.max(1, parseInt(String(req.query.page ?? '1'), 10)),
    pageSize: Math.min(500, Math.max(1, parseInt(String(req.query.pageSize ?? '100'), 10))),
  });
  res.json(result);
});

export const voidCode = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const result = await itemCodeService.voidCode(db, str(req.params.id));
  res.json(result);
});

export const scan = asyncHandler(async (req, res) => {
  const result = await itemCodeService.scanItemCode(req.tenantId!, str(req.params.token));
  res.json(result);
});
