import { lookupContextMaterialPrice } from './materialPurchasePrice.js';
import { resolveTheoreticalProcessUnitPrice } from './processEconomicsPrice.js';
import type { TheoreticalCostBreakdown, TheoreticalCostBreakdownItem } from './types.js';

export type TheoreticalCostBomItem = { productId: string; quantity: unknown };
export type TheoreticalCostBom = {
  parentProductId: string;
  variantId: string | null;
  nodeId: string | null;
  items: TheoreticalCostBomItem[];
};

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseMilestoneNodeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export function pickRootBomForTheoreticalCost(
  boms: TheoreticalCostBom[],
  productId: string,
): TheoreticalCostBom | undefined {
  const productBoms = boms.filter(b => b.parentProductId === productId);
  return (
    productBoms.find(b => !b.variantId && !b.nodeId)
    ?? productBoms.find(b => !b.variantId)
    ?? productBoms[0]
  );
}

export function buildTheoreticalCostBreakdown(params: {
  boms: TheoreticalCostBom[];
  productId: string;
  priceMap: Map<string, number>;
  nodeRates: Record<string, number>;
  reportPriceMap: Map<string, number>;
  outsourcePriceMap: Map<string, number>;
  milestoneNodeIds: string[];
  materialLabelById: Map<string, string>;
  nodeNameById: Map<string, string>;
}): TheoreticalCostBreakdown {
  const {
    boms,
    productId,
    priceMap,
    nodeRates,
    reportPriceMap,
    outsourcePriceMap,
    milestoneNodeIds,
    materialLabelById,
    nodeNameById,
  } = params;

  const items: TheoreticalCostBreakdownItem[] = [];
  const chosen = pickRootBomForTheoreticalCost(boms, productId);
  if (chosen) {
    for (const item of chosen.items) {
      const qty = num(item.quantity);
      if (!(qty > 0)) continue;
      const amount = round2(qty * lookupContextMaterialPrice(priceMap, productId, item.productId));
      if (!(amount > 0)) continue;
      items.push({
        key: `material:${item.productId}`,
        kind: 'material',
        label: materialLabelById.get(item.productId) ?? item.productId,
        amount,
      });
    }
  }

  for (const nodeId of parseMilestoneNodeIds(milestoneNodeIds)) {
    const amount = round2(
      resolveTheoreticalProcessUnitPrice({
        outsourcePriceMap,
        reportPriceMap,
        nodeRates,
        productId,
        nodeId,
      }),
    );
    if (!(amount > 0)) continue;
    items.push({
      key: `process:${nodeId}`,
      kind: 'process',
      label: nodeNameById.get(nodeId) ?? nodeId,
      amount,
    });
  }

  const total = round2(items.reduce((sum, i) => sum + i.amount, 0));
  const withPct = items.map(item => ({
    ...item,
    pct: total > 0 ? round2((item.amount / total) * 100) : 0,
  }));

  return { total, items: withPct };
}

export function computeTheoreticalUnitCost(breakdown: TheoreticalCostBreakdown): number {
  return breakdown.total;
}
