import { Prisma } from '@prisma/client';
import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';
import { sanitizeUpdate, sanitizeCreate, sanitizeItems } from '../utils/request.js';

// ── JSON field coercion ──

const PRODUCT_JSON_FIELDS = [
  'colorIds', 'sizeIds', 'categoryCustomData', 'milestoneNodeIds',
  'routeReportValues', 'nodeRates', 'nodePricingModes',
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

// ── Products CRUD ──

export async function listProducts(
  db: TenantPrismaClient,
  opts: { categoryId?: string; search?: string },
) {
  const where: Record<string, unknown> = {};
  if (opts.categoryId) where.categoryId = opts.categoryId;
  if (opts.search) where.name = { contains: opts.search, mode: 'insensitive' };
  return db.product.findMany({
    where,
    include: { category: true, variants: { orderBy: { id: 'asc' } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
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

  const dupSku = await basePrisma.product.findFirst({ where: { tenantId, sku } });
  if (dupSku) throw new AppError(409, '产品编号已存在');
  const dupName = await basePrisma.product.findFirst({ where: { tenantId, name } });
  if (dupName) throw new AppError(409, '产品名称已存在');

  let cleanVariants: any[] | undefined;
  if (variants && Array.isArray(variants) && variants.length > 0) {
    cleanVariants = (variants as any[]).map((v: any) => {
      const { id, createdAt, updatedAt, tenantId: _t, product, productId, nodeBOMs, ...fields } = v;
      return { id: id || genId('pv'), ...fields, nodeBoms: nodeBOMs ?? fields.nodeBoms ?? {} };
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

  const dupSku = await basePrisma.product.findFirst({ where: { tenantId, sku, id: { not: productId } } });
  if (dupSku) throw new AppError(409, '产品编号已存在');
  const dupName = await basePrisma.product.findFirst({ where: { tenantId, name, id: { not: productId } } });
  if (dupName) throw new AppError(409, '产品名称已存在');

  const oldNodeIds = (existing.milestoneNodeIds as string[]) || [];

  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: data as Prisma.ProductUpdateInput });
    if (variants && Array.isArray(variants)) {
      await tx.productVariant.deleteMany({ where: { productId } });
      if (variants.length > 0) {
        for (const v of variants as any[]) { if (!v.id) v.id = genId('pv'); }
        const cleanVariants = (variants as any[]).map((v: Record<string, unknown>) => {
          const { createdAt, updatedAt, product, nodeBOMs, ...fields } = v as any;
          return { ...fields, nodeBoms: nodeBOMs ?? fields.nodeBoms ?? {}, productId };
        });
        await tx.productVariant.createMany({ data: cleanVariants });
      }
    }
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
  const bomParent = await db.bom.count({ where: { parentProductId: productId } });
  if (bomParent > 0) blockers.push(`有 ${bomParent} 条 BOM 以该产品为父产品`);
  const bomItem = await basePrisma.bomItem.count({ where: { productId, bom: { tenantId } } });
  if (bomItem > 0) blockers.push(`有 ${bomItem} 条 BOM 子件引用该产品`);
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
  await db.product.delete({ where: { id: productId } });
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

  await basePrisma.$transaction(async (tx) => {
    await tx.productVariant.deleteMany({ where: { productId } });
    if (variants.length > 0) {
      const cleanVariants = variants.map((v: any) => {
        const { createdAt, updatedAt, tenantId, product: _p, nodeBOMs, ...fields } = v;
        if (!fields.id) fields.id = genId('pv');
        return { ...fields, nodeBoms: nodeBOMs ?? fields.nodeBoms ?? {}, productId };
      });
      await tx.productVariant.createMany({ data: cleanVariants });
    }
  });

  return basePrisma.productVariant.findMany({ where: { productId }, orderBy: { id: 'asc' } });
}

// ── BOM ──

export async function listBoms(db: TenantPrismaClient, opts: { parentProductId?: string }) {
  const where: Record<string, unknown> = {};
  if (opts.parentProductId) where.parentProductId = opts.parentProductId;
  return db.bom.findMany({
    where,
    include: { items: { orderBy: { sortOrder: 'asc' } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
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
      await tx.bomItem.deleteMany({ where: { bomId } });
      const cleanItems = sanitizeItems(items as Record<string, unknown>[], ['quantityInput']).map(
        (item) => ({ ...item, bomId }),
      );
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
        milestoneNodeIds: [] as Prisma.InputJsonValue, routeReportValues: {} as Prisma.InputJsonValue,
        nodeRates: {} as Prisma.InputJsonValue, nodePricingModes: {} as Prisma.InputJsonValue,
      };

      const variants: Array<{ id: string; colorId: string; sizeId: string; skuSuffix: string; nodeBoms: Prisma.InputJsonValue }> = [];
      if (colorIds.length > 0 && sizeIds.length > 0) {
        for (const cid of colorIds) { for (const sid of sizeIds) { variants.push({ id: genId('pv'), colorId: cid, sizeId: sid, skuSuffix: '', nodeBoms: {} as Prisma.InputJsonValue }); } }
      } else if (colorIds.length > 0) {
        for (const cid of colorIds) { variants.push({ id: genId('pv'), colorId: cid, sizeId: '', skuSuffix: '', nodeBoms: {} as Prisma.InputJsonValue }); }
      } else if (sizeIds.length > 0) {
        for (const sid of sizeIds) { variants.push({ id: genId('pv'), colorId: '', sizeId: sid, skuSuffix: '', nodeBoms: {} as Prisma.InputJsonValue }); }
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
