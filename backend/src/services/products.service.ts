import { Prisma } from '@prisma/client';
import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';
import { isProductBlockedAsBomMaterialDb } from '../utils/productBomMaterial.js';
import { sanitizeUpdate, sanitizeCreate, sanitizeItems } from '../utils/request.js';

/** 产品保存时未选分类或分类无效（与前端「业务分类」一致） */
const MSG_PRODUCT_CATEGORY_REQUIRED =
  '没有选择产品类型，请去系统设置中添加产品分类';

async function assertProductCategoryIdForWrite(
  db: TenantPrismaClient,
  data: Record<string, unknown>,
  mode: 'create' | 'update',
): Promise<void> {
  if (mode === 'create') {
    const raw = data.categoryId;
    const s = raw === undefined || raw === null ? '' : String(raw).trim();
    if (!s) throw new AppError(400, MSG_PRODUCT_CATEGORY_REQUIRED);
    const category = await db.productCategory.findFirst({ where: { id: s } });
    if (!category) throw new AppError(400, MSG_PRODUCT_CATEGORY_REQUIRED);
    data.categoryId = s;
    return;
  }
  if (!('categoryId' in data)) return;
  const v = data.categoryId;
  if (v === undefined) return;
  if (v === null) {
    data.categoryId = null;
    return;
  }
  const s = String(v).trim();
  if (!s) throw new AppError(400, MSG_PRODUCT_CATEGORY_REQUIRED);
  const category = await db.productCategory.findFirst({ where: { id: s } });
  if (!category) throw new AppError(400, MSG_PRODUCT_CATEGORY_REQUIRED);
  data.categoryId = s;
}

// ── JSON field coercion ──

const PRODUCT_JSON_FIELDS = [
  'colorIds', 'sizeIds', 'categoryCustomData', 'milestoneNodeIds',
  'routeReportValues', 'routeReportDisplayValues', 'nodeRates', 'nodePricingModes',
] as const;

function coerceProductJsonFields(data: Record<string, unknown>): void {
  for (const key of PRODUCT_JSON_FIELDS) {
    if (!(key in data)) continue;
    let v = data[key];
    if (v === undefined) { delete data[key]; continue; }
    if (typeof v === 'string') {
      const t = v.trim();
      if (t === '') {
        data[key] = key === 'colorIds' || key === 'sizeIds' || key === 'milestoneNodeIds'
          ? ([] as Prisma.InputJsonValue) : ({} as Prisma.InputJsonValue);
        continue;
      }
      try { v = JSON.parse(t) as unknown; } catch { delete data[key]; continue; }
    }
    try { data[key] = JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue; }
    catch { delete data[key]; }
  }
}

function omitUndefinedValues(data: Record<string, unknown>): void {
  for (const k of Object.keys(data)) { if (data[k] === undefined) delete data[k]; }
}

function normalizeProductNameSku(
  data: Record<string, unknown>,
  existing?: { name: string; sku: string },
): { name: string; sku: string } {
  const name = data.name !== undefined && typeof data.name === 'string'
    ? data.name.trim() : (existing ? String(existing.name ?? '').trim() : '');
  const sku = data.sku !== undefined && typeof data.sku === 'string'
    ? data.sku.trim() : (existing ? String(existing.sku ?? '').trim() : '');
  return { name, sku };
}

// ── 变体（颜色/尺码规格）引用校验与 diff 写入 ──

type VariantRef = { id: string; skuSuffix: string | null };
type VariantUsageDetail = { label: string; count: number };

/**
 * 统计指定变体在各业务表中的引用条数（按 variantId 分组）。
 * 覆盖含 variantId 的业务数据表；Bom.variantId 属配置数据，删除变体时级联清理，不在此列。
 */
