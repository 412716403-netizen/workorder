import {
  DEFAULT_PARENT_BOM_MATERIAL_PRICE_RULE,
  type EconomicsNodePriceRules,
  type MaterialPriceRule,
  type ProcessNodePriceRuleSource,
  type ProcessPriceSource,
} from './types.js';
import {
  filterBillsInRange,
  materialPriceRuleToPeriod,
  resolveMaterialPriceDateRange,
} from './materialPurchasePrice.js';

export type ReportRateLine = {
  rate: unknown;
  quantity: unknown;
  timestamp: Date | string;
};

export type OutsourcePriceLine = {
  unitPrice: unknown;
  amount: unknown;
  quantity: unknown;
  timestamp: Date | string;
};

export type ProcessPriceResolution = {
  unitPrice: number | null;
  priceSource: ProcessPriceSource | null;
  recordCountInPeriod: number;
};

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function lineTimestampMs(v: Date | string): number {
  const d = v instanceof Date ? v : new Date(v);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function processNodePriceContextKey(productId: string, nodeId: string): string {
  return `${productId}:${nodeId}`;
}

export function lookupContextProcessPrice(
  priceMap: Map<string, number>,
  productId: string,
  nodeId: string,
): number {
  return priceMap.get(processNodePriceContextKey(productId, nodeId)) ?? 0;
}

export function resolveParentNodeDefaultRule(
  defaultRule: MaterialPriceRule | null | undefined,
): MaterialPriceRule {
  if (!defaultRule || defaultRule.mode === 'all_time') {
    return DEFAULT_PARENT_BOM_MATERIAL_PRICE_RULE;
  }
  return defaultRule;
}

export function resolveEffectiveNodePriceRule(
  parentConfig: EconomicsNodePriceRules | null | undefined,
  nodeId: string,
): { rule: MaterialPriceRule; ruleSource: ProcessNodePriceRuleSource } {
  const override = parentConfig?.nodeOverrides?.[nodeId];
  if (override && typeof override === 'object') {
    if ('inherit' in override && override.inherit === true) {
      /* fall through */
    } else if ('mode' in override) {
      const rule =
        override.mode === 'all_time' ? DEFAULT_PARENT_BOM_MATERIAL_PRICE_RULE : override;
      return { rule, ruleSource: 'node_override' };
    }
  }
  return {
    rule: resolveParentNodeDefaultRule(parentConfig?.defaultRule),
    ruleSource: 'parent_default',
  };
}

function filterLinesInRange<T extends { timestamp: Date | string }>(
  lines: T[],
  range: { start: Date; end: Date } | null,
): T[] {
  if (!range) return lines;
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  return lines.filter(l => {
    const ms = lineTimestampMs(l.timestamp);
    return ms >= startMs && ms <= endMs;
  });
}

function latestReportRateFromLines(lines: ReportRateLine[]): number | null {
  let bestMs = -1;
  let bestRate: number | null = null;
  for (const l of lines) {
    const rate = num(l.rate);
    if (!(rate > 0)) continue;
    const ms = lineTimestampMs(l.timestamp);
    if (ms >= bestMs) {
      bestMs = ms;
      bestRate = rate;
    }
  }
  return bestRate;
}

function weightedAvgReportRateFromLines(lines: ReportRateLine[]): number | null {
  let totalQty = 0;
  let totalAmount = 0;
  for (const l of lines) {
    const qty = num(l.quantity);
    const rate = num(l.rate);
    if (!(qty > 0) || !(rate > 0)) continue;
    totalQty += qty;
    totalAmount += qty * rate;
  }
  if (totalQty <= 0) return null;
  return totalAmount / totalQty;
}

function outsourceUnitPriceFromLine(line: OutsourcePriceLine): number | null {
  const direct = num(line.unitPrice);
  if (direct > 0) return direct;
  const qty = num(line.quantity);
  const amount = num(line.amount);
  if (qty > 0 && amount > 0) return amount / qty;
  return null;
}

function latestOutsourcePriceFromLines(lines: OutsourcePriceLine[]): number | null {
  let bestMs = -1;
  let bestPrice: number | null = null;
  for (const l of lines) {
    const price = outsourceUnitPriceFromLine(l);
    if (price == null || !(price > 0)) continue;
    const ms = lineTimestampMs(l.timestamp);
    if (ms >= bestMs) {
      bestMs = ms;
      bestPrice = price;
    }
  }
  return bestPrice;
}

function weightedAvgOutsourcePriceFromLines(lines: OutsourcePriceLine[]): number | null {
  let totalQty = 0;
  let totalAmount = 0;
  for (const l of lines) {
    const qty = num(l.quantity);
    const price = outsourceUnitPriceFromLine(l);
    if (!(qty > 0) || price == null || !(price > 0)) continue;
    totalQty += qty;
    totalAmount += qty * price;
  }
  if (totalQty <= 0) return null;
  return totalAmount / totalQty;
}

function archiveFallback(archiveRate: unknown): ProcessPriceResolution {
  const fallback = num(archiveRate);
  if (fallback > 0) {
    return { unitPrice: fallback, priceSource: 'archive', recordCountInPeriod: 0 };
  }
  return { unitPrice: null, priceSource: null, recordCountInPeriod: 0 };
}

export function resolveReportUnitPriceFromRule(
  lines: ReportRateLine[],
  rule: MaterialPriceRule,
  archiveRate: unknown,
): ProcessPriceResolution {
  if (rule.mode === 'last_purchase') {
    const latest = latestReportRateFromLines(lines);
    if (latest != null && latest > 0) {
      return { unitPrice: latest, priceSource: 'last_record', recordCountInPeriod: lines.length };
    }
    return archiveFallback(archiveRate);
  }

  const period = materialPriceRuleToPeriod(rule);
  const range = resolveMaterialPriceDateRange(period);
  const filtered = filterLinesInRange(lines, range);
  const avg = weightedAvgReportRateFromLines(filtered);
  if (avg != null && avg > 0) {
    return { unitPrice: avg, priceSource: 'period_avg', recordCountInPeriod: filtered.length };
  }
  return archiveFallback(archiveRate);
}

export function resolveOutsourceUnitPriceFromRule(
  lines: OutsourcePriceLine[],
  rule: MaterialPriceRule,
  archiveRate: unknown,
): ProcessPriceResolution {
  if (rule.mode === 'last_purchase') {
    const latest = latestOutsourcePriceFromLines(lines);
    if (latest != null && latest > 0) {
      return { unitPrice: latest, priceSource: 'last_record', recordCountInPeriod: lines.length };
    }
    return archiveFallback(archiveRate);
  }

  const period = materialPriceRuleToPeriod(rule);
  const range = resolveMaterialPriceDateRange(period);
  const filtered = filterLinesInRange(lines, range);
  const avg = weightedAvgOutsourcePriceFromLines(filtered);
  if (avg != null && avg > 0) {
    return { unitPrice: avg, priceSource: 'period_avg', recordCountInPeriod: filtered.length };
  }
  return archiveFallback(archiveRate);
}

export function resolveTheoreticalProcessUnitPrice(params: {
  outsourcePriceMap: Map<string, number>;
  reportPriceMap: Map<string, number>;
  nodeRates: Record<string, number>;
  productId: string;
  nodeId: string;
}): number {
  const { outsourcePriceMap, reportPriceMap, nodeRates, productId, nodeId } = params;
  const outsource = lookupContextProcessPrice(outsourcePriceMap, productId, nodeId);
  if (outsource > 0) return outsource;
  const report = lookupContextProcessPrice(reportPriceMap, productId, nodeId);
  if (report > 0) return report;
  return num(nodeRates[nodeId]);
}
