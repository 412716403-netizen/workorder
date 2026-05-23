import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * 自带 `tenantId` 列、可被 Prisma 扩展直接注入 `where: { tenantId }` 的模型。
 * 新增带 tenant 列的模型时在此追加。
 */
const TENANT_MODELS = new Set([
  'ProductCategory', 'PartnerCategory', 'GlobalNodeTemplate', 'Warehouse',
  'FinanceCategory', 'FinanceAccountType', 'DictionaryItem', 'SystemSetting',
  'Partner', 'Worker', 'Equipment', 'Product', 'Bom',
  'PlanOrder', 'ProductionOrder', 'ProductMilestoneProgress',
  'ProductionOpRecord', 'PsiRecord', 'FinanceRecord',
  'Role', 'ItemCode', 'PlanVirtualBatch',
]);

/**
 * 自身不带 `tenantId` 列、必须通过父级关系继承租户的模型。
 *
 * 值是从该模型出发到达带 tenantId 的祖先所经过的关系字段名（按 Prisma schema 中的关系名）。
 * 例：MilestoneReport → milestone（Milestone）→ productionOrder（ProductionOrder.tenantId）。
 *
 * 框架会在所有读 / 批写 hook 里自动注入 `where: { <relation>: { ...: { tenantId } } }`，
 * 避免每个 service 手工记得加。新增此类模型时在此追加，并补一条单测。
 *
 * 限制：
 * 1. 只对通过 `getTenantPrisma(tenantId)` 拿到的客户端生效；事务里的 `tx.*` 与
 *    全局 `prisma.*` / 本文件导出的 `basePrisma` 不会被扩展，调用方仍需显式带过滤。
 * 2. 写侧（create/createMany/upsert）不做自动校验：子表写入约定通过已 tenant-verify 的
 *    父级 ID（如 milestoneId、productionOrderId）传入；如要再加一层防越权，
 *    需要在 service 里显式校验父级归属。
 */
const RELATION_TENANT_PATH: Record<string, string[]> = {
  Milestone: ['productionOrder'],
  MilestoneReport: ['milestone', 'productionOrder'],
  ProductProgressReport: ['progress'],
  OrderItem: ['productionOrder'],
  BomItem: ['bom'],
  PlanItem: ['planOrder'],
  ProductVariant: ['product'],
};

function injectTenantWhere(args: any, tenantId: string) {
  args.where = { ...args.where, tenantId };
}

/**
 * 把 `['milestone','productionOrder']` 与 `tenantId` 转成 Prisma 嵌套关系过滤：
 *   `{ milestone: { productionOrder: { tenantId } } }`
 * 留作纯函数导出，便于单测。
 */
export function buildRelationTenantWhere(
  path: readonly string[],
  tenantId: string,
): Record<string, unknown> {
  let acc: Record<string, unknown> = { tenantId };
  for (let i = path.length - 1; i >= 0; i--) {
    acc = { [path[i]]: acc };
  }
  return acc;
}

/**
 * 把租户关系过滤合进 `args.where`。用 `AND` 包一层而不是浅合并，目的是：
 *  - 不会与调用方已经存在的 `milestone: {...}` / `productionOrder: {...}` 关系过滤冲突；
 *  - Prisma 会扁平化 AND，性能上等价于直接合并。
 */
export function injectRelationTenantWhere(
  args: any,
  tenantId: string,
  path: readonly string[],
) {
  const tenantWhere = buildRelationTenantWhere(path, tenantId);
  args.where = args.where ? { AND: [args.where, tenantWhere] } : tenantWhere;
}

function delegateKey(model: string) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

class TenantAccessError extends Error {
  statusCode = 404;
  constructor() {
    super('记录不存在或无权操作');
    this.name = 'TenantAccessError';
  }
}

async function verifyOwnership(model: string, where: any, tenantId: string) {
  const delegate = (prisma as any)[delegateKey(model)];

  /** 分区表复合主键 (tenant_id, id)：delete/update 的 where 可能为 tenantId_id 复合 */
  if (model === 'ItemCode' || model === 'PlanVirtualBatch') {
    const compound = where?.tenantId_id as { tenantId?: string; id?: string } | undefined;
    const id = compound?.id ?? where?.id;
    if (!id) return;
    const tid = compound?.tenantId ?? where?.tenantId ?? tenantId;
    if (compound?.tenantId && compound.tenantId !== tenantId) throw new TenantAccessError();
    const exists = await delegate.findFirst({
      where: { tenantId_id: { tenantId: tid, id } },
      select: { id: true },
    });
    if (!exists) throw new TenantAccessError();
    return;
  }

  if (!where?.id) return;
  const exists = await delegate.findFirst({
    where: { id: where.id, tenantId },
    select: { id: true },
  });
  if (!exists) throw new TenantAccessError();
}

