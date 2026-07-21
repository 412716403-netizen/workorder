/**
 * 外协物料汇总：按物料聚合带 partner 的 STOCK_OUT / STOCK_RETURN，
 * 以及外协收回按 BOM 推算的「交货耗材」。
 * 口径与外协发出/退回子弹窗一致（含产品模式下 sourceProductId + 同产品工单族）。
 */
import type { BOM, Product, ProductionOpRecord, ProductionOrder } from '../types';
import { shouldExcludeFromProductionMaterialStats } from './productionMaterialReason';

export interface OutsourceMaterialSummaryRow {
  productId: string;
  productName: string;
  productSku: string;
  issuedQty: number;
  returnedQty: number;
  netQty: number;
  /** 外协已收回 × BOM 子项用量（与退回弹窗「交货耗材」同口径） */
  consumableQty: number;
  /** 结余 = 净外发 − 交货耗材 */
  balanceQty: number;
}

export interface OutsourceMaterialScope {
  productionLinkMode: 'order' | 'product';
  orderId?: string | null;
  productId?: string | null;
  /** 关联产品模式下同成品工单 id；不传则由 orders + productId 推算 */
  relatedOrderIds?: Set<string>;
  orders?: ProductionOrder[];
}

export interface OutsourceDeliveryConsumableOpts {
  finishedProductId?: string | null;
  products: Product[];
  boms: BOM[];
  /** 若传入则只统计该工厂；缺省为卡片内全部工厂 */
  partner?: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveRelatedOrderIds(scope: OutsourceMaterialScope): Set<string> {
  if (scope.relatedOrderIds) return scope.relatedOrderIds;
  const pid = scope.productId;
  if (!pid || !scope.orders) return new Set();
  return new Set(scope.orders.filter(o => o.productId === pid).map(o => o.id));
}

/** 是否属于当前外协物料卡片作用域（须已带 partner，且非开发/返工 reason） */
export function matchesOutsourceMaterialScope(
  r: ProductionOpRecord,
  scope: OutsourceMaterialScope,
): boolean {
  if (!r.partner?.trim()) return false;
  if (shouldExcludeFromProductionMaterialStats(r.reason)) return false;
  if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') return false;

  if (scope.productionLinkMode === 'product') {
    const targetProductId = scope.productId;
    if (!targetProductId) return false;
    if (r.sourceProductId === targetProductId) return true;
    const related = resolveRelatedOrderIds(scope);
    return Boolean(r.orderId && related.has(r.orderId));
  }

  return Boolean(scope.orderId && r.orderId === scope.orderId);
}

/** 外协已收回记录是否落在当前卡片作用域 */
export function matchesOutsourceReceiveScope(
  r: ProductionOpRecord,
  scope: OutsourceMaterialScope,
): boolean {
  if (r.type !== 'OUTSOURCE' || r.status !== '已收回') return false;
  if (!r.partner?.trim() || !r.nodeId) return false;

  if (scope.productionLinkMode === 'product') {
    const targetProductId = scope.productId;
    if (!targetProductId) return false;
    if (!r.orderId && r.productId === targetProductId) return true;
    const related = resolveRelatedOrderIds(scope);
    return Boolean(r.orderId && related.has(r.orderId));
  }

  return Boolean(scope.orderId && r.orderId === scope.orderId);
}

/**
 * 按外协已收回数量 × 工序 BOM 推算交货耗材（物料 productId → 数量）。
 * 与 `OutsourceMaterialReturnModal` 内「交货耗材」列同口径。
 */
export function buildOutsourceDeliveryConsumable(
  records: ProductionOpRecord[],
  scope: OutsourceMaterialScope,
  opts: OutsourceDeliveryConsumableOpts,
): Map<string, number> {
  const consumed = new Map<string, number>();
  const finishedProductId = opts.finishedProductId ?? scope.productId ?? null;
  if (!finishedProductId) return consumed;

  const partnerFilter = opts.partner?.trim() || null;
  const finished = opts.products.find(p => p.id === finishedProductId);
  const variants = finished?.variants ?? [];
  const receivedByNodeVar = new Map<string, number>();

  for (const r of records) {
    if (!matchesOutsourceReceiveScope(r, scope)) continue;
    if (partnerFilter && r.partner !== partnerFilter) continue;
    const key = r.variantId ? `${r.nodeId!}|${r.variantId}` : r.nodeId!;
    receivedByNodeVar.set(key, (receivedByNodeVar.get(key) ?? 0) + (Number(r.quantity) || 0));
  }

  receivedByNodeVar.forEach((recvQty, key) => {
    const sepIdx = key.indexOf('|');
    const nodeId = sepIdx >= 0 ? key.slice(0, sepIdx) : key;
    const variantId = sepIdx >= 0 ? key.slice(sepIdx + 1) : undefined;
    let matchedBoms: BOM[] = [];
    if (variantId) {
      const v = variants.find(vx => vx.id === variantId);
      if (v?.nodeBoms) {
        const bomId = (v.nodeBoms as Record<string, string>)[nodeId];
        if (bomId) {
          const b = opts.boms.find(bx => bx.id === bomId);
          if (b) matchedBoms = [b];
        }
      }
      if (matchedBoms.length === 0) {
        matchedBoms = opts.boms.filter(
          b => b.parentProductId === finishedProductId && b.nodeId === nodeId && b.variantId === variantId,
        );
      }
    }
    if (matchedBoms.length === 0) {
      matchedBoms = opts.boms.filter(
        b => b.parentProductId === finishedProductId && b.nodeId === nodeId && !b.variantId,
      );
    }
    matchedBoms.forEach(bom => {
      bom.items.forEach(bi => {
        consumed.set(
          bi.productId,
          (consumed.get(bi.productId) ?? 0) + Number(bi.quantity) * recvQty,
        );
      });
    });
  });

  return consumed;
}

/** 可退回 = max(0, 已外发 − 交货耗材 − 已退回) */
export function outsourceReturnableQty(dispatched: number, consumable: number, returned: number): number {
  return Math.max(0, round2(dispatched - consumable - returned));
}

export function buildOutsourceMaterialSummary(
  records: ProductionOpRecord[],
  productsById: Map<string, { name: string; sku?: string | null }>,
  scope: OutsourceMaterialScope,
  consumableOpts?: OutsourceDeliveryConsumableOpts,
): OutsourceMaterialSummaryRow[] {
  const issued = new Map<string, number>();
  const returned = new Map<string, number>();

  for (const r of records) {
    if (!matchesOutsourceMaterialScope(r, scope)) continue;
    const qty = Number(r.quantity) || 0;
    if (r.type === 'STOCK_OUT') {
      issued.set(r.productId, (issued.get(r.productId) ?? 0) + qty);
    } else {
      returned.set(r.productId, (returned.get(r.productId) ?? 0) + qty);
    }
  }

  const consumable = consumableOpts
    ? buildOutsourceDeliveryConsumable(records, scope, consumableOpts)
    : new Map<string, number>();

  const productIds = new Set([...issued.keys(), ...returned.keys(), ...consumable.keys()]);
  const rows: OutsourceMaterialSummaryRow[] = [];
  for (const productId of productIds) {
    const issuedQty = issued.get(productId) ?? 0;
    const returnedQty = returned.get(productId) ?? 0;
    const netQty = issuedQty - returnedQty;
    const consumableQty = round2(consumable.get(productId) ?? 0);
    const meta = productsById.get(productId);
    rows.push({
      productId,
      productName: meta?.name ?? '未知物料',
      productSku: meta?.sku ?? '',
      issuedQty,
      returnedQty,
      netQty,
      consumableQty,
      balanceQty: round2(netQty - consumableQty),
    });
  }
  rows.sort((a, b) => a.productName.localeCompare(b.productName, 'zh'));
  return rows;
}

/** 是否存在可退回的外协外发记录（任一工厂有 STOCK_OUT） */
export function hasOutsourceMaterialDispatch(
  records: ProductionOpRecord[],
  scope: OutsourceMaterialScope,
): boolean {
  return records.some(
    r => r.type === 'STOCK_OUT' && matchesOutsourceMaterialScope(r, scope),
  );
}

/** 卡片范围内出现过外发的加工厂名（用于退回弹窗工厂下拉） */
export function listOutsourceDispatchPartners(
  records: ProductionOpRecord[],
  scope: OutsourceMaterialScope,
): string[] {
  const names = new Set<string>();
  for (const r of records) {
    if (r.type !== 'STOCK_OUT') continue;
    if (!matchesOutsourceMaterialScope(r, scope)) continue;
    const p = r.partner?.trim();
    if (p) names.add(p);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'zh'));
}
