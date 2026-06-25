import type { DictionaryItem } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';
import { sanitizeUpdate, sanitizeCreate } from '../utils/request.js';
import { getRedis, redisDel, redisGetJson, redisSetJson } from '../lib/redis.js';

function dictionaryCacheKey(tenantId: string): string {
  return `cache:masterData:dictionaries:${tenantId}`;
}

async function invalidateDictionaryCache(tenantId: string): Promise<void> {
  if (getRedis()) await redisDel(dictionaryCacheKey(tenantId));
}

// ── 合作单位 ──

async function assertPartnerNameUnique(
  db: TenantPrismaClient,
  name: string,
  excludeId?: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new AppError(400, '请填写单位名称');
  const conflict = await db.partner.findFirst({
    where: {
      name: { equals: trimmed, mode: 'insensitive' },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (conflict) throw new AppError(409, `单位名称「${trimmed}」已存在`);
}

export async function listPartners(
  db: TenantPrismaClient,
  opts: { categoryId?: string; search?: string; all?: boolean; page?: number; pageSize?: number },
) {
  const where: Record<string, unknown> = {};
  if (opts.categoryId) where.categoryId = opts.categoryId;
  if (opts.search) where.name = { contains: opts.search, mode: 'insensitive' };
  const include = { category: true };
  const orderBy: any = [{ createdAt: 'desc' }, { id: 'asc' }];

  if (opts.all) {
    return db.partner.findMany({ where, include, orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.partner.findMany({ where, include, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.partner.count({ where }),
  ]);
  return { data, total, page, pageSize };
}

export async function createPartner(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('partner');
  delete data.partnerListNo;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  await assertPartnerNameUnique(db, name);
  data.name = name;
  const maxRow = await db.partner.aggregate({ _max: { partnerListNo: true } });
  data.partnerListNo = (maxRow._max.partnerListNo ?? 0) + 1;
  return db.partner.create({ data });
}

export async function updatePartner(
  db: TenantPrismaClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
) {
  const existing = await db.partner.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, '合作单位不存在');

  const data = sanitizeUpdate(body);
  delete data.partnerListNo;

  const newName = typeof data.name === 'string' ? data.name.trim() : undefined;
  const oldName = existing.name;
  if (newName !== undefined) {
    if (!newName) throw new AppError(400, '请填写单位名称');
    const nameChanged = newName.toLowerCase() !== oldName.trim().toLowerCase();
    if (nameChanged) await assertPartnerNameUnique(db, newName, id);
    data.name = newName;
  }

  const renamed = newName !== undefined && newName !== oldName;

  if (!renamed) {
    return db.partner.update({ where: { id }, data });
  }

  /**
   * 改名级联：业务单据上的合作单位名称是写入时的快照字符串，改名后必须同步，
   * 否则外协管理 / 外协流水 / 进销存 / 财务等列表会新旧名称并存（按名称分组也会割裂）。
   *
   * - ProductionOpRecord.partner：外协派工/收回、委外返工等（无 partnerId，按旧名称匹配）
   * - PsiRecord.partner：采购/销售等单据（优先按 partnerId 关联，兼容旧数据按名称匹配）
   * - FinanceRecord.partner：应收应付/结算（按旧名称匹配）
   */
  return basePrisma.$transaction(async (tx) => {
    const updated = await tx.partner.update({
      where: { id },
      data: { ...data, name: newName },
    });
    await tx.productionOpRecord.updateMany({
      where: { tenantId, partner: oldName },
      data: { partner: newName },
    });
    await tx.psiRecord.updateMany({
      where: { tenantId, OR: [{ partnerId: id }, { partner: oldName }] },
      data: { partner: newName },
    });
    await tx.financeRecord.updateMany({
      where: { tenantId, partner: oldName },
      data: { partner: newName },
    });
    return updated;
  });
}

export async function deletePartner(db: TenantPrismaClient, id: string) {
  await db.partner.delete({ where: { id } });
  return { message: '已删除' };
}

export async function importPartners(
  db: TenantPrismaClient,
  body: {
    categoryId: string;
    partners: Array<Record<string, unknown>>;
  },
) {
  const { categoryId, partners: rows } = body;
  if (!categoryId) throw new AppError(400, '必须指定单位分类');
  if (!Array.isArray(rows) || rows.length === 0) throw new AppError(400, '导入数据不能为空');

  const category = await db.partnerCategory.findUnique({ where: { id: categoryId } });
  if (!category) throw new AppError(404, '合作单位分类不存在');

  const existingPartners = await db.partner.findMany({ select: { name: true } });
  const existingNames = new Set(existingPartners.map((p) => p.name.trim().toLowerCase()));

  const results: Array<{ row: number; success: boolean; name?: string; reason?: string }> = [];
  let successCount = 0;
  const batchNames = new Set<string>();

  const maxRow = await db.partner.aggregate({ _max: { partnerListNo: true } });
  let nextListNo = (maxRow._max.partnerListNo ?? 0) + 1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    try {
      const name = typeof row.name === 'string' ? row.name.trim() : String(row.name ?? '').trim();
      if (!name) {
        results.push({ row: rowNum, success: false, name, reason: '单位名称不能为空' });
        continue;
      }
      const nameKey = name.toLowerCase();
      if (batchNames.has(nameKey)) {
        results.push({ row: rowNum, success: false, name, reason: `单位名称 "${name}" 在文件中重复` });
        continue;
      }
      batchNames.add(nameKey);
      if (existingNames.has(nameKey)) {
        results.push({ row: rowNum, success: false, name, reason: `单位名称 "${name}" 已存在` });
        continue;
      }

      const rawCustom = row.customData;
      const customData =
        rawCustom && typeof rawCustom === 'object' && !Array.isArray(rawCustom)
          ? rawCustom as Record<string, unknown>
          : {};

      await db.partner.create({
        /**
         * tenantId 由 getTenantPrisma 的 create 扩展在运行时自动注入（Partner 属于 TENANT_MODELS），
         * 故此处类型上省略；customData 已是校验过的 JSON 对象。
         */
        data: {
          id: genId('partner'),
          name,
          categoryId,
          contact: null,
          customData: customData as Prisma.InputJsonValue,
          partnerListNo: nextListNo++,
        } as Prisma.PartnerUncheckedCreateInput,
      });

      existingNames.add(nameKey);
      successCount++;
      results.push({ row: rowNum, success: true, name });
    } catch (e: unknown) {
      const msg = e instanceof AppError ? e.message : (e instanceof Error ? e.message : '未知错误');
      results.push({
        row: rowNum,
        success: false,
        name: typeof row.name === 'string' ? row.name : String(row.name ?? ''),
        reason: msg,
      });
    }
  }

  return { success: successCount, failed: results.filter((r) => !r.success).length, results };
}

// ── 工人 ──

export async function listWorkers(
  db: TenantPrismaClient,
  opts: { status?: string; search?: string; all?: boolean; page?: number; pageSize?: number },
) {
  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (opts.search) where.name = { contains: opts.search, mode: 'insensitive' };
  const orderBy: any = [{ createdAt: 'desc' }, { id: 'asc' }];

  if (opts.all) {
    return db.worker.findMany({ where, orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.worker.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.worker.count({ where }),
  ]);
  return { data, total, page, pageSize };
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
  opts: { search?: string; all?: boolean; page?: number; pageSize?: number },
) {
  const where: Record<string, unknown> = {};
  if (opts.search) where.name = { contains: opts.search, mode: 'insensitive' };
  const orderBy: any = [{ createdAt: 'desc' }, { id: 'asc' }];

  if (opts.all) {
    return db.equipment.findMany({ where, orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.equipment.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.equipment.count({ where }),
  ]);
  return { data, total, page, pageSize };
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

export type DictionaryListResult = {
  colors: DictionaryItem[];
  sizes: DictionaryItem[];
  units: DictionaryItem[];
};

export async function listDictionaries(db: TenantPrismaClient, tenantId: string): Promise<DictionaryListResult> {
  if (getRedis()) {
    const hit = await redisGetJson<DictionaryListResult>(dictionaryCacheKey(tenantId));
    if (hit) return hit;
  }

  const items = await db.dictionaryItem.findMany({
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const out: DictionaryListResult = {
    colors: items.filter((i) => i.type === 'color'),
    sizes: items.filter((i) => i.type === 'size'),
    units: items.filter((i) => i.type === 'unit'),
  };
  if (getRedis()) {
    await redisSetJson(dictionaryCacheKey(tenantId), out, 60);
  }
  return out;
}

export async function createDictionaryItem(
  db: TenantPrismaClient,
  tenantId: string,
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
  const created = await db.dictionaryItem.create({ data: data as any });
  await invalidateDictionaryCache(tenantId);
  return created;
}

export async function updateDictionaryItem(
  db: TenantPrismaClient,
  tenantId: string,
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
  const updated = await db.dictionaryItem.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: nextName } : {}),
      ...(value !== undefined ? { value: nextValue } : {}),
    },
  });
  await invalidateDictionaryCache(tenantId);
  return updated;
}

const DICT_TYPE_LABEL: Record<string, string> = { color: '颜色', size: '尺码', unit: '单位' };

export async function deleteDictionaryItem(db: TenantPrismaClient, tenantId: string, id: string) {
  const existing = await db.dictionaryItem.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, '字典项不存在');

  // 字典项被业务数据按 id 引用（变体颜色/尺码、产品勾选、产品单位）；被引用时禁止删除，避免悬空 id 导致名称解析失效
  const blockers: string[] = [];
  if (existing.type === 'color' || existing.type === 'size') {
    const variantWhere = existing.type === 'color' ? { colorId: id } : { sizeId: id };
    const productJsonWhere = existing.type === 'color'
      ? { colorIds: { array_contains: id } }
      : { sizeIds: { array_contains: id } };
    const [productCount, variantCount, devVariantCount] = await Promise.all([
      db.product.count({ where: productJsonWhere }),
      db.productVariant.count({ where: variantWhere }),
      db.devStyleVariant.count({ where: variantWhere }),
    ]);
    if (productCount > 0) blockers.push(`${productCount} 个产品已勾选`);
    if (variantCount > 0) blockers.push(`${variantCount} 个产品规格在使用`);
    if (devVariantCount > 0) blockers.push(`${devVariantCount} 个开发款式规格在使用`);
  } else if (existing.type === 'unit') {
    const unitCount = await db.product.count({ where: { unitId: id } });
    if (unitCount > 0) blockers.push(`${unitCount} 个产品将其用作计量单位`);
  }
  if (blockers.length > 0) {
    const typeLabel = DICT_TYPE_LABEL[existing.type] ?? '字典项';
    throw new AppError(409, `无法删除${typeLabel}「${existing.name}」：${blockers.join('、')}。请先在相关产品中调整后再删除。`);
  }

  await db.dictionaryItem.delete({ where: { id } });
  await invalidateDictionaryCache(tenantId);
  return { message: '已删除' };
}
