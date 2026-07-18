import * as adminUsageService from '../services/adminUsage.service.js';
import { str } from '../utils/request.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

function parseDays(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw) : 30;
  return Number.isFinite(n) ? n : 30;
}

export const getTenantUsage = asyncHandler(async (req, res) => {
  res.json(await adminUsageService.getAdminTenantUsage(parseDays(req.query.days)));
});

export const getTenantUsageDetail = asyncHandler(async (req, res) => {
  const id = str(req.params.id);
  res.json(await adminUsageService.getAdminTenantUsageDetail(id, parseDays(req.query.days)));
});
