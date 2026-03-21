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

export function getTenantPrisma(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async findFirst({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
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
        async updateMany({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async deleteMany({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async upsert({ model, args, query }: any) {
          if (TENANT_MODELS.has(model)) {
            args.create = { ...args.create, tenantId };
          }
          return query(args);
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof getTenantPrisma>;
