import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies.js';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, password, displayName } = req.body;
    const result = await authService.registerByPhone(phone, password, displayName);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json(result);
  } catch (err) { next(err); }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) {
      res.status(401).json({ error: 'Refresh token 缺失' });
      return;
    }
    const result = await authService.refresh(token);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json(result);
  } catch (err) { next(err); }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (token) {
      await authService.logout(token);
    }
    clearAuthCookies(res);
    res.json({ message: '已登出' });
  } catch (err) { next(err); }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getMe(req.user!.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.updateProfile(req.user!.userId, req.body);
    if (result.accessToken && result.refreshToken) {
      setAuthCookies(res, result.accessToken, result.refreshToken);
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function phoneChangeSendOld(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.phoneChangeSendCodeOld(req.user!.userId, req.body.oldPhone);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function phoneChangeVerifyOldCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { oldPhone, code } = req.body;
    const result = await authService.phoneChangeVerifyOldCode(req.user!.userId, oldPhone, code);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function phoneChangeSendNew(req: Request, res: Response, next: NextFunction) {
  try {
    const { phaseToken, newPhone } = req.body;
    const result = await authService.phoneChangeSendCodeNew(req.user!.userId, phaseToken, newPhone);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function phoneChangeComplete(req: Request, res: Response, next: NextFunction) {
  try {
    const { phaseToken, newPhone, code } = req.body;
    const result = await authService.phoneChangeComplete(req.user!.userId, phaseToken, newPhone, code);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
