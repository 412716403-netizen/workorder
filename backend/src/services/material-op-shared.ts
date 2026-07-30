/**
 * 开发物料 / 返工物料共用的领退料聚合辅助：
 * 两个业务都以 ProductionOpRecord（STOCK_OUT / STOCK_RETURN + 专属 reason）为数据源，
 * 汇总（累计领/退/净领用）、可退量（物料+仓库+批次）与单据分组的算法完全一致。
 */
import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  batchNoForDisplay,
  type DevMaterialDocGroup,
  type DevMaterialLineInput,
  type DevMaterialReturnableRow,
  type DevMaterialSummaryRow,
} from '../../../shared/types.js';

export type MaterialOpType = 'STOCK_OUT' | 'STOCK_RETURN';

export interface RawOpRow {
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

export function toQty(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function returnKey(productId: string, warehouseId: string, batchNo: string | null | undefined): string {
  return `${productId}::${warehouseId}::${batchNoForDisplay(batchNo)}`;
}

export function normalizeLines(raw: unknown): DevMaterialLineInput[] {
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

export async function loadProductMeta(
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

export function buildSummaryAndReturnable(
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

export function buildDocGroups(
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

/** 退料超额校验：按「物料 + 批次」合计可退量（入库仓库可由用户另选，不锁原出库仓） */
export function assertReturnWithinReturnable(
  lines: DevMaterialLineInput[],
  returnable: DevMaterialReturnableRow[],
): void {
  const avail = new Map<string, number>();
  for (const r of returnable) {
    const key = `${r.productId}::${batchNoForDisplay(r.batchNo)}`;
    avail.set(key, (avail.get(key) ?? 0) + r.returnableQty);
  }
  for (const line of lines) {
    if (!String(line.warehouseId ?? '').trim()) {
      throw new AppError(400, '退料须指定入库仓库');
    }
    const key = `${line.productId}::${batchNoForDisplay(line.batchNo)}`;
    const left = avail.get(key) ?? 0;
    if (line.quantity > left + 1e-9) {
      throw new AppError(
        400,
        `退料超出可退数量（物料 ${line.productId} / 批次 ${batchNoForDisplay(line.batchNo)}，可退 ${left}）`,
      );
    }
    avail.set(key, left - line.quantity);
  }
}

/**
 * 改/删领料流水后，断言按「物料 + 批次」合计仍满足 已领 >= 已退。
 * 与 {@link assertReturnWithinReturnable} 同口径（不锁仓库）。
 */
export function assertNoNegativeIssuedNet(rows: RawOpRow[]): void {
  const byKey = new Map<string, { productId: string; batchNo: string; issued: number; returned: number }>();
  for (const row of rows) {
    const qty = toQty(row.quantity);
    const productId = row.productId;
    const batchNo = batchNoForDisplay(row.batchNo);
    const key = `${productId}::${batchNo}`;
    const acc = byKey.get(key) ?? { productId, batchNo, issued: 0, returned: 0 };
    if (row.type === 'STOCK_OUT') acc.issued += qty;
    else if (row.type === 'STOCK_RETURN') acc.returned += qty;
    byKey.set(key, acc);
  }
  for (const acc of byKey.values()) {
    if (acc.returned > acc.issued + 1e-9) {
      throw new AppError(
        400,
        `修改后已退量超过已领量（物料 ${acc.productId} / 批次 ${acc.batchNo}，已领 ${acc.issued}、已退 ${acc.returned}）；请先处理对应退料单`,
      );
    }
  }
}
