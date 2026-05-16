import { Prisma } from '@prisma/client';
import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { generateDocNo, generateDocNoWithLock } from '../utils/docNumber.js';
import {
  nextOutsourceDocNoForPartner,
  nextOutsourceDocNoForPartnerTx,
} from '../utils/partnerDocNumberServer.js';
import { genId } from '../utils/genId.js';
import { sanitizeUpdate, sanitizeCreate, normalizeDates } from '../utils/request.js';
import { calcUsageByWeight } from '../utils/bomMaterialUsageByWeight.js';
import { withSerializableRetry } from '../utils/withSerializableRetry.js';
import {
  validateStockOutBatchOnWrite,
  validateStockReturnBatchOnWrite,
} from './productionStockBatchWriteValidation.js';
import {
  assertScanNotAlreadyUsed,
  type ScanValidatePurpose,
  type ScanValidateScope,
} from './scanValidate.service.js';

/**
 * 外协收回 / 生产报工等"按 BOM 占比把录入的本次交货总重量分摊为各子物料实际消耗"的统一算子。
 * 返回 weight + materialBreakdown，若不满足前置条件（节点未开启、没传 weight、没 BOM 可用）则返回 null。
 */
async function buildOpWeightBreakdown(opts: {
  productId: string;
  nodeId: string;
  variantId?: string | null;
  quantity: number;
  weight?: unknown;
}): Promise<{ weight: number; materialBreakdown: unknown } | null> {
  const rawWeight = typeof opts.weight === 'number'
    ? opts.weight
    : typeof opts.weight === 'string' && opts.weight !== ''
      ? parseFloat(opts.weight)
      : null;
  if (rawWeight == null || !Number.isFinite(rawWeight) || rawWeight <= 0) return null;

  const node = await basePrisma.globalNodeTemplate.findUnique({
    where: { id: opts.nodeId },
    select: { enableWeightOnReport: true },
  });
  if (!node?.enableWeightOnReport) return null;

  const boms = await basePrisma.bom.findMany({
    where: { parentProductId: opts.productId, nodeId: opts.nodeId },
    include: { items: true },
  });
  if (boms.length === 0) return { weight: rawWeight, materialBreakdown: null };

  const variantId = opts.variantId || null;
  const exactBom = variantId ? boms.find(b => b.variantId === variantId) : undefined;
  const chosen = exactBom ?? boms.find(b => !b.variantId) ?? boms[0];

  const childIds = chosen.items.map(it => it.productId);
  const children = childIds.length
    ? await basePrisma.product.findMany({ where: { id: { in: childIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(children.map(p => [p.id, p.name]));

  const breakdown = calcUsageByWeight(
    chosen.items.map(it => ({
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

/**
 * 由生产流水的 type/status 推出扫码去重的 purpose 与作用域。
 * 仅当传入的 record 带 itemCodeId / virtualBatchId 时才有意义。
 */
async function assertScanForRecord(
  tenantId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const itemCodeId = (data.itemCodeId as string | undefined) ?? null;
  const virtualBatchId = (data.virtualBatchId as string | undefined) ?? null;
  if (!itemCodeId && !virtualBatchId) return;

  let purpose: ScanValidatePurpose | null = null;
  const scope: ScanValidateScope = {};
  const type = String(data.type ?? '');
  if (type === 'STOCK_IN') {
    purpose = 'STOCK_IN';
    if (data.orderId) scope.orderId = String(data.orderId);
  } else if (type === 'REWORK_REPORT') {
    purpose = 'REWORK_REPORT';
    if (data.sourceReworkId) scope.sourceReworkId = String(data.sourceReworkId);
    if (data.nodeId) scope.nodeId = String(data.nodeId);
  } else if (type === 'OUTSOURCE' && data.status === '已收回' && !data.sourceReworkId) {
    purpose = 'OUTSOURCE_RECEIVE';
    if (data.orderId) scope.orderId = String(data.orderId);
    if (data.productId) scope.productId = String(data.productId);
    if (data.partner) scope.partner = String(data.partner);
    if (data.docNo) scope.docNo = String(data.docNo);
  }
  if (!purpose) return;
  await assertScanNotAlreadyUsed(tenantId, purpose, scope, { itemCodeId, virtualBatchId });
}

const DOC_PREFIX: Record<string, string> = {
  STOCK_OUT: 'LL',
  STOCK_RETURN: 'TL',
  STOCK_IN: 'RK',
  OUTSOURCE: 'WX',
  REWORK: 'FG',
  REWORK_REPORT: 'FGBG',
  SCRAP: 'BS',
};

/** 外协收回等写入时把 unitPrice / amount 规范为 Prisma Decimal */
function normalizeMoneyFields(data: Record<string, unknown>): void {
  for (const key of ['unitPrice', 'amount'] as const) {
    if (!(key in data) || data[key] == null || data[key] === '') continue;
    const n = Number(data[key]);
    if (!Number.isFinite(n)) {
      delete data[key];
      continue;
    }
    data[key] = new Prisma.Decimal(n);
  }
}

export interface ProductionListFilter {
  type?: string;
  /** Phase 3.C：支持多 type 窄拉（容器层按 tab 选择 ['STOCK_OUT','STOCK_RETURN'] 等） */
  types?: string[];
  orderId?: string;
  /** 工单中心等：多工单 id 窄拉（与 productIds 组合时为 OR 作用域） */
  orderIds?: string[];
  productId?: string;
  /** 关联产品模式外协/返工（无 orderId）及按产品汇总的 STOCK_IN */
  productIds?: string[];
  /** 关联产品模式领退料：按"成品" sourceProductId 收口（无 orderId，productId 为物料 id） */
  sourceProductIds?: string[];
  workerId?: string;
  partner?: string;
  status?: string;
  docNo?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

function buildProductionWhere(opts: ProductionListFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (opts.types && opts.types.length > 0) {
    where.type = { in: opts.types };
  } else if (opts.type) {
    where.type = opts.type;
  }
  const orderIds = (opts.orderIds ?? []).filter(Boolean);
  const productIds = (opts.productIds ?? []).filter(Boolean);
  const sourceProductIds = (opts.sourceProductIds ?? []).filter(Boolean);
  if (orderIds.length > 0 || productIds.length > 0 || sourceProductIds.length > 0) {
    const orBranches: Record<string, unknown>[] = [];
    if (orderIds.length > 0) {
      orBranches.push({ orderId: { in: orderIds } });
    }
    if (productIds.length > 0) {
      orBranches.push({
        AND: [
          { productId: { in: productIds } },
          { orderId: null },
          { type: { in: ['OUTSOURCE', 'REWORK'] } },
        ],
      });
      orBranches.push({
        AND: [{ productId: { in: productIds } }, { type: 'STOCK_IN' }],
      });
    }
    if (sourceProductIds.length > 0) {
      // 关联产品模式领退料：写入时 productId=物料、sourceProductId=成品、orderId=null；
      // 按成品 id 命中所有相关 STOCK_OUT/STOCK_RETURN。
      orBranches.push({ sourceProductId: { in: sourceProductIds } });
    }
    if (orBranches.length === 1) {
      Object.assign(where, orBranches[0]);
    } else {
      const existingAnd = Array.isArray(where.AND) ? (where.AND as Record<string, unknown>[]) : [];
      where.AND = [...existingAnd, { OR: orBranches }];
    }
  } else {
    if (opts.orderId) where.orderId = opts.orderId;
    if (opts.productId) where.productId = opts.productId;
  }
  if (opts.workerId) where.workerId = opts.workerId;
  if (opts.partner) where.partner = { contains: opts.partner, mode: 'insensitive' };
  if (opts.status) where.status = opts.status;
  if (opts.docNo) where.docNo = opts.docNo;

  if (opts.startDate || opts.endDate) {
    const ts: Record<string, Date> = {};
    if (opts.startDate) {
      const d = new Date(opts.startDate);
      if (!Number.isNaN(d.getTime())) ts.gte = d;
    }
    if (opts.endDate) {
      const d = new Date(opts.endDate);
      if (!Number.isNaN(d.getTime())) ts.lte = d;
    }
    if (Object.keys(ts).length) where.timestamp = ts;
  }
  if (opts.search) {
    where.OR = [
      { docNo: { contains: opts.search, mode: 'insensitive' } },
      { partner: { contains: opts.search, mode: 'insensitive' } },
      { reason: { contains: opts.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export async function listRecords(
  db: TenantPrismaClient,
  opts: ProductionListFilter & {
    all?: boolean;
    page?: number;
    pageSize?: number;
  },
) {
  const where = buildProductionWhere(opts);
  const orderBy: any = [{ timestamp: 'desc' }, { id: 'asc' }];

  if (opts.all) {
    return db.productionOpRecord.findMany({ where, orderBy });
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.productionOpRecord.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.productionOpRecord.count({ where }),
  ]);
  return { data, total, page, pageSize };
}

/**
 * Phase 3.C：生产报工汇总接口。
 * - `byType`：按操作类型（STOCK_OUT/STOCK_RETURN/STOCK_IN/OUTSOURCE/REWORK/SCRAP 等）的数量/重量合计、笔数
 * - `byStatus`：`type × status`（外协是否收回、报工是否结算等）的笔数
 * - `byWorker`：按工人聚合数量与重量，topN
 * - `byPartner`：按外协合作单位聚合数量与重量，topN
 * 与列表口径完全一致（同一 `filter`），用于报工模块"经营分析 / 看板"类页面。
 */
export async function summarize(
  db: TenantPrismaClient,
  opts: ProductionListFilter & { topWorkers?: number; topPartners?: number },
) {
  const where = buildProductionWhere(opts);
  const topWorkers = Math.min(Math.max(1, opts.topWorkers ?? 10), 50);
  const topPartners = Math.min(Math.max(1, opts.topPartners ?? 10), 50);

  const [byType, byStatus, byWorker, byPartner] = await Promise.all([
    db.productionOpRecord.groupBy({
      by: ['type'],
      where,
      _sum: { quantity: true, weight: true },
      _count: { _all: true },
    }),
    db.productionOpRecord.groupBy({
      by: ['type', 'status'],
      where,
      _count: { _all: true },
    }),
    db.productionOpRecord.groupBy({
      by: ['workerId'],
      where: { ...where, workerId: { not: null } },
      _sum: { quantity: true, weight: true },
      _count: { _all: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: topWorkers,
    }),
    db.productionOpRecord.groupBy({
      by: ['partner'],
      where: { ...where, partner: { not: null } },
      _sum: { quantity: true, weight: true },
      _count: { _all: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: topPartners,
    }),
  ]);

  return {
    byType: byType.map(r => ({
      type: r.type,
      quantity: Number(r._sum.quantity ?? 0),
      weight: Number(r._sum.weight ?? 0),
      count: r._count._all,
    })),
    byStatus: byStatus.map(r => ({
      type: r.type,
      status: r.status,
      count: r._count._all,
    })),
    byWorker: byWorker.map(r => ({
      workerId: r.workerId,
      quantity: Number(r._sum.quantity ?? 0),
      weight: Number(r._sum.weight ?? 0),
      count: r._count._all,
    })),
    byPartner: byPartner.map(r => ({
      partner: r.partner,
      quantity: Number(r._sum.quantity ?? 0),
      weight: Number(r._sum.weight ?? 0),
      count: r._count._all,
    })),
  };
}

export async function getRecord(db: TenantPrismaClient, id: string) {
  return db.productionOpRecord.findUnique({ where: { id } });
}

export async function createRecord(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
  tenantId?: string,
  /** `createRecordBatch` 已在外层 `basePrisma.$transaction` 内调用本函数时传入：此时 `db` 为事务内的 `tx`，无 `$transaction` 方法，不可再套一层。 */
  opts?: { skipNestedStockTransaction?: boolean },
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('prodop');
  normalizeDates(data);
  normalizeMoneyFields(data);
  if (!data.timestamp) data.timestamp = new Date();
  // sanitizeCreate 会剥掉 tenantId，正常情况下 getTenantPrisma 的 Proxy 会自动回填；
  // 但 createRecordBatch 内部把裸 $transaction 的 tx 强转成 TenantPrismaClient 传进来，
  // 那条路径上 Proxy 不生效，Prisma 就会抛 "Argument `tenantId` is missing"。
  // 这里显式回填一次，对 Proxy 路径只是重复赋值，无副作用。
  if (tenantId && !data.tenantId) data.tenantId = tenantId;

  if (!data.docNo) {
    if (data.type === 'OUTSOURCE' && data.partner && tenantId) {
      const kind = data.status === '已收回' ? 'receive' : 'dispatch';
      data.docNo = await nextOutsourceDocNoForPartner(tenantId, kind, String(data.partner));
    } else if (DOC_PREFIX[data.type as string]) {
      data.docNo = await generateDocNo(
        DOC_PREFIX[data.type as string],
        'production_op_records',
        'doc_no',
        tenantId,
      );
    }
  }

  // 扫码去重兜底（STOCK_IN / REWORK_REPORT / OUTSOURCE 已收回）
  if (tenantId) {
    await assertScanForRecord(tenantId, data);
  }

  /**
   * 外协收回 / 返工报工若工序开启称重，则在此统一计算 materialBreakdown，同时写到 OpRecord 和随后派生的 milestone/PMP 报工里。
   * 其他类型（领退料等）即便传了 weight 也不会分摊。
   */
  const isWeightSusceptible =
    (data.type === 'OUTSOURCE' && data.status === '已收回' && !data.sourceReworkId) ||
    data.type === 'REWORK_REPORT';
  if (isWeightSusceptible && data.productId && data.nodeId) {
    const payload = await buildOpWeightBreakdown({
      productId: String(data.productId),
      nodeId: String(data.nodeId),
      variantId: (data.variantId as string | null | undefined) ?? null,
      quantity: Number(data.quantity) || 0,
      weight: (data as Record<string, unknown>).weight,
    });
    if (payload) {
      data.weight = payload.weight;
      data.materialBreakdown = payload.materialBreakdown as any;
    }
  }

  const stockish = data.type === 'STOCK_OUT' || data.type === 'STOCK_RETURN';
  const record = stockish
    ? opts?.skipNestedStockTransaction
      ? await (async () => {
          await validateStockReturnBatchOnWrite(db, data as Record<string, unknown>);
          await validateStockOutBatchOnWrite(db, data as Record<string, unknown>, undefined);
          return db.productionOpRecord.create({ data: data as any });
        })()
      : await withSerializableRetry(() =>
          db.$transaction(
            async tx => {
              const txDb = tx as unknown as TenantPrismaClient;
              await validateStockReturnBatchOnWrite(txDb, data as Record<string, unknown>);
              await validateStockOutBatchOnWrite(txDb, data as Record<string, unknown>, undefined);
              return tx.productionOpRecord.create({ data: data as any });
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              maxWait: 10_000,
              timeout: 60_000,
            },
          ),
        )
    : await (async () => {
        await validateStockReturnBatchOnWrite(db, data as Record<string, unknown>);
        await validateStockOutBatchOnWrite(db, data as Record<string, unknown>, undefined);
        return db.productionOpRecord.create({ data });
      })();

  if (data.type === 'OUTSOURCE' && data.status === '已收回' && !data.sourceReworkId) {
    await applyOutsourceProgress({ ...record, tenantId: tenantId ?? null });
  }

  return record;
}

/**
 * 批量写入生产流水。
 *
 * 关键语义：当传入的一批记录"同 type、同 OUTSOURCE partner（或非 OUTSOURCE）、全部缺省 docNo"时，
 * 在服务端**先**统一分配一个 docNo 给整批共享；再依次走 `createRecord` 跑各自的副作用
 * （称重快照 / OUTSOURCE 进度回写 / 库存校验等）。
 *
 * 解决前端基于 stale 缓存自算 docNo 导致的"两次批量入库串号 / 加合"问题
 * （表现：第二张单的明细被并到上一张 docNo 下，待入库列表也没有及时消失）。
 *
 * Phase 3.E follow-up（并发安全 + 原子性）：
 * 1. **整批包一个 $transaction**：任一条 insert 失败 → 全部回滚，不再留半成品。
 * 2. **docNo 分配在事务内 + 持 advisory lock**：lock 持续到所有 insert 完成才释放，
 *    彻底闭合"取号→insert"之间的 race window，PM2 cluster / 多副本下也不会串号。
 * 3. 与单条 `createRecord` 走的同一个 lock key（`production_op_records:doc_no:<prefix>`
 *    / `outsource:<prefix>:<partner>`），跨入口完全互斥。
 *
 * 注：内部仍走 `createRecord(tx, ..., { skipNestedStockTransaction: true })` 复用所有既有副作用。
 * 事务内的 `tx` 没有 `$transaction` 方法，故领退料分支必须跳过内层再开事务（否则报
 * `db.$transaction is not a function`）。
 */
export async function createRecordBatch(
  db: TenantPrismaClient,
  records: Record<string, unknown>[],
  tenantId?: string,
) {
  if (!Array.isArray(records) || records.length === 0) return [];

  const types = new Set(records.map(r => r.type));
  const hasDocNo = records.some(r => r.docNo != null && String(r.docNo).trim() !== '');
  const allSameType = types.size === 1;
  const onlyType = allSameType ? String([...types][0]) : '';
  const partners = new Set(records.map(r => (r.partner ?? '') as string));
  const isOutsource = onlyType === 'OUTSOURCE';
  const sharePartner = isOutsource ? partners.size === 1 : true;
  const canShareDocNo = !hasDocNo && allSameType && sharePartner;

  return basePrisma.$transaction(
    async tx => {
      const txDb = tx as unknown as TenantPrismaClient;
      let sharedDocNo: string | null = null;
      if (canShareDocNo) {
        if (isOutsource && tenantId) {
          const partner = ([...partners][0] || '').trim();
          if (partner) {
            const kind = records.every(r => r.status === '已收回') ? 'receive' : 'dispatch';
            sharedDocNo = await nextOutsourceDocNoForPartnerTx(tx, tenantId, kind, partner);
          }
        } else if (DOC_PREFIX[onlyType]) {
          sharedDocNo = await generateDocNoWithLock(
            tx,
            DOC_PREFIX[onlyType],
            'production_op_records',
            'doc_no',
            tenantId,
          );
        }
      }

      const out: unknown[] = [];
      for (const r of records) {
        const body = { ...r };
        if (!body.docNo && sharedDocNo) body.docNo = sharedDocNo;
        out.push(await createRecord(txDb, body, tenantId, { skipNestedStockTransaction: true }));
      }
      return out;
    },
    {
      // STOCK_IN/OUTSOURCE 等批量写入可能触发库存批次校验与外协进度回写，预留较长超时。
      maxWait: 10_000,
      timeout: 60_000,
    },
  );
}

export async function updateRecord(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const oldRecord = await db.productionOpRecord.findUnique({ where: { id } });
  if (!oldRecord) return null;

  const data = sanitizeUpdate(body);
  normalizeDates(data);
  normalizeMoneyFields(data);

  const stockishUpdate = oldRecord.type === 'STOCK_OUT' || oldRecord.type === 'STOCK_RETURN';

  const record = stockishUpdate
    ? await withSerializableRetry(() =>
        db.$transaction(
          async tx => {
            const txDb = tx as unknown as TenantPrismaClient;
            if (oldRecord.type === 'STOCK_OUT') {
              const merged: Record<string, unknown> = {
                type: 'STOCK_OUT',
                productId: data.productId !== undefined ? data.productId : oldRecord.productId,
                warehouseId: data.warehouseId !== undefined ? data.warehouseId : oldRecord.warehouseId ?? '',
                batchNo:
                  data.batchNo !== undefined
                    ? data.batchNo
                    : (oldRecord as { batchNo?: string | null }).batchNo,
                quantity: data.quantity !== undefined ? data.quantity : oldRecord.quantity,
              };
              await validateStockOutBatchOnWrite(txDb, merged, oldRecord.id);
              if (typeof merged.batchNo === 'string' && merged.batchNo) {
                (data as Record<string, unknown>).batchNo = merged.batchNo;
              }
            }
            if (oldRecord.type === 'STOCK_RETURN') {
              const mergedRet: Record<string, unknown> = {
                type: 'STOCK_RETURN',
                productId: data.productId !== undefined ? data.productId : oldRecord.productId,
                warehouseId: data.warehouseId !== undefined ? data.warehouseId : oldRecord.warehouseId ?? '',
                batchNo:
                  data.batchNo !== undefined
                    ? data.batchNo
                    : (oldRecord as { batchNo?: string | null }).batchNo,
                quantity: data.quantity !== undefined ? data.quantity : oldRecord.quantity,
              };
              await validateStockReturnBatchOnWrite(txDb, mergedRet);
              if (typeof mergedRet.batchNo === 'string' && mergedRet.batchNo) {
                (data as Record<string, unknown>).batchNo = mergedRet.batchNo;
              }
            }
            return tx.productionOpRecord.update({ where: { id }, data });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 60_000,
          },
        ),
      )
    : await db.productionOpRecord.update({ where: { id }, data });

  if (oldRecord.type === 'OUTSOURCE' && oldRecord.status === '已收回' && oldRecord.docNo) {
    await syncOutsourceReportOnUpdate(oldRecord, record);
  }

  return record;
}

export async function deleteRecord(db: TenantPrismaClient, id: string) {
  const record = await db.productionOpRecord.findUnique({ where: { id } });
  if (!record) return null;

  await db.productionOpRecord.delete({ where: { id } });

  if (record.type === 'OUTSOURCE' && record.status === '已收回' && record.docNo) {
    await removeOutsourceProgress(record);
  }

  return { message: '已删除' };
}

export async function getDefectiveRework(db: TenantPrismaClient) {
  const [milestones, defectiveAgg, reworkRecords] = await Promise.all([
    db.milestone.findMany({ select: { id: true, templateId: true, productionOrderId: true } }),
    basePrisma.milestoneReport.groupBy({
      by: ['milestoneId'],
      _sum: { defectiveQuantity: true },
      having: { defectiveQuantity: { _sum: { gt: 0 } } },
    }),
    db.productionOpRecord.findMany({
      where: { type: { in: ['REWORK', 'REWORK_REPORT'] } },
      select: { orderId: true, sourceNodeId: true, nodeId: true, quantity: true },
    }),
  ]);

  const msMap = new Map(milestones.map(m => [m.id, m]));
  const defectiveByMs = new Map(defectiveAgg.map(a => [a.milestoneId, Number(a._sum?.defectiveQuantity || 0)]));

  const result: Record<string, { defective: number; rework: number }> = {};

  for (const ms of milestones) {
    const key = `${ms.productionOrderId}|${ms.templateId}`;
    const defective = defectiveByMs.get(ms.id) || 0;
    const rework = reworkRecords
      .filter(r => r.orderId === ms.productionOrderId && (r.sourceNodeId === ms.templateId || r.nodeId === ms.templateId))
      .reduce((s, r) => s + Number(r.quantity), 0);
    if (defective > 0 || rework > 0) {
      result[key] = { defective, rework };
    }
  }
  return result;
}

// ── outsource progress helpers (kept as-is from original controller) ──

export async function applyOutsourceProgress(record: {
  id?: string;
  orderId: string | null;
  productId?: string | null;
  nodeId: string | null;
  quantity: unknown;
  variantId?: string | null;
  timestamp?: Date | string | null;
  docNo?: string | null;
  tenantId?: string | null;
  partner?: string | null;
  /** 外协收回若工序开启称重，会同步把本次重量 + 物料分摊快照写入派生的 milestone/PMP 报工 */
  weight?: unknown;
  materialBreakdown?: unknown;
}) {
  if (!record.nodeId) return;
  const qty = Number(record.quantity);
  if (!qty || qty <= 0) return;
  const ts = record.timestamp ? new Date(record.timestamp as string) : new Date();
  const partnerName = record.partner != null ? String(record.partner).trim() : '';
  const weightNum = typeof record.weight === 'number'
    ? record.weight
    : typeof record.weight === 'string' && record.weight !== ''
      ? parseFloat(record.weight)
      : null;
  const reportData = {
    operator: partnerName || '外协收回',
    quantity: qty,
    defectiveQuantity: 0,
    variantId: record.variantId || null,
    reportNo: record.docNo ?? null,
    customData: { source: 'outsourceReceive', docNo: record.docNo ?? '' },
    weight: weightNum != null && Number.isFinite(weightNum) && weightNum > 0 ? weightNum : null,
    materialBreakdown: (record.materialBreakdown as any) ?? null,
  };

  if (record.orderId) {
    const milestone = await basePrisma.milestone.findFirst({
      where: { productionOrderId: record.orderId, templateId: record.nodeId },
    });
    if (!milestone) return;
    const newQty = Number(milestone.completedQuantity) + qty;
    const reportId = genId('rpt-wxrecv');
    await basePrisma.$transaction([
      basePrisma.milestoneReport.create({
        data: { id: reportId, milestoneId: milestone.id, timestamp: ts, ...reportData },
      }),
      basePrisma.milestone.update({
        where: { id: milestone.id },
        data: { completedQuantity: newQty, status: 'IN_PROGRESS' },
      }),
    ]);
    return;
  }

  if (!record.productId || !record.tenantId) return;
  const vid = record.variantId || null;
  let pmp = await basePrisma.productMilestoneProgress.findFirst({
    where: {
      productId: record.productId,
      variantId: vid,
      milestoneTemplateId: record.nodeId,
      tenantId: record.tenantId,
    },
  });
  if (!pmp) {
    pmp = await basePrisma.productMilestoneProgress.create({
      data: {
        id: genId('pmp-wxrecv'),
        tenantId: record.tenantId,
        productId: record.productId,
        variantId: vid,
        milestoneTemplateId: record.nodeId,
        completedQuantity: 0,
      },
    });
  }
  const newQty = Number(pmp.completedQuantity) + qty;
  const reportId = genId('rpt-wxrecv');
  await basePrisma.$transaction([
    basePrisma.productProgressReport.create({
      data: { id: reportId, progressId: pmp.id, timestamp: ts, ...reportData },
    }),
    basePrisma.productMilestoneProgress.update({
      where: { id: pmp.id },
      data: { completedQuantity: newQty },
    }),
  ]);
}

async function removeOutsourceProgress(record: {
  orderId: string | null;
  productId?: string | null;
  nodeId: string | null;
  docNo?: string | null;
  variantId?: string | null;
}) {
  if (!record.docNo) return;

  if (record.orderId && record.nodeId) {
    const milestone = await basePrisma.milestone.findFirst({
      where: { productionOrderId: record.orderId, templateId: record.nodeId },
    });
    if (!milestone) return;
    const reports = await basePrisma.milestoneReport.findMany({
      where: { milestoneId: milestone.id, reportNo: record.docNo },
    });
    if (reports.length === 0) return;
    const totalQty = reports.reduce((s, r) => s + Number(r.quantity), 0);
    await basePrisma.$transaction([
      basePrisma.milestoneReport.deleteMany({
        where: { milestoneId: milestone.id, reportNo: record.docNo },
      }),
      basePrisma.milestone.update({
        where: { id: milestone.id },
        data: {
          completedQuantity: Math.max(0, Number(milestone.completedQuantity) - totalQty),
        },
      }),
    ]);
    return;
  }

  if (record.productId && record.nodeId) {
    const vid = record.variantId || undefined;
    const pmps: any[] = await basePrisma.productMilestoneProgress.findMany({
      where: {
        productId: record.productId,
        milestoneTemplateId: record.nodeId!,
        ...(vid ? { variantId: vid } : {}),
      },
      include: { reports: { where: { reportNo: record.docNo } } },
    });
    for (const pmp of pmps) {
      if (!pmp.reports?.length) continue;
      const totalQty = pmp.reports.reduce((s: number, r: any) => s + Number(r.quantity), 0);
      await basePrisma.$transaction([
        basePrisma.productProgressReport.deleteMany({
          where: { progressId: pmp.id, reportNo: record.docNo },
        }),
        basePrisma.productMilestoneProgress.update({
          where: { id: pmp.id },
          data: {
            completedQuantity: Math.max(0, Number(pmp.completedQuantity) - totalQty),
          },
        }),
      ]);
    }
  }
}

async function syncOutsourceReportOnUpdate(
  oldRecord: {
    orderId: string | null;
    productId?: string | null;
    nodeId: string | null;
    docNo?: string | null;
    quantity: unknown;
    variantId?: string | null;
    timestamp?: Date | string | null;
  },
  newRecord: {
    orderId: string | null;
    productId?: string | null;
    nodeId: string | null;
    docNo?: string | null;
    quantity: unknown;
    variantId?: string | null;
    timestamp?: Date | string | null;
  },
) {
  const oldDocNo = oldRecord.docNo;
  if (!oldDocNo) return;

  const newQtyVal = Number(newRecord.quantity);
  const oldQtyVal = Number(oldRecord.quantity);
  const qtyDelta = newQtyVal - oldQtyVal;
  const newTs = newRecord.timestamp ? new Date(newRecord.timestamp as string) : undefined;

  if (oldRecord.orderId && oldRecord.nodeId) {
    const milestone = await basePrisma.milestone.findFirst({
      where: { productionOrderId: oldRecord.orderId, templateId: oldRecord.nodeId },
    });
    if (!milestone) return;
    const reports = await basePrisma.milestoneReport.findMany({
      where: { milestoneId: milestone.id, reportNo: oldDocNo },
    });
    if (reports.length === 0) return;
    const ops: any[] = [];
    for (const rpt of reports) {
      const updateData: Record<string, unknown> = { quantity: newQtyVal };
      if (newTs) updateData.timestamp = newTs;
      if (newRecord.docNo && newRecord.docNo !== oldDocNo) updateData.reportNo = newRecord.docNo;
      ops.push(basePrisma.milestoneReport.update({ where: { id: rpt.id }, data: updateData }));
    }
    if (qtyDelta !== 0) {
      ops.push(
        basePrisma.milestone.update({
          where: { id: milestone.id },
          data: {
            completedQuantity: Math.max(0, Number(milestone.completedQuantity) + qtyDelta),
          },
        }),
      );
    }
    await basePrisma.$transaction(ops);
    return;
  }

  if (oldRecord.productId && oldRecord.nodeId) {
    const vid = oldRecord.variantId || undefined;
    const pmps: any[] = await basePrisma.productMilestoneProgress.findMany({
      where: {
        productId: oldRecord.productId,
        milestoneTemplateId: oldRecord.nodeId!,
        ...(vid ? { variantId: vid } : {}),
      },
      include: { reports: { where: { reportNo: oldDocNo } } },
    });
    for (const pmp of pmps) {
      if (!pmp.reports?.length) continue;
      const ops: any[] = [];
      for (const rpt of pmp.reports) {
        const updateData: Record<string, unknown> = { quantity: newQtyVal };
        if (newTs) updateData.timestamp = newTs;
        if (newRecord.docNo && newRecord.docNo !== oldDocNo) updateData.reportNo = newRecord.docNo;
        ops.push(
          basePrisma.productProgressReport.update({ where: { id: rpt.id }, data: updateData }),
        );
      }
      if (qtyDelta !== 0) {
        ops.push(
          basePrisma.productMilestoneProgress.update({
            where: { id: pmp.id },
            data: {
              completedQuantity: Math.max(0, Number(pmp.completedQuantity) + qtyDelta),
            },
          }),
        );
      }
      await basePrisma.$transaction(ops);
    }
  }
}
