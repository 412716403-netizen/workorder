import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../lib/prisma.js';
import { str } from '../utils/request.js';
import * as settingsService from '../services/settings.service.js';

// ── 产品分类 ──
export async function listCategories(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.listCategories(getTenantPrisma(req.tenantId!))); } catch (e) { next(e); }
}
export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await settingsService.createCategory(getTenantPrisma(req.tenantId!), req.body)); } catch (e) { next(e); }
}
export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.updateCategory(getTenantPrisma(req.tenantId!), str(req.params.id), req.body)); } catch (e) { next(e); }
}
export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.deleteCategory(getTenantPrisma(req.tenantId!), str(req.params.id))); } catch (e) { next(e); }
}

// ── 合作单位分类 ──
export async function listPartnerCategories(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.listPartnerCategories(getTenantPrisma(req.tenantId!))); } catch (e) { next(e); }
}
export async function createPartnerCategory(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await settingsService.createPartnerCategory(getTenantPrisma(req.tenantId!), req.body)); } catch (e) { next(e); }
}
export async function updatePartnerCategory(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.updatePartnerCategory(getTenantPrisma(req.tenantId!), str(req.params.id), req.body)); } catch (e) { next(e); }
}
export async function deletePartnerCategory(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.deletePartnerCategory(getTenantPrisma(req.tenantId!), str(req.params.id))); } catch (e) { next(e); }
}

// ── 工序节点 ──
export async function listNodes(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.listNodes(getTenantPrisma(req.tenantId!))); } catch (e) { next(e); }
}
export async function createNode(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await settingsService.createNode(getTenantPrisma(req.tenantId!), req.body)); } catch (e) { next(e); }
}
export async function updateNode(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.updateNode(getTenantPrisma(req.tenantId!), str(req.params.id), req.body)); } catch (e) { next(e); }
}
export async function deleteNode(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.deleteNode(getTenantPrisma(req.tenantId!), str(req.params.id))); } catch (e) { next(e); }
}

// ── 仓库 ──
export async function listWarehouses(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.listWarehouses(getTenantPrisma(req.tenantId!))); } catch (e) { next(e); }
}
export async function createWarehouse(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await settingsService.createWarehouse(getTenantPrisma(req.tenantId!), req.body)); } catch (e) { next(e); }
}
export async function updateWarehouse(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.updateWarehouse(getTenantPrisma(req.tenantId!), str(req.params.id), req.body)); } catch (e) { next(e); }
}
export async function deleteWarehouse(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.deleteWarehouse(getTenantPrisma(req.tenantId!), str(req.params.id))); } catch (e) { next(e); }
}

// ── 收付款类型 ──
export async function listFinanceCategories(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.listFinanceCategories(getTenantPrisma(req.tenantId!))); } catch (e) { next(e); }
}
export async function createFinanceCategory(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await settingsService.createFinanceCategory(getTenantPrisma(req.tenantId!), req.body)); } catch (e) { next(e); }
}
export async function updateFinanceCategory(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.updateFinanceCategory(getTenantPrisma(req.tenantId!), str(req.params.id), req.body)); } catch (e) { next(e); }
}
export async function deleteFinanceCategory(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.deleteFinanceCategory(getTenantPrisma(req.tenantId!), str(req.params.id))); } catch (e) { next(e); }
}

// ── 收支账户类型 ──
export async function listFinanceAccountTypes(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.listFinanceAccountTypes(getTenantPrisma(req.tenantId!))); } catch (e) { next(e); }
}
export async function createFinanceAccountType(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await settingsService.createFinanceAccountType(getTenantPrisma(req.tenantId!), req.body)); } catch (e) { next(e); }
}
export async function updateFinanceAccountType(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.updateFinanceAccountType(getTenantPrisma(req.tenantId!), str(req.params.id), req.body)); } catch (e) { next(e); }
}
export async function deleteFinanceAccountType(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.deleteFinanceAccountType(getTenantPrisma(req.tenantId!), str(req.params.id))); } catch (e) { next(e); }
}

// ── 系统配置 ──
export async function getConfig(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.getConfig(req.tenantId!)); } catch (e) { next(e); }
}
export async function updateConfig(req: Request, res: Response, next: NextFunction) {
  try { res.json(await settingsService.updateConfig(req.tenantId!, str(req.params.key), req.body.value)); } catch (e) { next(e); }
}
