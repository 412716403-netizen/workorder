import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';
import {
  generateScanToken,
  resolveVariantLabel,
  verifyCollaborationAccess,
} from './planTreeQuota.service.js';

// ── public API ───────────────────────────────────────────────

export async function listItemCodes(
  db: TenantPrismaClient,
  opts: {
    planOrderId?: string;
    variantId?: string;
    batchId?: string;
    status?: string;
    page: number;
    pageSize: number;
  },
) {
  const where: Record<string, unknown> = {};
  if (opts.planOrderId) where.planOrderId = opts.planOrderId;
  if (opts.variantId) where.variantId = opts.variantId === '__null__' ? null : opts.variantId;
  if (opts.batchId) where.batchId = opts.batchId;
  if (opts.status) where.status = opts.status;

  const [items, total] = await Promise.all([
    db.itemCode.findMany({
      where,
      orderBy: { serialNo: 'asc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { batch: { select: { id: true, sequenceNo: true } } },
    }),
    db.itemCode.count({ where }),
  ]);

  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function voidCode(db: TenantPrismaClient, id: string) {
  const code = await db.itemCode.findUnique({ where: { id } });
  if (!code) throw new AppError(404, '单品码不存在');
  if (code.status === 'VOIDED') throw new AppError(400, '单品码已作废');

  return db.itemCode.update({
    where: { id },
    data: { status: 'VOIDED' },
  });
}

export async function scanItemCode(callerTenantId: string, token: string) {
  const code = await basePrisma.itemCode.findUnique({ where: { scanToken: token } });
  if (!code) throw new AppError(404, '单品码不存在');

  const ownerTenantId = code.tenantId;
  if (!(await verifyCollaborationAccess(callerTenantId, ownerTenantId))) {
    throw new AppError(403, '无权访问该单品码');
  }

  if (code.status === 'VOIDED') {
    return { status: 'VOIDED' as const, message: '该单品码已作废' };
  }

  const [product, plan, orders, tenant] = await Promise.all([
    basePrisma.product.findUnique({
      where: { id: code.productId },
      include: { variants: true },
    }),
    basePrisma.planOrder.findUnique({
      where: { id: code.planOrderId },
      select: { planNumber: true },
    }),
    basePrisma.productionOrder.findMany({
      where: { planOrderId: code.planOrderId, tenantId: ownerTenantId },
      select: { orderNumber: true },
    }),
    basePrisma.tenant.findUnique({
      where: { id: ownerTenantId },
      select: { name: true },
    }),
  ]);

  const { colorName, sizeName, variantLabel } = await resolveVariantLabel(
    ownerTenantId,
    code.productId,
    code.variantId,
  );

  let batchIdOut: string | null = code.batchId ?? null;
  let batchSequenceNo: number | null = null;
  let batchSerialLabel: string | null = null;
  if (code.batchId) {
    const vb = await basePrisma.planVirtualBatch.findUnique({
      where: { id: code.batchId },
      select: { sequenceNo: true, planOrderId: true },
    });
    if (vb) {
      const pl = await basePrisma.planOrder.findUnique({
        where: { id: vb.planOrderId },
        select: { planNumber: true },
      });
      batchSequenceNo = vb.sequenceNo;
      batchSerialLabel =
        pl?.planNumber != null
          ? `B-${pl.planNumber}-${String(vb.sequenceNo).padStart(4, '0')}`
          : null;
    }
  }

  return {
    itemCodeId: code.id,
    serialNo: code.serialNo,
    status: code.status,
    planNumber: plan?.planNumber ?? null,
    orderNumbers: orders.map((o) => o.orderNumber),
    productId: code.productId,
    productName: product?.name ?? null,
    sku: product?.sku ?? null,
    variantId: code.variantId ?? null,
    variantLabel,
    colorName,
    sizeName,
    ownerTenantId,
    ownerTenantName: tenant?.name ?? null,
    batchId: batchIdOut,
    batchSequenceNo,
    batchSerialLabel,
  };
}

/**
 * Generate item-codes for a plan order based on plan items,
 * skipping variants that already have enough codes.
 */
export async function generateItemCodes(
  db: TenantPrismaClient,
  tenantId: string,
  planOrderId: string,
) {
  const plan = await db.planOrder.findUnique({
    where: { id: planOrderId },
    include: { items: true },
  });
  if (!plan) throw new AppError(404, '计划单不存在');

  if (plan.items.length === 0) {
    throw new AppError(400, '计划单无明细行，无法生成单品码');
  }

  const itemSpecs: Array<{ variantId: string | null; quantity: number }> = [];
  for (const item of plan.items) {
    itemSpecs.push({
      variantId: item.variantId,
      quantity: Math.floor(Number(item.quantity)),
    });
  }

  const existingCounts = await basePrisma.$queryRawUnsafe<
    Array<{ variant_id: string | null; cnt: bigint }>
  >(
    `SELECT variant_id, COUNT(*)::bigint AS cnt FROM item_codes
     WHERE tenant_id = $1::uuid AND plan_order_id = $2 AND status = 'ACTIVE' AND batch_id IS NULL
     GROUP BY variant_id`,
    tenantId,
    planOrderId,
  );
  const countMap = new Map<string, number>();
  for (const row of existingCounts) {
    countMap.set(row.variant_id ?? '__null__', Number(row.cnt));
  }

  const maxSerialResult = await basePrisma.$queryRawUnsafe<
    Array<{ max_sn: number | null }>
  >(
    `SELECT MAX(serial_no) AS max_sn FROM item_codes
     WHERE tenant_id = $1::uuid AND plan_order_id = $2`,
    tenantId,
    planOrderId,
  );
  let nextSerial = (maxSerialResult[0]?.max_sn ?? 0) + 1;

  const toInsert: Array<{
    id: string;
    tenantId: string;
    planOrderId: string;
    productId: string;
    variantId: string | null;
    serialNo: number;
    scanToken: string;
    status: string;
  }> = [];

  const byVariant: Array<{ variantId: string | null; count: number }> = [];

  for (const spec of itemSpecs) {
    const key = spec.variantId ?? '__null__';
    const existing = countMap.get(key) ?? 0;
    const needed = Math.max(0, spec.quantity - existing);
    byVariant.push({ variantId: spec.variantId, count: needed });

    for (let i = 0; i < needed; i++) {
      toInsert.push({
        id: genId('ic'),
        tenantId,
        planOrderId,
        productId: plan.productId,
        variantId: spec.variantId,
        serialNo: nextSerial++,
        scanToken: generateScanToken(),
        status: 'ACTIVE',
      });
    }
  }

  if (toInsert.length > 0) {
    await basePrisma.itemCode.createMany({ data: toInsert });
  }

  const totalForPlan = await db.itemCode.count({ where: { planOrderId } });

  return { generated: toInsert.length, totalForPlan, byVariant };
}
