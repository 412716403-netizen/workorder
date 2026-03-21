import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, password, displayName } = req.body;
    const result = await authService.registerByPhone(phone, password, displayName);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    res.json(result);
  } catch (err) { next(err); }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refresh(refreshToken);
    res.json(result);
  } catch (err) { next(err); }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
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
    res.json(result);
  } catch (err) {
    next(err);
  }
}
