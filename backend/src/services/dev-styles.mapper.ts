import type { DevStageStatus, DevStyleStatus } from '../../../shared/types.js';

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function asNodeBoms(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && val) out[k] = val;
  }
  return out;
}

function dec(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function mapDevStyleRow(row: {
  id: string;
  code: string;
  name: string;
  customerName: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  categoryCustomData: unknown;
  colorIds: unknown;
  sizeIds: unknown;
  milestoneNodeIds: unknown;
  defaultStageNames: unknown;
  salesPrice: unknown;
  purchasePrice: unknown;
  unitId: string | null;
  supplierId: string | null;
  status: string;
  publishedProductId: string | null;
  createdAt: Date;
  updatedAt: Date;
  variants?: Array<{
    id: string;
    colorId: string | null;
    sizeId: string | null;
    skuSuffix: string | null;
    nodeBoms: unknown;
  }>;
  samples?: Array<{
    id: string;
    name: string;
    colorId: string | null;
    sizeId: string | null;
    createdAt: Date;
    stages?: Array<{
      id: string;
      name: string;
      status: string;
      order: number;
      updatedAt?: Date;
      fields?: Array<{ id: string; label: string; value: string; type: string }>;
      attachments?: Array<{ id: string; fileName: string; fileUrl: string; fileType: string | null }>;
    }>;
    logs?: Array<{ id: string; user: string; action: string; detail: string; time: Date }>;
  }>;
}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    customerName: row.customerName ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    categoryId: row.categoryId ?? undefined,
    categoryCustomData: asRecord(row.categoryCustomData),
    colorIds: asStringArray(row.colorIds),
    sizeIds: asStringArray(row.sizeIds),
    milestoneNodeIds: asStringArray(row.milestoneNodeIds),
    defaultStageNames: asStringArray(row.defaultStageNames),
    salesPrice: dec(row.salesPrice),
    purchasePrice: dec(row.purchasePrice),
    unitId: row.unitId ?? undefined,
    supplierId: row.supplierId ?? undefined,
    status: row.status as DevStyleStatus,
    publishedProductId: row.publishedProductId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    variants: (row.variants ?? []).map((v) => ({
      id: v.id,
      colorId: v.colorId ?? '',
      sizeId: v.sizeId ?? '',
      skuSuffix: v.skuSuffix ?? '',
      nodeBoms: asNodeBoms(v.nodeBoms),
    })),
    samples: (row.samples ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      colorId: s.colorId ?? undefined,
      sizeId: s.sizeId ?? undefined,
      createdAt: s.createdAt.toISOString(),
      stages: (s.stages ?? [])
        .sort((a, b) => a.order - b.order)
        .map((st) => ({
          id: st.id,
          name: st.name,
          status: st.status as DevStageStatus,
          order: st.order,
          updatedAt: st.updatedAt?.toISOString() ?? '',
          fields: (st.fields ?? []).map((f) => ({
            id: f.id,
            label: f.label,
            value: f.value,
            type: f.type,
          })),
          attachments: (st.attachments ?? []).map((a) => ({
            id: a.id,
            fileName: a.fileName,
            fileUrl: a.fileUrl,
            fileType: a.fileType ?? undefined,
          })),
        })),
      logs: (s.logs ?? [])
        .sort((a, b) => b.time.getTime() - a.time.getTime())
        .map((l) => ({
          id: l.id,
          user: l.user,
          action: l.action,
          detail: l.detail,
          time: l.time.toISOString(),
        })),
    })),
  };
}

export const devStyleInclude = {
  variants: { orderBy: { id: 'asc' as const } },
  samples: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      stages: {
        orderBy: { order: 'asc' as const },
        include: { fields: true, attachments: true },
      },
      logs: { orderBy: { time: 'desc' as const } },
    },
  },
} as const;
