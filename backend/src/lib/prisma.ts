import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

const TENANT_MODELS = new Set([
  'ProductCategory', 'PartnerCategory', 'GlobalNodeTemplate', 'Warehouse',
  'FinanceCategory', 'FinanceAccountType', 'DictionaryItem', 'SystemSetting',
  'Partner', 'Worker', 'Equipment', 'Product', 'Bom',
  'PlanOrder', 'ProductionOrder', 'ProductMilestoneProgress',
  'ProductionOpRecord', 'PsiRecord', 'FinanceRecord',
  'Role',
]);

function injectTenantWhere(args: any, tenantId: string) {
  args.where = { ...args.where, tenantId };
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
  if (!where?.id) return;
  const delegate = (prisma as any)[delegateKey(model)];
  const exists = await delegate.findFirst({
    where: { id: where.id, tenantId },
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
          return query(args);
        },
        async findFirst({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) injectTenantWhere(args, tenantId);
          return query(args);
        },
        async findUnique({ model, args, query }: any) {
          const result = await query(args);
          if (TENANT_MODELS.has(model) && result && (result as any).tenantId !== tenantId) {
            return null;
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
          return query(args);
        },
        async updateMany({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) injectTenantWhere(args, tenantId);
          return query(args);
        },
        async delete({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) await verifyOwnership(model, args.where, tenantId);
          return query(args);
        },
        async deleteMany({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) injectTenantWhere(args, tenantId);
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
          return query(args);
        },
        async aggregate({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) injectTenantWhere(args, tenantId);
          return query(args);
        },
        async groupBy({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) injectTenantWhere(args, tenantId);
          return query(args);
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof getTenantPrisma>;
