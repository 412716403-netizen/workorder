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
 * 「进销存 / 生产」共用只读数据的访问判断（库存聚合、PSI 单据列表、单号生成、上次单价等）。
 *
 * 背景（修复"子账号报无权 + 库存/列表不显示"）：
 * - 这些路由历史上要求 `psi:records:view` 或 `psi:purchase_order:view`，但权限树 `PSI_SUB_MODULES`
 *   里并没有 `records` 子模块，细粒度配置产生不出 `psi:records:*` 键；而 `purchase_order:view`
 *   对「只配了销售订单」的角色又过窄。
 * - 唯一能满足 `psi:records:view` 的（非 owner/admin）只有裸的顶级 `psi` 键，而角色编辑器
 *   在存在任意 `psi:*` 细粒度键时会主动剥离裸 `psi`，导致细粒度 PSI 角色读不到这些基础数据。
 * - 这些都是生产计划 / 工单 / 物料 / 进销存多处面板共用的**只读基础数据**，
 *   因此放宽为：拥有进销存任意权限，或生产模块任意权限即可读取。
 */
export function requirePsiOrProductionRead(): RequestHandler {
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

/**
 * 通用 `/psi/records*` 写端点（create / edit / delete）的权限判断。
 *
 * 背景：所有 PSI 单据（采购订单 / 采购入库 / 销售订单 / 销售单 / 调拨 / 盘点）以及订单待入库
 * 都通过通用 `/psi/records*` 落库，历史上挂 `psi:records:*`。但权限树里没有 `records`
 * 子模块，细粒度角色（如只勾「销售订单·新增」）永远拿不到 `psi:records:create`，保存即报
 * 「无权访问该功能模块」。
 *
 * 这里改为按请求体里的单据 `type` 映射到 UI 实际授予的子模块权限再校验（沿用 `hasSubPermission`
 * 语义：持有裸 `psi` / `production` 模块键视为拥有其全部子权限）：
 *   SALES_ORDER → psi:sales_order、PURCHASE_ORDER → psi:purchase_order、
 *   PURCHASE_BILL → psi:purchase_bill、SALES_BILL → psi:sales_bill、
 *   TRANSFER → psi:warehouse_transfer、STOCKTAKE → psi:warehouse_stocktake、
 *   STOCK_IN → production:orders_pending_stock_in。
 * 取不到 type 的场景（按 id 删除 / 不带 type 的更新）退化为「持有 psi/production 任一对应动作的写权限或裸模块键」放行。
 */
const PSI_RECORD_TYPE_TO_PERM_BASE: Record<string, string> = {
  PURCHASE_ORDER: 'psi:purchase_order',
  PURCHASE_BILL: 'psi:purchase_bill',
  SALES_ORDER: 'psi:sales_order',
  SALES_BILL: 'psi:sales_bill',
  TRANSFER: 'psi:warehouse_transfer',
  STOCKTAKE: 'psi:warehouse_stocktake',
  STOCK_IN: 'production:orders_pending_stock_in',
};

function collectPsiRecordTypes(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as Record<string, unknown>;
  const types = new Set<string>();
  if (typeof b.type === 'string') types.add(b.type);
  for (const key of ['records', 'newRecords'] as const) {
    const arr = b[key];
    if (Array.isArray(arr)) {
      for (const r of arr) {
        const t = (r as { type?: unknown })?.type;
        if (typeof t === 'string') types.add(t);
      }
    }
  }
  return [...types];
}

export function requirePsiRecordWrite(action: 'create' | 'edit' | 'delete'): RequestHandler {
  return (req, res, next) => {
    const { tenantRole } = req.user || {};
    if (isTenantElevatedRole(tenantRole)) {
      next();
      return;
    }
    resolvePermissions(req)
      .then(perms => {
        const types = collectPsiRecordTypes(req.body);
        if (types.length > 0) {
          for (const t of types) {
            const base = PSI_RECORD_TYPE_TO_PERM_BASE[t];
            if (!base) {
              // 未知/未来类型：保守放行给「持有 psi 或 production 任一权限」者，避免误伤既有流程
              const anyMod =
                perms.includes('psi') ||
                perms.includes('production') ||
                perms.some(p => p.startsWith('psi:') || p.startsWith('production:'));
              if (!anyMod) {
                res.status(403).json({ error: '无权执行该操作' });
                return;
              }
              continue;
            }
            if (!hasSubPermission(perms, `${base}:view`)) {
              res.status(403).json({ error: '无权访问该功能模块' });
              return;
            }
            if (!hasSubPermission(perms, `${base}:${action}`)) {
              res.status(403).json({ error: '无权执行该操作' });
              return;
            }
          }
          next();
          return;
        }
        // 取不到 type（按 id 删除 / 部分更新）：退化为「持有 psi/production 对应动作写权限或裸模块键」
        const canWrite =
          perms.includes('psi') ||
          perms.includes('production') ||
          perms.some(
            p =>
              (p.startsWith('psi:') || p.startsWith('production:')) && p.endsWith(`:${action}`),
          );
        if (canWrite) {
          next();
          return;
        }
        res.status(403).json({ error: '无权执行该操作' });
      })
      .catch(next);
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 「资源名不在权限树 → 细粒度角色不可达」一类问题的通用修复工具。
//
// 背景：部分路由按某个**资源名**鉴权（如 `production:orders`、`production:records`、
// `finance:records`），但前端权限树（views/member-management/constants.ts）里并没有这些
// 可勾选子模块。细粒度角色保存时裸模块键（production/finance）会被角色编辑器剥离，于是
// 永远凑不齐这些键 → 必 403。这里改为按「权限树真实能产生的键」做能力判断。
// ───────────────────────────────────────────────────────────────────────────

/** 是否持有给定模块下的任一权限（裸模块键或任意 `module:*` 子键）。 */
function hasAnyPermUnder(perms: string[], modules: string[]): boolean {
  return modules.some(m => perms.includes(m) || perms.some(p => p.startsWith(`${m}:`)));
}

/** 通用放行守卫：elevated 直接放行，否则按 `check(perms)` 判定。 */
function guardAny(check: (perms: string[]) => boolean): RequestHandler {
  return (req, res, next) => {
    const { tenantRole } = req.user || {};
    if (isTenantElevatedRole(tenantRole)) {
      next();
      return;
    }
    resolvePermissions(req)
      .then(perms => {
        if (check(perms)) {
          next();
          return;
        }
        res.status(403).json({ error: '无权执行该操作' });
      })
      .catch(next);
  };
}

/** 生产域只读端点（工单列表/详情、生产流水、报工进度等）：持有 production / process_report 任一权限即可。 */
export function requireProductionRead(): RequestHandler {
  return guardAny(perms => hasAnyPermUnder(perms, ['production', 'process_report']));
}

/**
 * 生产域写端点：
 * - `write`（create/edit，含报工/领退料/外协/返工等）：裸 `production`、`process_report`，
 *   或任意「非只读」`production:*` 子权限（create/edit/delete/allow）。
 * - `delete`（删除工单等破坏性操作）：裸 `production` 或任意 `production:*:delete`。
 * 前端已按 `orders_*` / `material_*` / `outsource_*` / `rework_*` 等细粒度 gating 各按钮，
 * 后端在此只做「该用户在生产域具备相应写能力」的兜底，避免细粒度角色被通用端点误拒。
 */
export function requireProductionWrite(kind: 'write' | 'delete'): RequestHandler {
  return guardAny(perms => {
    if (perms.includes('production')) return true;
    if (kind === 'delete') {
      return perms.some(p => p.startsWith('production:') && p.endsWith(':delete'));
    }
    return (
      perms.includes('process_report') ||
      perms.some(p => p.startsWith('production:') && !p.endsWith(':view'))
    );
  });
}

/** 财务域只读端点（收付款单列表/详情）：持有 finance 任一权限即可。 */
export function requireFinanceRead(): RequestHandler {
  return guardAny(perms => hasAnyPermUnder(perms, ['finance']));
}

/**
 * 财务收付款单写端点（通用 `/finance/records*`）。
 * 按记录 `type` 映射到权限树真实子模块：RECEIPT→finance:receipt、PAYMENT→finance:payment。
 * 取不到 type（按 id 删改）或对账/核销类（RECONCILIATION/SETTLEMENT）退化为
 * 「持有 finance 对应动作写权限、`:allow` 或裸 finance」放行。
 */
const FINANCE_RECORD_TYPE_TO_PERM_BASE: Record<string, string> = {
  RECEIPT: 'finance:receipt',
  PAYMENT: 'finance:payment',
};

export function requireFinanceRecordWrite(action: 'create' | 'edit' | 'delete'): RequestHandler {
  return (req, res, next) => {
    const { tenantRole } = req.user || {};
    if (isTenantElevatedRole(tenantRole)) {
      next();
      return;
    }
    resolvePermissions(req)
      .then(perms => {
        const rawType = (req.body as { type?: unknown } | undefined)?.type;
        const base = typeof rawType === 'string' ? FINANCE_RECORD_TYPE_TO_PERM_BASE[rawType] : undefined;
        if (base) {
          if (!hasSubPermission(perms, `${base}:view`)) {
            res.status(403).json({ error: '无权访问该功能模块' });
            return;
          }
          if (!hasSubPermission(perms, `${base}:${action}`)) {
            res.status(403).json({ error: '无权执行该操作' });
            return;
          }
          next();
          return;
        }
        const canWrite =
          perms.includes('finance') ||
          perms.some(
            p => p.startsWith('finance:') && (p.endsWith(`:${action}`) || p.endsWith(':allow')),
          );
        if (canWrite) {
          next();
          return;
        }
        res.status(403).json({ error: '无权执行该操作' });
      })
      .catch(next);
  };
}
