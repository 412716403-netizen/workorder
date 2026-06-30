import {
  DEFAULT_MATERIAL_PRICE_PERIOD,
  DEFAULT_PARENT_BOM_MATERIAL_PRICE_RULE,
  type EconomicsBomMaterialPrice,
  type MaterialPricePeriod,
  type MaterialPriceRule,
  type MaterialPriceRuleSource,
  type MaterialPriceSource,
  type ProductMaterialPricePeriodConfig,
} from './types.js';
import {
  isWorkbenchStatsYmd,
  resolveWorkbenchCustomStatsPeriodRange,
} from './workbenchOrderStats.js';

export type PurchaseBillLine = {
  quantity: unknown;
  purchasePrice: unknown;
  timestamp: Date | string;
};

export type MaterialPriceResolution = {
  unitPrice: number | null;
  priceSource: MaterialPriceSource | null;
  billCountInPeriod: number;
};

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function billTimestampMs(v: Date | string): number {
  const d = v instanceof Date ? v : new Date(v);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function materialPriceContextKey(parentProductId: string, materialId: string): string {
  return `${parentProductId}:${materialId}`;
}

export function lookupContextMaterialPrice(
  priceMap: Map<string, number>,
  parentProductId: string,
  materialId: string,
): number {
  return priceMap.get(materialPriceContextKey(parentProductId, materialId)) ?? 0;
}

/** 成品 BOM defaultRule 归一化：缺省或历史 all_time → 最近一次采购价 */
export function resolveParentBomDefaultRule(
  defaultRule: MaterialPriceRule | null | undefined,
): MaterialPriceRule {
  if (!defaultRule || defaultRule.mode === 'all_time') {
    return DEFAULT_PARENT_BOM_MATERIAL_PRICE_RULE;
  }
  return defaultRule;
}

/** 解析生效规则：单物料覆盖 > 成品 BOM 规则（默认最近一次采购价） */
export function resolveEffectiveMaterialPriceRule(
  _globalRule: MaterialPriceRule,
  parentBomConfig: EconomicsBomMaterialPrice | null | undefined,
  materialId: string,
): { rule: MaterialPriceRule; ruleSource: MaterialPriceRuleSource } {
  const override = parentBomConfig?.materialOverrides?.[materialId];
  if (override && typeof override === 'object') {
    if ('inherit' in override && override.inherit === true) {
      /* fall through */
    } else if ('mode' in override) {
      const rule =
        override.mode === 'all_time' ? DEFAULT_PARENT_BOM_MATERIAL_PRICE_RULE : override;
      return { rule, ruleSource: 'material_override' };
    }
  }
  return {
    rule: resolveParentBomDefaultRule(parentBomConfig?.defaultRule),
    ruleSource: 'parent_default',
  };
}

export function materialPriceRuleToPeriod(rule: MaterialPriceRule): MaterialPricePeriod {
  if (rule.mode === 'all_time') return { mode: 'all_time' };
  if (rule.mode === 'last_purchase') return { mode: 'all_time' };
  return { mode: 'fixed_range', startDate: rule.startDate, endDate: rule.endDate };
}

/** @deprecated 兼容旧 per-material 配置 */
export function resolveMaterialPricePeriod(
  productOverride: ProductMaterialPricePeriodConfig | null | undefined,
): MaterialPricePeriod {
  if (!productOverride || productOverride.inherit === true) {
    return { ...DEFAULT_MATERIAL_PRICE_PERIOD };
  }
  if (productOverride.mode === 'rolling_days') {
    const rollingDays = Math.max(1, Math.floor(num(productOverride.rollingDays)));
    return { mode: 'rolling_days', rollingDays };
  }
  if (
    productOverride.mode === 'fixed_range'
    && isWorkbenchStatsYmd(productOverride.startDate)
    && isWorkbenchStatsYmd(productOverride.endDate)
    && productOverride.startDate <= productOverride.endDate
  ) {
    return {
      mode: 'fixed_range',
      startDate: productOverride.startDate,
      endDate: productOverride.endDate,
    };
  }
  return { ...DEFAULT_MATERIAL_PRICE_PERIOD };
}

export function resolveMaterialPriceDateRange(period: MaterialPricePeriod): { start: Date; end: Date } | null {
  if (period.mode === 'all_time') return null;
  if (period.mode === 'rolling_days') {
    const days = Math.max(1, Math.floor(num(period.rollingDays)));
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (period.mode === 'fixed_range' && period.startDate && period.endDate) {
    return resolveWorkbenchCustomStatsPeriodRange(period.startDate, period.endDate);
  }
  return null;
}

export function buildPeriodExpandLadder(period: MaterialPricePeriod): MaterialPricePeriod[] {
  if (period.mode === 'all_time') return [{ ...DEFAULT_MATERIAL_PRICE_PERIOD }];
  const ladder: MaterialPricePeriod[] = [{ ...period }];
  if (period.mode === 'rolling_days') {
    const n = Math.max(1, Math.floor(num(period.rollingDays)));
    const doubled = Math.min(365, n * 2);
    if (doubled > n) ladder.push({ mode: 'rolling_days', rollingDays: doubled });
    if (doubled < 365) ladder.push({ mode: 'rolling_days', rollingDays: 365 });
  } else if (period.mode === 'fixed_range' && period.startDate && period.endDate) {
    const range = resolveWorkbenchCustomStatsPeriodRange(period.startDate, period.endDate);
    if (range) {
      const spanMs = range.end.getTime() - range.start.getTime();
      const expandedStart = new Date(range.start.getTime() - spanMs);
      const y = expandedStart.getFullYear();
      const m = String(expandedStart.getMonth() + 1).padStart(2, '0');
      const d = String(expandedStart.getDate()).padStart(2, '0');
      const expandedStartYmd = `${y}-${m}-${d}`;
      if (expandedStartYmd < period.startDate) {
        ladder.push({
          mode: 'fixed_range',
          startDate: expandedStartYmd,
          endDate: period.endDate,
        });
      }
    }
  }
  ladder.push({ ...DEFAULT_MATERIAL_PRICE_PERIOD });
  return ladder;
}

export function filterBillsInRange(
  bills: PurchaseBillLine[],
  range: { start: Date; end: Date } | null,
): PurchaseBillLine[] {
  if (!range) return bills;
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  return bills.filter(b => {
    const ms = billTimestampMs(b.timestamp);
    return ms >= startMs && ms <= endMs;
  });
}

export function weightedAvgFromBills(bills: PurchaseBillLine[]): number | null {
  let totalQty = 0;
  let totalAmount = 0;
  for (const r of bills) {
    const qty = num(r.quantity);
    const price = num(r.purchasePrice);
    if (qty === 0 || !(price > 0)) continue;
    totalQty += qty;
    totalAmount += qty * price;
  }
  if (totalQty <= 0) return null;
  return totalAmount / totalQty;
}

export function latestPurchasePriceFromBills(bills: PurchaseBillLine[]): number | null {
  let bestMs = -1;
  let bestPrice: number | null = null;
  for (const b of bills) {
    const price = num(b.purchasePrice);
    if (!(price > 0)) continue;
    const ms = billTimestampMs(b.timestamp);
    if (ms >= bestMs) {
      bestMs = ms;
      bestPrice = price;
    }
  }
  return bestPrice;
}

export function resolveMaterialUnitPriceFromRule(
  bills: PurchaseBillLine[],
  rule: MaterialPriceRule,
  archivePrice: unknown,
): MaterialPriceResolution {
  if (rule.mode === 'last_purchase') {
    const latest = latestPurchasePriceFromBills(bills);
    if (latest != null && latest > 0) {
      return { unitPrice: latest, priceSource: 'last_purchase', billCountInPeriod: bills.length };
    }
    const fallback = num(archivePrice);
    if (fallback > 0) {
      return { unitPrice: fallback, priceSource: 'archive', billCountInPeriod: 0 };
    }
    return { unitPrice: null, priceSource: null, billCountInPeriod: 0 };
  }

  const primary = materialPriceRuleToPeriod(rule);
  const attempts = buildPeriodExpandLadder(primary);
  let billCountInPeriod = 0;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]!;
    const range = resolveMaterialPriceDateRange(attempt);
    const filtered = filterBillsInRange(bills, range);
    if (i === 0) billCountInPeriod = filtered.length;
    const avg = weightedAvgFromBills(filtered);
    if (avg != null && avg > 0) {
      let priceSource: MaterialPriceSource;
      if (attempt.mode === 'all_time') {
        priceSource = primary.mode === 'all_time' ? 'all_time' : 'expanded';
      } else if (i === 0) {
        priceSource = 'period';
      } else {
        priceSource = 'expanded';
      }
      return { unitPrice: avg, priceSource, billCountInPeriod };
    }
  }

  const fallback = num(archivePrice);
  if (fallback > 0) {
    return { unitPrice: fallback, priceSource: 'archive', billCountInPeriod };
  }
  return { unitPrice: null, priceSource: null, billCountInPeriod };
}

