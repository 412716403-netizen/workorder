import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
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

/** 扫码 token：前 8 位为租户 UUID（去连字符）前缀，便于分区裁剪；后缀随机。 */
export function generateScanToken(tenantId: string): string {
  const compact = tenantId.replace(/-/g, '').toLowerCase();
  const prefix = compact.slice(0, 8);
  const rand = crypto.randomBytes(12).toString('base64url');
  return `${prefix}.${rand}`;
}

/** 从 token 解析出 8 位十六进制租户前缀；格式不符返回 null。 */
export function parseScanTokenTenantHexPrefix(token: string): string | null {
  const i = token.indexOf('.');
  if (i <= 0) return null;
  const prefix = token.slice(0, i).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(prefix)) return null;
  return prefix;
}

/** 将扫码前缀解析为唯一租户 id；存在歧义或不存在时返回 null。 */
export async function resolveTenantIdFromScanTokenPrefix(prefix8: string): Promise<string | null> {
  const rows = await basePrisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT id::text AS id FROM tenants
      WHERE lower(substring(regexp_replace(id::text, '-', '', 'g'), 1, 8)) = ${prefix8}
      LIMIT 2
    `,
  );
  if (rows.length !== 1) return null;
  return rows[0]!.id;
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

const MAX_COLLABORATION_HOPS = 4;
const COLLAB_CACHE_TTL_MS = 60_000;
const collabCache = new Map<string, { ok: boolean; exp: number }>();

function collabCacheKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function collabCacheGet(a: string, b: string): boolean | null {
  const k = collabCacheKey(a, b);
  const hit = collabCache.get(k);
  if (!hit) return null;
  if (hit.exp < Date.now()) {
    collabCache.delete(k);
    return null;
  }
  return hit.ok;
}

function collabCacheSet(a: string, b: string, ok: boolean): void {
  collabCache.set(collabCacheKey(a, b), { ok, exp: Date.now() + COLLAB_CACHE_TTL_MS });
}

/**
 * 跨租户协作可达性（传递信任）：在 ACTIVE 的 tenantCollaboration 图上 BFS，
 * 最多 MAX_COLLABORATION_HOPS 跳；结果缓存约 60s。
 */
export async function verifyCollaborationAccess(
  callerTenantId: string,
  ownerTenantId: string,
): Promise<boolean> {
  if (callerTenantId === ownerTenantId) return true;

  const cached = collabCacheGet(callerTenantId, ownerTenantId);
  if (cached !== null) return cached;

  const direct = await basePrisma.tenantCollaboration.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [
        { tenantAId: ownerTenantId, tenantBId: callerTenantId },
        { tenantAId: callerTenantId, tenantBId: ownerTenantId },
      ],
    },
    select: { id: true },
  });
  if (direct) {
    collabCacheSet(callerTenantId, ownerTenantId, true);
    return true;
  }

  const visited = new Set<string>([callerTenantId]);
  let frontier: string[] = [callerTenantId];
  for (let hop = 0; hop < MAX_COLLABORATION_HOPS && frontier.length > 0; hop++) {
    const edges = await basePrisma.tenantCollaboration.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ tenantAId: { in: frontier } }, { tenantBId: { in: frontier } }],
      },
      select: { tenantAId: true, tenantBId: true },
    });

    const nextFrontier: string[] = [];
    for (const e of edges) {
      for (const p of [e.tenantAId, e.tenantBId]) {
        if (visited.has(p)) continue;
        visited.add(p);
        if (p === ownerTenantId) {
          collabCacheSet(callerTenantId, ownerTenantId, true);
          return true;
        }
        nextFrontier.push(p);
      }
    }
    frontier = nextFrontier;
  }

  collabCacheSet(callerTenantId, ownerTenantId, false);
  return false;
}

export function invalidateCollaborationCache(): void {
  collabCache.clear();
}

export type PlanTreeNodeRow = {
  id: string;
  tenantId: string;
  parentPlanId: string | null;
  productId: string;
  planNumber: string;
};

/** 从任意计划节点上溯到 root，再向下收集整棵子树（跨租户，用 basePrisma）。 */
export async function collectPlanTreeFromNode(nodeId: string): Promise<PlanTreeNodeRow[]> {
  let cur: string | null = nodeId;
  let rootId = nodeId;
  const guardUp = new Set<string>();
  while (cur && !guardUp.has(cur)) {
    guardUp.add(cur);
    const row: { parentPlanId: string | null } | null = await basePrisma.planOrder.findUnique({
      where: { id: cur },
      select: { parentPlanId: true },
    });
    if (!row || !row.parentPlanId) {
      rootId = cur;
      break;
    }
    cur = row.parentPlanId;
  }

  const all: PlanTreeNodeRow[] = [];
  const seen = new Set<string>();
  const rootFull = await basePrisma.planOrder.findUnique({
    where: { id: rootId },
    select: { id: true, tenantId: true, parentPlanId: true, productId: true, planNumber: true },
  });
  if (rootFull) {
    all.push(rootFull);
    seen.add(rootFull.id);
  }

  let frontier: string[] = [rootId];
  while (frontier.length > 0) {
    const children = await basePrisma.planOrder.findMany({
      where: { parentPlanId: { in: frontier } },
      select: { id: true, tenantId: true, parentPlanId: true, productId: true, planNumber: true },
    });
    const next: string[] = [];
    for (const c of children) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      all.push(c);
      next.push(c.id);
    }
    frontier = next;
  }
  return all;
}

function isPlanAncestorOf(
  idToParent: Map<string, string | null>,
  ancestorId: string,
  nodeId: string,
): boolean {
  const guard = new Set<string>();
  let cur: string | null = nodeId;
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    if (cur === ancestorId) return true;
    cur = idToParent.get(cur) ?? null;
  }
  return false;
}

/**
 * 调用方在码所属计划树中的节点与工单（协作时多为下游子计划）。
 */
export async function resolveCallerContext(params: {
  callerTenantId: string;
  ownerTenantId: string;
  ownerPlanOrderId: string;
}): Promise<{
  callerPlanOrderId: string | null;
  callerPlanNumber: string | null;
  callerOrderNumbers: string[];
  relation: 'OWNER' | 'DOWNSTREAM' | 'UPSTREAM' | 'PEER';
}> {
  const { callerTenantId, ownerTenantId, ownerPlanOrderId } = params;

  if (callerTenantId === ownerTenantId) {
    const plan = await basePrisma.planOrder.findUnique({
      where: { id: ownerPlanOrderId },
      select: { id: true, planNumber: true },
    });
    const orders = await basePrisma.productionOrder.findMany({
      where: { planOrderId: ownerPlanOrderId, tenantId: callerTenantId },
      select: { orderNumber: true },
    });
    return {
      callerPlanOrderId: plan?.id ?? null,
      callerPlanNumber: plan?.planNumber ?? null,
      callerOrderNumbers: orders.map((o) => o.orderNumber),
      relation: 'OWNER',
    };
  }

  const tree = await collectPlanTreeFromNode(ownerPlanOrderId);
  const idToParent = new Map(tree.map((n) => [n.id, n.parentPlanId] as const));
  const callerNodes = tree.filter((n) => n.tenantId === callerTenantId);
  if (callerNodes.length === 0) {
    return {
      callerPlanOrderId: null,
      callerPlanNumber: null,
      callerOrderNumbers: [],
      relation: 'PEER',
    };
  }

  let relation: 'OWNER' | 'DOWNSTREAM' | 'UPSTREAM' | 'PEER' = 'PEER';
  let picked = callerNodes[0]!;

  const downstream = callerNodes.filter((n) => isPlanAncestorOf(idToParent, ownerPlanOrderId, n.id));
  if (downstream.length > 0) {
    relation = 'DOWNSTREAM';
    picked = downstream.reduce((best, n) => {
      const bd = depthFrom(idToParent, ownerPlanOrderId, n.id);
      const bestD = depthFrom(idToParent, ownerPlanOrderId, best.id);
      return bd > bestD ? n : best;
    });
  } else {
    const upstream = callerNodes.filter((n) => isPlanAncestorOf(idToParent, n.id, ownerPlanOrderId));
    if (upstream.length > 0) {
      relation = 'UPSTREAM';
      picked = upstream[0]!;
    }
  }

  const orders = await basePrisma.productionOrder.findMany({
    where: { planOrderId: picked.id, tenantId: callerTenantId },
    select: { orderNumber: true },
  });

  return {
    callerPlanOrderId: picked.id,
    callerPlanNumber: picked.planNumber,
    callerOrderNumbers: orders.map((o) => o.orderNumber),
    relation,
  };
}

function depthFrom(
  idToParent: Map<string, string | null>,
  fromId: string,
  toId: string,
): number {
  let d = 0;
  const guard = new Set<string>();
  let cur: string | null = toId;
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    if (cur === fromId) return d;
    d += 1;
    cur = idToParent.get(cur) ?? null;
  }
  return d;
}
