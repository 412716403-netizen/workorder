import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genUuidV7 } from '../utils/genId.js';
import {
  type VirtualBatchQuota,
  generateScanToken,
  parseScanTokenTenantHexPrefix,
  scanTokenEqualsWhere,
  resolveTenantIdFromScanTokenPrefix,
  collectPlanSubtreeIds,
  loadVirtualBatchQuota,
  resolveCallerContext,
  resolveVariantLabel,
  verifyCollaborationAccess,
} from './planTreeQuota.service.js';
import { voidActivePlanLevelItemCodesForVariants } from './itemCodes.service.js';
import { formatBatchSerialLabel } from '../../../shared/serialLabels.js';

const INSERT_CHUNK = 2000;

/** 计划子树内各规格 ACTIVE 批次占用件数汇总（用于额度展示，避免拉全量批次列表） */
export async function subtreeBatchAllocatedByVariant(
  db: TenantPrismaClient,
  rootPlanOrderId: string,
) {
  const plan = await db.planOrder.findUnique({
    where: { id: rootPlanOrderId },
    select: { productId: true },
  });
  if (!plan) throw new AppError(404, '计划单不存在');

  const subtreeIds = await collectPlanSubtreeIds(db, rootPlanOrderId);
  const agg = await db.planVirtualBatch.groupBy({
    by: ['variantId'],
    where: {
      planOrderId: { in: subtreeIds },
      productId: plan.productId,
      status: 'ACTIVE',
    },
    _sum: { quantity: true },
  });

  return {
    productId: plan.productId,
    allocations: agg.map((r) => ({
      variantId: r.variantId ?? null,
      allocated: Number(r._sum.quantity ?? 0),
    })),
  };
}

/** Create N linked item-codes for a batch inside an existing transaction. */
async function createLinkedItemCodesForBatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  params: {
    tenantId: string;
    planOrderId: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    batchId: string;
  },
): Promise<number> {
  const { tenantId, planOrderId, productId, variantId, quantity, batchId } = params;
  if (quantity <= 0) return 0;

  await tx.$executeRawUnsafe(
    `SELECT 1 FROM plan_orders WHERE id = $1 AND tenant_id = $2::uuid FOR UPDATE`,
    planOrderId,
    tenantId,
  );

  const maxSnRows = (await tx.$queryRawUnsafe(
    `SELECT MAX(serial_no) AS m FROM item_codes
     WHERE tenant_id = $1::uuid AND plan_order_id = $2`,
    tenantId,
    planOrderId,
  )) as Array<{ m: number | null }>;
  let seq = (maxSnRows[0]?.m ?? 0) + 1;

  const rows: Array<{
    id: string;
    tenantId: string;
    planOrderId: string;
    productId: string;
    variantId: string | null;
    serialNo: number;
    scanToken: string;
    status: string;
    batchId: string;
  }> = [];
  for (let i = 0; i < quantity; i++) {
    rows.push({
      id: genUuidV7(),
      tenantId,
      planOrderId,
      productId,
      variantId,
      serialNo: seq++,
      scanToken: generateScanToken(tenantId),
      status: 'ACTIVE',
      batchId,
    });
  }

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    if (chunk.length > 0) await tx.itemCode.createMany({ data: chunk });
  }
  return quantity;
}

// ── public API ───────────────────────────────────────────────

export async function listBatches(
  db: TenantPrismaClient,
  opts: { planOrderId?: string; all?: boolean; page?: number; pageSize?: number },
) {
  const where: Record<string, unknown> = {};
  if (opts.planOrderId) where.planOrderId = opts.planOrderId;
  const orderBy: any = [{ sequenceNo: 'desc' }, { createdAt: 'desc' }];

  let raw: Awaited<ReturnType<typeof db.planVirtualBatch.findMany>>;
  let total: number;
  let page: number;
  let pageSize: number;

  if (opts.all) {
    total = await db.planVirtualBatch.count({ where });
    raw = await db.planVirtualBatch.findMany({ where, orderBy });
    page = 1;
    pageSize = total;
  } else {
    page = Math.max(1, opts.page ?? 1);
    pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 15));
    const r = await Promise.all([
      db.planVirtualBatch.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.planVirtualBatch.count({ where }),
    ]);
    raw = r[0];
    total = r[1];
  }

  const batchIds = raw.map((b) => b.id);
  let countByBatch = new Map<string, number>();
  if (batchIds.length > 0) {
    const agg = await db.itemCode.groupBy({
      by: ['batchId'],
      where: { batchId: { in: batchIds }, status: 'ACTIVE' },
      _count: { id: true },
    });
    countByBatch = new Map(
      agg.map((r) => [r.batchId!, r._count.id]).filter((e): e is [string, number] => e[0] != null),
    );
  }

  const items = raw.map((rest) => ({
    ...rest,
    itemCodeCount: rest.id ? countByBatch.get(rest.id) ?? 0 : 0,
  }));

  return { items, total, page, pageSize };
}