/** @deprecated 旧 per-material 配置入口 */
export function resolveMaterialUnitPrice(
  bills: PurchaseBillLine[],
  periodConfig: ProductMaterialPricePeriodConfig | null | undefined,
  archivePrice: unknown,
): MaterialPriceResolution {
  if (periodConfig && periodConfig.inherit !== true && periodConfig.mode === 'last_purchase') {
    return resolveMaterialUnitPriceFromRule(bills, { mode: 'last_purchase' }, archivePrice);
  }
  if (periodConfig && periodConfig.inherit !== true && periodConfig.mode === 'fixed_range') {
    return resolveMaterialUnitPriceFromRule(
      bills,
      { mode: 'fixed_range', startDate: periodConfig.startDate!, endDate: periodConfig.endDate! },
      archivePrice,
    );
  }
  return resolveMaterialUnitPriceFromRule(bills, { mode: 'all_time' }, archivePrice);
}

export function formatMaterialPriceRuleLabel(rule: MaterialPriceRule): string {
  if (rule.mode === 'all_time') return '全部采购入库加权均价';
  if (rule.mode === 'last_purchase') return '最近一次采购价';
  return `${rule.startDate} ~ ${rule.endDate}`;
}

/** @deprecated */
export function formatMaterialPricePeriodLabel(
  config: ProductMaterialPricePeriodConfig | null | undefined,
): string {
  if (!config || config.inherit === true) return '继承上级规则';
  if (config.mode === 'rolling_days') {
    const days = Math.max(1, Math.floor(num(config.rollingDays)));
    return `近 ${days} 天`;
  }
  if (config.mode === 'fixed_range' && config.startDate && config.endDate) {
    return `${config.startDate} ~ ${config.endDate}`;
  }
  if (config.mode === 'last_purchase') return '最近一次采购价';
  return '继承上级规则';
}

export function periodKeyForMaterialPrice(period: MaterialPricePeriod): string {
  if (period.mode === 'all_time') return 'all_time';
  if (period.mode === 'rolling_days') {
    return `rolling:${Math.max(1, Math.floor(num(period.rollingDays)))}`;
  }
  return `fixed:${period.startDate}:${period.endDate}`;
}