async function collectVariantUsage(
  db: TenantPrismaClient,
  productId: string,
  variantIds: string[],
): Promise<Map<string, VariantUsageDetail[]>> {
  const result = new Map<string, VariantUsageDetail[]>();
  if (variantIds.length === 0) return result;
  const vIn = { in: variantIds };
  const groupArgs = { by: ['variantId'] as ['variantId'], _count: { _all: true as const } };

  const [orderItems, milestoneReports, pmps, pmpReports, opRecords, psiRecords, planItems, virtualBatches, itemCodes] =
    await Promise.all([
      db.orderItem.groupBy({ ...groupArgs, where: { variantId: vIn, productionOrder: { productId } } }),
      db.milestoneReport.groupBy({ ...groupArgs, where: { variantId: vIn, milestone: { productionOrder: { productId } } } }),
      db.productMilestoneProgress.groupBy({ ...groupArgs, where: { variantId: vIn, productId } }),
      db.productProgressReport.groupBy({ ...groupArgs, where: { variantId: vIn, progress: { productId } } }),
      db.productionOpRecord.groupBy({ ...groupArgs, where: { variantId: vIn, productId } }),
      db.psiRecord.groupBy({ ...groupArgs, where: { variantId: vIn, productId } }),
      db.planItem.groupBy({ ...groupArgs, where: { variantId: vIn, planOrder: { productId } } }),
      db.planVirtualBatch.groupBy({ ...groupArgs, where: { variantId: vIn, productId } }),
      db.itemCode.groupBy({ ...groupArgs, where: { variantId: vIn, productId } }),
    ]);

  const add = (label: string, rows: Array<{ variantId: string | null; _count: { _all: number } }>) => {
    for (const row of rows) {
      if (!row.variantId || row._count._all === 0) continue;
      const list = result.get(row.variantId) ?? [];
      list.push({ label, count: row._count._all });
      result.set(row.variantId, list);
    }
  };
  add('工单明细', orderItems);
  add('工单报工记录', milestoneReports);
  add('产品工序进度', pmps);
  add('产品报工记录', pmpReports);
  add('生产操作记录', opRecords);
  add('进销存流水', psiRecords);
  add('计划单明细', planItems);
  add('扫码批次', virtualBatches);
  add('单品码', itemCodes);
  return result;
}

function variantLabelOf(v: VariantRef): string {
  return (v.skuSuffix ?? '').trim() || v.id;
}

/** 删除变体前校验：任一变体已被业务数据引用则 409，按规格列出引用明细。 */
async function assertVariantsRemovable(
  db: TenantPrismaClient,
  productId: string,
  removed: VariantRef[],
): Promise<void> {
  const usage = await collectVariantUsage(db, productId, removed.map((v) => v.id));
  const blocked = removed.filter((v) => (usage.get(v.id) ?? []).length > 0);
  if (blocked.length === 0) return;
  const msgs = blocked.map((v) => {
    const details = usage.get(v.id)!;
    return `规格【${variantLabelOf(v)}】有 ${details.map((d) => `${d.count} 条${d.label}`).join('、')}`;
  });
  throw new AppError(409, `无法删除已产生业务数据的颜色/尺码：${msgs.join('；')}。请保留该规格，或先处理相关单据。`);
}

/** 规范化提交的变体行：补 id、剥离关系/审计字段、对齐 nodeBoms / nodeUnitWeights。 */
function cleanVariantInput(v: Record<string, unknown>, productId: string): Record<string, unknown> & { id: string } {
  const { id, createdAt, updatedAt, tenantId, product, productId: _pid, nodeBOMs, ...fields } = v as Record<string, unknown> & {
    id?: string;
    nodeBOMs?: unknown;
  };
  return {
    ...fields,
    id: id || genId('pv'),
    nodeBoms: nodeBOMs ?? (fields as { nodeBoms?: unknown }).nodeBoms ?? {},
    nodeUnitWeights: (fields as { nodeUnitWeights?: unknown }).nodeUnitWeights ?? {},
    productId,
  };
}

type VariantWritePlan = {
  removedIds: string[];
  toUpdate: Array<Record<string, unknown> & { id: string }>;
  toCreate: Array<Record<string, unknown> & { id: string }>;
};

/**
 * 计算变体 diff 写入计划（替代旧的「全删全建」）：
 * 被移除的变体先过引用校验；保留的只 update，新增的 create，避免误删后重建丢失外部引用。
 */
