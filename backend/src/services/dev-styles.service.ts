import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';
import { sanitizeCreate, sanitizeItems, sanitizeUpdate } from '../utils/request.js';
import { DevStageStatus, DevStyleStatus } from '../../../shared/types.js';
import { devStyleInclude, mapDevStyleRow } from './dev-styles.mapper.js';
import { publishDevStyleToProduct } from './dev-publish.service.js';

const STYLE_JSON_FIELDS = [
  'categoryCustomData', 'colorIds', 'sizeIds', 'milestoneNodeIds', 'defaultStageNames',
] as const;

function coerceStyleJson(data: Record<string, unknown>): void {
  for (const key of STYLE_JSON_FIELDS) {
    if (!(key in data)) continue;
    const v = data[key];
    if (typeof v === 'string') {
      try { data[key] = JSON.parse(v); } catch { /* keep */ }
    }
  }
}

/** 把任意来源（含 Prisma Json 字段）归一化为去空白、非空的工序名数组。 */
function normalizeStageNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x).trim()).filter(Boolean);
}

async function assertCategory(db: TenantPrismaClient, categoryId: unknown): Promise<string | undefined> {
  if (categoryId === undefined || categoryId === null || categoryId === '') return undefined;
  const id = String(categoryId).trim();
  if (!id) return undefined;
  const cat = await db.productCategory.findFirst({ where: { id } });
  if (!cat) throw new AppError(400, '产品分类不存在');
  return id;
}

/**
 * 校验并归一化样品绑定的颜色尺码：
 * - 款式有 variants（启用颜色尺码）时必填，且 colorId/sizeId 组合须命中某条 variant；
 * - 款式无 variants 时强制置空（不区分颜色尺码）。
 */
export function resolveSampleColorSize(
  variants: Array<{ colorId: unknown; sizeId: unknown }>,
  colorId: unknown,
  sizeId: unknown,
): { colorId: string | null; sizeId: string | null } {
  if (!variants.length) {
    return { colorId: null, sizeId: null };
  }
  const cid = colorId == null ? '' : String(colorId).trim();
  const sid = sizeId == null ? '' : String(sizeId).trim();
  if (!cid && !sid) {
    throw new AppError(400, '该款式已配置颜色尺码，请选择样品对应的颜色尺码');
  }
  const matched = variants.some(
    (v) => String(v.colorId ?? '') === cid && String(v.sizeId ?? '') === sid,
  );
  if (!matched) {
    throw new AppError(400, '所选颜色尺码不属于该款式');
  }
  return { colorId: cid || null, sizeId: sid || null };
}

async function appendDevLog(
  db: TenantPrismaClient,
  sampleId: string,
  user: string,
  action: string,
  detail: string,
) {
  await db.devLog.create({
    data: { id: genId('dlog'), sampleId, user, action, detail },
  });
}

export async function listDevStyles(
  db: TenantPrismaClient,
  opts: { categoryId?: string; search?: string; status?: string },
) {
  const where: Record<string, unknown> = {};
  if (opts.categoryId) where.categoryId = opts.categoryId;
  if (opts.status) where.status = opts.status;
  if (opts.search?.trim()) {
    const q = opts.search.trim();
    where.OR = [
      { code: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { customerName: { contains: q, mode: 'insensitive' } },
    ];
  }
  const rows = await db.devStyle.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
    include: devStyleInclude,
  });
  return rows.map(mapDevStyleRow);
}

export async function getDevStyle(db: TenantPrismaClient, id: string) {
  const row = await db.devStyle.findUnique({ where: { id }, include: devStyleInclude });
  if (!row) throw new AppError(404, '款式不存在');
  return mapDevStyleRow(row);
}

