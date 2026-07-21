import { getTenantPrisma } from '../lib/prisma.js';
import { str } from '../utils/request.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as reworkMaterialService from '../services/rework-material.service.js';

export const listReworkMaterialRecords = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await reworkMaterialService.listReworkMaterialRecords(db, str(req.params.orderId)));
});

export const createReworkMaterialIssueBatch = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  res.status(201).json(
    await reworkMaterialService.createReworkMaterialIssueBatch(
      db,
      tenantId,
      str(req.params.orderId),
      req.body,
      req.user?.userId,
    ),
  );
});

export const createReworkMaterialReturnBatch = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  res.status(201).json(
    await reworkMaterialService.createReworkMaterialReturnBatch(
      db,
      tenantId,
      str(req.params.orderId),
      req.body,
      req.user?.userId,
    ),
  );
});
