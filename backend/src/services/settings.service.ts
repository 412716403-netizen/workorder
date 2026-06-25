import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { genId } from '../utils/genId.js';
import { sanitizeUpdate, sanitizeCreate, normalizeDates } from '../utils/request.js';
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
  const existing = await db.productCategory.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, '产品分类不存在');

  // 产品分类被产品 / 开发款式按 categoryId 引用；被引用时禁止删除，避免悬空 id 导致分类名称解析失效
  const blockers: string[] = [];
  const [productCount, devStyleCount] = await Promise.all([
    db.product.count({ where: { categoryId: id } }),
    db.devStyle.count({ where: { categoryId: id } }),
  ]);
  if (productCount > 0) blockers.push(`${productCount} 个产品`);
  if (devStyleCount > 0) blockers.push(`${devStyleCount} 个开发款式`);
  if (blockers.length > 0) {
    throw new AppError(409, `无法删除产品分类「${existing.name}」：已被 ${blockers.join('、')}调用。请先调整相关数据后再删除。`);
  }

  await db.productCategory.delete({ where: { id } });
  return { message: '已删除' };
}

/** 返回被产品 / 开发款式引用的产品分类 id 列表（供前端置灰删除按钮） */
export async function getCategoryUsage(db: TenantPrismaClient): Promise<string[]> {
  const [products, devStyles] = await Promise.all([
    db.product.findMany({ where: { categoryId: { not: null } }, select: { categoryId: true }, distinct: ['categoryId'] }),
    db.devStyle.findMany({ where: { categoryId: { not: null } }, select: { categoryId: true }, distinct: ['categoryId'] }),
  ]);
  const used = new Set<string>();
  for (const r of products) if (r.categoryId) used.add(r.categoryId);
  for (const r of devStyles) if (r.categoryId) used.add(r.categoryId);
  return [...used];
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
  const existing = await db.partnerCategory.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, '合作单位分类不存在');

  // 合作单位分类被合作单位按 categoryId 引用；被引用时禁止删除，避免悬空 id 导致分类名称解析失效
  const partnerCount = await db.partner.count({ where: { categoryId: id } });
  if (partnerCount > 0) {
    throw new AppError(409, `无法删除合作单位分类「${existing.name}」：已被 ${partnerCount} 个合作单位调用。请先调整相关合作单位后再删除。`);
  }

  await db.partnerCategory.delete({ where: { id } });
  return { message: '已删除' };
}

/** 返回被合作单位引用的合作单位分类 id 列表（供前端置灰删除按钮） */
export async function getPartnerCategoryUsage(db: TenantPrismaClient): Promise<string[]> {
  const rows = await db.partner.findMany({ where: { categoryId: { not: null } }, select: { categoryId: true }, distinct: ['categoryId'] });
  const used = new Set<string>();
  for (const r of rows) if (r.categoryId) used.add(r.categoryId);
  return [...used];
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
  const existing = await db.globalNodeTemplate.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, '工序不存在');

  // 工序被产品信息按 id 引用（产品标准生产路线 milestoneNodeIds）；被引用时禁止删除，避免悬空 id 导致路线/报工解析失效
  const productCount = await db.product.count({
    where: { milestoneNodeIds: { array_contains: id } },
  });
  if (productCount > 0) {
    throw new AppError(
      409,
      `无法删除工序「${existing.name}」：已被 ${productCount} 个产品的生产路线调用。请先在相关产品信息中移除该工序后再删除。`,
    );
  }

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
  const existing = await db.warehouse.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, '仓库不存在');

  // 仓库被进销存单据（入/出/调拨/盘点）与生产操作记录按 warehouseId 引用（无外键约束，需手动校验）；被引用时禁止删除
  const blockers: string[] = [];
  const [psiCount, opCount] = await Promise.all([
    db.psiRecord.count({
      where: {
        OR: [
          { warehouseId: id },
          { fromWarehouseId: id },
          { toWarehouseId: id },
          { allocationWarehouseId: id },
        ],
      },
    }),
    db.productionOpRecord.count({ where: { warehouseId: id } }),
  ]);
  if (psiCount > 0) blockers.push(`${psiCount} 条进销存单据`);
  if (opCount > 0) blockers.push(`${opCount} 条生产操作记录`);
  if (blockers.length > 0) {
    throw new AppError(409, `无法删除仓库「${existing.name}」：已被 ${blockers.join('、')}调用。请先调整相关单据后再删除。`);
  }

  await db.warehouse.delete({ where: { id } });
  return { message: '已删除' };
}

/** 返回被进销存单据 / 生产操作记录引用的仓库 id 列表（供前端置灰删除按钮） */
export async function getWarehouseUsage(db: TenantPrismaClient): Promise<string[]> {
  const [wh, from, to, alloc, op] = await Promise.all([
    db.psiRecord.findMany({ where: { warehouseId: { not: null } }, select: { warehouseId: true }, distinct: ['warehouseId'] }),
    db.psiRecord.findMany({ where: { fromWarehouseId: { not: null } }, select: { fromWarehouseId: true }, distinct: ['fromWarehouseId'] }),
    db.psiRecord.findMany({ where: { toWarehouseId: { not: null } }, select: { toWarehouseId: true }, distinct: ['toWarehouseId'] }),
    db.psiRecord.findMany({ where: { allocationWarehouseId: { not: null } }, select: { allocationWarehouseId: true }, distinct: ['allocationWarehouseId'] }),
    db.productionOpRecord.findMany({ where: { warehouseId: { not: null } }, select: { warehouseId: true }, distinct: ['warehouseId'] }),
  ]);
  const used = new Set<string>();
  for (const r of wh) if (r.warehouseId) used.add(r.warehouseId);
  for (const r of from) if (r.fromWarehouseId) used.add(r.fromWarehouseId);
  for (const r of to) if (r.toWarehouseId) used.add(r.toWarehouseId);
  for (const r of alloc) if (r.allocationWarehouseId) used.add(r.allocationWarehouseId);
  for (const r of op) if (r.warehouseId) used.add(r.warehouseId);
  return [...used];
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
  const existing = await db.financeCategory.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, '收付款类型不存在');

  // 收付款类型被财务记录按 categoryId 引用；被引用时禁止删除，避免悬空 id 导致类型名称解析失效
  const recordCount = await db.financeRecord.count({ where: { categoryId: id } });
  if (recordCount > 0) {
    throw new AppError(409, `无法删除收付款类型「${existing.name}」：已被 ${recordCount} 条财务记录调用。请先调整相关财务记录后再删除。`);
  }

  await db.financeCategory.delete({ where: { id } });
  return { message: '已删除' };
}

/** 返回被财务记录引用的收付款类型 id 列表（供前端置灰删除按钮） */
export async function getFinanceCategoryUsage(db: TenantPrismaClient): Promise<string[]> {
  const rows = await db.financeRecord.findMany({ where: { categoryId: { not: null } }, select: { categoryId: true }, distinct: ['categoryId'] });
  const used = new Set<string>();
  for (const r of rows) if (r.categoryId) used.add(r.categoryId);
  return [...used];
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
  normalizeDates(data);
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
  normalizeDates(data);
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
