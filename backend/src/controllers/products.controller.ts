import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as productsService from '../services/products.service.js';
import { syncDevStyleFromPublishedProduct } from '../services/dev-published-sync.service.js';
import { getReceiveUnitWeightAverages } from '../services/receiveUnitWeightAverages.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listQueryFromRequest, warnListAllFromRequest } from '../utils/listQuery.js';

/** 仅改 enabled 开关时不回写开发款式 */
function isEnabledOnlyPatch(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const keys = Object.keys(body as Record<string, unknown>);
  return keys.length === 1 && keys[0] === 'enabled';
}

export const listProducts = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('products.listProducts', req);
  res.json(await productsService.listProducts(db, req.tenantId!, {
    categoryId: optStr(req.query.categoryId), search: optStr(req.query.search),
    all, page, pageSize,
    lite: req.query.lite === 'true',
  }));
});

export const getProduct = asyncHandler(async (req, res) => {
  res.json(await productsService.getProduct(getTenantPrisma(req.tenantId!), req.tenantId!, str(req.params.id)));
});

export const receiveUnitWeightAverages = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await getReceiveUnitWeightAverages(db, str(req.params.id)));
});

export const variantUsage = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const variantIds = String(req.query.variantIds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  res.json(await productsService.getVariantUsage(db, str(req.params.id), variantIds));
});

export const nextProductCode = asyncHandler(async (req, res) => {
  const prefix = String(req.query.prefix ?? '');
  const serialLength = Number(req.query.serialLength ?? '');
  res.json(await productsService.nextProductCode(req.tenantId!, prefix, serialLength));
});

export const getProductCodeRules = asyncHandler(async (req, res) => {
  res.json(await productsService.getProductCodeRules(req.tenantId!));
});

export const createProduct = asyncHandler(async (req, res) => {
  res.status(201).json(await productsService.createProduct(getTenantPrisma(req.tenantId!), req.tenantId!, req.body));
});

export const updateProduct = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const productId = str(req.params.id);
  const updated = await productsService.updateProduct(db, req.tenantId!, productId, req.body);
  if (!isEnabledOnlyPatch(req.body)) {
    await syncDevStyleFromPublishedProduct(db, productId);
  }
  res.json(updated);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  res.json(await productsService.deleteProduct(getTenantPrisma(req.tenantId!), req.tenantId!, str(req.params.id)));
});

export const listVariants = asyncHandler(async (req, res) => {
  res.json(await productsService.listVariants(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

export const syncVariants = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const productId = str(req.params.id);
  const result = await productsService.syncVariants(db, productId, req.body.variants || []);
  await syncDevStyleFromPublishedProduct(db, productId);
  res.json(result);
});

export const listBoms = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('products.listBoms', req);
  res.json(await productsService.listBoms(db, { parentProductId: optStr(req.query.parentProductId), all, page, pageSize }));
});

export const getBom = asyncHandler(async (req, res) => {
  res.json(await productsService.getBom(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

export const createBom = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const created = await productsService.createBom(db, req.body, req.tenantId!);
  const parentProductId = String(
    (created as { parentProductId?: string }).parentProductId
      ?? req.body?.parentProductId
      ?? '',
  ).trim();
  if (parentProductId) await syncDevStyleFromPublishedProduct(db, parentProductId);
  res.status(201).json(created);
});

export const updateBom = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const bomId = str(req.params.id);
  const updated = await productsService.updateBom(db, bomId, req.body);
  const parentProductId = String(
    (updated as { parentProductId?: string } | null)?.parentProductId
      ?? req.body?.parentProductId
      ?? '',
  ).trim();
  if (parentProductId) await syncDevStyleFromPublishedProduct(db, parentProductId);
  res.json(updated);
});

export const deleteBom = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const bomId = str(req.params.id);
  const existing = await db.bom.findUnique({
    where: { id: bomId },
    select: { parentProductId: true },
  });
  const result = await productsService.deleteBom(db, bomId);
  if (existing?.parentProductId) {
    await syncDevStyleFromPublishedProduct(db, existing.parentProductId);
  }
  res.json(result);
});

export const importProducts = asyncHandler(async (req, res) => {
  res.json(await productsService.importProducts(getTenantPrisma(req.tenantId!), req.tenantId!, req.body));
});