async function planVariantWrite(
  db: TenantPrismaClient,
  productId: string,
  variants: Array<Record<string, unknown>>,
): Promise<VariantWritePlan> {
  const existing = await db.productVariant.findMany({
    where: { productId },
    select: { id: true, skuSuffix: true },
  });
  const clean = variants.map((v) => cleanVariantInput(v, productId));
  const submittedIds = new Set(clean.map((v) => v.id));
  const removed = existing.filter((v) => !submittedIds.has(v.id));
  if (removed.length > 0) await assertVariantsRemovable(db, productId, removed);
  const existingIds = new Set(existing.map((v) => v.id));
  return {
    removedIds: removed.map((v) => v.id),
    toUpdate: clean.filter((v) => existingIds.has(v.id)),
    toCreate: clean.filter((v) => !existingIds.has(v.id)),
  };
}

/**
 * 变体写入所需的最小事务客户端形状。
 * 租户扩展客户端与 basePrisma 的事务客户端泛型签名不互相兼容，这里用结构化类型同时接住两者。
 */
type VariantWriteTx = {
  bom: { deleteMany: (args: { where: Prisma.BomWhereInput }) => Promise<unknown> };
  productVariant: {
    deleteMany: (args: { where: Prisma.ProductVariantWhereInput }) => Promise<unknown>;
    update: (args: { where: Prisma.ProductVariantWhereUniqueInput; data: Prisma.ProductVariantUpdateInput }) => Promise<unknown>;
    createMany: (args: { data: Prisma.ProductVariantCreateManyInput[] }) => Promise<unknown>;
  };
};

/** 在事务内应用变体写入计划；被删变体的变体级 BOM（配置数据）一并清理。 */
async function applyVariantWritePlan(
  tx: VariantWriteTx,
  productId: string,
  plan: VariantWritePlan,
): Promise<void> {
  if (plan.removedIds.length > 0) {
    await tx.bom.deleteMany({ where: { parentProductId: productId, variantId: { in: plan.removedIds } } });
    await tx.productVariant.deleteMany({ where: { productId, id: { in: plan.removedIds } } });
  }
  for (const v of plan.toUpdate) {
    const { id, productId: _pid, ...fields } = v;
    await tx.productVariant.update({ where: { id }, data: fields as Prisma.ProductVariantUpdateInput });
  }
  if (plan.toCreate.length > 0) {
    await tx.productVariant.createMany({ data: plan.toCreate as Prisma.ProductVariantCreateManyInput[] });
  }
}

/** 查询变体引用情况（前端取消勾选颜色/尺码时预检用） */
export async function getVariantUsage(
  db: TenantPrismaClient,
  productId: string,
  variantIds: string[],
) {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { variants: { select: { id: true, skuSuffix: true } } },
  });
  if (!product) throw new AppError(404, '产品不存在');
  const known = new Map(product.variants.map((v) => [v.id, v]));
  // 只统计后端已持久化的变体；前端临时生成、尚未保存的 id 不可能有业务数据
  const ids = (variantIds.length > 0 ? variantIds : product.variants.map((v) => v.id)).filter((id) => known.has(id));
  const usage = await collectVariantUsage(db, productId, ids);
  return {
    productId,
    usages: ids.map((id) => {
      const details = usage.get(id) ?? [];
      return {
        variantId: id,
        variantLabel: variantLabelOf(known.get(id)!),
        total: details.reduce((sum, d) => sum + d.count, 0),
        details,
      };
    }),
  };
}

// ── Products CRUD ──

