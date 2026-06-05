import { getTenantPrisma } from '../lib/prisma.js';
import { str } from '../utils/request.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as tplService from '../services/dev-stage-templates.service.js';

export const listTemplates = asyncHandler(async (req, res) => {
  res.json(await tplService.listDevStageTemplates(getTenantPrisma(req.tenantId!)));
});

export const createTemplate = asyncHandler(async (req, res) => {
  res.status(201).json(await tplService.createDevStageTemplate(getTenantPrisma(req.tenantId!), req.tenantId!, req.body));
});

export const updateTemplate = asyncHandler(async (req, res) => {
  res.json(await tplService.updateDevStageTemplate(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});

export const deleteTemplate = asyncHandler(async (req, res) => {
  res.json(await tplService.deleteDevStageTemplate(getTenantPrisma(req.tenantId!), str(req.params.id)));
});
