import type { Request, Response, NextFunction } from 'express';
import { hasSubPermission } from '../types/index.js';

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.tenantId) {
    res.status(403).json({ error: '请先选择或创建企业' });
    return;
  }
  (req as any).tenantId = req.user.tenantId;
  next();
}

export function requirePermission(module: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { tenantRole, permissions } = req.user || {};
    if (tenantRole === 'owner') return next();
    if (permissions?.includes(module) || permissions?.some(p => p.startsWith(`${module}:`))) {
      return next();
    }
    res.status(403).json({ error: '无权访问该功能模块' });
  };
}

/**
 * Fine-grained permission check, e.g. requireSubPermission('settings:categories:view').
 * Backward compatible: if user has the top-level module permission (e.g. 'settings'),
 * they are treated as having all sub-permissions under that module.
 * For create/edit/delete actions, the corresponding 'view' permission is also required.
 */
export function requireSubPermission(required: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { tenantRole, permissions } = req.user || {};
    if (tenantRole === 'owner') return next();

    const userPerms = permissions || [];

    const parts = required.split(':');
    const action = parts[2];
    if (action && action !== 'view') {
      const viewPerm = `${parts[0]}:${parts[1]}:view`;
      if (!hasSubPermission(userPerms, viewPerm)) {
        res.status(403).json({ error: '无权访问该功能模块' });
        return;
      }
    }

    if (!hasSubPermission(userPerms, required)) {
      res.status(403).json({ error: '无权执行该操作' });
      return;
    }
    next();
  };
}
