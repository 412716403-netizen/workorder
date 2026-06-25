import { Prisma } from '@prisma/client';
import type { TenantPrismaClient } from '../lib/prisma.js';
import { normalizeBatchNo, BATCH_NO_UNTAGGED } from '../../../shared/types.js';
import { genId } from '../utils/genId.js';
import { withSerializableRetry } from '../utils/withSerializableRetry.js';
import { sanitizeUpdate, sanitizeCreate, normalizeDates } from '../utils/request.js';

const PSI_STRIP_KEYS = new Set(['_savedAtMs', 'receivedQty', 'remainingQty', 'productName', 'productSku']);

/** 列表/详情展示用：不依赖「产品档案」接口权限，由服务端按 tenant 关联 Product 表补全名称 */
async function enrichPsiRecordsWithProductMeta(db: TenantPrismaClient, records: { productId?: string | null }[]) {
  const ids = [...new Set(records.map(r => r.productId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, sku: true },
  });
  const m = new Map(products.map(p => [p.id, p]));
  for (const r of records as any[]) {
    if (!r.productId) continue;
    const p = m.get(r.productId);
    if (p) {
      r.productName = p.name || p.sku || undefined;
      r.productSku = p.sku || undefined;
    }
  }
}

function cleanPsi(data: Record<string, unknown>) {
  for (const k of PSI_STRIP_KEYS) delete data[k];
  // 前端常写 `batch`；库表为 `batchNo`。若来源行已带 `batchNo: null`（仍算 in 对象），
  // 旧逻辑会跳过复制导致用户输入的 `batch` 被删且未落库（如采购订单转采购单）。
  if ('batch' in data) {
    const fromBatch = normalizeBatchNo(data.batch);
    delete data.batch;
    if (fromBatch) {
      data.batchNo = fromBatch;
    }
  }
  const bn = normalizeBatchNo(data.batchNo);
  // 哨兵字符串「无批号」视同未填：DB 一律存 NULL，避免与真实业务批号混淆。
  if (bn && bn !== BATCH_NO_UNTAGGED) data.batchNo = bn;
  else delete data.batchNo;
  return data;
}

export async function listRecords(
  db: TenantPrismaClient,
  opts: {
    type?: string;
    types?: string[];
    productId?: string;
    docNumber?: string;
    partnerId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    all?: boolean;
    page?: number;
    pageSize?: number;
  },
) {
  const where: Record<string, unknown> = {};
  if (opts.types && opts.types.length > 0) {
    where.type = { in: opts.types };
  } else if (opts.type) {
    where.type = opts.type;
  }
  if (opts.productId) where.productId = opts.productId;
  if (opts.docNumber) where.docNumber = opts.docNumber;
  if (opts.partnerId) where.partnerId = opts.partnerId;
  // 与 orderBy 保持一致，按业务「添加日期」过滤；命中 [tenantId, type, createdAt] 三元组索引。
  if (opts.startDate || opts.endDate) {
    const range: Record<string, Date> = {};
    if (opts.startDate) {
      const d = new Date(opts.startDate);
      if (!Number.isNaN(d.getTime())) range.gte = d;
    }
    if (opts.endDate) {
      const d = new Date(opts.endDate);
      if (!Number.isNaN(d.getTime())) range.lt = d;
    }
    if (Object.keys(range).length > 0) where.createdAt = range;
  }
  if (opts.search) {
    where.OR = [
      { docNumber: { contains: opts.search, mode: 'insensitive' } },
      { partner: { contains: opts.search, mode: 'insensitive' } },
      { note: { contains: opts.search, mode: 'insensitive' } },
      { operator: { contains: opts.search, mode: 'insensitive' } },
    ];
  }
  const orderBy: any = [{ createdAt: 'desc' }, { id: 'asc' }];

  if (opts.all) {
    const data = await db.psiRecord.findMany({ where, orderBy });
    await enrichPsiRecordsWithProductMeta(db, data);
    return data;
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
  const [data, total] = await Promise.all([
    db.psiRecord.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.psiRecord.count({ where }),
  ]);
  await enrichPsiRecordsWithProductMeta(db, data);
  return { data, total, page, pageSize };
}

export async function createRecord(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
) {
  const data = cleanPsi(sanitizeCreate(body));
  if (!data.id) data.id = genId('psi');
  normalizeDates(data);
  const created = await db.psiRecord.create({ data: data as any });
  await enrichPsiRecordsWithProductMeta(db, [created]);
  return created;
}

export async function createBatchRecords(
  db: TenantPrismaClient,
  records: Record<string, unknown>[],
) {
  const prepared = records.map(r => {
    const data = cleanPsi(sanitizeCreate(r));
    if (!data.id) data.id = genId('psi');
    normalizeDates(data);
    return data as any;
  });
  const ids = prepared.map((d: any) => d.id as string);
  await db.psiRecord.createMany({ data: prepared });
  const createdRows = await db.psiRecord.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: 'desc' } });
  await enrichPsiRecordsWithProductMeta(db, createdRows);
  return createdRows;
}

