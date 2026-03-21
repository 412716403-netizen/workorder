import type { Request, Response, NextFunction } from 'express';

/** 需在 authMiddleware 之后使用 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' });
    return;
  }
  next();
}
