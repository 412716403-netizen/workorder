import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma, prisma as basePrisma } from '../lib/prisma.js';
import { str, optStr, sanitizeUpdate, sanitizeCreate } from '../utils/request.js';

function genId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

// ── 合作单位 ──
export async function listPartners(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const categoryId = optStr(req.query.categoryId);
    const search = optStr(req.query.search);
    const where: Record<string, unknown> = {};
    if (categoryId) where.categoryId = categoryId;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    res.json(await db.partner.findMany({ where, include: { category: true }, orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
}
export async function createPartner(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = sanitizeCreate(req.body);
    if (!data.id) data.id = genId('partner');
    res.status(201).json(await db.partner.create({ data }));
  } catch (e) { next(e); }
}
export async function updatePartner(req: Request, res: Response, next: NextFunction) {
  try { res.json(await basePrisma.partner.update({ where: { id: str(req.params.id) }, data: sanitizeUpdate(req.body) })); } catch (e) { next(e); }
}
export async function deletePartner(req: Request, res: Response, next: NextFunction) {
  try { await basePrisma.partner.delete({ where: { id: str(req.params.id) } }); res.json({ message: '已删除' }); } catch (e) { next(e); }
}

// ── 工人 ──
export async function listWorkers(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const status = optStr(req.query.status);
    const search = optStr(req.query.search);
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    res.json(await db.worker.findMany({ where, orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
}
export async function createWorker(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = sanitizeCreate(req.body);
    if (!data.id) data.id = genId('worker');
    res.status(201).json(await db.worker.create({ data }));
  } catch (e) { next(e); }
}
export async function updateWorker(req: Request, res: Response, next: NextFunction) {
  try { res.json(await basePrisma.worker.update({ where: { id: str(req.params.id) }, data: sanitizeUpdate(req.body) })); } catch (e) { next(e); }
}
export async function deleteWorker(req: Request, res: Response, next: NextFunction) {
  try { await basePrisma.worker.delete({ where: { id: str(req.params.id) } }); res.json({ message: '已删除' }); } catch (e) { next(e); }
}

// ── 设备 ──
export async function listEquipment(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const search = optStr(req.query.search);
    const where: Record<string, unknown> = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    res.json(await db.equipment.findMany({ where, orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
}
export async function createEquipment(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = sanitizeCreate(req.body);
    if (!data.id) data.id = genId('eq');
    res.status(201).json(await db.equipment.create({ data }));
  } catch (e) { next(e); }
}
export async function updateEquipment(req: Request, res: Response, next: NextFunction) {
  try { res.json(await basePrisma.equipment.update({ where: { id: str(req.params.id) }, data: sanitizeUpdate(req.body) })); } catch (e) { next(e); }
}
export async function deleteEquipment(req: Request, res: Response, next: NextFunction) {
  try { await basePrisma.equipment.delete({ where: { id: str(req.params.id) } }); res.json({ message: '已删除' }); } catch (e) { next(e); }
}

// ── 数据字典 ──
export async function listDictionaries(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    // sortOrder 相同时按创建时间，保证按添加先后稳定排序
    const items = await db.dictionaryItem.findMany({
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const grouped = {
      colors: items.filter(i => i.type === 'color'),
      sizes: items.filter(i => i.type === 'size'),
      units: items.filter(i => i.type === 'unit'),
    };
    res.json(grouped);
  } catch (e) { next(e); }
}
export async function createDictionaryItem(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = sanitizeCreate(req.body);
    if (!data.id) data.id = genId('dict');
    const type = String(data.type ?? '');
    const maxRow = await db.dictionaryItem.aggregate({
      where: { type },
      _max: { sortOrder: true },
    });
    data.sortOrder = (maxRow._max.sortOrder ?? -1) + 1;
    res.status(201).json(await db.dictionaryItem.create({ data: data as any }));
  } catch (e) { next(e); }
}
export async function deleteDictionaryItem(req: Request, res: Response, next: NextFunction) {
  try { await basePrisma.dictionaryItem.delete({ where: { id: str(req.params.id) } }); res.json({ message: '已删除' }); } catch (e) { next(e); }
}