export async function updateRecord(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const data = cleanPsi(sanitizeUpdate(body));
  normalizeDates(data);
  const updated = await db.psiRecord.update({ where: { id }, data });
  await enrichPsiRecordsWithProductMeta(db, [updated]);
  return updated;
}

export async function replaceRecords(
  db: TenantPrismaClient,
  deleteIds: string[] | undefined,
  newRecords: Record<string, unknown>[] | undefined,
) {
  const toInsert = (newRecords || []).map(r => {
    const data = cleanPsi(sanitizeCreate(r));
    if (!data.id) data.id = genId('psi');
    normalizeDates(data);
    return data as any;
  });
  return withSerializableRetry(() =>
    db.$transaction(
      async tx => {
        if (deleteIds?.length) {
          await tx.psiRecord.deleteMany({ where: { id: { in: deleteIds } } });
        }
        if (toInsert.length) {
          await tx.psiRecord.createMany({ data: toInsert });
        }
        return { message: '已替换' };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 120_000,
      },
    ),
  );
}

export async function deleteRecord(db: TenantPrismaClient, id: string) {
  await db.psiRecord.delete({ where: { id } });
  return { message: '已删除' };
}

export async function deleteBatchRecords(db: TenantPrismaClient, ids: string[]) {
  await db.psiRecord.deleteMany({ where: { id: { in: ids } } });
  return { message: '已删除' };
}

export async function getStock(
  db: TenantPrismaClient,
  opts: { productId?: string; warehouseId?: string },
) {
  const productFilter = opts.productId ? { productId: opts.productId } : { productId: { not: null } };
  const warehouseFilter = opts.warehouseId ? { warehouseId: opts.warehouseId } : {};

  const [inboundAgg, outboundAgg, transferIn, transferOut, stocktakeAgg, prodAgg] = await Promise.all([
    db.psiRecord.groupBy({
      by: ['productId'],
      where: { type: { in: ['PURCHASE_BILL', 'STOCK_IN'] }, ...productFilter, ...warehouseFilter },
      _sum: { quantity: true },
    }),
    db.psiRecord.groupBy({
      by: ['productId'],
      where: { type: 'SALES_BILL', ...productFilter, ...warehouseFilter },
      _sum: { quantity: true },
    }),
    opts.warehouseId
      ? db.psiRecord.groupBy({
          by: ['productId'],
          where: { type: 'TRANSFER', toWarehouseId: opts.warehouseId, ...productFilter },
          _sum: { quantity: true },
        })
      : Promise.resolve([]),
    opts.warehouseId
      ? db.psiRecord.groupBy({
          by: ['productId'],
          where: { type: 'TRANSFER', fromWarehouseId: opts.warehouseId, ...productFilter },
          _sum: { quantity: true },
        })
      : Promise.resolve([]),
    /** 盘点：实盘与系统数的差额在 `diffQuantity`，与 `getStockBatches` / 前端 `usePsiStockIndex` 一致 */
    db.psiRecord.groupBy({
      by: ['productId'],
      where: { type: 'STOCKTAKE', ...productFilter, ...warehouseFilter },
      _sum: { diffQuantity: true },
    }),
    /**
     * 生产出入库：与仓库面板（getStockSnapshot / usePsiStockIndex）口径对齐——
     * STOCK_IN / STOCK_RETURN 计入库存，STOCK_OUT（生产领料出库）扣减库存。
     * 此前仅统计 STOCK_IN，会导致计划单 BOM 汇总库存与仓库不同步（领料后偏高、退料后偏低）。
     */
    db.productionOpRecord.groupBy({
      by: ['productId', 'type'],
      where: {
        type: { in: ['STOCK_IN', 'STOCK_RETURN', 'STOCK_OUT'] },
        ...(opts.productId ? { productId: opts.productId } : {}),
        ...(opts.warehouseId ? { warehouseId: opts.warehouseId } : {}),
      },
      _sum: { quantity: true },
    }),
  ]);

  const stockMap: Record<string, number> = {};
  const stocktakeSet = new Set<string>();

  for (const r of stocktakeAgg) {
    if (r.productId) {
      stockMap[r.productId] = Number(r._sum?.diffQuantity || 0);
      stocktakeSet.add(r.productId);
    }
  }
  for (const r of inboundAgg) {
    if (r.productId) stockMap[r.productId] = (stockMap[r.productId] || 0) + Number(r._sum?.quantity || 0);
  }
  for (const r of outboundAgg) {
    if (r.productId) stockMap[r.productId] = (stockMap[r.productId] || 0) - Number(r._sum?.quantity || 0);
  }
  for (const r of transferIn) {
    if (r.productId) stockMap[r.productId] = (stockMap[r.productId] || 0) + Number(r._sum?.quantity || 0);
  }
  for (const r of transferOut) {
    if (r.productId) stockMap[r.productId] = (stockMap[r.productId] || 0) - Number(r._sum?.quantity || 0);
  }
  for (const r of prodAgg) {
    if (!r.productId) continue;
    const q = Number(r._sum?.quantity || 0);
    stockMap[r.productId] = (stockMap[r.productId] || 0) + (r.type === 'STOCK_OUT' ? -q : q);
  }

  return Object.entries(stockMap).map(([pid, qty]) => ({
    productId: pid,
    stock: Math.max(0, qty),
  }));
}

