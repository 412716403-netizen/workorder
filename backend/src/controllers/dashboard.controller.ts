import { getTenantPrisma } from '../lib/prisma.js';
import * as dashboardService from '../services/dashboard.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const getStats = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await dashboardService.getStats(db));
});
