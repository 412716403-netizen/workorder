import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma, prisma as basePrisma } from '../lib/prisma.js';
import { str, optStr, sanitizeUpdate, sanitizeCreate, sanitizeItems } from '../utils/request.js';

function genId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

// ── 产品 ──
export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const categoryId = optStr(req.query.categoryId);
    const search = optStr(req.query.search);
    const where: Record<string, unknown> = {};
    if (categoryId) where.categoryId = categoryId;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    res.json(await db.product.findMany({
      where,
      include: { category: true, variants: { orderBy: { id: 'asc' } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    }));
  } catch (e) { next(e); }
}

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await basePrisma.product.findUnique({
      where: { id: str(req.params.id) },
      include: { category: true, variants: true, boms: { include: { items: true } } },
    });
    if (!product) { res.status(404).json({ error: '产品不存在' }); return; }
    res.json(product);
  } catch (e) { next(e); }
}

export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const { variants, category, boms: _boms, ...rest } = req.body;
    const data = sanitizeCreate(rest);
    if (!data.id) data.id = genId('prod');
    let cleanVariants: any[] | undefined;
    if (variants && Array.isArray(variants) && variants.length > 0) {
      cleanVariants = variants.map((v: any) => {
        const { id, createdAt, updatedAt, tenantId, product, productId, nodeBOMs, ...fields } = v;
        return { id: id || genId('pv'), ...fields, nodeBoms: nodeBOMs ?? fields.nodeBoms ?? {} };
      });
    }
    const product = await db.product.create({
      data: {
        ...data,
        variants: cleanVariants ? { create: cleanVariants } : undefined,
      },
      include: { variants: true },
    });
    res.status(201).json(product);
  } catch (e) { next(e); }
}

export async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { variants, category, boms: _boms, ...rest } = req.body;
    const data = sanitizeUpdate(rest);
    const productId = str(req.params.id);
    await basePrisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: productId }, data });
      if (variants && Array.isArray(variants)) {
        await tx.productVariant.deleteMany({ where: { productId } });
        if (variants.length > 0) {
          for (const v of variants) { if (!v.id) v.id = genId('pv'); }
          const cleanVariants = variants.map((v: Record<string, unknown>) => {
            const { createdAt, updatedAt, product, nodeBOMs, ...fields } = v as any;
            return { ...fields, nodeBoms: nodeBOMs ?? fields.nodeBoms ?? {}, productId };
          });
          await tx.productVariant.createMany({ data: cleanVariants });
        }
      }
    });
    const product = await basePrisma.product.findUnique({
      where: { id: productId },
      include: { variants: true },
    });
    res.json(product);
  } catch (e) { next(e); }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    await basePrisma.product.delete({ where: { id: str(req.params.id) } });
    res.json({ message: '已删除' });
  } catch (e) { next(e); }
}

// ── 产品变体 ──
export async function listVariants(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await basePrisma.productVariant.findMany({ where: { productId: str(req.params.id) }, orderBy: { id: 'asc' } }));
  } catch (e) { next(e); }
}

export async function syncVariants(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = str(req.params.id);
    const variants: Array<Record<string, unknown>> = req.body.variants || [];

    await basePrisma.$transaction(async (tx) => {
      await tx.productVariant.deleteMany({ where: { productId } });
      if (variants.length > 0) {
        const cleanVariants = variants.map((v: any) => {
          const { createdAt, updatedAt, tenantId, product, nodeBOMs, ...fields } = v;
          if (!fields.id) fields.id = genId('pv');
          return { ...fields, nodeBoms: nodeBOMs ?? fields.nodeBoms ?? {}, productId };
        });
        await tx.productVariant.createMany({ data: cleanVariants });
      }
    });

    res.json(await basePrisma.productVariant.findMany({ where: { productId }, orderBy: { id: 'asc' } }));
  } catch (e) { next(e); }
}

// ── BOM ──
export async function listBoms(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const parentProductId = optStr(req.query.parentProductId);
    const where: Record<string, unknown> = {};
    if (parentProductId) where.parentProductId = parentProductId;
    res.json(await db.bom.findMany({ where, include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }));
  } catch (e) { next(e); }
}

export async function getBom(req: Request, res: Response, next: NextFunction) {
  try {
    const bom = await basePrisma.bom.findUnique({ where: { id: str(req.params.id) }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    if (!bom) { res.status(404).json({ error: 'BOM 不存在' }); return; }
    res.json(bom);
  } catch (e) { next(e); }
}

export async function createBom(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const { items, ...rest } = req.body;
    const data = sanitizeCreate(rest);
    if (!data.id) data.id = genId('bom');
    const cleanItems = items ? sanitizeItems(items, ['quantityInput']) : undefined;
    const bom = await basePrisma.bom.create({
      data: { ...data, tenantId, items: cleanItems ? { create: cleanItems } : undefined },
      include: { items: true },
    });
    res.status(201).json(bom);
  } catch (e) { next(e); }
}

export async function updateBom(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, ...rest } = req.body;
    const data = sanitizeUpdate(rest);
    const bomId = str(req.params.id);
    await basePrisma.$transaction(async (tx) => {
      await tx.bom.update({ where: { id: bomId }, data });
      if (items) {
        await tx.bomItem.deleteMany({ where: { bomId } });
        const cleanItems = sanitizeItems(items, ['quantityInput']).map(item => ({ ...item, bomId }));
        await tx.bomItem.createMany({ data: cleanItems });
      }
    });
    const bom = await basePrisma.bom.findUnique({ where: { id: bomId }, include: { items: true } });
    res.json(bom);
  } catch (e) { next(e); }
}

export async function deleteBom(req: Request, res: Response, next: NextFunction) {
  try {
    await basePrisma.bom.delete({ where: { id: str(req.params.id) } });
    res.json({ message: '已删除' });
  } catch (e) { next(e); }
}
