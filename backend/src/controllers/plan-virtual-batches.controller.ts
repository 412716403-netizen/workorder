import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { getTenantPrisma, prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';
import { str, optStr } from '../utils/request.js';

function generateScanToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

function parseWithItemCodes(body: unknown): boolean {
  const b = body as Record<string, unknown> | null;
  const v = b?.withItemCodes;
  return v === true || v === 'true' || v === 1 || v === '1';
}

/** 在同一计划单下为批次创建 N 条绑定单品码（事务内调用） */
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

function variantKey(v: string | null | undefined): string {
  return v ?? '';
}

/** 当前计划 + 所有子孙计划 id（BFS），用于父计划数量在子计划明细上的场景 */
async function collectPlanSubtreeIds(
  db: ReturnType<typeof getTenantPrisma>,
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
    frontier = children.map(c => c.id);
  }
  return [...all];
}

type VirtualBatchQuota = {
  plan: { id: string; productId: string };
  subtreeIds: string[];
  maxFromPlan: number;
  allocated: number;
  remaining: number;
};

async function loadVirtualBatchQuota(
  db: ReturnType<typeof getTenantPrisma>,
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

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const db = getTenantPrisma(tenantId);
    const planOrderId = str(req.body.planOrderId);
    const quantity = Math.floor(Number(req.body.quantity));
    const rawVid = req.body.variantId;
    const variantId =
      rawVid === undefined || rawVid === null || rawVid === '' ? null : str(rawVid);

    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new AppError(400, '数量须为大于等于 1 的整数');
    }

    const { plan, maxFromPlan, allocated, remaining } = await loadVirtualBatchQuota(db, planOrderId, variantId);

    if (quantity > remaining) {
      throw new AppError(
        400,
        remaining <= 0
          ? `批次数量受计划限制：该规格在计划树下计划量为 ${maxFromPlan}，已有批次码占用 ${allocated}，无法再生成`
          : `批次数量受计划限制：该规格计划量 ${maxFromPlan}，已有批次码占用 ${allocated}，本次最多还可生成 ${remaining} 件`,
      );
    }

    const withItemCodes = parseWithItemCodes(req.body);

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

    res.json({ ...batch, itemCodesCreated });
  } catch (e) {
    next(e);
  }
}

/** 按固定每批件数，将当前剩余可分配数量拆成多条批次码（同一事务） */
export async function bulkSplit(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const db = getTenantPrisma(tenantId);
    const planOrderId = str(req.body.planOrderId);
    const batchSize = Math.floor(Number(req.body.batchSize));
    const rawVid = req.body.variantId;
    const variantId =
      rawVid === undefined || rawVid === null || rawVid === '' ? null : str(rawVid);

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

    const withItemCodes = parseWithItemCodes(req.body);

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

    res.json({
      created: rows.length,
      items: rows,
      batchSize,
      quantities: chunks,
      totalQuantity: ctx.remaining,
      maxFromPlan: ctx.maxFromPlan,
      allocatedBefore: ctx.allocated,
      itemCodesCreated,
    });
  } catch (e) {
    next(e);
  }
}

/** 无需指定规格：对计划树中出现的每个规格，分别按每批件数拆满剩余可分配量（单事务） */
export async function bulkSplitAllVariants(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const db = getTenantPrisma(tenantId);
    const planOrderId = str(req.body.planOrderId);
    const batchSize = Math.floor(Number(req.body.batchSize));
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
    type PendingBatch = { variantId: string | null; quantity: number; productId: string };
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

    const withItemCodes = parseWithItemCodes(req.body);

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

    res.json({
      totalCreated: rows.length,
      items: rows,
      batchSize,
      byVariant,
      itemCodesCreated,
    });
  } catch (e) {
    next(e);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const planOrderId = optStr(req.query.planOrderId);
    const where: Record<string, unknown> = {};
    if (planOrderId) where.planOrderId = planOrderId;

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
    res.json({ items, total: items.length });
  } catch (e) {
    next(e);
  }
}

export async function voidBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const id = str(req.params.id);
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
    res.json(updated);
  } catch (e) {
    next(e);
  }
}

export async function scan(req: Request, res: Response, next: NextFunction) {
  try {
    const token = str(req.params.token);
    const batch = await basePrisma.planVirtualBatch.findUnique({
      where: { scanToken: token },
    });
    if (!batch) {
      res.status(404).json({ error: '批次码不存在' });
      return;
    }

    const callerTenantId = req.tenantId!;
    const ownerTenantId = batch.tenantId;

    if (callerTenantId !== ownerTenantId) {
      const collab = await basePrisma.tenantCollaboration.findFirst({
        where: {
          status: 'ACTIVE',
          OR: [
            { tenantAId: ownerTenantId, tenantBId: callerTenantId },
            { tenantAId: callerTenantId, tenantBId: ownerTenantId },
          ],
        },
      });
      if (!collab) {
        res.status(403).json({ error: '无权访问该批次码' });
        return;
      }
    }

    if (batch.status === 'VOIDED') {
      res.json({ kind: 'VIRTUAL_BATCH', status: 'VOIDED', message: '该批次码已作废' });
      return;
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

    let colorName: string | null = null;
    let sizeName: string | null = null;
    let variantLabel: string | null = null;

    if (batch.variantId && product) {
      const variant = product.variants.find((v: { id: string }) => v.id === batch.variantId);
      if (variant) {
        const dictIds = [variant.colorId, variant.sizeId].filter(Boolean) as string[];
        if (dictIds.length > 0) {
          const dictItems = await basePrisma.dictionaryItem.findMany({
            where: { id: { in: dictIds }, tenantId: ownerTenantId },
          });
          const dictMap = new Map(dictItems.map((d: { id: string; name: string }) => [d.id, d.name]));
          colorName = (variant.colorId ? dictMap.get(variant.colorId) : null) ?? null;
          sizeName = (variant.sizeId ? dictMap.get(variant.sizeId) : null) ?? null;
        }
        const parts = [colorName, sizeName].filter(Boolean);
        variantLabel = parts.length > 0 ? parts.join('-') : variant.skuSuffix || null;
      }
    }

    const itemCodes =
      batch.status === 'ACTIVE'
        ? await basePrisma.itemCode.findMany({
            where: { batchId: batch.id, status: 'ACTIVE' },
            select: { id: true, serialNo: true, scanToken: true, status: true },
            orderBy: { serialNo: 'asc' },
          })
        : [];

    res.json({
      kind: 'VIRTUAL_BATCH',
      status: batch.status,
      batchId: batch.id,
      quantity: batch.quantity,
      planNumber: plan?.planNumber ?? null,
      orderNumbers: orders.map((o: { orderNumber: string }) => o.orderNumber),
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
    });
  } catch (e) {
    next(e);
  }
}
