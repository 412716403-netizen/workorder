import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as batchService from '../services/planVirtualBatches.service.js';
import * as itemCodeService from '../services/itemCodes.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

function parseWithItemCodes(body: unknown): boolean {
  const b = body as Record<string, unknown> | null;
  const v = b?.withItemCodes;
  return v === true || v === 'true' || v === 1 || v === '1';
}

function parseVariantId(raw: unknown): string | null {
  return raw === undefined || raw === null || raw === '' ? null : str(raw);
}

export const create = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const result = await batchService.createBatch(db, tenantId, {
    planOrderId: str(req.body.planOrderId),
    quantity: Math.floor(Number(req.body.quantity)),
    variantId: parseVariantId(req.body.variantId),
    withItemCodes: parseWithItemCodes(req.body),
  });
  res.json(result);
});

export const bulkSplit = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const result = await batchService.bulkSplit(db, tenantId, {
    planOrderId: str(req.body.planOrderId),
    batchSize: Math.floor(Number(req.body.batchSize)),
    variantId: parseVariantId(req.body.variantId),
    withItemCodes: parseWithItemCodes(req.body),
  });
  res.json(result);
});

export const bulkSplitAllVariants = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const result = await batchService.bulkSplitAllVariants(db, tenantId, {
    planOrderId: str(req.body.planOrderId),
    batchSize: Math.floor(Number(req.body.batchSize)),
    withItemCodes: parseWithItemCodes(req.body),
  });
  res.json(result);
});

export const list = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const result = await batchService.listBatches(db, {
    planOrderId: optStr(req.query.planOrderId),
    page: Math.max(1, parseInt(String(req.query.page ?? '1'), 10)),
    pageSize: Math.min(500, Math.max(1, parseInt(String(req.query.pageSize ?? '15'), 10))),
  });
  res.json(result);
});

export const subtreeAllocations = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const rootId = optStr(req.query.rootPlanOrderId);
  if (!rootId) {
    res.status(400).json({ error: '缺少 rootPlanOrderId' });
    return;
  }
  const result = await batchService.subtreeBatchAllocatedByVariant(db, rootId);
  res.json(result);
});

export const scan = asyncHandler(async (req, res) => {
  const result = await batchService.scanBatch(req.tenantId!, str(req.params.token));
  res.json(result);
});

export const trace = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize ?? '50'), 10)));
  const result = await itemCodeService.traceVirtualBatch(req.tenantId!, str(req.params.token), page, pageSize);
  res.json(result);
});
