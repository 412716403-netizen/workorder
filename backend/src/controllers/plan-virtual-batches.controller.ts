import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as batchService from '../services/planVirtualBatches.service.js';
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
  });
  res.json(result);
});

export const voidBatch = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const result = await batchService.voidBatch(db, str(req.params.id));
  res.json(result);
});

export const scan = asyncHandler(async (req, res) => {
  const result = await batchService.scanBatch(req.tenantId!, str(req.params.token));
  res.json(result);
});
