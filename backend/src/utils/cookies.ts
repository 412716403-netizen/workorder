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

/**
 * 生产环境默认 secure=true（仅 HTTPS 会下发/携带 Cookie）。
 * 若用 HTTP 访问（如公网 IP 未上证书），须设置 COOKIE_SECURE=false，否则 refresh 无法落盘，access 过期后报「认证令牌无效或已过期」。
 */
function useSecureAuthCookies(): boolean {
  const raw = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  return process.env.NODE_ENV === 'production';
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const common: import('express').CookieOptions = {
    httpOnly: true,
    secure: useSecureAuthCookies(),
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
  const common: import('express').CookieOptions = {
    httpOnly: true,
    secure: useSecureAuthCookies(),
    sameSite: 'lax',
    path: '/',
  };
  res.clearCookie('accessToken', common);
  res.clearCookie('refreshToken', common);
}
