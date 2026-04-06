import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as masterDataService from '../services/masterData.service.js';

// ── 合作单位 ──
export async function listPartners(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await masterDataService.listPartners(db, { categoryId: optStr(req.query.categoryId), search: optStr(req.query.search) }));
  } catch (e) { next(e); }
}
export async function createPartner(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await masterDataService.createPartner(getTenantPrisma(req.tenantId!), req.body)); }
  catch (e) { next(e); }
}
export async function updatePartner(req: Request, res: Response, next: NextFunction) {
  try { res.json(await masterDataService.updatePartner(getTenantPrisma(req.tenantId!), str(req.params.id), req.body)); }
  catch (e) { next(e); }
}
export async function deletePartner(req: Request, res: Response, next: NextFunction) {
  try { res.json(await masterDataService.deletePartner(getTenantPrisma(req.tenantId!), str(req.params.id))); }
  catch (e) { next(e); }
}

// ── 工人 ──
export async function listWorkers(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await masterDataService.listWorkers(db, { status: optStr(req.query.status), search: optStr(req.query.search) }));
  } catch (e) { next(e); }
}
export async function createWorker(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await masterDataService.createWorker(getTenantPrisma(req.tenantId!), req.body)); }
  catch (e) { next(e); }
}
export async function updateWorker(req: Request, res: Response, next: NextFunction) {
  try { res.json(await masterDataService.updateWorker(getTenantPrisma(req.tenantId!), str(req.params.id), req.body)); }
  catch (e) { next(e); }
}
export async function deleteWorker(req: Request, res: Response, next: NextFunction) {
  try { res.json(await masterDataService.deleteWorker(getTenantPrisma(req.tenantId!), str(req.params.id))); }
  catch (e) { next(e); }
}

// ── 设备 ──
export async function listEquipment(req: Request, res: Response, next: NextFunction) {
  try { res.json(await masterDataService.listEquipment(getTenantPrisma(req.tenantId!), { search: optStr(req.query.search) })); }
  catch (e) { next(e); }
}
export async function createEquipment(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await masterDataService.createEquipment(getTenantPrisma(req.tenantId!), req.body)); }
  catch (e) { next(e); }
}
export async function updateEquipment(req: Request, res: Response, next: NextFunction) {
  try { res.json(await masterDataService.updateEquipment(getTenantPrisma(req.tenantId!), str(req.params.id), req.body)); }
  catch (e) { next(e); }
}
export async function deleteEquipment(req: Request, res: Response, next: NextFunction) {
  try { res.json(await masterDataService.deleteEquipment(getTenantPrisma(req.tenantId!), str(req.params.id))); }
  catch (e) { next(e); }
}

// ── 数据字典 ──
export async function listDictionaries(req: Request, res: Response, next: NextFunction) {
  try { res.json(await masterDataService.listDictionaries(getTenantPrisma(req.tenantId!))); }
  catch (e) { next(e); }
}
export async function createDictionaryItem(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await masterDataService.createDictionaryItem(getTenantPrisma(req.tenantId!), req.body)); }
  catch (e) { next(e); }
}
export async function updateDictionaryItem(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await masterDataService.updateDictionaryItem(getTenantPrisma(req.tenantId!), str(req.params.id), req.body);
    if (!result) { res.status(404).json({ error: '记录不存在' }); return; }
    if ('_validationError' in result) { res.status(400).json({ error: result._validationError }); return; }
    res.json(result);
  } catch (e) { next(e); }
}
export async function deleteDictionaryItem(req: Request, res: Response, next: NextFunction) {
  try { res.json(await masterDataService.deleteDictionaryItem(getTenantPrisma(req.tenantId!), str(req.params.id))); }
  catch (e) { next(e); }
}
