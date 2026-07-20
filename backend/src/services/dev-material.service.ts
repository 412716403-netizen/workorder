import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  BATCH_NO_UNTAGGED,
  DevStyleStatus,
  PROD_OP_REASON_FROM_DEV,
  batchNoForDisplay,
  isUntaggedBatch,
  type DevMaterialBatchRequest,
  type DevMaterialBatchResult,
  type DevMaterialDocGroup,
  type DevMaterialLineInput,
  type DevMaterialRecordsResponse,
  type DevMaterialReturnableRow,
  type DevMaterialSummaryRow,
} from '../../../shared/types.js';
import { createRecordBatch } from './production.service.js';

type MaterialOpType = 'STOCK_OUT' | 'STOCK_RETURN';

interface RawOpRow {
  id: string;
  type: string;
  productId: string;
  quantity: unknown;
  warehouseId: string | null;
  batchNo: string | null;
  docNo: string | null;
  operator: string | null;
  timestamp: Date;
}

function toQty(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function returnKey(productId: string, warehouseId: string, batchNo: string | null | undefined): string {
  return `${productId}::${warehouseId}::${batchNoForDisplay(batchNo)}`;
}

function normalizeLines(raw: unknown): DevMaterialLineInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError(400, '至少需要一条物料明细');
  }
  return raw.map((row, index) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const productId = String(r.productId ?? '').trim();
    const warehouseId = String(r.warehouseId ?? '').trim();
    const quantity = toQty(r.quantity);
    if (!productId) throw new AppError(400, `第 ${index + 1} 行缺少物料`);
    if (!warehouseId) throw new AppError(400, `第 ${index + 1} 行缺少仓库`);
    if (!(quantity > 0)) throw new AppError(400, `第 ${index + 1} 行数量须大于 0`);
    const batchRaw = r.batchNo == null ? null : String(r.batchNo);
    return {
      productId,
      warehouseId,
      quantity,
      batchNo: batchRaw,
    };
  });
}

async function assertStyle(db: TenantPrismaClient, styleId: string) {
  const style = await db.devStyle.findUnique({
    where: { id: styleId },
    select: { id: true, status: true, code: true, name: true },
  });
  if (!style) throw new AppError(404, '款式不存在');
  return style;
}

async function loadBomProductIds(db: TenantPrismaClient, styleId: string): Promise<string[]> {
  const boms = await db.devBom.findMany({
    where: { parentStyleId: styleId },
    include: { items: { select: { productId: true } } },
  });
  const ids = new Set<string>();
  for (const bom of boms) {
    for (const item of bom.items) {
      const pid = String(item.productId ?? '').trim();
      if (pid) ids.add(pid);
    }
  }
  return [...ids];
}

