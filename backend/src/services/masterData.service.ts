import type { TenantPrismaClient } from '../lib/prisma.js';
import { genId } from '../utils/genId.js';
import { sanitizeUpdate, sanitizeCreate } from '../utils/request.js';

// ── 合作单位 ──

export async function listPartners(
  db: TenantPrismaClient,
  opts: { categoryId?: string; search?: string },
) {
  const where: Record<string, unknown> = {};
  if (opts.categoryId) where.categoryId = opts.categoryId;
  if (opts.search) where.name = { contains: opts.search, mode: 'insensitive' };
  return db.partner.findMany({
    where,
    include: { category: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
}

export async function createPartner(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('partner');
  return db.partner.create({ data });
}

export async function updatePartner(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  return db.partner.update({ where: { id }, data: sanitizeUpdate(body) });
}

export async function deletePartner(db: TenantPrismaClient, id: string) {
  await db.partner.delete({ where: { id } });
  return { message: '已删除' };
}

// ── 工人 ──

export async function listWorkers(
  db: TenantPrismaClient,
  opts: { status?: string; search?: string },
) {
  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (opts.search) where.name = { contains: opts.search, mode: 'insensitive' };
  return db.worker.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
}

export async function createWorker(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('worker');
  return db.worker.create({ data });
}

export async function updateWorker(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  return db.worker.update({ where: { id }, data: sanitizeUpdate(body) });
}

export async function deleteWorker(db: TenantPrismaClient, id: string) {
  await db.worker.delete({ where: { id } });
  return { message: '已删除' };
}

// ── 设备 ──

export async function listEquipment(
  db: TenantPrismaClient,
  opts: { search?: string },
) {
  const where: Record<string, unknown> = {};
  if (opts.search) where.name = { contains: opts.search, mode: 'insensitive' };
  return db.equipment.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
}

export async function createEquipment(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('eq');
  return db.equipment.create({ data });
}

export async function updateEquipment(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  return db.equipment.update({ where: { id }, data: sanitizeUpdate(body) });
}

export async function deleteEquipment(db: TenantPrismaClient, id: string) {
  await db.equipment.delete({ where: { id } });
  return { message: '已删除' };
}

// ── 数据字典 ──

export async function listDictionaries(db: TenantPrismaClient) {
  const items = await db.dictionaryItem.findMany({
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return {
    colors: items.filter((i) => i.type === 'color'),
    sizes: items.filter((i) => i.type === 'size'),
    units: items.filter((i) => i.type === 'unit'),
  };
}

export async function createDictionaryItem(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('dict');
  const type = String(data.type ?? '');
  const maxRow = await db.dictionaryItem.aggregate({
    where: { type },
    _max: { sortOrder: true },
  });
  data.sortOrder = (maxRow._max.sortOrder ?? -1) + 1;
  return db.dictionaryItem.create({ data: data as any });
}

export async function updateDictionaryItem(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const existing = await db.dictionaryItem.findFirst({ where: { id } });
  if (!existing) return null;

  const raw = sanitizeUpdate(body);
  const nameIn = raw.name;
  const valueIn = raw.value;
  const name = typeof nameIn === 'string' ? nameIn.trim() : undefined;
  const value = typeof valueIn === 'string' ? valueIn.trim() : undefined;
  if (name !== undefined && !name) return { _validationError: '名称不能为空' };

  const nextName = name ?? existing.name;
  const dup = await db.dictionaryItem.findFirst({
    where: { type: existing.type, name: nextName, NOT: { id } },
  });
  if (dup) return { _validationError: `该类型下已存在「${nextName}」` };

  const nextValue = value !== undefined ? value : existing.value;
  return db.dictionaryItem.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: nextName } : {}),
      ...(value !== undefined ? { value: nextValue } : {}),
    },
  });
}

export async function deleteDictionaryItem(db: TenantPrismaClient, id: string) {
  await db.dictionaryItem.delete({ where: { id } });
  return { message: '已删除' };
}
