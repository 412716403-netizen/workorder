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
    /** 上限放宽：计划详情「打印单品码」等需一次拉全量；仍设硬顶以防异常大请求 */
    pageSize: Math.min(100_000, Math.max(1, parseInt(String(req.query.pageSize ?? '100'), 10))),
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
