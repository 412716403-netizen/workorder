import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

type WeightSample = {
  variantId: string | null;
  nodeId: string;
  weight: number;
  quantity: number;
};

function pushSample(samples: WeightSample[], row: WeightSample): void {
  if (!row.nodeId) return;
  if (!(row.weight > 0) || !(row.quantity > 0)) return;
  samples.push(row);
}

/** 按规格×工序汇总历史外协/返工收货单件重量均值（总交货重÷总收货件数） */
export async function getReceiveUnitWeightAverages(
  db: TenantPrismaClient,
  productId: string,
) {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      variants: { select: { id: true, colorId: true, sizeId: true } },
    },
  });
  if (!product) throw new AppError(404, '产品不存在');

  const samples: WeightSample[] = [];

  const opRecords = await db.productionOpRecord.findMany({
    where: {
      productId,
      type: { in: ['OUTSOURCE', 'REWORK_REPORT'] },
      OR: [
        { type: 'OUTSOURCE', status: '已收回' },
        { type: 'REWORK_REPORT' },
      ],
      nodeId: { not: null },
      weight: { not: null, gt: 0 },
      quantity: { gt: 0 },
    },
    select: {
      variantId: true,
      nodeId: true,
      weight: true,
      quantity: true,
      docNo: true,
      sourceReworkId: true,
      type: true,
    },
  });

  /** 返工报工与镜像外协收回常成对出现，只计 REWORK_REPORT 避免双计 */
  const reworkWeightKeys = new Set<string>();
  for (const r of opRecords) {
    if (r.type === 'REWORK_REPORT' && r.sourceReworkId && r.nodeId) {
      reworkWeightKeys.add(`${r.sourceReworkId}\0${r.nodeId}`);
    }
  }

  const opDocNos = new Set<string>();
  for (const r of opRecords) {
    if (!r.nodeId) continue;
    if (
      r.type === 'OUTSOURCE' &&
      r.sourceReworkId &&
      reworkWeightKeys.has(`${r.sourceReworkId}\0${r.nodeId}`)
    ) {
      continue;
    }
    const weight = Number(r.weight);
    const quantity = Number(r.quantity);
    if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(quantity) || quantity <= 0) continue;
    if (r.docNo) opDocNos.add(r.docNo);
    pushSample(samples, {
      variantId: r.variantId,
      nodeId: r.nodeId,
      weight,
      quantity,
    });
  }

  // 派生报工：仅当同 docNo 的外协流水未带 weight 时补入（避免双计）
  const [productReports, milestoneReports] = await Promise.all([
    db.productProgressReport.findMany({
      where: {
        weight: { not: null, gt: 0 },
        quantity: { gt: 0 },
        customData: { path: ['source'], equals: 'outsourceReceive' },
        progress: { productId },
      },
      select: {
        variantId: true,
        weight: true,
        quantity: true,
        reportNo: true,
        progress: { select: { variantId: true, milestoneTemplateId: true } },
      },
    }),
    db.milestoneReport.findMany({
      where: {
        weight: { not: null, gt: 0 },
        quantity: { gt: 0 },
        customData: { path: ['source'], equals: 'outsourceReceive' },
        milestone: { productionOrder: { productId } },
      },
      select: {
        variantId: true,
        weight: true,
        quantity: true,
        reportNo: true,
        milestone: { select: { templateId: true } },
      },
    }),
  ]);

  for (const r of productReports) {
    if (r.reportNo && opDocNos.has(r.reportNo)) continue;
    pushSample(samples, {
      variantId: r.variantId ?? r.progress.variantId,
      nodeId: r.progress.milestoneTemplateId,
      weight: Number(r.weight),
      quantity: Number(r.quantity),
    });
  }
  for (const r of milestoneReports) {
    if (r.reportNo && opDocNos.has(r.reportNo)) continue;
    pushSample(samples, {
      variantId: r.variantId,
      nodeId: r.milestone.templateId,
      weight: Number(r.weight),
      quantity: Number(r.quantity),
    });
  }

  const currentVariantIds = new Set(product.variants.map(v => v.id));
  const variantIdByColorSize = new Map<string, string>();
  for (const v of product.variants) {
    variantIdByColorSize.set(`${v.colorId ?? ''}:${v.sizeId ?? ''}`, v.id);
  }

  const sampleVariantIds = [
    ...new Set(samples.map(s => s.variantId).filter((id): id is string => !!id)),
  ];
  const variantMetaRows =
    sampleVariantIds.length > 0
      ? await basePrisma.productVariant.findMany({
          where: { id: { in: sampleVariantIds } },
          select: { id: true, productId: true, colorId: true, sizeId: true },
        })
      : [];
  const variantMetaById = new Map(variantMetaRows.map(v => [v.id, v]));

  const resolveCurrentVariantId = (rawVariantId: string | null): string | null => {
    if (rawVariantId && currentVariantIds.has(rawVariantId)) return rawVariantId;
    if (rawVariantId) {
      const meta = variantMetaById.get(rawVariantId);
      if (meta?.productId === productId) {
        return variantIdByColorSize.get(`${meta.colorId ?? ''}:${meta.sizeId ?? ''}`) ?? null;
      }
    }
    if (product.variants.length === 1) return product.variants[0]?.id ?? null;
    return null;
  };

  const buckets = new Map<string, { totalWeight: number; totalQty: number; recordCount: number }>();
  const nodeBuckets = new Map<string, { totalWeight: number; totalQty: number; recordCount: number }>();

  for (const s of samples) {
    const resolvedVariantId = resolveCurrentVariantId(s.variantId);
    if (resolvedVariantId) {
      const key = `${resolvedVariantId}\0${s.nodeId}`;
      const cur = buckets.get(key) ?? { totalWeight: 0, totalQty: 0, recordCount: 0 };
      cur.totalWeight += s.weight;
      cur.totalQty += s.quantity;
      cur.recordCount += 1;
      buckets.set(key, cur);
      continue;
    }
    const cur = nodeBuckets.get(s.nodeId) ?? { totalWeight: 0, totalQty: 0, recordCount: 0 };
    cur.totalWeight += s.weight;
    cur.totalQty += s.quantity;
    cur.recordCount += 1;
    nodeBuckets.set(s.nodeId, cur);
  }

  for (const [nodeId, bucket] of nodeBuckets) {
    if (bucket.totalQty <= 0) continue;
    for (const v of product.variants) {
      const key = `${v.id}\0${nodeId}`;
      if (buckets.has(key)) continue;
      buckets.set(key, { ...bucket });
    }
  }

  const averages: Array<{
    variantId: string;
    nodeId: string;
    avgUnitWeightKg: number;
    recordCount: number;
  }> = [];

  for (const [key, bucket] of buckets) {
    if (bucket.totalQty <= 0) continue;
    const sep = key.indexOf('\0');
    averages.push({
      variantId: key.slice(0, sep),
      nodeId: key.slice(sep + 1),
      avgUnitWeightKg: bucket.totalWeight / bucket.totalQty,
      recordCount: bucket.recordCount,
    });
  }

  return { productId, averages };
}