async function assertNoProductCatalogConflict(
  db: TenantPrismaClient,
  code: string,
  name: string,
  excludeProductId?: string,
): Promise<void> {
  const sku = code.trim();
  const productName = name.trim();
  const idFilter = excludeProductId ? { id: { not: excludeProductId } } : {};
  const dupSku = await db.product.findFirst({ where: { sku, ...idFilter } });
  if (dupSku) throw new AppError(409, '产品编号在租户内已存在，请更换');
  const dupName = await db.product.findFirst({ where: { name: productName, ...idFilter } });
  if (dupName) throw new AppError(409, '产品名称在租户内已存在，请更换');
}

async function syncDevStyleCustomerNameFromSupplier(
  db: TenantPrismaClient,
  data: Record<string, unknown>,
): Promise<void> {
  if (!Object.prototype.hasOwnProperty.call(data, 'supplierId')) return;
  const sid = data.supplierId == null ? '' : String(data.supplierId).trim();
  if (!sid) {
    data.customerName = null;
    return;
  }
  const partner = await db.partner.findFirst({
    where: { id: sid },
    select: { name: true },
  });
  data.customerName = partner?.name?.trim() || null;
}

export async function createDevStyle(
  db: TenantPrismaClient,
  tenantId: string,
  body: Record<string, unknown>,
) {
  const { variants, samples, templateStageNames, ...rest } = body;
  const data = sanitizeCreate(rest);
  if (!data.id) data.id = genId('dstyle');
  const code = String(data.code ?? '').trim();
  const name = String(data.name ?? '').trim();
  if (!code) throw new AppError(400, '款号不能为空');
  if (!name) throw new AppError(400, '品名不能为空');
  data.code = code;
  data.name = name;
  data.categoryId = await assertCategory(db, data.categoryId);
  coerceStyleJson(data);
  if (!data.status) data.status = DevStyleStatus.DEVELOPING;

  const dup = await db.devStyle.findFirst({ where: { code } });
  if (dup) throw new AppError(409, '款号已存在');

  await assertNoProductCatalogConflict(db, code, name);
  await syncDevStyleCustomerNameFromSupplier(db, data);

  const cleanVariants = Array.isArray(variants)
    ? (variants as Record<string, unknown>[]).map((v) => ({
        id: String(v.id ?? genId('dvar')),
        colorId: v.colorId ?? null,
        sizeId: v.sizeId ?? null,
        skuSuffix: v.skuSuffix ?? null,
        nodeBoms: v.nodeBoms ?? v.nodeBOMs ?? {},
      }))
    : [];

  // 该款式的默认开发流程节点（创建时配置）。不再自动创建头样，
  // 头样与后续样品统一在「样品开发」区点「+」经 addDevSample 创建，并带出这套默认节点。
  // 优先用显式传入的 templateStageNames；未传时保留 body 自带的 defaultStageNames（兼容非 UI 调用方），都没有则为空。
  if (templateStageNames !== undefined) {
    data.defaultStageNames = normalizeStageNames(templateStageNames);
  } else {
    data.defaultStageNames = normalizeStageNames(data.defaultStageNames);
  }

  await db.devStyle.create({
    data: {
      ...data,
      tenantId,
      variants: cleanVariants.length ? { create: cleanVariants } : undefined,
    },
  });

  return getDevStyle(db, data.id as string);
}