/**
 * 关系继承租户模型的所有权校验：通过父级关系链确认 id 归属当前租户。
 * 用在 update / delete hook 里，等价于 TENANT_MODELS 的 verifyOwnership。
 */
async function verifyRelationOwnership(
  model: string,
  where: any,
  tenantId: string,
  path: readonly string[],
) {
  if (!where?.id) throw new TenantAccessError();
  const delegate = (prisma as any)[delegateKey(model)];
  const tenantWhere = buildRelationTenantWhere(path, tenantId);
  const exists = await delegate.findFirst({
    where: { AND: [{ id: where.id }, tenantWhere] },
    select: { id: true },
  });
  if (!exists) throw new TenantAccessError();
}

export function getTenantPrisma(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) injectTenantWhere(args, tenantId);
          else if (RELATION_TENANT_PATH[model])
            injectRelationTenantWhere(args, tenantId, RELATION_TENANT_PATH[model]);
          return query(args);
        },
        async findFirst({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) injectTenantWhere(args, tenantId);
          else if (RELATION_TENANT_PATH[model])
            injectRelationTenantWhere(args, tenantId, RELATION_TENANT_PATH[model]);
          return query(args);
        },
        async findUnique({ model, args, query }: any) {
          /**
           * 关系继承租户模型：findUnique.where 只接受唯一键，无法直接挂关系过滤。
           * 转译为 base prisma 的 findFirst（unique 条件 AND 关系过滤），
           * 避免再走一次扩展（防止递归）；语义保持等价。
           */
          if (RELATION_TENANT_PATH[model]) {
            const tenantWhere = buildRelationTenantWhere(
              RELATION_TENANT_PATH[model],
              tenantId,
            );
            const delegate = (prisma as any)[delegateKey(model)];
            return delegate.findFirst({
              ...args,
              where: { AND: [args.where, tenantWhere] },
            });
          }
          const result = await query(args);
          // select 未包含 tenantId 时结果为 undefined，不可误判为跨租户
          if (TENANT_MODELS.has(model) && result) {
            const tid = (result as any).tenantId;
            if (tid !== undefined && tid !== tenantId) return null;
          }
          return result;
        },
        async create({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) {
            if (Array.isArray(args.data)) {
              args.data = args.data.map((d: any) => ({ ...d, tenantId }));
            } else {
              args.data = { ...args.data, tenantId };
            }
          }
          return query(args);
        },
        async createMany({ model, args, query }: any) {
          if (TENANT_MODELS.has(model) && Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          }
          return query(args);
        },
        async update({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) await verifyOwnership(model, args.where, tenantId);
          else if (RELATION_TENANT_PATH[model])
            await verifyRelationOwnership(model, args.where, tenantId, RELATION_TENANT_PATH[model]);
          return query(args);
        },
        async updateMany({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) injectTenantWhere(args, tenantId);
          else if (RELATION_TENANT_PATH[model])
            injectRelationTenantWhere(args, tenantId, RELATION_TENANT_PATH[model]);
          return query(args);
        },
        async delete({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) await verifyOwnership(model, args.where, tenantId);
          else if (RELATION_TENANT_PATH[model])
            await verifyRelationOwnership(model, args.where, tenantId, RELATION_TENANT_PATH[model]);
          return query(args);
        },
        async deleteMany({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) injectTenantWhere(args, tenantId);
          else if (RELATION_TENANT_PATH[model])
            injectRelationTenantWhere(args, tenantId, RELATION_TENANT_PATH[model]);
          return query(args);
        },
        async upsert({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) {
            args.create = { ...args.create, tenantId };
          }
          return query(args);
        },
        async count({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) injectTenantWhere(args, tenantId);
          else if (RELATION_TENANT_PATH[model])
            injectRelationTenantWhere(args, tenantId, RELATION_TENANT_PATH[model]);
          return query(args);
        },
        async aggregate({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) injectTenantWhere(args, tenantId);
          else if (RELATION_TENANT_PATH[model])
            injectRelationTenantWhere(args, tenantId, RELATION_TENANT_PATH[model]);
          return query(args);
        },
        async groupBy({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) injectTenantWhere(args, tenantId);
          else if (RELATION_TENANT_PATH[model])
            injectRelationTenantWhere(args, tenantId, RELATION_TENANT_PATH[model]);
          return query(args);
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof getTenantPrisma>;
