import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as devStylesService from '../services/dev-styles.service.js';

export const listStyles = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await devStylesService.listDevStyles(db, {
    categoryId: optStr(req.query.categoryId),
    search: optStr(req.query.search),
    status: optStr(req.query.status),
  }));
});

export const getStyle = asyncHandler(async (req, res) => {
  res.json(await devStylesService.getDevStyle(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

export const createStyle = asyncHandler(async (req, res) => {
  res.status(201).json(
    await devStylesService.createDevStyle(getTenantPrisma(req.tenantId!), req.tenantId!, req.body),
  );
});

export const updateStyle = asyncHandler(async (req, res) => {
  res.json(await devStylesService.updateDevStyle(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});

export const deleteStyle = asyncHandler(async (req, res) => {
  res.json(await devStylesService.deleteDevStyle(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

export const publishStyle = asyncHandler(async (req, res) => {
  res.json(
    await devStylesService.publishDevStyleToProduct(getTenantPrisma(req.tenantId!), req.tenantId!, str(req.params.id)),
  );
});

export const addSample = asyncHandler(async (req, res) => {
  res.status(201).json(
    await devStylesService.addDevSample(getTenantPrisma(req.tenantId!), str(req.params.id), req.body),
  );
});

export const deleteSample = asyncHandler(async (req, res) => {
  res.json(await devStylesService.deleteDevSample(getTenantPrisma(req.tenantId!), str(req.params.sampleId)));
});

export const updateStage = asyncHandler(async (req, res) => {
  res.json(await devStylesService.updateDevStage(getTenantPrisma(req.tenantId!), str(req.params.stageId), req.body));
});

export const listBoms = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await devStylesService.listDevBoms(db, {
    parentStyleId: optStr(req.query.parentStyleId),
    all: req.query.all === 'true',
  }));
});

export const getBom = asyncHandler(async (req, res) => {
  res.json(await devStylesService.getDevBom(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

export const createBom = asyncHandler(async (req, res) => {
  res.status(201).json(
    await devStylesService.createDevBom(getTenantPrisma(req.tenantId!), req.tenantId!, req.body),
  );
});

export const updateBom = asyncHandler(async (req, res) => {
  res.json(await devStylesService.updateDevBom(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});

export const deleteBom = asyncHandler(async (req, res) => {
  res.json(await devStylesService.deleteDevBom(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

export const syncVariantNodeBoms = asyncHandler(async (req, res) => {
  res.json(
    await devStylesService.syncDevVariantNodeBoms(
      getTenantPrisma(req.tenantId!),
      str(req.params.id),
      str(req.params.variantId),
      (req.body.nodeBoms ?? req.body.nodeBOMs ?? {}) as Record<string, string>,
    ),
  );
});