async function listDevMaterialOpRows(db: TenantPrismaClient, styleId: string): Promise<RawOpRow[]> {
  const rows = await db.productionOpRecord.findMany({
    where: {
      reason: PROD_OP_REASON_FROM_DEV,
      type: { in: ['STOCK_OUT', 'STOCK_RETURN'] },
      customData: { path: ['devStyleId'], equals: styleId },
    },
    orderBy: [{ timestamp: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      type: true,
      productId: true,
      quantity: true,
      warehouseId: true,
      batchNo: true,
      docNo: true,
      operator: true,
      timestamp: true,
    },
  });
  return rows as RawOpRow[];
}

async function loadProductMeta(
  db: TenantPrismaClient,
  productIds: string[],
): Promise<Map<string, { name: string; sku: string }>> {
  const uniq = [...new Set(productIds.filter(Boolean))];
  if (uniq.length === 0) return new Map();
  const products = await db.product.findMany({
    where: { id: { in: uniq } },
    select: { id: true, name: true, sku: true },
  });
  return new Map(products.map((p) => [p.id, { name: p.name, sku: p.sku ?? '' }]));
}

function buildSummaryAndReturnable(
  rows: RawOpRow[],
  productMeta: Map<string, { name: string; sku: string }>,
): { summary: DevMaterialSummaryRow[]; returnable: DevMaterialReturnableRow[] } {
  const byProduct = new Map<string, { issued: number; returned: number }>();
  const byReturnKey = new Map<string, { productId: string; warehouseId: string; batchNo: string; issued: number; returned: number }>();

  for (const row of rows) {
    const qty = toQty(row.quantity);
    const productId = row.productId;
    const warehouseId = String(row.warehouseId ?? '').trim();
    const batchNo = batchNoForDisplay(row.batchNo);

    const prodAcc = byProduct.get(productId) ?? { issued: 0, returned: 0 };
    if (row.type === 'STOCK_OUT') prodAcc.issued += qty;
    else if (row.type === 'STOCK_RETURN') prodAcc.returned += qty;
    byProduct.set(productId, prodAcc);

    if (!warehouseId) continue;
    const key = returnKey(productId, warehouseId, row.batchNo);
    const acc = byReturnKey.get(key) ?? {
      productId,
      warehouseId,
      batchNo,
      issued: 0,
      returned: 0,
    };
    if (row.type === 'STOCK_OUT') acc.issued += qty;
    else if (row.type === 'STOCK_RETURN') acc.returned += qty;
    byReturnKey.set(key, acc);
  }

  const summary: DevMaterialSummaryRow[] = [...byProduct.entries()]
    .map(([productId, acc]) => {
      const meta = productMeta.get(productId);
      return {
        productId,
        productName: meta?.name ?? productId,
        productSku: meta?.sku ?? '',
        issuedQty: acc.issued,
        returnedQty: acc.returned,
        netQty: acc.issued - acc.returned,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, 'zh-CN'));

  const returnable: DevMaterialReturnableRow[] = [...byReturnKey.values()]
    .map((acc) => {
      const meta = productMeta.get(acc.productId);
      return {
        productId: acc.productId,
        productName: meta?.name ?? acc.productId,
        productSku: meta?.sku ?? '',
        warehouseId: acc.warehouseId,
        batchNo: acc.batchNo,
        returnableQty: acc.issued - acc.returned,
      };
    })
    .filter((r) => r.returnableQty > 1e-9)
    .sort((a, b) => {
      const nameCmp = a.productName.localeCompare(b.productName, 'zh-CN');
      if (nameCmp !== 0) return nameCmp;
      return a.batchNo.localeCompare(b.batchNo, 'zh-CN');
    });

  return { summary, returnable };
}

function buildDocGroups(
  rows: RawOpRow[],
  productMeta: Map<string, { name: string; sku: string }>,
): DevMaterialDocGroup[] {
  const byDoc = new Map<string, DevMaterialDocGroup>();
  for (const row of rows) {
    const docNo = String(row.docNo ?? '').trim() || row.id;
    const type = row.type === 'STOCK_RETURN' ? 'STOCK_RETURN' : 'STOCK_OUT';
    const meta = productMeta.get(row.productId);
    let group = byDoc.get(docNo);
    if (!group) {
      group = {
        docNo,
        type,
        timestamp: row.timestamp.toISOString(),
        operator: row.operator,
        lines: [],
      };
      byDoc.set(docNo, group);
    }
    group.lines.push({
      id: row.id,
      productId: row.productId,
      productName: meta?.name ?? row.productId,
      productSku: meta?.sku ?? '',
      quantity: toQty(row.quantity),
      warehouseId: row.warehouseId,
      batchNo: row.batchNo,
    });
  }
  return [...byDoc.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function countDevMaterialRecords(db: TenantPrismaClient, styleId: string): Promise<number> {
  return db.productionOpRecord.count({
    where: {
      reason: PROD_OP_REASON_FROM_DEV,
      customData: { path: ['devStyleId'], equals: styleId },
    },
  });
}

export async function listDevMaterialRecords(
  db: TenantPrismaClient,
  styleId: string,
): Promise<DevMaterialRecordsResponse> {
  const style = await assertStyle(db, styleId);
  const [rows, bomProductIds] = await Promise.all([
    listDevMaterialOpRows(db, styleId),
    loadBomProductIds(db, styleId),
  ]);
  const productIds = [
    ...bomProductIds,
    ...rows.map((r) => r.productId),
  ];
  const productMeta = await loadProductMeta(db, productIds);
  const { summary, returnable } = buildSummaryAndReturnable(rows, productMeta);
  const docs = buildDocGroups(rows, productMeta);
  return {
    summary,
    returnable,
    docs,
    bomProductIds,
    canIssue: style.status === DevStyleStatus.DEVELOPING,
    canReturn: returnable.length > 0,
  };
}

async function createDevMaterialBatch(
  db: TenantPrismaClient,
  tenantId: string,
  styleId: string,
  body: DevMaterialBatchRequest,
  type: MaterialOpType,
  creatorUserId?: string,
): Promise<DevMaterialBatchResult> {
  const style = await assertStyle(db, styleId);
  const lines = normalizeLines(body.lines);

  if (type === 'STOCK_OUT' && style.status !== DevStyleStatus.DEVELOPING) {
    throw new AppError(409, '仅开发中的款式可继续领料；归档/已发布仅可退料');
  }

  const bomProductIds = new Set(await loadBomProductIds(db, styleId));
  if (type === 'STOCK_OUT') {
    if (bomProductIds.size === 0) {
      throw new AppError(400, '请先配置试制 BOM 后再领料');
    }
    for (const line of lines) {
      if (!bomProductIds.has(line.productId)) {
        throw new AppError(400, `物料不在该款式试制 BOM 中：${line.productId}`);
      }
    }
  }

  if (type === 'STOCK_RETURN') {
    const existing = await listDevMaterialOpRows(db, styleId);
    const productMeta = await loadProductMeta(db, existing.map((r) => r.productId));
    const { returnable } = buildSummaryAndReturnable(existing, productMeta);
    const avail = new Map(returnable.map((r) => [returnKey(r.productId, r.warehouseId, r.batchNo), r.returnableQty]));
    for (const line of lines) {
      const key = returnKey(line.productId, line.warehouseId, line.batchNo);
      const left = avail.get(key) ?? 0;
      if (line.quantity > left + 1e-9) {
        throw new AppError(
          400,
          `退料超出可退数量（物料 ${line.productId} / 仓库 ${line.warehouseId} / 批次 ${batchNoForDisplay(line.batchNo)}，可退 ${left}）`,
        );
      }
      avail.set(key, left - line.quantity);
    }
  }

  const operator = String(body.operator ?? '').trim() || undefined;
  const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    throw new AppError(400, '单据时间无效');
  }

  const records = lines.map((line) => {
    const batchNo =
      line.batchNo == null || isUntaggedBatch(line.batchNo)
        ? type === 'STOCK_RETURN'
          ? BATCH_NO_UNTAGGED
          : null
        : String(line.batchNo).trim();
    return {
      type,
      productId: line.productId,
      quantity: line.quantity,
      warehouseId: line.warehouseId,
      batchNo,
      orderId: null,
      sourceProductId: null,
      partner: null,
      reason: PROD_OP_REASON_FROM_DEV,
      status: '已完成',
      operator,
      timestamp,
      customData: { devStyleId: styleId },
    };
  });

  const result = await createRecordBatch(db, records, tenantId, creatorUserId);
  const created = (result.records ?? []) as Array<{ id?: string; docNo?: string | null }>;
  const docNo = String(created[0]?.docNo ?? '').trim();
  if (!docNo) {
    throw new AppError(500, '开发物料单据号生成失败');
  }
  return {
    docNo,
    type,
    recordIds: created.map((r) => String(r.id ?? '')).filter(Boolean),
  };
}

export async function createDevMaterialIssueBatch(
  db: TenantPrismaClient,
  tenantId: string,
  styleId: string,
  body: DevMaterialBatchRequest,
  creatorUserId?: string,
): Promise<DevMaterialBatchResult> {
  return createDevMaterialBatch(db, tenantId, styleId, body, 'STOCK_OUT', creatorUserId);
}

export async function createDevMaterialReturnBatch(
  db: TenantPrismaClient,
  tenantId: string,
  styleId: string,
  body: DevMaterialBatchRequest,
  creatorUserId?: string,
): Promise<DevMaterialBatchResult> {
  return createDevMaterialBatch(db, tenantId, styleId, body, 'STOCK_RETURN', creatorUserId);
}