/**
 * Phase 3.B：库存快照接口（替代前端 `usePsiStockIndex` 全量遍历）。
 * 单一查询同时返回三个维度桶：
 * - `byWarehouse`：产品 × 仓库
 * - `byVariant`：产品 × 仓库 × 变体
 * - `byBatch`：产品 × 仓库 × 批次号
 * 桶字段语义与 `usePsiStockIndex` 完全对齐，方便前端原样替换。
 *
 * Phase 3.B 后续：byVariant 桶补 `displayQty`（最近一次盘点之后的展示数量），
 * 与前端 `getVariantDisplayQty` 等价，避免前端再次按 timestamp 遍历明细。
 * 当变体下无盘点记录时不写 `displayQty`，前端按 `psiIn+transferIn+prodIn - 出库` 兜底。
 */
export interface StockSnapshotBucket {
  productId: string;
  warehouseId: string;
  variantId?: string;
  batchNo?: string;
  psiIn: number;
  psiOut: number;
  transferIn: number;
  transferOut: number;
  prodIn: number;
  prodOut: number;
  stocktakeAdj: number;
  /** Phase 3.B：仅 byVariant 且变体下有盘点时存在，等价于前端 getVariantDisplayQty 结果 */
  displayQty?: number;
}

export interface StockSnapshotResponse {
  byWarehouse: StockSnapshotBucket[];
  byVariant: StockSnapshotBucket[];
  byBatch: StockSnapshotBucket[];
}