export async function createBatch(
  db: TenantPrismaClient,
  tenantId: string,
  params: {
    planOrderId: string;
    quantity: number;
    variantId: string | null;
    withItemCodes: boolean;
  },
) {
  const { planOrderId, quantity, variantId, withItemCodes } = params;

  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new AppError(400, '数量须为大于等于 1 的整数');
  }

  const { plan, maxFromPlan, allocated, remaining } =
    await loadVirtualBatchQuota(db, planOrderId, variantId);

  if (quantity > remaining) {
    throw new AppError(
      400,
      remaining <= 0
        ? `批次数量受计划限制：该规格在计划树下计划量为 ${maxFromPlan}，已有批次码占用 ${allocated}，无法再生成`
        : `批次数量受计划限制：该规格计划量 ${maxFromPlan}，已有批次码占用 ${allocated}，本次最多还可生成 ${remaining} 件`,
    );
  }

  const { batch, itemCodesCreated } = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT 1 FROM plan_orders WHERE id = $1 AND tenant_id = $2::uuid FOR UPDATE`,
      planOrderId,
      tenantId,
    );

    const maxSeqRows = await tx.$queryRawUnsafe<Array<{ m: number | null }>>(
      `SELECT MAX(sequence_no) AS m FROM plan_virtual_batches
       WHERE tenant_id = $1::uuid AND plan_order_id = $2`,
      tenantId,
      planOrderId,
    );
    const sequenceNo = (maxSeqRows[0]?.m ?? 0) + 1;

    const row = await tx.planVirtualBatch.create({
      data: {
        id: genUuidV7(),
        tenantId,
        planOrderId,
        productId: plan.productId,
        variantId,
        quantity,
        sequenceNo,
        scanToken: generateScanToken(tenantId),
        status: 'ACTIVE',
      },
    });
    let created = 0;
    if (withItemCodes) {
      created = await createLinkedItemCodesForBatch(tx, {
        tenantId,
        planOrderId,
        productId: plan.productId,
        variantId,
        quantity: row.quantity,
        batchId: row.id,
      });
      if (created > 0) {
        await voidActivePlanLevelItemCodesForVariants(tx, tenantId, planOrderId, [variantId]);
      }
    }
    return { batch: row, itemCodesCreated: created };
  });

  return { ...batch, itemCodesCreated };
}

export async function bulkSplit(
  db: TenantPrismaClient,
  tenantId: string,
  params: {
    planOrderId: string;
    batchSize: number;
    variantId: string | null;
    withItemCodes: boolean;
  },
) {
  const { planOrderId, batchSize, variantId, withItemCodes } = params;

  if (!Number.isFinite(batchSize) || batchSize < 1) {
    throw new AppError(400, '每批件数须为大于等于 1 的整数');
  }

  const ctx = await loadVirtualBatchQuota(db, planOrderId, variantId);
  if (ctx.remaining <= 0) {
    throw new AppError(
      400,
      `当前无可拆批数量：计划量 ${ctx.maxFromPlan}，已有批次码占用 ${ctx.allocated}`,
    );
  }

  const chunks: number[] = [];
  let left = ctx.remaining;
  while (left > 0) {
    const q = Math.min(batchSize, left);
    chunks.push(q);
    left -= q;
  }

  const { rows, itemCodesCreated } = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT 1 FROM plan_orders WHERE id = $1 AND tenant_id = $2::uuid FOR UPDATE`,
      planOrderId,
      tenantId,
    );

    const maxSeqRows = await tx.$queryRawUnsafe<Array<{ m: number | null }>>(
      `SELECT MAX(sequence_no) AS m FROM plan_virtual_batches
       WHERE tenant_id = $1::uuid AND plan_order_id = $2`,
      tenantId,
      planOrderId,
    );
    let seq = (maxSeqRows[0]?.m ?? 0) + 1;
    const rowsOut: Awaited<ReturnType<typeof tx.planVirtualBatch.create>>[] = [];
    let codes = 0;
    for (const q of chunks) {
      const row = await tx.planVirtualBatch.create({
        data: {
          id: genUuidV7(),
          tenantId,
          planOrderId,
          productId: ctx.plan.productId,
          variantId,
          quantity: q,
          sequenceNo: seq++,
          scanToken: generateScanToken(tenantId),
          status: 'ACTIVE',
        },
      });
      rowsOut.push(row);
      if (withItemCodes) {
        codes += await createLinkedItemCodesForBatch(tx, {
          tenantId,
          planOrderId,
          productId: ctx.plan.productId,
          variantId,
          quantity: row.quantity,
          batchId: row.id,
        });
      }
    }
    if (withItemCodes && codes > 0) {
      await voidActivePlanLevelItemCodesForVariants(tx, tenantId, planOrderId, [variantId]);
    }
    return { rows: rowsOut, itemCodesCreated: codes };
  });

  return {
    created: rows.length,
    items: rows,
    batchSize,
    quantities: chunks,
    totalQuantity: ctx.remaining,
    maxFromPlan: ctx.maxFromPlan,
    allocatedBefore: ctx.allocated,
    itemCodesCreated,
  };
}

