import { asyncHandler } from '../middleware/asyncHandler.js';
import * as bindSvc from '../services/wxMpBind.service.js';

export const getStatus = asyncHandler(async (req, res) => {
  const status = await bindSvc.getWxMpStatusForUser(req.user!.userId);
  res.json(status);
});

export const createBindQrcode = asyncHandler(async (req, res) => {
  const result = await bindSvc.createBindQrcode(req.user!.userId);
  res.json(result);
});

export const unbind = asyncHandler(async (req, res) => {
  const result = await bindSvc.unbindWxMp(req.user!.userId);
  res.json(result);
});