export async function getStockSnapshot(
  db: TenantPrismaClient,
  opts: { productId?: string; warehouseId?: string },
): Promise<StockSnapshotResponse> {
  const productFilter = opts.productId ? { productId: opts.productId } : {};
  const warehouseFilter = opts.warehouseId ? { warehouseId: opts.warehouseId } : {};

  const psiRecs = await db.psiRecord.findMany({
    where: {
      productId: { not: null },
      ...productFilter,
      ...warehouseFilter,
    },
    select: {
      id: true,
      productId: true,
      warehouseId: true,
      variantId: true,
      batchNo: true,
      fromWarehouseId: true,
      toWarehouseId: true,
      type: true,
      quantity: true,
      diffQuantity: true,
      systemQuantity: true,
      timestamp: true,
    },
  });

  let transferRecs: typeof psiRecs = [];
  if (opts.warehouseId) {
    transferRecs = await db.psiRecord.findMany({
      where: {
        productId: { not: null },
        ...productFilter,
        type: 'TRANSFER',
        OR: [{ fromWarehouseId: opts.warehouseId }, { toWarehouseId: opts.warehouseId }],
      },
      select: {
        id: true,
        productId: true,
        warehouseId: true,
        variantId: true,
        batchNo: true,
        fromWarehouseId: true,
        toWarehouseId: true,
        type: true,
        quantity: true,
        diffQuantity: true,
        systemQuantity: true,
        timestamp: true,
      },
    });
  }

  const prodRecs = await db.productionOpRecord.findMany({
    where: {
      type: { in: ['STOCK_IN', 'STOCK_RETURN', 'STOCK_OUT'] },
      ...productFilter,
      ...warehouseFilter,
    },
    select: {
      id: true,
      productId: true,
      warehouseId: true,
      variantId: true,
      batchNo: true,
      type: true,
      quantity: true,
      timestamp: true,
    },
  });

  const whMap = new Map<string, StockSnapshotBucket>();
  const varMap = new Map<string, StockSnapshotBucket>();
  const batchMap = new Map<string, StockSnapshotBucket>();

  /**
   * Phase 3.B：仅按变体维度维护按时间排序的事件流，用于在最后一次盘点之后做净增减计算。
   * 与前端 `getVariantDisplayQty` 一致：仅当变体下存在盘点时启用。
   */
  type VariantEvent =
    | { time: number; kind: 'in'; qty: number }
    | { time: number; kind: 'out'; qty: number }
    | { time: number; kind: 'stocktake'; qty: number; sysQty: number; id: string };
  const variantEvents = new Map<string, VariantEvent[]>();
  const pushVarEvent = (pId: string, wh: string, vId: string, ev: VariantEvent) => {
    if (!vId) return;
    const k = `${pId}::${wh}::${vId}`;
    let arr = variantEvents.get(k);
    if (!arr) {
      arr = [];
      variantEvents.set(k, arr);
    }
    arr.push(ev);
  };

  const empty = () => ({ psiIn: 0, psiOut: 0, transferIn: 0, transferOut: 0, prodIn: 0, prodOut: 0, stocktakeAdj: 0 });

  const getWh = (pId: string, whId: string) => {
    const k = `${pId}::${whId}`;
    let b = whMap.get(k);
    if (!b) { b = { productId: pId, warehouseId: whId, ...empty() }; whMap.set(k, b); }
    return b;
  };
  const getVar = (pId: string, whId: string, vId: string) => {
    const k = `${pId}::${whId}::${vId}`;
    let b = varMap.get(k);
    if (!b) { b = { productId: pId, warehouseId: whId, variantId: vId, ...empty() }; varMap.set(k, b); }
    return b;
  };
  const getBatch = (pId: string, whId: string, bn: string) => {
    const k = `${pId}::${whId}::${bn}`;
    let b = batchMap.get(k);
    if (!b) { b = { productId: pId, warehouseId: whId, batchNo: bn, ...empty() }; batchMap.set(k, b); }
    return b;
  };

  const accum = (rec: typeof psiRecs[number], isTransferScope: boolean) => {
    const pId = rec.productId;
    if (!pId) return;
    const qty = Number(rec.quantity ?? 0) || 0;
    const diff = Number(rec.diffQuantity ?? 0) || 0;
    const vId = rec.variantId ?? '';
    const bn = normalizeBatchNo(rec.batchNo) ?? BATCH_NO_UNTAGGED;
    const time = rec.timestamp ? new Date(rec.timestamp).getTime() : 0;

    if (rec.type === 'PURCHASE_BILL') {
      const wh = rec.warehouseId || '';
      if (!wh) return;
      getWh(pId, wh).psiIn += qty;
      if (vId) {
        getVar(pId, wh, vId).psiIn += qty;
        pushVarEvent(pId, wh, vId, { time, kind: 'in', qty });
      }
      getBatch(pId, wh, bn).psiIn += qty;
    } else if (rec.type === 'SALES_BILL') {
      const wh = rec.warehouseId || '';
      if (!wh) return;
      getWh(pId, wh).psiOut += qty;
      if (vId) {
        getVar(pId, wh, vId).psiOut += qty;
        pushVarEvent(pId, wh, vId, { time, kind: 'out', qty });
      }
      getBatch(pId, wh, bn).psiOut += qty;
    } else if (rec.type === 'TRANSFER') {
      if (isTransferScope) return;
      const toWh = rec.toWarehouseId ?? undefined;
      const fromWh = rec.fromWarehouseId ?? undefined;
      if (toWh) {
        getWh(pId, toWh).transferIn += qty;
        if (vId) {
          getVar(pId, toWh, vId).transferIn += qty;
          pushVarEvent(pId, toWh, vId, { time, kind: 'in', qty });
        }
        getBatch(pId, toWh, bn).transferIn += qty;
      }
      if (fromWh) {
        getWh(pId, fromWh).transferOut += qty;
        if (vId) {
          getVar(pId, fromWh, vId).transferOut += qty;
          pushVarEvent(pId, fromWh, vId, { time, kind: 'out', qty });
        }
        getBatch(pId, fromWh, bn).transferOut += qty;
      }
    } else if (rec.type === 'STOCKTAKE') {
      const wh = rec.warehouseId || '';
      if (!wh) return;
      getWh(pId, wh).stocktakeAdj += diff;
      getBatch(pId, wh, bn).stocktakeAdj += diff;
      if (vId && rec.systemQuantity != null) {
        pushVarEvent(pId, wh, vId, {
          time,
          kind: 'stocktake',
          qty,
          sysQty: Number(rec.systemQuantity) || 0,
          id: rec.id,
        });
      }
    }
  };

  for (const r of psiRecs) accum(r, false);
  for (const r of transferRecs) accum(r, true);

  for (const r of prodRecs) {
    const pId = r.productId;
    if (!pId) continue;
    const wh = r.warehouseId || '';
    if (!wh) continue;
    const qty = Number(r.quantity ?? 0) || 0;
    const vId = r.variantId ?? '';
    const bn = normalizeBatchNo(r.batchNo) ?? BATCH_NO_UNTAGGED;
    const time = r.timestamp ? new Date(r.timestamp).getTime() : 0;
    if (r.type === 'STOCK_IN' || r.type === 'STOCK_RETURN') {
      getWh(pId, wh).prodIn += qty;
      if (vId) {
        getVar(pId, wh, vId).prodIn += qty;
        pushVarEvent(pId, wh, vId, { time, kind: 'in', qty });
      }
      getBatch(pId, wh, bn).prodIn += qty;
    } else if (r.type === 'STOCK_OUT') {
      getWh(pId, wh).prodOut += qty;
      if (vId) {
        getVar(pId, wh, vId).prodOut += qty;
        pushVarEvent(pId, wh, vId, { time, kind: 'out', qty });
      }
      getBatch(pId, wh, bn).prodOut += qty;
    }
  }

  /**
   * Phase 3.B：对每个变体桶，若存在盘点记录，按"最后一次盘点 + 之后增减"算 displayQty。
   * 与前端 `getVariantDisplayQty` 完全对齐：
   *   1. latest = max(stocktake by time)
   *   2. insAfter / outsAfter = 所有 time >= latestTime 的 in/out
   *   3. adjustAfter = 其它 (id != latest.id) 的 stocktake 在 latestTime 之后的 (qty - sysQty)
   *   4. displayQty = latest.qty + insAfter - outsAfter + adjustAfter
   */
  for (const [key, events] of variantEvents) {
    let latest: Extract<VariantEvent, { kind: 'stocktake' }> | null = null;
    for (const ev of events) {
      if (ev.kind !== 'stocktake') continue;
      if (!latest || ev.time > latest.time) latest = ev;
    }
    if (!latest) continue;
    const bucket = varMap.get(key);
    if (!bucket) continue;
    let insAfter = 0;
    let outsAfter = 0;
    let adjustAfter = 0;
    for (const ev of events) {
      if (ev.time < latest.time) continue;
      if (ev.kind === 'in') insAfter += ev.qty;
      else if (ev.kind === 'out') outsAfter += ev.qty;
      else if (ev.kind === 'stocktake' && ev.id !== latest.id) {
        adjustAfter += ev.qty - ev.sysQty;
      }
    }
    bucket.displayQty = latest.qty + insAfter - outsAfter + adjustAfter;
  }

  return {
    byWarehouse: [...whMap.values()],
    byVariant: [...varMap.values()],
    byBatch: [...batchMap.values()],
  };
}

