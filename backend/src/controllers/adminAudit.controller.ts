import * as platformAuditService from '../services/platformAudit.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const list = asyncHandler(async (req, res) => {
  const raw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(raw) ? raw : 50;
  res.json(await platformAuditService.listPlatformAuditLogs({ limit }));
});
