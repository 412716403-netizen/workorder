import type { Request, Response, NextFunction } from 'express';
import { hasSubPermission } from '../types/index.js';

/**
 * 权限中间件分层（约定）：
 *
 * 1. `requirePermission('production' | 'psi' | 'finance')` — 挂在 `app.ts` 的 **模块入口**，
 *    表示「能进该业务域 API」。与前端「持有顶级模块 key」一致；细粒度用户会有 `production:xxx` 前缀 key，
 *    此时 `requirePermission` 同样放行（见实现）。
 *
 * 2. `requireSubPermission('production:plans:view')` — 挂在 **具体路由**，
 *    与前端按钮级权限一致。`hasSubPermission` 规则：精确匹配 **或** 持有顶级模块名（如 `production`）视为拥有该模块下全部子权限。
 *
 * 3. 渐进迁移：计划单、单品码、虚拟批次相关路由已改为仅依赖 `requireSubPermission`（`app.ts` 不再对这三条 path 叠 `requirePermission`）。
 *    工单 / 生产报工 / 进销存 / 财务 等路由仍使用入口级 `requirePermission` + 前端细粒度控制；后续可按资源域拆到各 `routes/*.ts`。
 */

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