type BatchAggRow = { batchNo: string | null; _sum: { quantity?: unknown; diffQuantity?: unknown } | null };

function addBatchAgg(map: Map<string, number>, rows: BatchAggRow[], sign: 1 | -1, field: 'quantity' | 'diffQuantity') {
  for (const r of rows) {
    // NULL/空 → 哨兵字符串 BATCH_NO_UNTAGGED，与"已填批号"一并参与按批次汇总。
    const key = normalizeBatchNo(r.batchNo) ?? BATCH_NO_UNTAGGED;
    const raw = field === 'quantity' ? r._sum?.quantity : r._sum?.diffQuantity;
    const q = Number(raw ?? 0) || 0;
    if (!q) continue;
    map.set(key, (map.get(key) || 0) + sign * q);
  }
}

/** `production_op_records` 的 `groupBy({ by: ['batchNo'] })` 在部分 Prisma/客户端组合下会报 Unknown argument 'batchNo'，故用 findMany 后在内存按批号汇总。 */
function addProdOpRowsToMap(
  map: Map<string, number>,
  rows: { batchNo: string | null; quantity: unknown }[],
  sign: 1 | -1,
) {
  for (const r of rows) {
    // NULL/空 → 哨兵字符串 BATCH_NO_UNTAGGED，让"未填批号"的生产流水也被纳入按批次余量。
    const bn = normalizeBatchNo(r.batchNo) ?? BATCH_NO_UNTAGGED;
    const q = Number(r.quantity ?? 0) || 0;
    if (!q) continue;
    map.set(bn, (map.get(bn) || 0) + sign * q);
  }
}

