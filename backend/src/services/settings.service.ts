import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { genId } from '../utils/genId.js';
import { sanitizeUpdate, sanitizeCreate } from '../utils/request.js';
import { AppError } from '../middleware/errorHandler.js';
import { assertCategoryBatchColorMutex, applyCategoryPurchasePartnerRule, assertCategoryPurchasePartnerRule } from '../utils/categoryMutex.js';
import {
  mergePrintTemplatesForTenantConfig,
  stripSystemPrintTemplatesForPersistence,
} from '../../../shared/systemPrintTemplates.js';
import { z } from 'zod';
import { getRedis, redisDel, redisGetJson, redisSetJson } from '../lib/redis.js';

const tenantConfigCacheKey = (tenantId: string) => `cache:settings:config:${tenantId}`;

/** 与 `shared/types` 中 CustomDocFieldType 一致；写入设置 JSON 时拒绝 number/boolean 等脏类型 */
const reportFieldDefRowZ = z
  .object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['text', 'date', 'select', 'file']),
  })
  .passthrough();

function parseJsonReportFieldDefinitions(path: string, raw: unknown): unknown {
  const parsed = z.array(reportFieldDefRowZ).safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${path} 无效：自定义项 type 仅允许 text、date、select、file（${parsed.error.message}）`);
  }
  return parsed.data;
}

function maybeParseReportFields(data: Record<string, unknown>, key: string) {
  if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined) {
    (data as Record<string, unknown>)[key] = parseJsonReportFieldDefinitions(key, data[key]) as unknown;
  }
}

// ── 产品分类 ──

export async function listCategories(db: TenantPrismaClient, opts: { all?: boolean; page?: number; pageSize?: number }) {
  const orderBy: any = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

  if (opts.all) {
    return db.productCategory.findMany({ orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.productCategory.findMany({ orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.productCategory.count({}),
  ]);
  return { data, total, page, pageSize };
}

export async function createCategory(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body) as Record<string, unknown>;
  maybeParseReportFields(data, 'customFields');
  assertCategoryBatchColorMutex(data);
  applyCategoryPurchasePartnerRule(data);
  assertCategoryPurchasePartnerRule(data);
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
  const data = sanitizeUpdate(body) as Record<string, unknown>;
  delete data.sortOrder;
  maybeParseReportFields(data, 'customFields');
  const existing = await db.productCategory.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, '产品分类不存在');
  const nextHasColor =
    Object.prototype.hasOwnProperty.call(data, 'hasColorSize')
      ? Boolean(data.hasColorSize)
      : existing.hasColorSize;
  const nextHasBatch =
    Object.prototype.hasOwnProperty.call(data, 'hasBatchManagement')
      ? Boolean(data.hasBatchManagement)
      : existing.hasBatchManagement;
  assertCategoryBatchColorMutex({ hasColorSize: nextHasColor, hasBatchManagement: nextHasBatch });
  const nextHasPurchase =
    Object.prototype.hasOwnProperty.call(data, 'hasPurchasePrice')
      ? Boolean(data.hasPurchasePrice)
      : existing.hasPurchasePrice;
  let nextLinkPartner =
    Object.prototype.hasOwnProperty.call(data, 'linkPartner')
      ? Boolean(data.linkPartner)
      : existing.linkPartner;
  if (nextHasPurchase) {
    nextLinkPartner = true;
    if (
      Object.prototype.hasOwnProperty.call(data, 'hasPurchasePrice') ||
      Object.prototype.hasOwnProperty.call(data, 'linkPartner')
    ) {
      data.linkPartner = true;
    }
  }
  assertCategoryPurchasePartnerRule({
    hasPurchasePrice: nextHasPurchase,
    linkPartner: nextLinkPartner,
  });
  return db.productCategory.update({ where: { id }, data });
}

export async function deleteCategory(db: TenantPrismaClient, id: string) {
  await db.productCategory.delete({ where: { id } });
  return { message: '已删除' };
}

// ── 合作单位分类 ──

export async function listPartnerCategories(db: TenantPrismaClient, opts: { all?: boolean; page?: number; pageSize?: number }) {
  const orderBy: any = [{ createdAt: 'asc' }, { id: 'asc' }];

  if (opts.all) {
    return db.partnerCategory.findMany({ orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.partnerCategory.findMany({ orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.partnerCategory.count({}),
  ]);
  return { data, total, page, pageSize };
}

export async function createPartnerCategory(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body) as Record<string, unknown>;
  maybeParseReportFields(data, 'customFields');
  if (!data.id) data.id = genId('pcat');
  return db.partnerCategory.create({ data: data as any });
}

export async function updatePartnerCategory(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const data = sanitizeUpdate(body) as Record<string, unknown>;
  maybeParseReportFields(data, 'customFields');
  return db.partnerCategory.update({ where: { id }, data });
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

export async function listNodes(db: TenantPrismaClient, opts: { all?: boolean; page?: number; pageSize?: number }) {
  const orderBy: any = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

  if (opts.all) {
    const rows = await db.globalNodeTemplate.findMany({ orderBy });
    return rows.map((r) => {
      const { hasBom, ...rest } = r as Record<string, unknown>;
      return { ...rest, hasBOM: hasBom };
    });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [rows, total] = await Promise.all([
    db.globalNodeTemplate.findMany({ orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.globalNodeTemplate.count({}),
  ]);
  const data = rows.map((r) => {
    const { hasBom, ...rest } = r as Record<string, unknown>;
    return { ...rest, hasBOM: hasBom };
  });
  return { data, total, page, pageSize };
}

export async function createNode(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(normalizeNodeData(body) as Record<string, unknown>) as Record<string, unknown>;
  maybeParseReportFields(data, 'reportTemplate');
  maybeParseReportFields(data, 'reportDisplayTemplate');
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
  const data = sanitizeUpdate(normalizeNodeData(body) as Record<string, unknown>) as Record<string, unknown>;
  delete data.sortOrder;
  maybeParseReportFields(data, 'reportTemplate');
  maybeParseReportFields(data, 'reportDisplayTemplate');
  return db.globalNodeTemplate.update({ where: { id }, data: data as any });
}

export async function deleteNode(db: TenantPrismaClient, id: string) {
  await db.globalNodeTemplate.delete({ where: { id } });
  return { message: '已删除' };
}

// ── 仓库 ──

export async function listWarehouses(db: TenantPrismaClient, opts: { all?: boolean; page?: number; pageSize?: number }) {
  const orderBy: any = [{ createdAt: 'asc' }, { id: 'asc' }];

  if (opts.all) {
    return db.warehouse.findMany({ orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.warehouse.findMany({ orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.warehouse.count({}),
  ]);
  return { data, total, page, pageSize };
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

export async function listFinanceCategories(db: TenantPrismaClient, opts: { all?: boolean; page?: number; pageSize?: number }) {
  const orderBy: any = [{ createdAt: 'asc' }, { id: 'asc' }];

  if (opts.all) {
    return db.financeCategory.findMany({ orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.financeCategory.findMany({ orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.financeCategory.count({}),
  ]);
  return { data, total, page, pageSize };
}

export async function createFinanceCategory(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body) as Record<string, unknown>;
  maybeParseReportFields(data, 'customFields');
  if (!data.id) data.id = genId('fcat');
  return db.financeCategory.create({ data: data as any });
}

export async function updateFinanceCategory(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const data = sanitizeUpdate(body) as Record<string, unknown>;
  maybeParseReportFields(data, 'customFields');
  return db.financeCategory.update({ where: { id }, data });
}

export async function deleteFinanceCategory(db: TenantPrismaClient, id: string) {
  await db.financeCategory.delete({ where: { id } });
  return { message: '已删除' };
}

// ── 收支账户类型 ──

export async function listFinanceAccountTypes(db: TenantPrismaClient, opts: { all?: boolean; page?: number; pageSize?: number }) {
  const orderBy: any = [{ createdAt: 'asc' }, { id: 'asc' }];

  if (opts.all) {
    return db.financeAccountType.findMany({ orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.financeAccountType.findMany({ orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.financeAccountType.count({}),
  ]);
  return { data, total, page, pageSize };
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
  if (getRedis()) {
    const hit = await redisGetJson<Record<string, unknown>>(tenantConfigCacheKey(tenantId));
    if (hit) return hit;
  }

  const settings = await basePrisma.systemSetting.findMany({ where: { tenantId } });
  const config: Record<string, unknown> = {};
  for (const s of settings) config[s.key] = s.value;
  config.printTemplates = mergePrintTemplatesForTenantConfig(config.printTemplates);
  if (getRedis()) {
    await redisSetJson(tenantConfigCacheKey(tenantId), config, 60);
  }
  return config;
}

export async function updateConfig(tenantId: string, key: string, value: unknown) {
  if (getRedis()) {
    await redisDel(tenantConfigCacheKey(tenantId));
  }
  let nextValue = value;
  if (key === 'printTemplates') {
    nextValue = stripSystemPrintTemplatesForPersistence(value);
  }
  return basePrisma.systemSetting.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { value: nextValue as any },
    create: { tenantId, key, value: nextValue as any },
  });
}
