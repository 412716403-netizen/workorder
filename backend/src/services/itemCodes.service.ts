import { Prisma } from '@prisma/client';
import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genUuidV7 } from '../utils/genId.js';
import {
  collectPlanTreeFromNode,
  generateScanToken,
  parseScanTokenTenantHexPrefix,
  scanTokenEqualsWhere,
  resolveTenantIdFromScanTokenPrefix,
  resolveCallerContext,
  resolveVariantLabel,
  verifyCollaborationAccess,
} from './planTreeQuota.service.js';
import { attachBatchPieceNos } from '../utils/itemCodeBatchPiece.js';
import { formatBatchSerialLabel, formatItemCodeSerialLabel } from '../../../shared/serialLabels.js';
import { SCAN_ITEM_CODE_IDS_KEY } from '../types/index.js';

const INSERT_CHUNK = 2000;

/**
 * 已为某规格生成「批次绑定的单品码」后，作废同计划、同规格下旧的「纯计划单品码」（batchId=null）。
 * 避免详情/打印列表里并存两套 ACTIVE 单品码；已印出的旧码扫码会提示已作废。
 */
export async function voidActivePlanLevelItemCodesForVariants(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  tenantId: string,
  planOrderId: string,
  variantIds: Array<string | null>,
): Promise<number> {
  const uniq: Array<string | null> = [];
  const seen = new Set<string>();
  for (const v of variantIds) {
    const key = v === null || v === undefined ? '' : v;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(v ?? null);
  }
  if (uniq.length === 0) return 0;
  let total = 0;
  for (const variantId of uniq) {
    const r = await tx.itemCode.updateMany({
      where: {
        tenantId,
        planOrderId,
        batchId: null,
        status: 'ACTIVE',
        variantId,
      },
      data: { status: 'VOIDED' },
    });
    total += r.count;
  }
  return total;
}

/** 删计划单前调用：无外键级联时由应用层清理码表 */
export async function deleteItemCodesAndVirtualBatchesForPlan(
  db: TenantPrismaClient,
  planOrderId: string,
): Promise<void> {
  await db.itemCode.deleteMany({ where: { planOrderId } });
  await db.planVirtualBatch.deleteMany({ where: { planOrderId } });
}

// ── public API ───────────────────────────────────────────────

export async function listItemCodes(
  db: TenantPrismaClient,
  opts: {
    planOrderId?: string;
    variantId?: string;
    batchId?: string;
    status?: string;
    all?: boolean;
    page?: number;
    pageSize?: number;
  },
) {
  const where: Record<string, unknown> = {};
  if (opts.planOrderId) where.planOrderId = opts.planOrderId;
  if (opts.variantId) where.variantId = opts.variantId === '__null__' ? null : opts.variantId;
  if (opts.batchId) where.batchId = opts.batchId;
  if (opts.status) where.status = opts.status;
  const orderBy = { serialNo: 'asc' as const };

  let items: Awaited<ReturnType<typeof db.itemCode.findMany>>;
  let total: number;
  let page: number;
  let pageSize: number;

  if (opts.all) {
    total = await db.itemCode.count({ where });
    items = await db.itemCode.findMany({ where, orderBy });
    page = 1;
    pageSize = total;
  } else {
    page = Math.max(1, opts.page ?? 1);
    pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
    const r = await Promise.all([
      db.itemCode.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.itemCode.count({ where }),
    ]);
    items = r[0];
    total = r[1];
  }

  const batchIds = [...new Set(items.map((i) => i.batchId).filter(Boolean))] as string[];
  let batchMap = new Map<string, { id: string; sequenceNo: number }>();
  if (batchIds.length > 0) {
    const batches = await db.planVirtualBatch.findMany({
      where: { id: { in: batchIds } },
      select: { id: true, sequenceNo: true },
    });
    batchMap = new Map(batches.map((b) => [b.id, b]));
  }

  // 分页时件号需跨页连续：以本页每个批次最小 serialNo 之前的件数作为基数，
  // 否则每页都从 1 重新编号（第 2 页会与第 1 页重号、并丢失后半段件号）。
  const baseOffsetByBatch = new Map<string, number>();
  for (const batchId of batchIds) {
    const minSerialInPage = Math.min(
      ...items.filter((i) => i.batchId === batchId).map((i) => i.serialNo),
    );
    baseOffsetByBatch.set(
      batchId,
      await db.itemCode.count({
        where: { batchId, serialNo: { lt: minSerialInPage } },
      }),
    );
  }

  const itemsOut = attachBatchPieceNos(
    items.map((row) => ({
      ...row,
      batch: row.batchId ? batchMap.get(row.batchId) ?? null : null,
    })),
    baseOffsetByBatch,
  );

  return { items: itemsOut, total, page, pageSize };
}