/**
 * 按「产品 + 仓库 + 批次号」汇总可用库存（与前端 `usePsiStockIndex` 中批次桶语义对齐）。
 * 为支持「未填批号」（如采购入库未输入批号、历史数据空）的物料同样能在领料/退料下拉中被选择，
 * 这里**不再**过滤 `batchNo IS NULL`：所有 NULL/空批号的流水都归一为哨兵 {@link BATCH_NO_UNTAGGED}。
 * `excludeProductionOpRecordId`：更新领料单某行时排除自身，避免把当前行已扣数量算进可用量。
 */
export async function getStockBatches(
  db: TenantPrismaClient,
  opts: { productId: string; warehouseId: string; excludeProductionOpRecordId?: string },
): Promise<{ batchNo: string; stock: number }[]> {
  const { productId, warehouseId, excludeProductionOpRecordId: exId } = opts;
  const map = new Map<string, number>();

  const prodEx = exId ? { id: { not: exId } } : {};

  const [psiIn, psiOut, transferIn, transferOut, stocktakeRows, prodInRows, prodRetRows, prodOutRows] =
    await Promise.all([
      db.psiRecord.groupBy({
        by: ['batchNo'],
        where: {
          productId,
          warehouseId,
          type: { in: ['PURCHASE_BILL', 'STOCK_IN'] },
        },
        _sum: { quantity: true },
      }),
      db.psiRecord.groupBy({
        by: ['batchNo'],
        where: { productId, warehouseId, type: 'SALES_BILL' },
        _sum: { quantity: true },
      }),
      db.psiRecord.groupBy({
        by: ['batchNo'],
        where: { productId, toWarehouseId: warehouseId, type: 'TRANSFER' },
        _sum: { quantity: true },
      }),
      db.psiRecord.groupBy({
        by: ['batchNo'],
        where: { productId, fromWarehouseId: warehouseId, type: 'TRANSFER' },
        _sum: { quantity: true },
      }),
      db.psiRecord.groupBy({
        by: ['batchNo'],
        where: { productId, warehouseId, type: 'STOCKTAKE' },
        _sum: { diffQuantity: true },
      }),
      db.productionOpRecord.findMany({
        where: { productId, warehouseId, type: 'STOCK_IN', ...prodEx },
        select: { batchNo: true, quantity: true },
      }),
      db.productionOpRecord.findMany({
        where: { productId, warehouseId, type: 'STOCK_RETURN', ...prodEx },
        select: { batchNo: true, quantity: true },
      }),
      db.productionOpRecord.findMany({
        where: { productId, warehouseId, type: 'STOCK_OUT', ...prodEx },
        select: { batchNo: true, quantity: true },
      }),
    ]);

  addBatchAgg(map, psiIn, 1, 'quantity');
  addBatchAgg(map, transferIn, 1, 'quantity');
  addBatchAgg(map, stocktakeRows, 1, 'diffQuantity');
  addProdOpRowsToMap(map, prodInRows, 1);
  addProdOpRowsToMap(map, prodRetRows, 1);

  addBatchAgg(map, psiOut, -1, 'quantity');
  addBatchAgg(map, transferOut, -1, 'quantity');
  addProdOpRowsToMap(map, prodOutRows, -1);

  return [...map.entries()]
    .map(([batchNo, stock]) => ({ batchNo, stock: Math.max(0, stock) }))
    .filter(r => r.stock > 0)
    .sort((a, b) => a.batchNo.localeCompare(b.batchNo, 'zh-CN'));
}

