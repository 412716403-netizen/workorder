import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';
import {
  type VirtualBatchQuota,
  generateScanToken,
  collectPlanSubtreeIds,
  loadVirtualBatchQuota,
  variantKey,
  resolveVariantLabel,
  verifyCollaborationAccess,
} from './planTreeQuota.service.js';

// ── helpers ──────────────────────────────────────────────────

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
  const { tenantId, planOrderId, productId, variantId, quantity, batchId } =
    params;
  if (quantity <= 0) return 0;

  const agg = await tx.itemCode.aggregate({
    where: { planOrderId },
    _max: { serialNo: true },
  });
  let seq = (agg._max.serialNo ?? 0) + 1;

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
      id: genId('ic'),
      tenantId,
      planOrderId,
      productId,
      variantId,
      serialNo: seq++,
      scanToken: generateScanToken(),
      status: 'ACTIVE',
      batchId,
    });
  }
  await tx.itemCode.createMany({ data: rows });
  return quantity;
}

// ── public API ───────────────────────────────────────────────

export async function listBatches(
  db: TenantPrismaClient,
  opts: { planOrderId?: string },
) {
  const where: Record<string, unknown> = {};
  if (opts.planOrderId) where.planOrderId = opts.planOrderId;

  const raw = await db.planVirtualBatch.findMany({
    where,
    orderBy: [{ sequenceNo: 'desc' }, { createdAt: 'desc' }],
    include: {
      _count: {
        select: { itemCodes: { where: { status: 'ACTIVE' } } },
      },
    },
  });
  const items = raw.map(({ _count, ...rest }) => ({
    ...rest,
    itemCodeCount: _count.itemCodes,
  }));
  return { items, total: items.length };
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
    const agg = await tx.planVirtualBatch.aggregate({
      where: { planOrderId },
      _max: { sequenceNo: true },
    });
    const sequenceNo = (agg._max.sequenceNo ?? 0) + 1;
    const row = await tx.planVirtualBatch.create({
      data: {
        id: genId('pvb'),
        tenantId,
        planOrderId,
        productId: plan.productId,
        variantId,
        quantity,
        sequenceNo,
        scanToken: generateScanToken(),
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
    const agg = await tx.planVirtualBatch.aggregate({
      where: { planOrderId },
      _max: { sequenceNo: true },
    });
    let seq = (agg._max.sequenceNo ?? 0) + 1;
    const rowsOut: Awaited<ReturnType<typeof tx.planVirtualBatch.create>>[] = [];
    let codes = 0;
    for (const q of chunks) {
      const row = await tx.planVirtualBatch.create({
        data: {
          id: genId('pvb'),
          tenantId,
          planOrderId,
          productId: ctx.plan.productId,
          variantId,
          quantity: q,
          sequenceNo: seq++,
          scanToken: generateScanToken(),
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
    const agg = await tx.planVirtualBatch.aggregate({
      where: { planOrderId },
      _max: { sequenceNo: true },
    });
    let seq = (agg._max.sequenceNo ?? 0) + 1;
    const rowsOut: Awaited<ReturnType<typeof tx.planVirtualBatch.create>>[] = [];
    let codes = 0;
    for (const p of pending) {
      const row = await tx.planVirtualBatch.create({
        data: {
          id: genId('pvb'),
          tenantId,
          planOrderId,
          productId: p.productId,
          variantId: p.variantId,
          quantity: p.quantity,
          sequenceNo: seq++,
          scanToken: generateScanToken(),
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

export async function voidBatch(db: TenantPrismaClient, id: string) {
  const batch = await db.planVirtualBatch.findUnique({ where: { id } });
  if (!batch) throw new AppError(404, '批次码不存在');
  if (batch.status === 'VOIDED') throw new AppError(400, '批次码已作废');

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.planVirtualBatch.update({
      where: { id },
      data: { status: 'VOIDED' },
    });
    await tx.itemCode.updateMany({
      where: { batchId: id, status: 'ACTIVE' },
      data: { status: 'VOIDED' },
    });
    return row;
  });
  return updated;
}

export async function scanBatch(callerTenantId: string, token: string) {
  const batch = await basePrisma.planVirtualBatch.findUnique({
    where: { scanToken: token },
  });
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
    where: { batchId: batch.id, status: 'ACTIVE' },
    select: { id: true, serialNo: true, scanToken: true, status: true },
    orderBy: { serialNo: 'asc' },
  });

  return {
    kind: 'VIRTUAL_BATCH' as const,
    status: batch.status,
    batchId: batch.id,
    quantity: batch.quantity,
    planNumber: plan?.planNumber ?? null,
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
  };
}
