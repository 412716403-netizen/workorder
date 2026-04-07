import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as productsService from '../services/products.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const listProducts = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await productsService.listProducts(db, {
    categoryId: optStr(req.query.categoryId), search: optStr(req.query.search),
  }));
});

export const getProduct = asyncHandler(async (req, res) => {
  res.json(await productsService.getProduct(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

export const createProduct = asyncHandler(async (req, res) => {
  res.status(201).json(await productsService.createProduct(getTenantPrisma(req.tenantId!), req.tenantId!, req.body));
});

export const updateProduct = asyncHandler(async (req, res) => {
  res.json(await productsService.updateProduct(getTenantPrisma(req.tenantId!), req.tenantId!, str(req.params.id), req.body));
});

export const deleteProduct = asyncHandler(async (req, res) => {
  res.json(await productsService.deleteProduct(getTenantPrisma(req.tenantId!), req.tenantId!, str(req.params.id)));
});

export const listVariants = asyncHandler(async (req, res) => {
  res.json(await productsService.listVariants(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

export const syncVariants = asyncHandler(async (req, res) => {
  res.json(await productsService.syncVariants(getTenantPrisma(req.tenantId!), str(req.params.id), req.body.variants || []));
});

export const listBoms = asyncHandler(async (req, res) => {
  res.json(await productsService.listBoms(getTenantPrisma(req.tenantId!), { parentProductId: optStr(req.query.parentProductId) }));
});

export const getBom = asyncHandler(async (req, res) => {
  res.json(await productsService.getBom(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

export const createBom = asyncHandler(async (req, res) => {
  res.status(201).json(await productsService.createBom(getTenantPrisma(req.tenantId!), req.body));
});

export const updateBom = asyncHandler(async (req, res) => {
  res.json(await productsService.updateBom(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});

export const deleteBom = asyncHandler(async (req, res) => {
  res.json(await productsService.deleteBom(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

export const importProducts = asyncHandler(async (req, res) => {
  res.json(await productsService.importProducts(getTenantPrisma(req.tenantId!), req.tenantId!, req.body));
});
