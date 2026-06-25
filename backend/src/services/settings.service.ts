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
    type: z.enum(['text', 'date', 'select', 'file', 'knowledge']),
  })
  .passthrough();

function parseJsonReportFieldDefinitions(path: string, raw: unknown): unknown {
  const parsed = z.array(reportFieldDefRowZ).safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${path} 无效：自定义项 type 仅允许 text、date、select、file、knowledge（${parsed.error.message}）`);
  }
  return parsed.data;
}

function maybeParseReportFields(data: Record<string, unknown>, key: string) {
  if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined) {
    (data as Record<string, unknown>)[key] = parseJsonReportFieldDefinitions(key, data[key]) as unknown;
  }
}

type NameUniqueDelegate = {
  findFirst(args: {
    where: { name: { equals: string; mode: 'insensitive' }; NOT?: { id: string } };
    select: { id: true };
  }): Promise<{ id: string } | null>;
};

async function assertSettingsNameUnique(
  delegate: NameUniqueDelegate,
  rawName: unknown,
  entityLabel: string,
  excludeId?: string,
): Promise<string> {
  const trimmed = typeof rawName === 'string' ? rawName.trim() : '';
  if (!trimmed) throw new AppError(400, `请填写${entityLabel}`);
  const conflict = await delegate.findFirst({
    where: {
      name: { equals: trimmed, mode: 'insensitive' },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (conflict) throw new AppError(409, `${entityLabel}「${trimmed}」已存在`);
  return trimmed;
}

async function resolveSettingsNameOnUpdate(
  delegate: NameUniqueDelegate,
  data: Record<string, unknown>,
  entityLabel: string,
  excludeId: string,
): Promise<void> {
  if (!Object.prototype.hasOwnProperty.call(data, 'name')) return;
  data.name = await assertSettingsNameUnique(delegate, data.name, entityLabel, excludeId);
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
  data.name = await assertSettingsNameUnique(db.productCategory, data.name, '产品分类');
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
  await resolveSettingsNameOnUpdate(db.productCategory, data, '产品分类', id);
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
  data.name = await assertSettingsNameUnique(db.partnerCategory, data.name, '合作单位分类');
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
  await resolveSettingsNameOnUpdate(db.partnerCategory, data, '合作单位分类', id);
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
  data.name = await assertSettingsNameUnique(db.globalNodeTemplate, data.name, '工序');
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
  await resolveSettingsNameOnUpdate(db.globalNodeTemplate, data, '工序', id);
  return db.globalNodeTemplate.update({ where: { id }, data: data as any });
}

export async function deleteNode(db: TenantPrismaClient, id: string) {
  await db.globalNodeTemplate.delete({ where: { id } });
  return { message: '已删除' };
}

export async function reorderNodes(db: TenantPrismaClient, orderedIds: string[]) {
  const existing = await db.globalNodeTemplate.findMany({ select: { id: true } });
  if (orderedIds.length !== existing.length) {
    throw new AppError(400, '排序列表与工序数量不一致');
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new AppError(400, '排序列表包含重复项');
  }
  const existingIds = new Set(existing.map((row) => row.id));
  for (const id of orderedIds) {
    if (!existingIds.has(id)) throw new AppError(400, '排序列表包含无效工序');
  }
  await db.$transaction(
    orderedIds.map((id, index) =>
      db.globalNodeTemplate.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  return listNodes(db, { all: true });
}

/** 工单中心表单配置：仅更新工序报工自定义单据字段（reportTemplate） */
export async function updateNodeReportTemplate(
  db: TenantPrismaClient,
  nodeId: string,
  reportTemplate: unknown,
) {
  const existing = await db.globalNodeTemplate.findUnique({ where: { id: nodeId } });
  if (!existing) throw new AppError(404, '工序不存在');
  const data: Record<string, unknown> = { reportTemplate };
  maybeParseReportFields(data, 'reportTemplate');
  const updated = await db.globalNodeTemplate.update({
    where: { id: nodeId },
    data: { reportTemplate: data.reportTemplate } as Parameters<typeof db.globalNodeTemplate.update>[0]['data'],
  });
  const { hasBom, ...rest } = updated as Record<string, unknown>;
  return { ...rest, hasBOM: hasBom };
}

export async function batchUpdateNodeReportTemplates(
  db: TenantPrismaClient,
  updates: Array<{ nodeId: string; reportTemplate: unknown }>,
) {
  return db.$transaction(async (tx) => {
    const updated: Awaited<ReturnType<typeof updateNodeReportTemplate>>[] = [];
    for (const { nodeId, reportTemplate } of updates) {
      updated.push(await updateNodeReportTemplate(tx as TenantPrismaClient, nodeId, reportTemplate));
    }
    return { updated };
  });
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
  data.name = await assertSettingsNameUnique(db.warehouse, data.name, '仓库');
  if (!data.id) data.id = genId('wh');
  return db.warehouse.create({ data });
}

export async function updateWarehouse(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const data = sanitizeUpdate(body);
  await resolveSettingsNameOnUpdate(db.warehouse, data, '仓库', id);
  return db.warehouse.update({ where: { id }, data });
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
  data.name = await assertSettingsNameUnique(db.financeCategory, data.name, '收付款类型');
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
  await resolveSettingsNameOnUpdate(db.financeCategory, data, '收付款类型', id);
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
  data.name = await assertSettingsNameUnique(db.financeAccountType, data.name, '收支账户类型');
  if (!data.id) data.id = genId('fatype');
  return db.financeAccountType.create({ data });
}

export async function updateFinanceAccountType(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const data = sanitizeUpdate(body);
  await resolveSettingsNameOnUpdate(db.financeAccountType, data, '收支账户类型', id);
  return db.financeAccountType.update({ where: { id }, data });
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

/** 租户侧 PUT /settings/config/:key 禁止修改的键（平台内部 sync 走 updateConfig 不经此校验） */
export function assertTenantConfigKeyEditable(key: string): void {
  if (key === 'productionLinkMode') {
    throw new AppError(403, '生产关联模式由平台管理员在企业管理中配置，租户不可修改');
  }
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
