import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { genId } from '../utils/genId.js';
import { sanitizeUpdate, sanitizeCreate } from '../utils/request.js';

// ── 产品分类 ──

export async function listCategories(db: TenantPrismaClient) {
  return db.productCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function createCategory(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('cat');
  const maxRow = await db.productCategory.aggregate({ _max: { sortOrder: true } });
  data.sortOrder = (maxRow._max.sortOrder ?? -1) + 1;
  return db.productCategory.create({ data: data as any });
}

export async function updateCategory(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const data = sanitizeUpdate(body);
  delete data.sortOrder;
  return db.productCategory.update({ where: { id }, data });
}

export async function deleteCategory(db: TenantPrismaClient, id: string) {
  await db.productCategory.delete({ where: { id } });
  return { message: '已删除' };
}

// ── 合作单位分类 ──

export async function listPartnerCategories(db: TenantPrismaClient) {
  return db.partnerCategory.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

export async function createPartnerCategory(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('pcat');
  return db.partnerCategory.create({ data });
}

export async function updatePartnerCategory(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  return db.partnerCategory.update({ where: { id }, data: sanitizeUpdate(body) });
}

export async function deletePartnerCategory(db: TenantPrismaClient, id: string) {
  await db.partnerCategory.delete({ where: { id } });
  return { message: '已删除' };
}

// ── 工序节点 ──

function normalizeNodeData(raw: Record<string, unknown>) {
  const data = { ...raw };
  if ('hasBOM' in data) { data.hasBom = data.hasBOM; delete data.hasBOM; }
  delete data.enableAssignment;
  return data;
}

export async function listNodes(db: TenantPrismaClient) {
  const rows = await db.globalNodeTemplate.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => {
    const { hasBom, ...rest } = r as Record<string, unknown>;
    return { ...rest, hasBOM: hasBom };
  });
}

export async function createNode(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(normalizeNodeData(body) as Record<string, unknown>);
  if (!data.id) data.id = genId('node');
  const maxRow = await db.globalNodeTemplate.aggregate({ _max: { sortOrder: true } });
  data.sortOrder = (maxRow._max.sortOrder ?? -1) + 1;
  return db.globalNodeTemplate.create({ data: data as any });
}

export async function updateNode(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const data = sanitizeUpdate(normalizeNodeData(body) as Record<string, unknown>);
  delete data.sortOrder;
  return db.globalNodeTemplate.update({ where: { id }, data: data as any });
}

export async function deleteNode(db: TenantPrismaClient, id: string) {
  await db.globalNodeTemplate.delete({ where: { id } });
  return { message: '已删除' };
}

// ── 仓库 ──

export async function listWarehouses(db: TenantPrismaClient) {
  return db.warehouse.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

export async function createWarehouse(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('wh');
  return db.warehouse.create({ data });
}

export async function updateWarehouse(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  return db.warehouse.update({ where: { id }, data: sanitizeUpdate(body) });
}

export async function deleteWarehouse(db: TenantPrismaClient, id: string) {
  await db.warehouse.delete({ where: { id } });
  return { message: '已删除' };
}

// ── 收付款类型 ──

export async function listFinanceCategories(db: TenantPrismaClient) {
  return db.financeCategory.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

export async function createFinanceCategory(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('fcat');
  return db.financeCategory.create({ data });
}

export async function updateFinanceCategory(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  return db.financeCategory.update({ where: { id }, data: sanitizeUpdate(body) });
}

export async function deleteFinanceCategory(db: TenantPrismaClient, id: string) {
  await db.financeCategory.delete({ where: { id } });
  return { message: '已删除' };
}

// ── 收支账户类型 ──

export async function listFinanceAccountTypes(db: TenantPrismaClient) {
  return db.financeAccountType.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

export async function createFinanceAccountType(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('fatype');
  return db.financeAccountType.create({ data });
}

export async function updateFinanceAccountType(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  return db.financeAccountType.update({ where: { id }, data: sanitizeUpdate(body) });
}

export async function deleteFinanceAccountType(db: TenantPrismaClient, id: string) {
  await db.financeAccountType.delete({ where: { id } });
  return { message: '已删除' };
}

// ── 系统配置 ──

export async function getConfig(tenantId: string) {
  const settings = await basePrisma.systemSetting.findMany({ where: { tenantId } });
  const config: Record<string, unknown> = {};
  for (const s of settings) config[s.key] = s.value;
  return config;
}

export async function updateConfig(tenantId: string, key: string, value: unknown) {
  return basePrisma.systemSetting.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { value: value as any },
    create: { tenantId, key, value: value as any },
  });
}