export async function bulkSplitAllVariants(
  db: TenantPrismaClient,
  tenantId: string,
  params: {
    planOrderId: string;
    batchSize: number;
    withItemCodes: boolean;
  },
) {
  const { planOrderId, batchSize, withItemCodes } = params;

  if (!Number.isFinite(batchSize) || batchSize < 1) {
    throw new AppError(400, '每批件数须为大于等于 1 的整数');
  }

  const plan = await db.planOrder.findUnique({
    where: { id: planOrderId },
    select: { id: true, productId: true },
  });
  if (!plan) throw new AppError(404, '计划单不存在');

  const subtreeIds = await collectPlanSubtreeIds(db, planOrderId);
  const plansInTree = await db.planOrder.findMany({
    where: { id: { in: subtreeIds }, productId: plan.productId },
    include: { items: true },
  });

  const variantSet = new Set<string | null>();
  for (const p of plansInTree) {
    for (const it of p.items) {
      variantSet.add(it.variantId ?? null);
    }
  }
  if (variantSet.size === 0) {
    throw new AppError(400, '计划明细为空，无法拆批');
  }

  const sortedVariants = [...variantSet].sort((a, b) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a.localeCompare(b);
  });

  type VarSummary = {
    variantId: string | null;
    created: number;
    quantities: number[];
    totalQty: number;
  };
  const byVariant: VarSummary[] = [];
  type PendingBatch = {
    variantId: string | null;
    quantity: number;
    productId: string;
  };
  const pending: PendingBatch[] = [];

  for (const vid of sortedVariants) {
    let ctx: VirtualBatchQuota;
    try {
      ctx = await loadVirtualBatchQuota(db, planOrderId, vid);
    } catch {
      continue;
    }
    if (ctx.remaining <= 0) continue;

    const chunks: number[] = [];
    let left = ctx.remaining;
    while (left > 0) {
      const q = Math.min(batchSize, left);
      chunks.push(q);
      left -= q;
    }

    for (const q of chunks) {
      pending.push({
        variantId: vid,
        quantity: q,
        productId: ctx.plan.productId,
      });
    }
    byVariant.push({
      variantId: vid,
      created: chunks.length,
      quantities: chunks,
      totalQty: ctx.remaining,
    });
  }

  if (pending.length === 0) {
    throw new AppError(400, '当前各规格均无剩余可拆批数量');
  }

  const { rows, itemCodesCreated } = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT 1 FROM plan_orders WHERE id = $1 AND tenant_id = $2::uuid FOR UPDATE`,
      planOrderId,
      tenantId,
    );

    const maxSeqRows = await tx.$queryRawUnsafe<Array<{ m: number | null }>>(
      `SELECT MAX(sequence_no) AS m FROM plan_virtual_batches
       WHERE tenant_id = $1::uuid AND plan_order_id = $2`,
      tenantId,
      planOrderId,
    );
    let seq = (maxSeqRows[0]?.m ?? 0) + 1;
    const rowsOut: Awaited<ReturnType<typeof tx.planVirtualBatch.create>>[] = [];
    let codes = 0;
    for (const p of pending) {
      const row = await tx.planVirtualBatch.create({
        data: {
          id: genUuidV7(),
          tenantId,
          planOrderId,
          productId: p.productId,
          variantId: p.variantId,
          quantity: p.quantity,
          sequenceNo: seq++,
          scanToken: generateScanToken(tenantId),
          status: 'ACTIVE',
        },
      });
      rowsOut.push(row);
      if (withItemCodes) {
        codes += await createLinkedItemCodesForBatch(tx, {
          tenantId,
          planOrderId,
          productId: p.productId,
          variantId: p.variantId,
          quantity: row.quantity,
          batchId: row.id,
        });
      }
    }
    if (withItemCodes && codes > 0) {
      const variantKeys = [...new Set(pending.map((p) => p.variantId))];
      await voidActivePlanLevelItemCodesForVariants(tx, tenantId, planOrderId, variantKeys);
    }
    return { rows: rowsOut, itemCodesCreated: codes };
  });

  return {
    totalCreated: rows.length,
    items: rows,
    batchSize,
    byVariant,
    itemCodesCreated,
  };
}

async function findVirtualBatchByScanToken(scanToken: string) {
  const prefix = parseScanTokenTenantHexPrefix(scanToken);
  if (!prefix) return null;
  const ownerTenantId = await resolveTenantIdFromScanTokenPrefix(prefix);
  if (!ownerTenantId) return null;
  return basePrisma.planVirtualBatch.findFirst({
    where: scanTokenEqualsWhere(ownerTenantId, scanToken),
  });
}

export async function scanBatch(callerTenantId: string, token: string) {
  const batch = await findVirtualBatchByScanToken(token);
  if (!batch) throw new AppError(404, '批次码不存在');

  const ownerTenantId = batch.tenantId;
  if (!(await verifyCollaborationAccess(callerTenantId, ownerTenantId))) {
    throw new AppError(403, '无权访问该批次码');
  }

  if (batch.status === 'VOIDED') {
    return { kind: 'VIRTUAL_BATCH' as const, status: 'VOIDED' as const, message: '该批次码已作废' };
  }

  const [product, plan, orders, tenant] = await Promise.all([
    basePrisma.product.findUnique({
      where: { id: batch.productId },
      include: { variants: true },
    }),
    basePrisma.planOrder.findUnique({
      where: { id: batch.planOrderId },
      select: { planNumber: true },
    }),
    basePrisma.productionOrder.findMany({
      where: { planOrderId: batch.planOrderId, tenantId: ownerTenantId },
      select: { orderNumber: true },
    }),
    basePrisma.tenant.findUnique({
      where: { id: ownerTenantId },
      select: { name: true },
    }),
  ]);

  const { colorName, sizeName, variantLabel } = await resolveVariantLabel(
    ownerTenantId,
    batch.productId,
    batch.variantId,
  );

  const itemCodes = await basePrisma.itemCode.findMany({
    where: { tenantId: ownerTenantId, batchId: batch.id, status: 'ACTIVE' },
    select: { id: true, serialNo: true, scanToken: true, status: true },
    orderBy: { serialNo: 'asc' },
  });

  const callerContext = await resolveCallerContext({
    callerTenantId,
    ownerTenantId,
    ownerPlanOrderId: batch.planOrderId,
  });

  const planNumber = plan?.planNumber ?? null;
  const sequenceNo = batch.sequenceNo;
  const serialLabel =
    planNumber != null && sequenceNo != null
      ? formatBatchSerialLabel(planNumber, sequenceNo)
      : null;

  return {
    kind: 'VIRTUAL_BATCH' as const,
    status: batch.status,
    batchId: batch.id,
    quantity: batch.quantity,
    sequenceNo,
    serialLabel,
    planOrderId: batch.planOrderId,
    planNumber,
    orderNumbers: orders.map((o) => o.orderNumber),
    productId: batch.productId,
    productName: product?.name ?? null,
    sku: product?.sku ?? null,
    variantId: batch.variantId ?? null,
    variantLabel,
    colorName,
    sizeName,
    ownerTenantId,
    ownerTenantName: tenant?.name ?? null,
    itemCodes,
    callerContext,
  };
}
