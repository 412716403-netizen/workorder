import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';

const ALLOWED_FIELD_TYPES = new Set(['text', 'date', 'select', 'file']);

type TemplateFieldInput = {
  id?: string;
  label: string;
  required?: boolean;
  order?: number;
  type?: string;
  options?: string[] | null;
  dateWithTime?: boolean | null;
  dateAutoFill?: boolean | null;
};

function normalizeFieldType(type: string | undefined): string {
  if (type && ALLOWED_FIELD_TYPES.has(type)) return type;
  return 'text';
}

function normalizeFieldRow(f: TemplateFieldInput, i: number) {
  const type = normalizeFieldType(f.type);
  // 字段每次保存均「先删后建」，id 无需保持稳定；客户端可能带超长前缀 id（>50），
  // 统一在服务端生成短 id，避免超出 dev_stage_template_fields.id VarChar(50)。
  const id = f.id && f.id.length <= 50 ? f.id : genId('dtplf');
  return {
    id,
    label: String(f.label).trim(),
    type,
    options: Array.isArray(f.options) ? f.options : [],
    dateWithTime: f.dateWithTime ?? null,
    dateAutoFill: f.dateAutoFill ?? null,
    required: f.required ?? false,
    order: f.order ?? i,
  };
}

export async function listDevStageTemplates(db: TenantPrismaClient) {
  return db.devStageTemplate.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    include: { fields: { orderBy: { order: 'asc' } } },
  });
}

export async function createDevStageTemplate(
  db: TenantPrismaClient,
  tenantId: string,
  body: { name: string; order?: number; fields?: TemplateFieldInput[] },
) {
  const name = body.name?.trim();
  if (!name) throw new AppError(400, '模板名称不能为空');
  const id = genId('dtpl');
  return db.devStageTemplate.create({
    data: {
      id,
      tenantId,
      name,
      order: body.order ?? 0,
      fields: body.fields?.length
        ? { create: body.fields.map((f, i) => normalizeFieldRow(f, i)) }
        : undefined,
    },
    include: { fields: { orderBy: { order: 'asc' } } },
  });
}

export async function updateDevStageTemplate(
  db: TenantPrismaClient,
  id: string,
  body: {
    name?: string;
    order?: number;
    fields?: TemplateFieldInput[];
  },
) {
  const existing = await db.devStageTemplate.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, '模板不存在');
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.order !== undefined) data.order = body.order;

  await db.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.devStageTemplate.update({ where: { id }, data });
    }
    if (Array.isArray(body.fields)) {
      await tx.devStageTemplateField.deleteMany({ where: { templateId: id } });
      if (body.fields.length > 0) {
        await tx.devStageTemplateField.createMany({
          data: body.fields.map((f, i) => ({ ...normalizeFieldRow(f, i), templateId: id })),
        });
      }
    }
  });

  return db.devStageTemplate.findUnique({
    where: { id },
    include: { fields: { orderBy: { order: 'asc' } } },
  });
}

export async function deleteDevStageTemplate(db: TenantPrismaClient, id: string) {
  await db.devStageTemplate.delete({ where: { id } });
  return { message: '已删除' };
}
