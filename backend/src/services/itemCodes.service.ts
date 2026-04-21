import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';
import {
  collectPlanTreeFromNode,
  generateScanToken,
  resolveCallerContext,
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

export async function scanItemCode(callerTenantId: string, token: string) {
  const code = await basePrisma.itemCode.findUnique({ where: { scanToken: token } });
  if (!code) throw new AppError(404, '单品码不存在');

  const ownerTenantId = code.tenantId;
  if (!(await verifyCollaborationAccess(callerTenantId, ownerTenantId))) {
    throw new AppError(403, '无权访问该单品码');
  }

  if (code.status === 'VOIDED') {
    return { kind: 'ITEM_CODE' as const, status: 'VOIDED' as const, message: '该单品码已作废' };
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

  const callerContext = await resolveCallerContext({
    callerTenantId,
    ownerTenantId,
    ownerPlanOrderId: code.planOrderId,
  });

  return {
    kind: 'ITEM_CODE' as const,
    itemCodeId: code.id,
    serialNo: code.serialNo,
    status: code.status,
    planOrderId: code.planOrderId,
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
    callerContext,
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

// ── 追溯时间轴（按产品 + 规格 + 计划树聚合）────────────────────

export type TraceEventKind =
  | 'REPORT'
  | 'OUTSOURCE'
  | 'REWORK'
  | 'STOCK'
  | 'TRANSFER'
  | 'OTHER';

export interface TraceEventRow {
  kind: TraceEventKind;
  subKind: string;
  id: string;
  tenantId: string;
  tenantName: string | null;
  timestamp: string;
  quantity: number;
  orderId?: string | null;
  orderNumber?: string | null;
  nodeName?: string | null;
  operator?: string | null;
  notes?: string | null;
  partner?: string | null;
  warehouseId?: string | null;
}

function mapOpTypeToKind(type: string): TraceEventKind {
  const t = type.toUpperCase();
  if (t === 'OUTSOURCE' || t.includes('OUTSOURCE')) return 'OUTSOURCE';
  if (t === 'REWORK' || t.startsWith('REWORK')) return 'REWORK';
  if (t === 'STOCK_IN' || t === 'STOCK_OUT' || t.startsWith('STOCK')) return 'STOCK';
  if (t === 'TRANSFER' || t.includes('TRANSFER')) return 'TRANSFER';
  return 'OTHER';
}

async function buildTraceByPlanTree(params: {
  rootPlanOrderId: string;
  productId: string;
  variantId: string | null;
}): Promise<{
  events: TraceEventRow[];
  tenants: Array<{ id: string; name: string | null }>;
  planTree: Array<{ id: string; tenantId: string; planNumber: string; parentPlanId: string | null }>;
}> {
  const tree = await collectPlanTreeFromNode(params.rootPlanOrderId);
  const planIds = tree.map((n) => n.id);
  const tenantIds = Array.from(new Set(tree.map((n) => n.tenantId)));

  const [tenants, orders] = await Promise.all([
    basePrisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true },
    }),
    basePrisma.productionOrder.findMany({
      where: { planOrderId: { in: planIds } },
      select: { id: true, orderNumber: true, tenantId: true, productId: true },
    }),
  ]);
  const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));
  const orderIds = orders.map((o) => o.id);
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const milestones =
    orderIds.length > 0
      ? await basePrisma.milestone.findMany({
          where: { productionOrderId: { in: orderIds } },
          select: { id: true, name: true, productionOrderId: true },
        })
      : [];
  const milestoneMap = new Map(milestones.map((m) => [m.id, m]));
  const milestoneIds = milestones.map((m) => m.id);

  const reportWhere: { milestoneId: { in: string[] }; variantId?: string | null } = {
    milestoneId: { in: milestoneIds },
  };
  if (params.variantId != null) reportWhere.variantId = params.variantId;
  else reportWhere.variantId = null;

  const reports =
    milestoneIds.length > 0
      ? await basePrisma.milestoneReport.findMany({
          where: reportWhere,
          select: {
            id: true,
            milestoneId: true,
            timestamp: true,
            operator: true,
            quantity: true,
            variantId: true,
            notes: true,
          },
        })
      : [];

  const opRecords = await basePrisma.productionOpRecord.findMany({
    where: {
      tenantId: { in: tenantIds },
      productId: params.productId,
      variantId: params.variantId ?? null,
      ...(orderIds.length > 0
        ? { OR: [{ orderId: { in: orderIds } }, { orderId: null }] }
        : {}),
    },
    select: {
      id: true,
      tenantId: true,
      type: true,
      orderId: true,
      quantity: true,
      reason: true,
      partner: true,
      operator: true,
      timestamp: true,
      nodeId: true,
      warehouseId: true,
      docNo: true,
    },
  });

  const events: TraceEventRow[] = [];

  for (const r of reports) {
    const ms = milestoneMap.get(r.milestoneId);
    const order = ms ? orderMap.get(ms.productionOrderId) : undefined;
    const tid = order?.tenantId ?? '';
    events.push({
      kind: 'REPORT',
      subKind: 'MILESTONE_REPORT',
      id: r.id,
      tenantId: tid,
      tenantName: tenantMap.get(tid) ?? null,
      timestamp: r.timestamp.toISOString(),
      quantity: Number(r.quantity),
      orderId: order?.id ?? null,
      orderNumber: order?.orderNumber ?? null,
      nodeName: ms?.name ?? null,
      operator: r.operator ?? null,
      notes: r.notes ?? null,
    });
  }

  for (const op of opRecords) {
    const order = op.orderId ? orderMap.get(op.orderId) : undefined;
    events.push({
      kind: mapOpTypeToKind(op.type),
      subKind: op.type,
      id: op.id,
      tenantId: op.tenantId,
      tenantName: tenantMap.get(op.tenantId) ?? null,
      timestamp: op.timestamp.toISOString(),
      quantity: Number(op.quantity),
      orderId: op.orderId ?? null,
      orderNumber: order?.orderNumber ?? null,
      operator: op.operator ?? null,
      partner: op.partner ?? null,
      warehouseId: op.warehouseId ?? null,
      notes: op.reason ?? op.docNo ?? null,
    });
  }

  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    events,
    tenants: tenants.map((t) => ({ id: t.id, name: t.name })),
    planTree: tree.map((n) => ({
      id: n.id,
      tenantId: n.tenantId,
      planNumber: n.planNumber,
      parentPlanId: n.parentPlanId,
    })),
  };
}

export async function traceItemCode(callerTenantId: string, token: string) {
  const code = await basePrisma.itemCode.findUnique({ where: { scanToken: token } });
  if (!code) throw new AppError(404, '单品码不存在');
  if (!(await verifyCollaborationAccess(callerTenantId, code.tenantId))) {
    throw new AppError(403, '无权追溯该单品码');
  }
  return buildTraceByPlanTree({
    rootPlanOrderId: code.planOrderId,
    productId: code.productId,
    variantId: code.variantId ?? null,
  });
}

export async function traceVirtualBatch(callerTenantId: string, token: string) {
  const batch = await basePrisma.planVirtualBatch.findUnique({ where: { scanToken: token } });
  if (!batch) throw new AppError(404, '批次码不存在');
  if (!(await verifyCollaborationAccess(callerTenantId, batch.tenantId))) {
    throw new AppError(403, '无权追溯该批次码');
  }
  return buildTraceByPlanTree({
    rootPlanOrderId: batch.planOrderId,
    productId: batch.productId,
    variantId: batch.variantId ?? null,
  });
}
