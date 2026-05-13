/**
 * StockMaterialPanel 的纯函数 helper：物料行筛选、BOM 解析、按重量快照分摊耗材。
 * 从 StockMaterialPanel.tsx 顶部抽出（S11 工程性整理），无外部副作用，可直接被单测覆盖。
 */
import type { Product, BOM, MaterialBreakdownRow } from '../../types';

export type MatRow = { productId: string; issue: number; returnQty: number; theoryCost: number };

/** 领料、退料、报工理论耗材（与表格同精度）均为 0 时视为无展示价值的占位行 */
export function filterMaterialRowsWithActivity(materials: MatRow[]): MatRow[] {
  return materials.filter(m => {
    if (m.issue !== 0 || m.returnQty !== 0) return true;
    const th = Math.round(Number(m.theoryCost) * 100) / 100;
    return th !== 0;
  });
}

/** 与表格「按关键词筛物料行」逻辑一致（供列表过滤与 useCallback 共用） */
export function displayMaterialsForKeyword(
  materials: MatRow[],
  materialKw: string,
  productsById: Map<string, Product>,
): MatRow[] {
  const kw = materialKw.trim().toLowerCase();
  if (!kw) return materials;
  const hit = materials.filter(m => {
    const p = productsById.get(m.productId);
    return (p?.name ?? '').toLowerCase().includes(kw) || (p?.sku ?? '').toLowerCase().includes(kw);
  });
  return hit.length > 0 ? hit : materials;
}

export function visibleMaterialRowsForList(
  materials: MatRow[],
  materialKw: string,
  productsById: Map<string, Product>,
): MatRow[] {
  return filterMaterialRowsWithActivity(displayMaterialsForKeyword(materials, materialKw, productsById));
}

/**
 * 取指定产品在指定工序节点上的 BOM 子物料列表。
 * 优先级：产品规格级 nodeBoms > parent product 下挂的 variant BOM > parent product 通用 BOM。
 * Shared between partnerMaterialGroups and potentially other BOM-aware logic.
 */
export function resolveBomItems(
  productsById: Map<string, Product>,
  bomsById: Map<string, BOM>,
  bomsByParentProduct: Map<string, BOM[]>,
  productId: string,
  nodeId: string,
  variantId?: string,
): { productId: string; quantity: number }[] {
  const product = productsById.get(productId);
  if (!product) return [];
  const items: { productId: string; quantity: number }[] = [];
  const variants = product.variants ?? [];

  if (variantId && variants.length > 0) {
    const v = variants.find(vv => vv.id === variantId);
    if (v?.nodeBoms) {
      const bomId = (v.nodeBoms as Record<string, string>)[nodeId];
      if (bomId) {
        const bom = bomsById.get(bomId);
        if (bom) { bom.items.forEach(bi => items.push({ productId: bi.productId, quantity: Number(bi.quantity) })); return items; }
      }
    }
    (bomsByParentProduct.get(product.id) ?? [])
      .filter(b => b.nodeId === nodeId && b.variantId === variantId)
      .forEach(bom => bom.items.forEach(bi => items.push({ productId: bi.productId, quantity: Number(bi.quantity) })));
    if (items.length > 0) return items;
  }

  (bomsByParentProduct.get(product.id) ?? [])
    .filter(b => b.nodeId === nodeId)
    .forEach(bom => bom.items.forEach(bi => items.push({ productId: bi.productId, quantity: Number(bi.quantity) })));
  return items;
}

/**
 * 若 report / OUTSOURCE 记录里带有按重量拆分的 materialBreakdown 快照，
 * 则直接把各子物料 actualWeight 计入 addToTheory，并返回 true（表示已替代 BOM×件数 口径）。
 *
 * `weightEnabled` 表示该 report/OUTSOURCE 命中的工序当前是否开启 `enableWeightOnReport`：
 * 没开启时即便记录里残留陈旧的 materialBreakdown（曾经开启过又关掉），也不应再按"重量 × 占比"算耗材，
 * 否则会出现"30 件 × 0.32 BOM 应得 9.6，却被陈旧的 1.4kg 快照算成 1.07"这类肉眼可见的偏低。
 */
export function applyMaterialBreakdown(
  source: { materialBreakdown?: MaterialBreakdownRow[] | unknown } | null | undefined,
  addToTheory: (productId: string, amount: number) => void,
  weightEnabled: boolean = true,
): boolean {
  if (!weightEnabled) return false;
  const raw = source ? (source as { materialBreakdown?: unknown }).materialBreakdown : null;
  const mb = Array.isArray(raw) ? (raw as MaterialBreakdownRow[]) : null;
  if (!mb || mb.length === 0) return false;
  for (const row of mb) {
    const pid = row?.materialProductId;
    const amt = Number(row?.actualWeight);
    if (!pid || !Number.isFinite(amt) || amt <= 0) continue;
    addToTheory(pid, amt);
  }
  return true;
}
