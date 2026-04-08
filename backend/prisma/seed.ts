import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

const ALL_PERMISSIONS = [
  'dashboard', 'production', 'psi', 'finance', 'basic', 'settings', 'members',
];

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  console.log('Seeding database...');

  // 1. 确保默认企业存在
  const tenantExists = await prisma.tenant.findUnique({ where: { id: DEFAULT_TENANT_ID } });
  if (!tenantExists) {
    await prisma.tenant.create({
      data: {
        id: DEFAULT_TENANT_ID,
        name: '默认企业',
        inviteCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
      },
    });
    console.log('Created default tenant');
  }

  // 2. 创建默认管理员
  let admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash: await bcrypt.hash('admin123', 10),
        displayName: '系统管理员',
        role: 'admin',
        email: 'admin@smarttrack.local',
        isEnterprise: true,
      },
    });
    console.log('Created default admin user (admin / admin123)');
  } else if (!admin.isEnterprise) {
    await prisma.user.update({ where: { id: admin.id }, data: { isEnterprise: true } });
  }

  // 3. 将 admin 加入默认企业 (owner)
  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: admin.id, tenantId: DEFAULT_TENANT_ID } },
  });
  if (!membership) {
    await prisma.tenantMembership.create({
      data: {
        userId: admin.id,
        tenantId: DEFAULT_TENANT_ID,
        role: 'owner',
        permissions: ALL_PERMISSIONS,
      },
    });
    console.log('Added admin to default tenant as owner');
  }

  // 4. 默认系统配置（关联到默认企业）
  const defaultSettings: Record<string, unknown> = {
    productionLinkMode: 'order',
    processSequenceMode: 'free',
    allowExceedMaxReportQty: true,
    planFormSettings: {
      standardFields: [
        { id: 'planNumber', label: '计划单号', showInList: true, showInCreate: false, showInDetail: true },
        { id: 'customer', label: '客户', showInList: true, showInCreate: true, showInDetail: true },
        { id: 'dueDate', label: '交期', showInList: true, showInCreate: true, showInDetail: true },
        { id: 'startDate', label: '开始日期', showInList: false, showInCreate: true, showInDetail: true },
        { id: 'priority', label: '优先级', showInList: true, showInCreate: true, showInDetail: true },
      ],
      customFields: [],
    },
    orderFormSettings: {
      standardFields: [
        { id: 'orderNumber', label: '工单号', showInList: true, showInCreate: false, showInDetail: true },
        { id: 'customer', label: '客户', showInList: true, showInCreate: false, showInDetail: true },
        { id: 'dueDate', label: '交期', showInList: true, showInCreate: false, showInDetail: true },
        { id: 'startDate', label: '开始日期', showInList: false, showInCreate: false, showInDetail: true },
      ],
      customFields: [],
    },
    purchaseOrderFormSettings: {
      standardFields: [
        { id: 'docNumber', label: '单据号', showInList: true, showInCreate: false, showInDetail: true },
        { id: 'partner', label: '供应商', showInList: true, showInCreate: true, showInDetail: true },
        { id: 'dueDate', label: '交期', showInList: true, showInCreate: true, showInDetail: true },
      ],
      customFields: [],
    },
    purchaseBillFormSettings: {
      standardFields: [
        { id: 'docNumber', label: '单据号', showInList: true, showInCreate: false, showInDetail: true },
        { id: 'partner', label: '供应商', showInList: true, showInCreate: true, showInDetail: true },
        { id: 'warehouse', label: '入库仓库', showInList: true, showInCreate: true, showInDetail: true },
      ],
      customFields: [],
    },
    materialPanelSettings: {
      groupByOutsourcePartner: false,
    },
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.systemSetting.upsert({
      where: { tenantId_key: { tenantId: DEFAULT_TENANT_ID, key } },
      update: {},
      create: { tenantId: DEFAULT_TENANT_ID, key, value: value as object },
    });
  }
  console.log('Seeded default system settings');

  console.log('Seeding complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