export async function listProducts(
  db: TenantPrismaClient,
  opts: { categoryId?: string; search?: string; all?: boolean; page?: number; pageSize?: number },
) {
  const where: Record<string, unknown> = {};
  if (opts.categoryId) where.categoryId = opts.categoryId;
  if (opts.search) where.name = { contains: opts.search, mode: 'insensitive' };
  const include = { category: true, variants: { orderBy: { id: 'asc' as const } } };
  const orderBy: any = [{ createdAt: 'desc' }, { id: 'asc' }];

  if (opts.all) {
    return db.product.findMany({ where, include, orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.product.findMany({ where, include, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.product.count({ where }),
  ]);
  return { data, total, page, pageSize };
}

export async function getProduct(db: TenantPrismaClient, id: string) {
  const product = await db.product.findUnique({
    where: { id },
    include: { category: true, variants: true, boms: { include: { items: true } } },
  });
  if (!product) throw new AppError(404, '产品不存在');
  return product;
}

export async function createProduct(
  db: TenantPrismaClient,
  tenantId: string,
  body: Record<string, unknown>,
) {
  const { variants, category, boms: _boms, ...rest } = body;
  const data = sanitizeCreate(rest);
  if (!data.id) data.id = genId('prod');

  const { name, sku } = normalizeProductNameSku(data);
  if (!name) throw new AppError(400, '产品名称不能为空');
  if (!sku) throw new AppError(400, '产品编号不能为空');
  data.name = name;
  data.sku = sku;
  coerceProductJsonFields(data);
  omitUndefinedValues(data);

  await assertProductCategoryIdForWrite(db, data, 'create');

  const dupSku = await basePrisma.product.findFirst({ where: { tenantId, sku } });
  if (dupSku) throw new AppError(409, '产品编号已存在');
  const dupName = await basePrisma.product.findFirst({ where: { tenantId, name } });
  if (dupName) throw new AppError(409, '产品名称已存在');

  let cleanVariants: any[] | undefined;
  if (variants && Array.isArray(variants) && variants.length > 0) {
    cleanVariants = (variants as any[]).map((v: any) => {
      const { id, createdAt, updatedAt, tenantId: _t, product, productId, nodeBOMs, ...fields } = v;
      return {
        id: id || genId('pv'),
        ...fields,
        nodeBoms: nodeBOMs ?? fields.nodeBoms ?? {},
        nodeUnitWeights: fields.nodeUnitWeights ?? {},
      };
    });
  }
  return db.product.create({
    data: { ...data, variants: cleanVariants ? { create: cleanVariants } : undefined },
    include: { variants: true },
  });
}

export async function updateProduct(
  db: TenantPrismaClient,
  tenantId: string,
  productId: string,
  body: Record<string, unknown>,
) {
  const { variants, category, boms: _boms, ...rest } = body;
  const data = sanitizeUpdate(rest);
  const existing = await db.product.findUnique({ where: { id: productId } });
  if (!existing) throw new AppError(404, '产品不存在');

  const { name, sku } = normalizeProductNameSku(data, { name: existing.name, sku: existing.sku });
  if (!name) throw new AppError(400, '产品名称不能为空');
  if (!sku) throw new AppError(400, '产品编号不能为空');
  data.name = name;
  data.sku = sku;
  coerceProductJsonFields(data);
  omitUndefinedValues(data);

  await assertProductCategoryIdForWrite(db, data, 'update');

  const dupSku = await basePrisma.product.findFirst({ where: { tenantId, sku, id: { not: productId } } });
  if (dupSku) throw new AppError(409, '产品编号已存在');
  const dupName = await basePrisma.product.findFirst({ where: { tenantId, name, id: { not: productId } } });
  if (dupName) throw new AppError(409, '产品名称已存在');

  const oldNodeIds = (existing.milestoneNodeIds as string[]) || [];
  // 工单上的 productName/sku 是创建时的快照；产品改名/改编号后同步刷新，保持单据展示与档案一致
  const nameOrSkuChanged = name !== existing.name || sku !== existing.sku;

  // 被移除的变体（颜色/尺码组合）若已被业务数据引用，这里直接 409，不进事务
  const variantPlan = variants && Array.isArray(variants)
    ? await planVariantWrite(db, productId, variants as Array<Record<string, unknown>>)
    : null;

  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: data as Prisma.ProductUpdateInput });
    if (nameOrSkuChanged) {
      await tx.productionOrder.updateMany({
        where: { productId },
        data: { productName: name, sku },
      });
    }
    if (variantPlan) await applyVariantWritePlan(tx, productId, variantPlan);
  });

  const newNodeIds = (data.milestoneNodeIds as string[] | undefined) ?? oldNodeIds;
  if (oldNodeIds.length === 0 && newNodeIds.length > 0) {
    await backfillPendingProcessOrders(productId, tenantId, newNodeIds);
  }

  return db.product.findUnique({ where: { id: productId }, include: { variants: true } });
}

