/**
 * 工单中心列表「生产物料」弹窗专用口径：
 * - 领退往来：仅本厂 STOCK_OUT / STOCK_RETURN（无 partner，排除开发/返工）
 * - 报工耗材：沿用工单报工推算（theoryCost / actualCost），与详情页同源
 * 工单详情「生产物料」仍用全量 useOrderMaterialStats，不走本文件。
 */
import type { DevMaterialReturnableRow, Product, ProductionOpRecord } from '../types';
import { batchNoForDisplay } from '../types';
import { shouldExcludeFromProductionMaterialStats } from './productionMaterialReason';
import {
  filterMaterialRowsWithActivity,
  type MatRow,
} from '../views/production-ops/stockMaterialPanelHelpers';

export type OrderMaterialReturnableRow = DevMaterialReturnableRow;

function toQty(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 是否计入工单中心本厂领退往来（统计 / 可退 / 流水类型） */
export function isOrderCenterMaterialStockRecord(r: ProductionOpRecord): boolean {
  if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') return false;
  if ((r.partner ?? '').trim()) return false;
  if (shouldExcludeFromProductionMaterialStats(r.reason)) return false;
  return true;
}

/**
 * 从已窄拉的 STOCK_OUT / STOCK_RETURN 聚合可退行。
 * - 仅本厂（无 partner）
 * - 排除 `shouldExcludeFromProductionMaterialStats`（开发/返工）
 * - 无 warehouseId 的行不计入可退（与后端 material-op-shared 一致）
 */
export function buildOrderMaterialReturnable(
  stockRecords: ProductionOpRecord[],
  productsById: Map<string, Product>,
): OrderMaterialReturnableRow[] {
  const byKey = new Map<
    string,
    { productId: string; warehouseId: string; batchNo: string; issued: number; returned: number }
  >();

  for (const r of stockRecords) {
    if (!isOrderCenterMaterialStockRecord(r)) continue;
    const warehouseId = String(r.warehouseId ?? '').trim();
    if (!warehouseId) continue;
    const productId = String(r.productId ?? '').trim();
    if (!productId) continue;
    const batchNo = batchNoForDisplay(r.batchNo);
    const key = `${productId}::${warehouseId}::${batchNo}`;
    const acc = byKey.get(key) ?? { productId, warehouseId, batchNo, issued: 0, returned: 0 };
    const qty = toQty(r.quantity);
    if (r.type === 'STOCK_OUT') acc.issued += qty;
    else acc.returned += qty;
    byKey.set(key, acc);
  }

  return [...byKey.values()]
    .map(acc => {
      const p = productsById.get(acc.productId);
      return {
        productId: acc.productId,
        productName: p?.name ?? acc.productId,
        productSku: p?.sku ?? '',
        warehouseId: acc.warehouseId,
        batchNo: acc.batchNo,
        returnableQty: Math.round((acc.issued - acc.returned) * 1000) / 1000,
      };
    })
    .filter(r => r.returnableQty > 1e-9)
    .sort((a, b) => {
      const nameCmp = a.productName.localeCompare(b.productName, 'zh-CN');
      if (nameCmp !== 0) return nameCmp;
      return a.batchNo.localeCompare(b.batchNo, 'zh-CN');
    });
}

/** 按物料汇总本厂领退数量（供工单中心弹窗统计表覆盖 issue / returnQty） */
export function sumOrderCenterIssueReturnByProduct(
  stockRecords: ProductionOpRecord[],
): Map<string, { issue: number; returnQty: number }> {
  const map = new Map<string, { issue: number; returnQty: number }>();
  for (const r of stockRecords) {
    if (!isOrderCenterMaterialStockRecord(r)) continue;
    const productId = String(r.productId ?? '').trim();
    if (!productId) continue;
    const acc = map.get(productId) ?? { issue: 0, returnQty: 0 };
    const qty = toQty(r.quantity);
    if (r.type === 'STOCK_OUT') acc.issue += qty;
    else acc.returnQty += qty;
    map.set(productId, acc);
  }
  return map;
}

/**
 * 工单中心弹窗统计：保留报工耗材（theory/actual），领退改写为本厂往来；去掉无活动占位行。
 * 外协 / 返工 / 开发领退不计入领退列（与详情页全量统计刻意分离）。
 */
export function toOrderCenterMaterialStats(
  materials: MatRow[],
  stockRecords: ProductionOpRecord[],
): MatRow[] {
  const byProduct = sumOrderCenterIssueReturnByProduct(stockRecords);
  const remapped = materials.map(row => {
    const acc = byProduct.get(row.productId);
    return {
      ...row,
      issue: acc?.issue ?? 0,
      returnQty: acc?.returnQty ?? 0,
    };
  });
  const known = new Set(remapped.map(r => r.productId));
  for (const [productId, acc] of byProduct) {
    if (known.has(productId)) continue;
    remapped.push({
      productId,
      issue: acc.issue,
      returnQty: acc.returnQty,
      theoryCost: 0,
      actualCost: 0,
    });
  }
  return filterMaterialRowsWithActivity(remapped);
}

/**
 * 退料 UI：按物料聚合可退行，供「一行一物料 + 批次下拉」使用（对齐外协退料 / 发出）。
 */
export type OrderMaterialReturnProductRow = {
  productId: string;
  productName: string;
  productSku: string;
  /** 该物料全部批次可退合计 */
  returnableQty: number;
  batches: { batchNo: string; returnableQty: number }[];
};

export function aggregateReturnableByProduct(
  returnable: OrderMaterialReturnableRow[],
): OrderMaterialReturnProductRow[] {
  const map = new Map<string, OrderMaterialReturnProductRow>();
  for (const row of returnable) {
    const existing = map.get(row.productId);
    if (!existing) {
      map.set(row.productId, {
        productId: row.productId,
        productName: row.productName,
        productSku: row.productSku,
        returnableQty: row.returnableQty,
        batches: [{ batchNo: row.batchNo, returnableQty: row.returnableQty }],
      });
      continue;
    }
    existing.returnableQty += row.returnableQty;
    const bi = existing.batches.find(b => b.batchNo === row.batchNo);
    if (bi) bi.returnableQty += row.returnableQty;
    else existing.batches.push({ batchNo: row.batchNo, returnableQty: row.returnableQty });
  }
  return [...map.values()]
    .map(r => ({
      ...r,
      returnableQty: Math.round(r.returnableQty * 1000) / 1000,
      batches: r.batches
        .map(b => ({ ...b, returnableQty: Math.round(b.returnableQty * 1000) / 1000 }))
        .sort((a, b) => a.batchNo.localeCompare(b.batchNo, 'zh-CN')),
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName, 'zh-CN'));
}
