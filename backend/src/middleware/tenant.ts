import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { hasSubPermission, isTenantElevatedRole } from '../types/index.js';
import { loadEffectivePermissions } from '../services/auth.service.js';

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
 *
 * 实现说明（2026-05 重构）：
 * - JWT 不再携带 `permissions`（owner/admin 全权时 ALL_PERMISSIONS 上百条会撑爆 nginx
 *   `proxy_buffer_size`，导致 502 "upstream sent too big header"）。
 * - owner/admin 走 `isTenantElevatedRole` 快路径，零 IO 直接放行。
 * - 其他角色按需调 `loadEffectivePermissions(userId, tenantId)`，命中 Redis 5s
 *   缓存（`buildTenantPayload`）时不查 DB；缓存失效后查一次 DB 再缓存。
 */

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.tenantId) {
    res.status(403).json({ error: '请先选择或创建企业' });
    return;
  }
  (req as any).tenantId = req.user.tenantId;
  next();
}

async function resolvePermissions(req: Request): Promise<string[]> {
  const userId = req.user?.userId;
  const tenantId = req.user?.tenantId;
  if (!userId || !tenantId) return [];
  return loadEffectivePermissions(userId, tenantId);
}

export function requirePermission(module: string): RequestHandler {
  return (req, res, next) => {
    const { tenantRole } = req.user || {};
    if (isTenantElevatedRole(tenantRole)) {
      next();
      return;
    }
    resolvePermissions(req)
      .then(perms => {
        if (perms.includes(module) || perms.some(p => p.startsWith(`${module}:`))) {
          next();
          return;
        }
        res.status(403).json({ error: '无权访问该功能模块' });
      })
      .catch(next);
  };
}

/**
 * Fine-grained permission check, e.g. requireSubPermission('settings:categories:view').
 * Backward compatible: if user has the top-level module permission (e.g. 'settings'),
 * they are treated as having all sub-permissions under that module.
 * For create/edit/delete actions, the corresponding 'view' permission is also required.
 */
export function requireSubPermission(required: string): RequestHandler {
  const parts = required.split(':');
  const action = parts[2];
  const viewPerm = action && action !== 'view' ? `${parts[0]}:${parts[1]}:view` : null;

  return (req, res, next) => {
    const { tenantRole } = req.user || {};
    if (isTenantElevatedRole(tenantRole)) {
      next();
      return;
    }
    resolvePermissions(req)
      .then(userPerms => {
        if (viewPerm && !hasSubPermission(userPerms, viewPerm)) {
          res.status(403).json({ error: '无权访问该功能模块' });
          return;
        }
        if (!hasSubPermission(userPerms, required)) {
          res.status(403).json({ error: '无权执行该操作' });
          return;
        }
        next();
      })
      .catch(next);
  };
}

/**
 * 只读库存聚合接口（`/psi/stock`、`/psi/stock/batches`、`/psi/stock-snapshot`）的访问判断。
 *
 * 背景（修复"子账号查看生产计划报无权 + 库存不显示"）：
 * - 这些路由历史上要求 `psi:records:view`，但权限树 `PSI_SUB_MODULES` 里并没有 `records`
 *   这个可勾选子模块，任何细粒度配置都产生不出 `psi:records:*` 键。
 * - 唯一能满足 `psi:records:view` 的（非 owner/admin）只有裸的顶级 `psi` 键，而角色编辑器
 *   在存在任意 `psi:*` 细粒度键时会主动剥离裸 `psi`，导致细粒度 PSI 角色拿不到库存。
 * - 库存聚合是生产计划 / 工单 / 物料 / PSI 等多处面板共用的**只读基础数据**（仅数量，不含流水明细），
 *   因此放宽为：拥有进销存任意权限，或生产模块任意权限即可读取。
 */
export function requireStockReadAccess(): RequestHandler {
  return (req, res, next) => {
    const { tenantRole } = req.user || {};
    if (isTenantElevatedRole(tenantRole)) {
      next();
      return;
    }
    resolvePermissions(req)
      .then(userPerms => {
        const canRead =
          userPerms.includes('psi') ||
          userPerms.includes('production') ||
          userPerms.some(p => p.startsWith('psi:') || p.startsWith('production:'));
        if (canRead) {
          next();
          return;
        }
        res.status(403).json({ error: '无权执行该操作' });
      })
      .catch(next);
  };
}
