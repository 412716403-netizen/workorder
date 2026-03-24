import type { Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseExpiryMs(expr: string): number {
  const match = expr.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 86400_000;
  const val = parseInt(match[1]);
  const unit = match[2];
  const ms: Record<string, number> = { s: 1000, m: 60_000, h: 3600_000, d: 86400_000 };
  return val * (ms[unit] ?? 86400_000);
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  const common: import('express').CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
  res.cookie('accessToken', accessToken, {
    ...common,
    maxAge: parseExpiryMs(env.JWT_EXPIRES_IN),
  });
  res.cookie('refreshToken', refreshToken, {
    ...common,
    maxAge: parseExpiryMs(env.JWT_REFRESH_EXPIRES_IN),
  });
}

export function clearAuthCookies(res: Response) {
  const isProduction = process.env.NODE_ENV === 'production';
  const common: import('express').CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
  res.clearCookie('accessToken', common);
  res.clearCookie('refreshToken', common);
}
