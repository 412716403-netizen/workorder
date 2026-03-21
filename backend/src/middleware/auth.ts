import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { JwtPayload } from '../types/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      tenantId?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未提供认证令牌' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: '认证令牌无效或已过期' });
  }
}
