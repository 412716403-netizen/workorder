import * as authService from '../services/auth.service.js';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const register = asyncHandler(async (req, res) => {
  const { phone, password, displayName } = req.body;
  const result = await authService.registerByPhone(phone, password, displayName);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(201).json(result);
});

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const result = await authService.login(username, password);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.json(result);
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) {
    res.status(401).json({ error: 'Refresh token 缺失' });
    return;
  }
  const result = await authService.refresh(token);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.json(result);
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (token) {
    await authService.logout(token);
  }
  clearAuthCookies(res);
  res.json({ message: '已登出' });
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user!.userId);
  res.json(user);
});

export const updateMe = asyncHandler(async (req, res) => {
  const result = await authService.updateProfile(req.user!.userId, req.body);
  if (result.accessToken && result.refreshToken) {
    setAuthCookies(res, result.accessToken, result.refreshToken);
  }
  res.json(result);
});

export const phoneChangeSendOld = asyncHandler(async (req, res) => {
  const result = await authService.phoneChangeSendCodeOld(req.user!.userId, req.body.oldPhone);
  res.json(result);
});

export const phoneChangeVerifyOldCode = asyncHandler(async (req, res) => {
  const { oldPhone, code } = req.body;
  const result = await authService.phoneChangeVerifyOldCode(req.user!.userId, oldPhone, code);
  res.json(result);
});

export const phoneChangeSendNew = asyncHandler(async (req, res) => {
  const { phaseToken, newPhone } = req.body;
  const result = await authService.phoneChangeSendCodeNew(req.user!.userId, phaseToken, newPhone);
  res.json(result);
});

export const phoneChangeComplete = asyncHandler(async (req, res) => {
  const { phaseToken, newPhone, code } = req.body;
  const result = await authService.phoneChangeComplete(req.user!.userId, phaseToken, newPhone, code);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.json(result);
});
