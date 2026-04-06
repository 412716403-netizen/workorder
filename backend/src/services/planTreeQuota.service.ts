import crypto from 'node:crypto';
import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export type VirtualBatchQuota = {
  plan: { id: string; productId: string };
  subtreeIds: string[];
  maxFromPlan: number;
  allocated: number;
  remaining: number;
};

export function variantKey(v: string | null | undefined): string {
  return v ?? '';
}

export function generateScanToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

/** BFS: current plan + all descendant plan ids */
export async function collectPlanSubtreeIds(
  db: TenantPrismaClient,
  rootId: string,
): Promise<string[]> {
  const all = new Set<string>();
  let frontier: string[] = [rootId];
  while (frontier.length > 0) {
    for (const id of frontier) all.add(id);
    const children = await db.planOrder.findMany({
      where: { parentPlanId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
  }
  return [...all];
}

/**
 * Load quota for a specific variant within the plan subtree.
 * Returns plan info, subtree ids, max allowed from plan items,
 * already allocated via ACTIVE batches, and remaining capacity.
 */
export async function loadVirtualBatchQuota(
  db: TenantPrismaClient,
  planOrderId: string,
  variantId: string | null,
): Promise<VirtualBatchQuota> {
  const plan = await db.planOrder.findUnique({
    where: { id: planOrderId },
    select: { id: true, productId: true },
  });
  if (!plan) throw new AppError(404, '计划单不存在');

  if (variantId != null) {
    const variant = await basePrisma.productVariant.findFirst({
      where: { id: variantId, productId: plan.productId },
    });
    if (!variant) throw new AppError(400, '规格不属于该计划产品');
  }

  const subtreeIds = await collectPlanSubtreeIds(db, planOrderId);
  const plansInTree = await db.planOrder.findMany({
    where: {
      id: { in: subtreeIds },
      productId: plan.productId,
    },
    include: { items: true },
  });

  let maxFromPlan = 0;
  for (const p of plansInTree) {
    for (const it of p.items) {
      if (variantKey(it.variantId) === variantKey(variantId)) {
        maxFromPlan += Math.floor(Number(it.quantity));
      }
    }
  }
  if (maxFromPlan <= 0) {
    throw new AppError(400, '计划明细中无该规格的数量，请先维护计划（含子计划明细）');
  }

  const batchWhere = {
    planOrderId: { in: subtreeIds },
    productId: plan.productId,
    status: 'ACTIVE' as const,
    variantId,
  };
  const allocatedAgg = await db.planVirtualBatch.aggregate({
    where: batchWhere,
    _sum: { quantity: true },
  });
  const allocated = Number(allocatedAgg._sum.quantity ?? 0);
  const remaining = maxFromPlan - allocated;

  return { plan, subtreeIds, maxFromPlan, allocated, remaining };
}

/**
 * Resolve variant display info (color/size names) from a product's variants.
 * Used by both item-code scan and virtual-batch scan.
 */
export async function resolveVariantLabel(
  ownerTenantId: string,
  productId: string,
  variantId: string | null,
): Promise<{
  colorName: string | null;
  sizeName: string | null;
  variantLabel: string | null;
}> {
  if (!variantId) return { colorName: null, sizeName: null, variantLabel: null };

  const product = await basePrisma.product.findUnique({
    where: { id: productId },
    include: { variants: true },
  });
  if (!product) return { colorName: null, sizeName: null, variantLabel: null };

  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) return { colorName: null, sizeName: null, variantLabel: null };

  let colorName: string | null = null;
  let sizeName: string | null = null;

  const dictIds = [variant.colorId, variant.sizeId].filter(Boolean) as string[];
  if (dictIds.length > 0) {
    const dictItems = await basePrisma.dictionaryItem.findMany({
      where: { id: { in: dictIds }, tenantId: ownerTenantId },
    });
    const dictMap = new Map(dictItems.map((d) => [d.id, d.name]));
    colorName = (variant.colorId ? dictMap.get(variant.colorId) : null) ?? null;
    sizeName = (variant.sizeId ? dictMap.get(variant.sizeId) : null) ?? null;
  }

  const parts = [colorName, sizeName].filter(Boolean);
  const variantLabel =
    parts.length > 0 ? parts.join('-') : variant.skuSuffix || null;

  return { colorName, sizeName, variantLabel };
}

/** Verify cross-tenant collaboration access for scan operations. */
export async function verifyCollaborationAccess(
  callerTenantId: string,
  ownerTenantId: string,
): Promise<boolean> {
  if (callerTenantId === ownerTenantId) return true;
  const collab = await basePrisma.tenantCollaboration.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [
        { tenantAId: ownerTenantId, tenantBId: callerTenantId },
        { tenantAId: callerTenantId, tenantBId: ownerTenantId },
      ],
    },
  });
  return !!collab;
}
