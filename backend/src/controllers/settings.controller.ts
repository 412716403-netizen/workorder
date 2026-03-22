import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma, prisma as basePrisma } from '../lib/prisma.js';
import { str, sanitizeUpdate, sanitizeCreate } from '../utils/request.js';

function genId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

// ── 产品分类 ──
export async function listCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(
      await db.productCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    );
  } catch (e) { next(e); }
}
export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = sanitizeCreate(req.body);
    if (!data.id) data.id = genId('cat');
    const maxRow = await db.productCategory.aggregate({ _max: { sortOrder: true } });
    const nextOrder = (maxRow._max.sortOrder ?? -1) + 1;
    data.sortOrder = nextOrder;
    res.status(201).json(await db.productCategory.create({ data: data as any }));
  } catch (e) { next(e); }
}
export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const data = sanitizeUpdate(req.body);
    delete data.sortOrder;
    res.json(await basePrisma.productCategory.update({ where: { id: str(req.params.id) }, data }));
  } catch (e) { next(e); }
}
export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try { await basePrisma.productCategory.delete({ where: { id: str(req.params.id) } }); res.json({ message: '已删除' }); } catch (e) { next(e); }
}

// ── 合作单位分类 ──
export async function listPartnerCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await db.partnerCategory.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }));
  } catch (e) { next(e); }
}
export async function createPartnerCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = sanitizeCreate(req.body);
    if (!data.id) data.id = genId('pcat');
    res.status(201).json(await db.partnerCategory.create({ data }));
  } catch (e) { next(e); }
}
export async function updatePartnerCategory(req: Request, res: Response, next: NextFunction) {
  try { res.json(await basePrisma.partnerCategory.update({ where: { id: str(req.params.id) }, data: sanitizeUpdate(req.body) })); } catch (e) { next(e); }
}
export async function deletePartnerCategory(req: Request, res: Response, next: NextFunction) {
  try { await basePrisma.partnerCategory.delete({ where: { id: str(req.params.id) } }); res.json({ message: '已删除' }); } catch (e) { next(e); }
}

// ── 工序节点 ──
function normalizeNodeData(raw: Record<string, unknown>) {
  const data = { ...raw };
  if ('hasBOM' in data) { data.hasBom = data.hasBOM; delete data.hasBOM; }
  delete data.enableAssignment;
  return data;
}

export async function listNodes(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const rows = await db.globalNodeTemplate.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(rows.map(r => {
      const { hasBom, ...rest } = r as Record<string, unknown>;
      return { ...rest, hasBOM: hasBom };
    }));
  } catch (e) { next(e); }
}
export async function createNode(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = sanitizeCreate(normalizeNodeData(req.body) as Record<string, unknown>);
    if (!data.id) data.id = genId('node');
    const maxRow = await db.globalNodeTemplate.aggregate({ _max: { sortOrder: true } });
    data.sortOrder = (maxRow._max.sortOrder ?? -1) + 1;
    res.status(201).json(await db.globalNodeTemplate.create({ data: data as any }));
  } catch (e) { next(e); }
}
export async function updateNode(req: Request, res: Response, next: NextFunction) {
  try {
    const data = sanitizeUpdate(normalizeNodeData(req.body) as Record<string, unknown>);
    delete data.sortOrder;
    res.json(await basePrisma.globalNodeTemplate.update({ where: { id: str(req.params.id) }, data: data as any }));
  } catch (e) { next(e); }
}
export async function deleteNode(req: Request, res: Response, next: NextFunction) {
  try { await basePrisma.globalNodeTemplate.delete({ where: { id: str(req.params.id) } }); res.json({ message: '已删除' }); } catch (e) { next(e); }
}

// ── 仓库 ──
export async function listWarehouses(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await db.warehouse.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }));
  } catch (e) { next(e); }
}
export async function createWarehouse(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = sanitizeCreate(req.body);
    if (!data.id) data.id = genId('wh');
    res.status(201).json(await db.warehouse.create({ data }));
  } catch (e) { next(e); }
}
export async function updateWarehouse(req: Request, res: Response, next: NextFunction) {
  try { res.json(await basePrisma.warehouse.update({ where: { id: str(req.params.id) }, data: sanitizeUpdate(req.body) })); } catch (e) { next(e); }
}
export async function deleteWarehouse(req: Request, res: Response, next: NextFunction) {
  try { await basePrisma.warehouse.delete({ where: { id: str(req.params.id) } }); res.json({ message: '已删除' }); } catch (e) { next(e); }
}

// ── 收付款类型 ──
export async function listFinanceCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await db.financeCategory.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }));
  } catch (e) { next(e); }
}
export async function createFinanceCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = sanitizeCreate(req.body);
    if (!data.id) data.id = genId('fcat');
    res.status(201).json(await db.financeCategory.create({ data }));
  } catch (e) { next(e); }
}
export async function updateFinanceCategory(req: Request, res: Response, next: NextFunction) {
  try { res.json(await basePrisma.financeCategory.update({ where: { id: str(req.params.id) }, data: sanitizeUpdate(req.body) })); } catch (e) { next(e); }
}
export async function deleteFinanceCategory(req: Request, res: Response, next: NextFunction) {
  try { await basePrisma.financeCategory.delete({ where: { id: str(req.params.id) } }); res.json({ message: '已删除' }); } catch (e) { next(e); }
}

// ── 收支账户类型 ──
export async function listFinanceAccountTypes(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await db.financeAccountType.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }));
  } catch (e) { next(e); }
}
export async function createFinanceAccountType(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = sanitizeCreate(req.body);
    if (!data.id) data.id = genId('fatype');
    res.status(201).json(await db.financeAccountType.create({ data }));
  } catch (e) { next(e); }
}
export async function updateFinanceAccountType(req: Request, res: Response, next: NextFunction) {
  try { res.json(await basePrisma.financeAccountType.update({ where: { id: str(req.params.id) }, data: sanitizeUpdate(req.body) })); } catch (e) { next(e); }
}
export async function deleteFinanceAccountType(req: Request, res: Response, next: NextFunction) {
  try { await basePrisma.financeAccountType.delete({ where: { id: str(req.params.id) } }); res.json({ message: '已删除' }); } catch (e) { next(e); }
}

// ── 系统配置 ──
export async function getConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const settings = await basePrisma.systemSetting.findMany({ where: { tenantId } });
    const config: Record<string, unknown> = {};
    for (const s of settings) config[s.key] = s.value;
    res.json(config);
  } catch (e) { next(e); }
}

export async function updateConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const key = str(req.params.key);
    const { value } = req.body;
    const setting = await basePrisma.systemSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: { value },
      create: { tenantId, key, value },
    });
    res.json(setting);
  } catch (e) { next(e); }
}