async function findItemCodeByScanToken(scanToken: string) {
  const prefix = parseScanTokenTenantHexPrefix(scanToken);
  if (!prefix) return null;
  const ownerTenantId = await resolveTenantIdFromScanTokenPrefix(prefix);
  if (!ownerTenantId) return null;
  return basePrisma.itemCode.findFirst({
    where: scanTokenEqualsWhere(ownerTenantId, scanToken),
  });
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

export async function scanItemCode(callerTenantId: string, token: string) {
  const code = await findItemCodeByScanToken(token);
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
  let batchPieceNo: number | null =
    code.batchPieceNo != null && code.batchPieceNo > 0 ? code.batchPieceNo : null;
  let batchSerialLabel: string | null = null;
  let batchScanToken: string | null = null;
  if (code.batchId) {
    if (batchPieceNo == null) {
      batchPieceNo = await basePrisma.itemCode.count({
        where: {
          tenantId: ownerTenantId,
          batchId: code.batchId,
          serialNo: { lte: code.serialNo },
        },
      });
    }
    const vb = await basePrisma.planVirtualBatch.findFirst({
      where: { tenantId: ownerTenantId, id: code.batchId! },
      select: { sequenceNo: true, planOrderId: true, scanToken: true },
    });
    if (vb) {
      const pl = await basePrisma.planOrder.findUnique({
        where: { id: vb.planOrderId },
        select: { planNumber: true },
      });
      batchSequenceNo = vb.sequenceNo;
      batchSerialLabel =
        pl?.planNumber != null ? formatBatchSerialLabel(pl.planNumber, vb.sequenceNo) : null;
      batchScanToken = vb.scanToken ?? null;
    }
  }

  const callerContext = await resolveCallerContext({
    callerTenantId,
    ownerTenantId,
    ownerPlanOrderId: code.planOrderId,
  });

  const planNumber = plan?.planNumber ?? null;
  const serialLabel =
    planNumber != null
      ? formatItemCodeSerialLabel(planNumber, code.serialNo, {
          batchSequenceNo,
          batchPieceNo,
        })
      : null;

  return {
    kind: 'ITEM_CODE' as const,
    itemCodeId: code.id,
    serialNo: code.serialNo,
    serialLabel,
    status: code.status,
    planOrderId: code.planOrderId,
    planNumber,
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
    batchPieceNo,
    batchSerialLabel,
    batchScanToken,
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

  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT 1 FROM plan_orders WHERE id = $1 AND tenant_id = $2::uuid FOR UPDATE`,
      planOrderId,
      tenantId,
    );

    const existingCounts = await tx.$queryRawUnsafe<
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

    const maxSerialResult = await tx.$queryRawUnsafe<Array<{ max_sn: number | null }>>(
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
          id: genUuidV7(),
          tenantId,
          planOrderId,
          productId: plan.productId,
          variantId: spec.variantId,
          serialNo: nextSerial++,
          scanToken: generateScanToken(tenantId),
          status: 'ACTIVE',
        });
      }
    }

    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      const chunk = toInsert.slice(i, i + INSERT_CHUNK);
      if (chunk.length > 0) {
        await tx.itemCode.createMany({ data: chunk });
      }
    }

    const totalForPlan = await tx.itemCode.count({ where: { planOrderId } });

    return { generated: toInsert.length, totalForPlan, byVariant };
  });
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

type TraceSqlRow = {
  ev_kind: string;
  sub_kind: string;
  ev_id: string;
  tenant_id: string;
  ts: Date;
  qty: unknown;
  order_id: string | null;
  order_number: string | null;
  node_name: string | null;
  operator: string | null;
  notes: string | null;
  partner: string | null;
  warehouse_id: string | null;
};

function mapSqlRowToTraceEvent(
  r: TraceSqlRow,
  tenantMap: Map<string, string | null>,
): TraceEventRow {
  const kind =
    r.ev_kind === 'REPORT'
      ? 'REPORT'
      : mapOpTypeToKind(r.sub_kind);
  return {
    kind,
    subKind: r.sub_kind,
    id: r.ev_id,
    tenantId: r.tenant_id,
    tenantName: tenantMap.get(r.tenant_id) ?? null,
    timestamp: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
    quantity: Number(r.qty),
    orderId: r.order_id,
    orderNumber: r.order_number,
    nodeName: r.node_name,
    operator: r.operator,
    notes: r.notes,
    partner: r.partner,
    warehouseId: r.warehouse_id,
  };
}

/** 仅展示扫码写入 virtual_batch_id / item_code_id 关联的生产事件 */
export type TraceScanLinkScope = {
  virtualBatchId: string | null;
  itemCodeId: string | null;
  notBefore: Date;
};

function traceScanLinkSql(alias: string, scope: TraceScanLinkScope): Prisma.Sql {
  const { virtualBatchId, itemCodeId } = scope;
  const a = Prisma.raw(alias);

  // 列匹配：批次码模式 / 老数据 / 非扫码记录沿用 virtual_batch_id / item_code_id 列。
  let columnCond: Prisma.Sql;
  if (virtualBatchId && itemCodeId) {
    columnCond = Prisma.sql`(${a}.virtual_batch_id = ${virtualBatchId}::uuid OR ${a}.item_code_id = ${itemCodeId}::uuid)`;
  } else if (virtualBatchId) {
    columnCond = Prisma.sql`${a}.virtual_batch_id = ${virtualBatchId}::uuid`;
  } else if (itemCodeId) {
    columnCond = Prisma.sql`${a}.item_code_id = ${itemCodeId}::uuid`;
  } else {
    return Prisma.sql`FALSE`;
  }

  // 仅按批次追溯（无具体单品码）时，直接用列：单品码模式记录仍写了 virtual_batch_id（去重所需），故也能命中整批。
  if (!itemCodeId) return columnCond;

  // 追溯具体单品码时：记录若带 __scanItemCodeIds（单品码模式逐件扫入列表），则仅按列表逐件精确匹配，
  // 使同批未扫入的单品不被误关联；否则（批次码模式/老数据）回退列匹配（整批共享链路）。
  const itemInListCond = Prisma.sql`(${a}.custom_data -> ${SCAN_ITEM_CODE_IDS_KEY}) @> to_jsonb(${itemCodeId}::text)`;
  return Prisma.sql`
    CASE
      WHEN jsonb_typeof(${a}.custom_data -> ${SCAN_ITEM_CODE_IDS_KEY}) = 'array'
           AND jsonb_array_length(${a}.custom_data -> ${SCAN_ITEM_CODE_IDS_KEY}) > 0
      THEN (${itemInListCond})
      ELSE (${columnCond})
    END
  `;
}

async function traceEventRowsPaged(params: {
  planIds: string[];
  tenantIds: string[];
  productId: string;
  variantId: string | null;
  orderIds: string[];
  page: number;
  pageSize: number;
  scanLinkScope?: TraceScanLinkScope;
}): Promise<{ rows: TraceEventRow[]; total: number }> {
  const { planIds, tenantIds, productId, variantId, orderIds, page, pageSize, scanLinkScope } = params;
  if (planIds.length === 0 || tenantIds.length === 0) {
    return { rows: [], total: 0 };
  }

  const offset = Math.max(0, (page - 1) * pageSize);
  const planList = Prisma.join(planIds);
  /** Prisma.join(tenantIds) 默认为 text；库表 tenant_id 为 uuid，须显式 cast */
  const tenantList = Prisma.join(tenantIds.map((id) => Prisma.sql`${id}::uuid`));
  const variantIsNull = variantId === null;
  const orderIdsEmpty = orderIds.length === 0;
  const variantCond = variantIsNull
    ? Prisma.sql`mr.variant_id IS NULL`
    : Prisma.sql`mr.variant_id = ${variantId}`;

  const opVariantCond = variantIsNull
    ? Prisma.sql`por.variant_id IS NULL`
    : Prisma.sql`por.variant_id = ${variantId}`;

  const pmpVariantCond = variantIsNull
    ? Prisma.sql`pmp.variant_id IS NULL`
    : Prisma.sql`pmp.variant_id = ${variantId}`;

  const opOrderCond = orderIdsEmpty
    ? Prisma.sql`TRUE`
    : Prisma.sql`(por.order_id IS NULL OR por.order_id IN (${Prisma.join(orderIds)}))`;

  const timeNotBefore = scanLinkScope?.notBefore;
  const mrTimeCond = timeNotBefore
    ? Prisma.sql`mr.timestamp >= ${timeNotBefore}`
    : Prisma.sql`TRUE`;
  const porTimeCond = timeNotBefore
    ? Prisma.sql`por.timestamp >= ${timeNotBefore}`
    : Prisma.sql`TRUE`;
  const pprTimeCond = timeNotBefore
    ? Prisma.sql`ppr.timestamp >= ${timeNotBefore}`
    : Prisma.sql`TRUE`;
  const mrLinkCond = scanLinkScope ? traceScanLinkSql('mr', scanLinkScope) : Prisma.sql`TRUE`;
  const porLinkCond = scanLinkScope ? traceScanLinkSql('por', scanLinkScope) : Prisma.sql`TRUE`;
  const pprLinkCond = scanLinkScope ? traceScanLinkSql('ppr', scanLinkScope) : Prisma.sql`TRUE`;

  const unionInner = Prisma.sql`
    (
      SELECT
        'REPORT'::text AS ev_kind,
        'MILESTONE_REPORT'::text AS sub_kind,
        mr.id::text AS ev_id,
        po.tenant_id::text AS tenant_id,
        mr.timestamp AS ts,
        mr.quantity AS qty,
        po.id::text AS order_id,
        po.order_number AS order_number,
        m.name AS node_name,
        mr.operator AS operator,
        mr.notes AS notes,
        NULL::text AS partner,
        NULL::text AS warehouse_id
      FROM milestone_reports mr
      INNER JOIN milestones m ON m.id = mr.milestone_id
      INNER JOIN production_orders po ON po.id = m.production_order_id
      WHERE po.plan_order_id IN (${planList})
        AND (${scanLinkScope ? Prisma.sql`TRUE` : variantCond})
        AND (${mrTimeCond})
        AND (${mrLinkCond})
        -- 外协收货派生的工序报工：OUTSOURCE 已收回记录已表达同一业务
        AND COALESCE(mr.custom_data ->> 'source', '') <> 'outsourceReceive'
    )
    UNION ALL
    (
      SELECT
        'OP'::text AS ev_kind,
        CASE
          WHEN por.type = 'OUTSOURCE' AND por.status = '已收回' THEN 'OUTSOURCE_RECEIVE'
          WHEN por.type = 'OUTSOURCE' THEN 'OUTSOURCE_DISPATCH'
          ELSE por.type
        END AS sub_kind,
        por.id::text AS ev_id,
        por.tenant_id::text AS tenant_id,
        por.timestamp AS ts,
        por.quantity AS qty,
        por.order_id::text AS order_id,
        po.order_number AS order_number,
        NULL::text AS node_name,
        por.operator AS operator,
        COALESCE(por.reason, por.doc_no) AS notes,
        por.partner AS partner,
        por.warehouse_id::text AS warehouse_id
      FROM production_op_records por
      LEFT JOIN production_orders po ON po.id = por.order_id
      WHERE por.tenant_id IN (${tenantList})
        AND por.product_id = ${productId}
        AND (${scanLinkScope ? Prisma.sql`TRUE` : opVariantCond})
        AND (${scanLinkScope ? Prisma.sql`TRUE` : opOrderCond})
        AND (${porTimeCond})
        AND (${porLinkCond})
        -- 委外返工收回：REWORK_REPORT 已表达同一业务，跳过镜像 OUTSOURCE 已收回（带 source_rework_id）
        AND NOT (por.type = 'OUTSOURCE' AND por.status = '已收回' AND por.source_rework_id IS NOT NULL)
    )
    UNION ALL
    (
      SELECT
        'REPORT'::text AS ev_kind,
        'PRODUCT_PROGRESS'::text AS sub_kind,
        ppr.id::text AS ev_id,
        pmp.tenant_id::text AS tenant_id,
        ppr.timestamp AS ts,
        ppr.quantity AS qty,
        NULL::text AS order_id,
        NULL::text AS order_number,
        gnt.name AS node_name,
        ppr.operator AS operator,
        ppr.notes AS notes,
        NULL::text AS partner,
        NULL::text AS warehouse_id
      FROM product_progress_reports ppr
      INNER JOIN product_milestone_progresses pmp ON pmp.id = ppr.progress_id
      LEFT JOIN global_node_templates gnt ON gnt.id = pmp.milestone_template_id
      WHERE pmp.tenant_id IN (${tenantList})
        AND pmp.product_id = ${productId}
        AND (${scanLinkScope ? Prisma.sql`TRUE` : pmpVariantCond})
        AND (${pprTimeCond})
        AND (${pprLinkCond})
        AND COALESCE(ppr.custom_data ->> 'source', '') <> 'outsourceReceive'
    )
  `;

  const countRows = await basePrisma.$queryRaw<Array<{ c: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS c FROM (${unionInner}) u
  `);
  const total = Number(countRows[0]?.c ?? 0n);

  const pageRows = await basePrisma.$queryRaw<TraceSqlRow[]>(Prisma.sql`
    SELECT * FROM (${unionInner}) u
    ORDER BY u.ts ASC, u.ev_id ASC
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const tenantRows = await basePrisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, name: true },
  });
  const tenantMap = new Map(tenantRows.map((t) => [t.id, t.name]));

  const rows = pageRows.map((r) => mapSqlRowToTraceEvent(r, tenantMap));
  return { rows, total };
}

async function buildTracePayloadPaged(params: {
  rootPlanOrderId: string;
  productId: string;
  variantId: string | null;
  page: number;
  pageSize: number;
  scanLinkScope?: TraceScanLinkScope;
  scopeNote?: string | null;
  itemSerialLabel?: string | null;
}): Promise<{
  events: TraceEventRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  tenants: Array<{ id: string; name: string | null }>;
  planTree: Array<{ id: string; tenantId: string; planNumber: string; parentPlanId: string | null }>;
  scopeNote?: string | null;
  itemSerialLabel?: string | null;
}> {
  const tree = await collectPlanTreeFromNode(params.rootPlanOrderId);
  const planIds = tree.map((n) => n.id);
  const tenantIds = Array.from(new Set(tree.map((n) => n.tenantId)));

  const tenants = await basePrisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, name: true },
  });

  const planTree = tree.map((n) => ({
    id: n.id,
    tenantId: n.tenantId,
    planNumber: n.planNumber,
    parentPlanId: n.parentPlanId,
  }));

  if (planIds.length === 0) {
    return {
      events: [],
      total: 0,
      page: params.page,
      pageSize: params.pageSize,
      hasMore: false,
      tenants: tenants.map((t) => ({ id: t.id, name: t.name })),
      planTree,
      scopeNote: params.scopeNote ?? null,
      itemSerialLabel: params.itemSerialLabel ?? null,
    };
  }

  const orders = await basePrisma.productionOrder.findMany({
    where: { planOrderId: { in: planIds } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  const { rows, total } = await traceEventRowsPaged({
    planIds,
    tenantIds,
    productId: params.productId,
    variantId: params.variantId,
    orderIds,
    page: params.page,
    pageSize: params.pageSize,
    scanLinkScope: params.scanLinkScope,
  });

  const hasMore = params.page * params.pageSize < total;

  return {
    events: rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    hasMore,
    tenants: tenants.map((t) => ({ id: t.id, name: t.name })),
    planTree,
    scopeNote: params.scopeNote ?? null,
    itemSerialLabel: params.itemSerialLabel ?? null,
  };
}

export async function traceItemCode(
  callerTenantId: string,
  token: string,
  page = 1,
  pageSize = 50,
) {
  const code = await findItemCodeByScanToken(token);
  if (!code) throw new AppError(404, '单品码不存在');
  if (!(await verifyCollaborationAccess(callerTenantId, code.tenantId))) {
    throw new AppError(403, '无权追溯该单品码');
  }
  const p = Math.max(1, page);
  const ps = Math.min(200, Math.max(1, pageSize));
  const variantId =
    code.variantId != null && String(code.variantId).trim() !== ''
      ? String(code.variantId).trim()
      : null;
  const planNumber = (await basePrisma.planOrder.findUnique({
    where: { id: code.planOrderId },
    select: { planNumber: true },
  }))?.planNumber;
  let batchSequenceNo: number | null = null;
  let batchPieceNo: number | null = code.batchPieceNo ?? null;
  let batchCreatedAt: Date | null = null;
  let batchSerialLabel: string | null = null;
  if (code.batchId) {
    const vb = await basePrisma.planVirtualBatch.findFirst({
      where: { tenantId: code.tenantId, id: code.batchId },
      select: { sequenceNo: true, createdAt: true },
    });
    batchSequenceNo = vb?.sequenceNo ?? null;
    batchCreatedAt = vb?.createdAt ?? null;
    if (planNumber != null && batchSequenceNo != null) {
      batchSerialLabel = formatBatchSerialLabel(planNumber, batchSequenceNo);
    }
    if (batchPieceNo == null || batchPieceNo <= 0) {
      batchPieceNo = await basePrisma.itemCode.count({
        where: {
          tenantId: code.tenantId,
          batchId: code.batchId,
          serialNo: { lte: code.serialNo },
        },
      });
    }
  }
  const itemSerialLabel =
    planNumber != null
      ? formatItemCodeSerialLabel(planNumber, code.serialNo, {
          batchSequenceNo,
          batchPieceNo,
        })
      : null;

  /** 有批次时以批次生成时刻为下界；无批次则用单品码生成时刻 */
  const notBefore = batchCreatedAt ?? code.createdAt;

  const scopeNote = batchSerialLabel
    ? itemSerialLabel
      ? `单品码 ${itemSerialLabel}（所属批次 ${batchSerialLabel}）：仅显示扫码报工/扫码入库时写入关联的生产事件；同批次下各单品码共享该链路。`
      : `所属批次 ${batchSerialLabel}：仅显示扫码关联的生产事件。`
    : itemSerialLabel
      ? `单品码 ${itemSerialLabel}：仅显示扫码关联的生产事件。`
      : '仅显示扫码关联的生产事件。';

  return buildTracePayloadPaged({
    rootPlanOrderId: code.planOrderId,
    productId: code.productId,
    variantId,
    page: p,
    pageSize: ps,
    scanLinkScope: {
      virtualBatchId: code.batchId ?? null,
      itemCodeId: code.id,
      notBefore,
    },
    scopeNote,
    itemSerialLabel,
  });
}

export async function traceVirtualBatch(
  _callerTenantId: string,
  _token: string,
  _page = 1,
  _pageSize = 50,
) {
  throw new AppError(400, '产品追溯仅支持单品码，请勿扫批次码');
}
