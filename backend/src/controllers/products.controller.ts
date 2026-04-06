import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as productsService from '../services/products.service.js';

export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await productsService.listProducts(db, {
      categoryId: optStr(req.query.categoryId), search: optStr(req.query.search),
    }));
  } catch (e) { next(e); }
}

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try { res.json(await productsService.getProduct(getTenantPrisma(req.tenantId!), str(req.params.id))); }
  catch (e) { next(e); }
}

export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await productsService.createProduct(getTenantPrisma(req.tenantId!), req.tenantId!, req.body)); }
  catch (e) { next(e); }
}

export async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try { res.json(await productsService.updateProduct(getTenantPrisma(req.tenantId!), req.tenantId!, str(req.params.id), req.body)); }
  catch (e) { next(e); }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try { res.json(await productsService.deleteProduct(getTenantPrisma(req.tenantId!), req.tenantId!, str(req.params.id))); }
  catch (e) { next(e); }
}

export async function listVariants(req: Request, res: Response, next: NextFunction) {
  try { res.json(await productsService.listVariants(getTenantPrisma(req.tenantId!), str(req.params.id))); }
  catch (e) { next(e); }
}

export async function syncVariants(req: Request, res: Response, next: NextFunction) {
  try { res.json(await productsService.syncVariants(getTenantPrisma(req.tenantId!), str(req.params.id), req.body.variants || [])); }
  catch (e) { next(e); }
}

export async function listBoms(req: Request, res: Response, next: NextFunction) {
  try { res.json(await productsService.listBoms(getTenantPrisma(req.tenantId!), { parentProductId: optStr(req.query.parentProductId) })); }
  catch (e) { next(e); }
}

export async function getBom(req: Request, res: Response, next: NextFunction) {
  try { res.json(await productsService.getBom(getTenantPrisma(req.tenantId!), str(req.params.id))); }
  catch (e) { next(e); }
}

export async function createBom(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await productsService.createBom(getTenantPrisma(req.tenantId!), req.body)); }
  catch (e) { next(e); }
}

export async function updateBom(req: Request, res: Response, next: NextFunction) {
  try { res.json(await productsService.updateBom(getTenantPrisma(req.tenantId!), str(req.params.id), req.body)); }
  catch (e) { next(e); }
}

export async function deleteBom(req: Request, res: Response, next: NextFunction) {
  try { res.json(await productsService.deleteBom(getTenantPrisma(req.tenantId!), str(req.params.id))); }
  catch (e) { next(e); }
}

export async function importProducts(req: Request, res: Response, next: NextFunction) {
  try { res.json(await productsService.importProducts(getTenantPrisma(req.tenantId!), req.tenantId!, req.body)); }
  catch (e) { next(e); }
}