export async function deleteProduct(
  db: TenantPrismaClient,
  tenantId: string,
  productId: string,
) {
  const existing = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!existing) throw new AppError(404, '产品不存在');

  const blockers: string[] = [];
  const bomItem = await basePrisma.bomItem.count({ where: { productId, bom: { tenantId } } });
  if (bomItem > 0) blockers.push(`有 ${bomItem} 条 BOM 子件引用该产品（请先在其他产品物料单中移除）`);
  const plans = await db.planOrder.count({ where: { productId } });
  if (plans > 0) blockers.push(`有 ${plans} 条生产计划`);
  const orders = await db.productionOrder.count({ where: { productId } });
  if (orders > 0) blockers.push(`有 ${orders} 条生产工单`);
  const pmp = await db.productMilestoneProgress.count({ where: { productId } });
  if (pmp > 0) blockers.push(`有 ${pmp} 条产品工序进度`);
  const opRec = await db.productionOpRecord.count({
    where: { OR: [{ productId }, { sourceProductId: productId }] },
  });
  if (opRec > 0) blockers.push(`有 ${opRec} 条生产操作记录`);
  const psi = await db.psiRecord.count({ where: { productId } });
  if (psi > 0) blockers.push(`有 ${psi} 条进销存记录`);
  const fin = await db.financeRecord.count({ where: { productId } });
  if (fin > 0) blockers.push(`有 ${fin} 条财务记录`);
  const transfers = await basePrisma.interTenantSubcontractTransfer.count({
    where: {
      OR: [
        { senderTenantId: tenantId, senderProductId: productId },
        { receiverTenantId: tenantId, receiverProductId: productId },
      ],
    },
  });
  if (transfers > 0) blockers.push(`有 ${transfers} 条协作外发/接收关联`);
  const collabMaps = await basePrisma.collaborationProductMap.count({
    where: {
      receiverProductId: productId,
      collaboration: { OR: [{ tenantAId: tenantId }, { tenantBId: tenantId }] },
    },
  });
  if (collabMaps > 0) blockers.push(`有 ${collabMaps} 条协作产品映射`);

  if (blockers.length > 0) throw new AppError(409, `无法删除产品：${blockers.join('；')}`);

  await db.$transaction(async (tx) => {
    await tx.bom.deleteMany({ where: { parentProductId: productId } });
    await tx.product.delete({ where: { id: productId } });
  });
  return { message: '已删除' };
}

// ── Variants ──

export async function listVariants(db: TenantPrismaClient, productId: string) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError(404, '产品不存在');
  return basePrisma.productVariant.findMany({ where: { productId }, orderBy: { id: 'asc' } });
}

export async function syncVariants(
  db: TenantPrismaClient,
  productId: string,
  variants: Array<Record<string, unknown>>,
) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError(404, '产品不存在');

  const plan = await planVariantWrite(db, productId, variants);
  await basePrisma.$transaction(async (tx) => {
    await applyVariantWritePlan(tx, productId, plan);
  });

  return basePrisma.productVariant.findMany({ where: { productId }, orderBy: { id: 'asc' } });
}

// ── BOM ──

