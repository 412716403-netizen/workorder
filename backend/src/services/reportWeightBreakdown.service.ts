import { getTenantPrisma } from '../lib/prisma.js';
import { calcUsageByWeight } from '../utils/bomMaterialUsageByWeight.js';

/**
 * 若工序开启「报工时记录重量」并传入 weight，则按当前 BOM 自动派生占比，
 * 返回写入 DB 的 weight + materialBreakdown JSON 快照。
 * 查询一律走租户 Prisma，避免跨租户读到错误工序/BOM。
 */
export async function buildReportWeightBreakdown(opts: {
  tenantId: string;
  productId: string;
  milestoneTemplateId: string;
  variantId?: string | null;
  quantity: number;
  weight?: unknown;
}): Promise<{ weight: number | null; materialBreakdown: unknown }> {
  const db = getTenantPrisma(opts.tenantId);
  const rawWeight = typeof opts.weight === 'number'
    ? opts.weight
    : typeof opts.weight === 'string' && opts.weight !== ''
      ? parseFloat(opts.weight)
      : null;
  if (rawWeight == null || !Number.isFinite(rawWeight) || rawWeight <= 0) {
    return { weight: null, materialBreakdown: null };
  }
  const node = await db.globalNodeTemplate.findFirst({
    where: { id: opts.milestoneTemplateId, tenantId: opts.tenantId },
    select: { enableWeightOnReport: true },
  });
  if (!node?.enableWeightOnReport) {
    return { weight: null, materialBreakdown: null };
  }
  const productId = opts.productId;
  const variantId = opts.variantId || null;

  const boms = await db.bom.findMany({
    where: {
      tenantId: opts.tenantId,
      parentProductId: productId,
      nodeId: opts.milestoneTemplateId,
    },
    include: { items: true },
  });
  if (boms.length === 0) {
    return { weight: rawWeight, materialBreakdown: null };
  }
  const exactBom = variantId ? boms.find(b => b.variantId === variantId) : undefined;
  const chosenBom = exactBom ?? boms.find(b => !b.variantId) ?? boms[0];

  const childIds = chosenBom.items.map(it => it.productId);
  const childProducts = childIds.length
    ? await db.product.findMany({
      where: { tenantId: opts.tenantId, id: { in: childIds } },
      select: { id: true, name: true },
    })
    : [];
  const nameById = new Map(childProducts.map(p => [p.id, p.name]));

  const breakdown = calcUsageByWeight(
    chosenBom.items.map(it => ({
      productId: it.productId,
      quantity: it.quantity,
      excludeFromWeightShare: it.excludeFromWeightShare,
    })),
    opts.quantity,
    rawWeight,
    pid => nameById.get(pid) ?? '',
  );

  return { weight: rawWeight, materialBreakdown: breakdown };
}