export async function updateDevStyle(
  db: TenantPrismaClient,
  styleId: string,
  body: Record<string, unknown>,
) {
  const existing = await db.devStyle.findUnique({ where: { id: styleId } });
  if (!existing) throw new AppError(404, '款式不存在');
  if (existing.status === DevStyleStatus.PUBLISHED) {
    throw new AppError(409, '已发布大货的款式不可编辑，请在产品档案中维护');
  }

  const { variants, samples, ...rest } = body;
  const data = sanitizeUpdate(rest);
  // 状态机：常规编辑只允许在 开发中 / 已归档 间切换；
  // 发布（published）必须走 publishDevStyleToProduct，避免出现无产品档案的“已发布”脏数据。
  if ('status' in data) {
    const nextStatus = data.status;
    if (nextStatus === DevStyleStatus.PUBLISHED) {
      throw new AppError(400, '请通过「生成大货」发布，不能直接将款式标记为已发布');
    }
    if (nextStatus !== DevStyleStatus.DEVELOPING && nextStatus !== DevStyleStatus.ARCHIVED) {
      throw new AppError(400, '非法的款式状态');
    }
  }
  if ('code' in data) {
    const code = String(data.code ?? '').trim();
    if (!code) throw new AppError(400, '款号不能为空');
    const dup = await db.devStyle.findFirst({ where: { code, id: { not: styleId } } });
    if (dup) throw new AppError(409, '款号已存在');
    data.code = code;
  }
  if ('name' in data) {
    const name = String(data.name ?? '').trim();
    if (!name) throw new AppError(400, '品名不能为空');
    data.name = name;
  }
  const nextCode = ('code' in data ? String(data.code ?? '').trim() : existing.code) || existing.code;
  const nextName = ('name' in data ? String(data.name ?? '').trim() : existing.name) || existing.name;
  if ('code' in data || 'name' in data) {
    await assertNoProductCatalogConflict(db, nextCode, nextName, existing.publishedProductId ?? undefined);
  }
  if ('categoryId' in data) data.categoryId = await assertCategory(db, data.categoryId);
  coerceStyleJson(data);
  await syncDevStyleCustomerNameFromSupplier(db, data);

  await db.$transaction(async (tx) => {
    await tx.devStyle.update({ where: { id: styleId }, data });
    if (Array.isArray(variants)) {
      await tx.devStyleVariant.deleteMany({ where: { styleId } });
      if (variants.length > 0) {
        await tx.devStyleVariant.createMany({
          data: (variants as Record<string, unknown>[]).map((v) => ({
            id: String(v.id ?? genId('dvar')),
            styleId,
            colorId: (v.colorId as string) ?? null,
            sizeId: (v.sizeId as string) ?? null,
            skuSuffix: (v.skuSuffix as string) ?? null,
            nodeBoms: v.nodeBoms ?? v.nodeBOMs ?? {},
          })),
        });
      }
    }
  });

  return getDevStyle(db, styleId);
}

export async function deleteDevStyle(db: TenantPrismaClient, styleId: string) {
  const style = await db.devStyle.findUnique({
    where: { id: styleId },
    include: { samples: { include: { stages: true } } },
  });
  if (!style) throw new AppError(404, '款式不存在');
  if (style.status === DevStyleStatus.PUBLISHED) {
    throw new AppError(409, '已发布大货的款式不可删除');
  }
  const hasProgress = style.samples.some((s) =>
    s.stages.some((st) => st.status !== DevStageStatus.PENDING),
  );
  if (hasProgress) {
    throw new AppError(409, '存在已开始的开发节点，无法删除款式');
  }
  await db.devStyle.delete({ where: { id: styleId } });
  return { message: '已删除' };
}