async function assertBomItemsNotColorSizeProducts(
  db: TenantPrismaClient,
  items: { productId?: string }[] | undefined,
) {
  if (!items?.length) return;
  const ids = [...new Set(items.map((i) => String(i.productId ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return;
  const rows = await db.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, sku: true, colorIds: true, sizeIds: true, variants: { select: { id: true }, take: 1 } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) throw new AppError(400, `BOM 子件产品不存在：${id}`);
    if (isProductBlockedAsBomMaterialDb(row)) {
      throw new AppError(400, `BOM 子件不能使用带颜色/尺码的产品：${row.name}（${row.sku}）`);
    }
  }
}

export async function listBoms(
  db: TenantPrismaClient,
  opts: { parentProductId?: string; all?: boolean; page?: number; pageSize?: number },
) {
  const where: Record<string, unknown> = {};
  if (opts.parentProductId) where.parentProductId = opts.parentProductId;
  const include = { items: { orderBy: { sortOrder: 'asc' as const } } };
  const orderBy: any = [{ createdAt: 'desc' }, { id: 'asc' }];

  if (opts.all) {
    return db.bom.findMany({ where, include, orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.bom.findMany({ where, include, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.bom.count({ where }),
  ]);
  return { data, total, page, pageSize };
}

export async function getBom(db: TenantPrismaClient, id: string) {
  const bom = await db.bom.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!bom) throw new AppError(404, 'BOM 不存在');
  return bom;
}

export async function createBom(db: TenantPrismaClient, body: Record<string, unknown>) {
  const { items, ...rest } = body;
  const data = sanitizeCreate(rest);
  if (!data.id) data.id = genId('bom');
  const cleanItems = items
    ? sanitizeItems(items as Record<string, unknown>[], ['quantityInput', 'bomId'])
    : undefined;
  await assertBomItemsNotColorSizeProducts(db, cleanItems);
  return db.bom.create({
    data: { ...data, items: cleanItems ? { create: cleanItems } : undefined },
    include: { items: true },
  });
}

export async function updateBom(
  db: TenantPrismaClient,
  bomId: string,
  body: Record<string, unknown>,
) {
  const { items, ...rest } = body;
  const data = sanitizeUpdate(rest);
  const existing = await db.bom.findUnique({ where: { id: bomId } });
  if (!existing) throw new AppError(404, 'BOM 不存在');

  await basePrisma.$transaction(async (tx) => {
    await tx.bom.update({ where: { id: bomId }, data });
    if (items) {
      const cleanItems = sanitizeItems(items as Record<string, unknown>[], ['quantityInput']).map(
        (item) => ({ ...item, bomId }),
      );
      await assertBomItemsNotColorSizeProducts(db, cleanItems);
      await tx.bomItem.deleteMany({ where: { bomId } });
      await tx.bomItem.createMany({ data: cleanItems });
    }
  });
  return basePrisma.bom.findUnique({ where: { id: bomId }, include: { items: true } });
}

export async function deleteBom(db: TenantPrismaClient, id: string) {
  await db.bom.delete({ where: { id } });
  return { message: '已删除' };
}

// ── Import ──

export async function importProducts(
  db: TenantPrismaClient,
  tenantId: string,
  body: {
    categoryId: string;
    products: Array<Record<string, any>>;
    newDictionaryItems?: Array<{ type: string; name: string; value: string }>;
  },
) {
  const { categoryId, products: rows, newDictionaryItems } = body;
  if (!categoryId) throw new AppError(400, '必须指定产品分类');
  if (!Array.isArray(rows) || rows.length === 0) throw new AppError(400, '导入数据不能为空');

  const category = await db.productCategory.findUnique({ where: { id: categoryId } });
  if (!category) throw new AppError(404, '产品分类不存在');

  const createdDictMap = new Map<string, string>();
  if (newDictionaryItems && newDictionaryItems.length > 0) {
    for (const item of newDictionaryItems) {
      const existing = await db.dictionaryItem.findFirst({
        where: { type: item.type, name: item.name },
      });
      if (existing) { createdDictMap.set(`${item.type}:${item.name}`, existing.id); continue; }
      const id = genId('dict');
      const maxRow = await db.dictionaryItem.aggregate({ where: { type: item.type }, _max: { sortOrder: true } });
      const sortOrder = (maxRow._max.sortOrder ?? -1) + 1;
      await db.dictionaryItem.create({
        data: { id, type: item.type, name: item.name, value: item.value, sortOrder } as any,
      });
      createdDictMap.set(`${item.type}:${item.name}`, id);
    }
  }

  const existingProducts = await basePrisma.product.findMany({
    where: { tenantId },
    select: { sku: true, name: true },
  });
  const existingSkus = new Set(existingProducts.map((p) => p.sku.toLowerCase()));
  const existingNames = new Set(existingProducts.map((p) => p.name.toLowerCase()));

  const results: Array<{ row: number; success: boolean; name?: string; sku?: string; reason?: string }> = [];
  let successCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    try {
      const name = (row.name ?? '').trim();
      const sku = (row.sku ?? '').trim();
      if (!name) { results.push({ row: rowNum, success: false, name, sku, reason: '产品名称不能为空' }); continue; }
      if (!sku) { results.push({ row: rowNum, success: false, name, sku, reason: '产品编号不能为空' }); continue; }
      if (existingSkus.has(sku.toLowerCase())) { results.push({ row: rowNum, success: false, name, sku, reason: `产品编号 "${sku}" 已存在` }); continue; }
      if (existingNames.has(name.toLowerCase())) { results.push({ row: rowNum, success: false, name, sku, reason: `产品名称 "${name}" 已存在` }); continue; }

      const productId = genId('prod');
      const colorIds = row.colorIds ?? [];
      const sizeIds = row.sizeIds ?? [];
      const productData: Record<string, unknown> = {
        id: productId, sku, name, categoryId,
        imageUrl: row.imageUrl || null, salesPrice: row.salesPrice ?? null,
        purchasePrice: row.purchasePrice ?? null, supplierId: row.supplierId || null,
        unitId: row.unitId || null,
        colorIds: colorIds as Prisma.InputJsonValue, sizeIds: sizeIds as Prisma.InputJsonValue,
        categoryCustomData: (row.categoryCustomData ?? {}) as Prisma.InputJsonValue,
        milestoneNodeIds: [] as Prisma.InputJsonValue,
        routeReportValues: {} as Prisma.InputJsonValue,
        routeReportDisplayValues: {} as Prisma.InputJsonValue,
        nodeRates: {} as Prisma.InputJsonValue, nodePricingModes: {} as Prisma.InputJsonValue,
      };

      const variants: Array<{ id: string; colorId: string; sizeId: string; skuSuffix: string; nodeBoms: Prisma.InputJsonValue; nodeUnitWeights: Prisma.InputJsonValue }> = [];
      if (colorIds.length > 0 && sizeIds.length > 0) {
        for (const cid of colorIds) { for (const sid of sizeIds) { variants.push({ id: genId('pv'), colorId: cid, sizeId: sid, skuSuffix: '', nodeBoms: {} as Prisma.InputJsonValue, nodeUnitWeights: {} as Prisma.InputJsonValue }); } }
      } else if (colorIds.length > 0) {
        for (const cid of colorIds) { variants.push({ id: genId('pv'), colorId: cid, sizeId: '', skuSuffix: '', nodeBoms: {} as Prisma.InputJsonValue, nodeUnitWeights: {} as Prisma.InputJsonValue }); }
      } else if (sizeIds.length > 0) {
        for (const sid of sizeIds) { variants.push({ id: genId('pv'), colorId: '', sizeId: sid, skuSuffix: '', nodeBoms: {} as Prisma.InputJsonValue, nodeUnitWeights: {} as Prisma.InputJsonValue }); }
      }

      await db.product.create({
        data: { ...productData, variants: variants.length > 0 ? { create: variants } : undefined } as any,
      });

      existingSkus.add(sku.toLowerCase());
      existingNames.add(name.toLowerCase());
      successCount++;
      results.push({ row: rowNum, success: true, name, sku });
    } catch (e: any) {
      const msg = e instanceof AppError ? e.message : (e?.message ?? '未知错误');
      results.push({ row: rowNum, success: false, name: row.name, sku: row.sku, reason: msg });
    }
  }

  return { success: successCount, failed: results.filter((r) => !r.success).length, results };
}

// ── backfill ──

async function backfillPendingProcessOrders(
  productId: string,
  tenantId: string,
  milestoneNodeIds: string[],
) {
  const pendingOrders = await basePrisma.productionOrder.findMany({
    where: { productId, tenantId, status: 'PENDING_PROCESS' },
    include: { milestones: true },
  });
  if (pendingOrders.length === 0) return;

  const nodes = await basePrisma.globalNodeTemplate.findMany({ where: { tenantId } });
  for (const order of pendingOrders) {
    if (order.milestones.length > 0) continue;
    const milestones = milestoneNodeIds.map((nodeId, idx) => {
      const node = nodes.find((n) => n.id === nodeId);
      return {
        id: genId('ms'), templateId: nodeId, name: node?.name || nodeId,
        status: 'PENDING', completedQuantity: 0,
        reportTemplate: (node as any)?.reportTemplate || [],
        reportDisplayTemplate: (node as any)?.reportDisplayTemplate ?? [],
        weight: 1, assignedWorkerIds: [], assignedEquipmentIds: [],
        sortOrder: idx, productionOrderId: order.id,
      };
    });
    await basePrisma.$transaction(async (tx) => {
      await tx.milestone.createMany({ data: milestones });
      await tx.productionOrder.update({ where: { id: order.id }, data: { status: 'IN_PROGRESS' } });
    });
  }
}
