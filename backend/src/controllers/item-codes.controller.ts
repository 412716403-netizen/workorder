import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as itemCodeService from '../services/itemCodes.service.js';
import * as scanValidateService from '../services/scanValidate.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listQueryFromRequest, warnListAllFromRequest } from '../utils/listQuery.js';

export const generate = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const result = await itemCodeService.generateItemCodes(db, tenantId, str(req.body.planOrderId));
  res.json(result);
});

export const list = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('itemCodes.list', req);
  const result = await itemCodeService.listItemCodes(db, {
    planOrderId: optStr(req.query.planOrderId),
    variantId: optStr(req.query.variantId),
    batchId: optStr(req.query.batchId),
    status: optStr(req.query.status),
    all,
    page,
    pageSize,
  });
  res.json(result);
});

export const scan = asyncHandler(async (req, res) => {
  const result = await itemCodeService.scanItemCode(req.tenantId!, str(req.params.token));
  res.json(result);
});

export const trace = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize ?? '50'), 10)));
  const result = await itemCodeService.traceItemCode(req.tenantId!, str(req.params.token), page, pageSize);
  res.json(result);
});

export const validateScanUsage = asyncHandler(async (req, res) => {
  const result = await scanValidateService.validateScanUsage(req.tenantId!, req.body);
  res.json(result);
});
