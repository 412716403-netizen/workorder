import { getTenantPrisma } from '../lib/prisma.js';
import { str } from '../utils/request.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as devMaterialService from '../services/dev-material.service.js';

export const listMaterialRecords = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await devMaterialService.listDevMaterialRecords(db, str(req.params.styleId)));
});

export const createMaterialIssueBatch = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  res.status(201).json(
    await devMaterialService.createDevMaterialIssueBatch(
      db,
      tenantId,
      str(req.params.styleId),
      req.body,
      req.user?.userId,
    ),
  );
});

export const createMaterialReturnBatch = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  res.status(201).json(
    await devMaterialService.createDevMaterialReturnBatch(
      db,
      tenantId,
      str(req.params.styleId),
      req.body,
      req.user?.userId,
    ),
  );
});

export const updateMaterialDoc = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(
    await devMaterialService.updateDevMaterialDoc(
      db,
      str(req.params.styleId),
      str(req.params.docNo),
      req.body,
    ),
  );
});

export const deleteMaterialDoc = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(
    await devMaterialService.deleteDevMaterialDoc(
      db,
      str(req.params.styleId),
      str(req.params.docNo),
    ),
  );
});