/**
 * Phase 3.D follow-up：计划详情用「计划相关 PSI」窄查接口。
 * 取代前端 PlanDetailPanel 之前对 `AppDataContext.psiRecords` 全量扫描的三段逻辑：
 *  1) `materialIdsWithPO`：按 customData.sourcePlanId / customData.sourcePlanNumber / note 含 `计划单[<no>]` 命中该计划的 PO 行。
 *  2) `relatedPOsByMaterial`：同上，按 productId 桶化。
 *  3) `receivedByOrderLine`：所有 PB（`type='PURCHASE_BILL' AND sourceOrderNumber IS NOT NULL`）按 (sourceOrderNumber, sourceLineId) 累加；
 *      为避免扫所有 PB，这里限定 `sourceOrderNumber IN (本计划相关 PO 的 docNumber)`。
 * 调用方：`GET /api/psi/plan-related?planId=...&planNumbers=a,b,c`。
 */
export async function listPlanRelatedPsi(
  db: TenantPrismaClient,
  opts: { planId: string; planNumbers: string[] },
): Promise<{ purchaseOrders: unknown[]; purchaseBills: unknown[] }> {
  const planId = String(opts.planId || '').trim();
  const planNumbers = (opts.planNumbers ?? [])
    .map(n => String(n ?? '').trim())
    .filter(Boolean);

  if (!planId && planNumbers.length === 0) {
    return { purchaseOrders: [], purchaseBills: [] };
  }

  const orClauses: Prisma.PsiRecordWhereInput[] = [];
  if (planId) {
    orClauses.push({ customData: { path: ['sourcePlanId'], equals: planId } });
  }
  if (planNumbers.length > 0) {
    // Prisma JSON path filter 不支持 `in`，逐 planNumber 拆 OR 子句
    for (const pn of planNumbers) {
      orClauses.push({ customData: { path: ['sourcePlanNumber'], equals: pn } });
      // 历史数据：`note` 中含「计划单[<planNumber>]」也算命中（与前端 purchaseOrderRecordMatchesPlanPanel 一致）
      orClauses.push({ note: { contains: `计划单[${pn}]` } });
    }
  }

  const purchaseOrders = await db.psiRecord.findMany({
    where: { type: 'PURCHASE_ORDER', OR: orClauses },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  await enrichPsiRecordsWithProductMeta(db, purchaseOrders);

  const poDocNumbers = purchaseOrders
    .map(r => r.docNumber)
    .filter((d): d is string => typeof d === 'string' && d.length > 0);

  const purchaseBills = poDocNumbers.length
    ? await db.psiRecord.findMany({
        where: {
          type: 'PURCHASE_BILL',
          sourceOrderNumber: { in: poDocNumbers },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      })
    : [];
  if (purchaseBills.length) await enrichPsiRecordsWithProductMeta(db, purchaseBills);

  return { purchaseOrders, purchaseBills };
}

/**
 * Phase 3.D follow-up：按合作单位预生成 PSI 单号（取代前端 `nextPsiDocNumber` 扫全表）。
 * 同时支持 legacy 前缀（如 SALES_BILL 的旧前缀 SB 与新前缀 XS 共用同一合作单位序号空间）。
 */
export async function nextDocNumberForPartner(
  db: TenantPrismaClient,
  opts: {
    prefix: string;
    psiType: string;
    partnerId?: string | null;
    partnerName?: string | null;
    legacyPrefixes?: string[];
  },
): Promise<{ docNumber: string; segment: string; seq: number }> {
  const prefix = String(opts.prefix || '').trim();
  if (!prefix) throw new Error('prefix is required');
  const psiType = String(opts.psiType || '').trim();
  if (!psiType) throw new Error('psiType is required');

  const partnerId = opts.partnerId ? String(opts.partnerId).trim() : '';
  const partnerName = opts.partnerName ? String(opts.partnerName).trim() : '';

  // 解析 partner_list_no → 4 位 segment
  let partner: { id: string; name: string; partnerListNo: number; createdAt: Date } | null = null;
  if (partnerId) {
    partner = await db.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true, partnerListNo: true, createdAt: true },
    });
  }
  if (!partner && partnerName) {
    partner = await db.partner.findFirst({
      where: { name: partnerName },
      select: { id: true, name: true, partnerListNo: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  let seg = '0000';
  if (partner) {
    const n = Number(partner.partnerListNo);
    if (Number.isFinite(n) && n >= 1) {
      seg = String(n).padStart(4, '0');
    } else {
      // 兜底：按 createdAt 排序求位置（保持与前端 fallbackPartnerListNoBySort 同语义）
      const all = await db.partner.findMany({
        select: { id: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const idx = all.findIndex(x => x.id === partner!.id);
      seg = String((idx < 0 ? 1 : idx + 1)).padStart(4, '0');
    }
  }

  const prefixes = [prefix, ...(opts.legacyPrefixes ?? [])];
  const orList: Prisma.PsiRecordWhereInput[] = prefixes.map(p => ({
    docNumber: { startsWith: `${p}-${seg}-` },
  }));
  const partnerOr: Prisma.PsiRecordWhereInput[] = [];
  const effectivePartnerId = partner?.id || partnerId;
  if (effectivePartnerId) partnerOr.push({ partnerId: effectivePartnerId });
  if (partnerName) partnerOr.push({ partner: partnerName });
  if (partnerOr.length === 0) {
    // 没法识别合作单位时直接返回 0001
    return { docNumber: `${prefix}-${seg}-001`, segment: seg, seq: 1 };
  }

  const records = await db.psiRecord.findMany({
    where: {
      type: psiType,
      AND: [{ OR: partnerOr }, { OR: orList }],
    },
    select: { docNumber: true },
  });

  const escapedSeg = seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let maxSeq = 0;
  for (const p of prefixes) {
    const re = new RegExp(`^${p}-${escapedSeg}-(\\d+)$`);
    for (const r of records) {
      const m = r.docNumber?.match(re);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
  }
  const seq = maxSeq + 1;
  return { docNumber: `${prefix}-${seg}-${String(seq).padStart(3, '0')}`, segment: seg, seq };
}

/**
 * Phase 3.D follow-up：批量查 (partnerId|partnerName, productId) 的"上次采购单价"。
 * 与前端 `getLastPurchaseUnitPrice` 一致：PURCHASE_ORDER + PURCHASE_BILL，按 timestamp/createdAt desc 取最新非空 purchasePrice。
 * 端点：`POST /api/psi/last-purchase-prices`，body: `{ items: [{ partnerId?, partnerName?, productId }] }`。
 */
export async function batchLastPurchasePrices(
  db: TenantPrismaClient,
  items: Array<{ partnerId?: string | null; partnerName?: string | null; productId: string }>,
): Promise<Array<{ price: number | null }>> {
  if (!Array.isArray(items) || items.length === 0) return [];

  const productIds = [...new Set(items.map(i => i.productId).filter((x): x is string => !!x))];
  if (productIds.length === 0) return items.map(() => ({ price: null }));

  const partnerIds = [...new Set(items.map(i => (i.partnerId ?? '').trim()).filter(Boolean))];
  const partnerNames = [...new Set(items.map(i => (i.partnerName ?? '').trim()).filter(Boolean))];

  const partnerOr: Prisma.PsiRecordWhereInput[] = [];
  if (partnerIds.length) partnerOr.push({ partnerId: { in: partnerIds } });
  if (partnerNames.length) partnerOr.push({ partner: { in: partnerNames } });
  if (partnerOr.length === 0) return items.map(() => ({ price: null }));

  const records = await db.psiRecord.findMany({
    where: {
      type: { in: ['PURCHASE_ORDER', 'PURCHASE_BILL'] },
      productId: { in: productIds },
      OR: partnerOr,
      purchasePrice: { not: null },
    },
    select: {
      productId: true,
      partnerId: true,
      partner: true,
      purchasePrice: true,
      timestamp: true,
      createdAt: true,
    },
    orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }],
  });

  // 索引：partnerKey | productId → first（已按 timestamp/createdAt desc 排好）
  const idx = new Map<string, number>();
  for (const r of records) {
    if (!r.productId || r.purchasePrice == null) continue;
    const price = Number(r.purchasePrice);
    if (!Number.isFinite(price)) continue;
    const keys: string[] = [];
    if (r.partnerId) keys.push(`id:${r.partnerId}|${r.productId}`);
    const pn = (r.partner ?? '').trim();
    if (pn) keys.push(`name:${pn}|${r.productId}`);
    for (const k of keys) {
      if (!idx.has(k)) idx.set(k, price);
    }
  }

  return items.map(i => {
    const productId = String(i.productId);
    const pid = (i.partnerId ?? '').trim();
    const pn = (i.partnerName ?? '').trim();
    const candidates: string[] = [];
    if (pid) candidates.push(`id:${pid}|${productId}`);
    if (pn) candidates.push(`name:${pn}|${productId}`);
    for (const k of candidates) {
      const p = idx.get(k);
      if (p != null) return { price: p };
    }
    return { price: null };
  });
}