export async function addDevSample(
  db: TenantPrismaClient,
  styleId: string,
  body: { name?: string; stageNames?: string[]; colorId?: string; sizeId?: string },
) {
  const style = await db.devStyle.findUnique({
    where: { id: styleId },
    include: { variants: { select: { colorId: true, sizeId: true } } },
  });
  if (!style) throw new AppError(404, '款式不存在');
  const sampleColorSize = resolveSampleColorSize(style.variants, body.colorId, body.sizeId);
  let names = body.stageNames?.length
    ? body.stageNames.map((n) => n.trim()).filter(Boolean)
    : [];
  if (names.length === 0) {
    // 与前端 DevAddSampleModal 一致：优先款式的默认开发流程，其次头样节点，最后兜底。
    names = normalizeStageNames(style.defaultStageNames);
  }
  if (names.length === 0) {
    const firstSample = await db.devSample.findFirst({
      where: { styleId },
      orderBy: { createdAt: 'asc' },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    names = firstSample?.stages.map((s) => s.name).filter(Boolean) ?? [];
  }
  if (names.length === 0) {
    names = ['设计', '打样', '评审'];
  }
  const sampleId = genId('dsmp');
  await db.devSample.create({
    data: {
      id: sampleId,
      styleId,
      name: body.name?.trim() || `样品 ${Date.now() % 1000}`,
      colorId: sampleColorSize.colorId,
      sizeId: sampleColorSize.sizeId,
      stages: {
        create: names.map((n, i) => ({
          id: genId('dstg'),
          name: n,
          order: i,
          status: i === 0 ? DevStageStatus.IN_PROGRESS : DevStageStatus.PENDING,
        })),
      },
    },
  });
  return getDevStyle(db, styleId);
}

export async function deleteDevSample(db: TenantPrismaClient, sampleId: string) {
  const sample = await db.devSample.findUnique({
    where: { id: sampleId },
    include: {
      stages: { include: { fields: true, attachments: true }, orderBy: { order: 'asc' } },
      style: true,
    },
  });
  if (!sample) throw new AppError(404, '样品轮次不存在');
  if (sample.style.status === DevStyleStatus.PUBLISHED) {
    throw new AppError(409, '已发布大货的款式不可修改样品');
  }
  // 可删：全部待开始；或仅第一个节点「进行中且未录入资料」、其余待开始
  const stageHasData = (st: { fields: { value: string }[]; attachments: unknown[] }) =>
    st.attachments.length > 0 || st.fields.some((f) => (f.value ?? '').trim() !== '');
  const blocked = sample.stages.some((st, idx) => {
    if (st.status === DevStageStatus.PENDING) return false;
    if (idx === 0 && st.status === DevStageStatus.IN_PROGRESS && !stageHasData(st)) return false;
    return true;
  });
  if (blocked) throw new AppError(409, '样品存在已录入资料或已推进的节点，无法删除');
  await db.devSample.delete({ where: { id: sampleId } });
  return getDevStyle(db, sample.styleId);
}

export async function updateDevStage(
  db: TenantPrismaClient,
  stageId: string,
  body: {
    status?: string;
    fields?: Array<{ id?: string; label: string; value: string; type?: string }>;
    attachments?: Array<{ id?: string; fileName: string; fileUrl: string; fileType?: string }>;
    user?: string;
  },
) {
  const stage = await db.devStage.findUnique({
    where: { id: stageId },
    include: { sample: { include: { style: true } } },
  });
  if (!stage) throw new AppError(404, '开发节点不存在');
  if (stage.sample.style.status === DevStyleStatus.PUBLISHED) {
    throw new AppError(409, '已发布大货的款式不可登记节点');
  }

  const user = body.user?.trim() || '系统';
  const updates: string[] = [];

  const newStatus = body.status && body.status !== stage.status ? body.status : undefined;

  await db.$transaction(async (tx) => {
    if (newStatus) {
      await tx.devStage.update({
        where: { id: stageId },
        data: { status: newStatus },
      });
      updates.push(`状态 → ${newStatus}`);

      if (newStatus === DevStageStatus.COMPLETED) {
        const siblings = await tx.devStage.findMany({
          where: { sampleId: stage.sampleId },
          orderBy: { order: 'asc' },
        });
        const idx = siblings.findIndex((s) => s.id === stageId);
        const next = siblings.slice(idx + 1).find((s) => s.status === DevStageStatus.PENDING);
        if (next) {
          await tx.devStage.update({
            where: { id: next.id },
            data: { status: DevStageStatus.IN_PROGRESS },
          });
        }
      }
    }
    if (Array.isArray(body.fields)) {
      await tx.devStageField.deleteMany({ where: { stageId } });
      if (body.fields.length > 0) {
        await tx.devStageField.createMany({
          data: body.fields.map((f) => ({
            id: f.id ?? genId('dsfld'),
            stageId,
            label: f.label,
            value: f.value,
            type: f.type ?? 'text',
          })),
        });
      }
      updates.push('工艺参数已更新');
    }
    if (Array.isArray(body.attachments)) {
      await tx.devAttachment.deleteMany({ where: { stageId } });
      if (body.attachments.length > 0) {
        await tx.devAttachment.createMany({
          data: body.attachments.map((a) => ({
            id: a.id ?? genId('datt'),
            stageId,
            fileName: a.fileName,
            fileUrl: a.fileUrl,
            fileType: a.fileType ?? null,
          })),
        });
      }
      updates.push(`附件 ${body.attachments.length} 个`);
    }
  });

  if (updates.length > 0) {
    await appendDevLog(db, stage.sampleId, user, `节点「${stage.name}」`, updates.join('；'));
  }

  return getDevStyle(db, stage.sample.styleId);
}

export async function listDevBoms(
  db: TenantPrismaClient,
  opts: { parentStyleId?: string; all?: boolean },
) {
  const where: Record<string, unknown> = {};
  if (opts.parentStyleId) where.parentStyleId = opts.parentStyleId;
  const rows = await db.devBom.findMany({
    where,
    include: { items: { orderBy: { sortOrder: 'asc' } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return rows;
}

export async function getDevBom(db: TenantPrismaClient, id: string) {
  const bom = await db.devBom.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!bom) throw new AppError(404, '开发 BOM 不存在');
  return bom;
}

/** 校验父款式存在且归属当前租户（DevStyle 走 tenant 扩展，跨租户 findUnique 返回 null） */
async function assertDevParentStyle(db: TenantPrismaClient, parentStyleId: unknown) {
  const id = String(parentStyleId ?? '').trim();
  if (!id) throw new AppError(400, '缺少父款式');
  const parent = await db.devStyle.findUnique({ where: { id } });
  if (!parent) throw new AppError(404, '父款式不存在或无权操作');
  return parent;
}

export async function createDevBom(
  db: TenantPrismaClient,
  tenantId: string,
  body: Record<string, unknown>,
) {
  const { items, ...rest } = body;
  const data = sanitizeCreate(rest);
  await assertDevParentStyle(db, data.parentStyleId);
  if (!data.id) data.id = genId('dbom');
  const cleanItems = items
    ? sanitizeItems(items as Record<string, unknown>[], ['bomId'])
    : undefined;
  return db.devBom.create({
    data: {
      ...data,
      tenantId,
      items: cleanItems ? { create: cleanItems } : undefined,
    },
    include: { items: true },
  });
}

export async function updateDevBom(db: TenantPrismaClient, bomId: string, body: Record<string, unknown>) {
  const { items, ...rest } = body;
  const data = sanitizeUpdate(rest);
  const existing = await db.devBom.findUnique({ where: { id: bomId } });
  if (!existing) throw new AppError(404, '开发 BOM 不存在');
  // 若改动父款式归属，校验新父款式同样属于当前租户，避免脏外键
  if ('parentStyleId' in data) await assertDevParentStyle(db, data.parentStyleId);

  await db.$transaction(async (tx) => {
    await tx.devBom.update({ where: { id: bomId }, data });
    if (items) {
      const cleanItems = sanitizeItems(items as Record<string, unknown>[], ['bomId']).map(
        (item) => ({ ...item, bomId }),
      );
      await tx.devBomItem.deleteMany({ where: { bomId } });
      if (cleanItems.length > 0) await tx.devBomItem.createMany({ data: cleanItems });
    }
  });
  return getDevBom(db, bomId);
}

export async function deleteDevBom(db: TenantPrismaClient, id: string) {
  await db.devBom.delete({ where: { id } });
  return { message: '已删除' };
}

export async function syncDevVariantNodeBoms(
  db: TenantPrismaClient,
  styleId: string,
  variantId: string,
  nodeBoms: Record<string, string>,
) {
  const v = await db.devStyleVariant.findFirst({ where: { id: variantId, styleId } });
  if (!v) throw new AppError(404, '款式变体不存在');
  await db.devStyleVariant.update({
    where: { id: variantId },
    data: { nodeBoms },
  });
  return getDevStyle(db, styleId);
}

export { publishDevStyleToProduct };
