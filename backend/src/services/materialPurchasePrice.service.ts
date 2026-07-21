import type { TenantPrismaClient } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';
import {
  formatMaterialPriceRuleLabel,
  materialPriceContextKey,
  resolveEffectiveMaterialPriceRule,
  resolveMaterialUnitPriceFromRule,
  type PurchaseBillLine,
} from '../../../shared/materialPurchasePrice.js';
import {
  DEFAULT_PRODUCT_ECONOMICS_SETTINGS,
  MATERIAL_PRICE_RULE_SOURCE_LABEL,
  parseEconomicsBomMaterialPrice,
  parseMaterialPriceRule,
  parseMaterialPriceRuleOverride,
  parseProductEconomicsSettings,
  type EconomicsBomMaterialPrice,
  type MaterialPriceBomMaterialRow,
  type MaterialPriceBomMaterialsResponse,
  type MaterialPriceParentProductRow,
  type MaterialPriceRule,
  type MaterialPriceRuleOverride,
  type MaterialPriceSettingsResponse,
} from '../../../shared/types.js';
import * as settingsService from './settings.service.js';
import { invalidateProductEconomicsCache } from './productEconomicsCache.js';

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type MaterialPriceContext = { parentProductId: string; materialId: string };

async function loadGlobalMaterialPriceRule(tenantId: string): Promise<MaterialPriceRule> {
  const config = await settingsService.getConfig(tenantId);
  return parseProductEconomicsSettings(config.productEconomicsSettings).materialPriceRule;
}

async function loadPurchaseBillsByProductIds(
  db: TenantPrismaClient,
  productIds: string[],
): Promise<Map<string, PurchaseBillLine[]>> {
  if (productIds.length === 0) return new Map();
  const rows = await db.psiRecord.findMany({
    where: {
      productId: { in: productIds },
      type: 'PURCHASE_BILL',
      purchasePrice: { not: null },
      quantity: { not: null },
    },
    select: {
      productId: true,
      quantity: true,
      purchasePrice: true,
      timestamp: true,
    },
  });
  const byProduct = new Map<string, PurchaseBillLine[]>();
  for (const r of rows) {
    if (!r.productId) continue;
    const list = byProduct.get(r.productId) ?? [];
    list.push({
      quantity: r.quantity,
      purchasePrice: r.purchasePrice,
      timestamp: r.timestamp,
    });
    byProduct.set(r.productId, list);
  }
  return byProduct;
}

function computeUnitPriceForContext(
  globalRule: MaterialPriceRule,
  parentBomConfig: EconomicsBomMaterialPrice | null | undefined,
  materialId: string,
  bills: PurchaseBillLine[],
  archivePrice: unknown,
): Pick<MaterialPriceBomMaterialRow, 'unitPrice' | 'priceSource' | 'billCountInPeriod' | 'ruleSource' | 'ruleLabel' | 'hasIndividualOverride'> {
  const { rule, ruleSource } = resolveEffectiveMaterialPriceRule(globalRule, parentBomConfig, materialId);
  const resolved = resolveMaterialUnitPriceFromRule(bills, rule, archivePrice);
  const override = parentBomConfig?.materialOverrides?.[materialId];
  const hasIndividualOverride =
    override != null
    && !('inherit' in override && override.inherit === true);
  return {
    unitPrice: resolved.unitPrice != null ? round2(resolved.unitPrice) : null,
    priceSource: resolved.priceSource,
    billCountInPeriod: resolved.billCountInPeriod,
    ruleSource,
    ruleLabel: formatMaterialPriceRuleLabel(rule),
    hasIndividualOverride: !!hasIndividualOverride,
  };
}

/** 报工耗材：按 parentProductId + materialId 上下文构建价格 Map */
export async function buildMaterialPriceMapForEconomics(
  db: TenantPrismaClient,
  tenantId: string,
  contexts: MaterialPriceContext[],
): Promise<Map<string, number>> {
  const uniqueContexts = [...new Map(
    contexts.filter(c => c.parentProductId && c.materialId)
      .map(c => [materialPriceContextKey(c.parentProductId, c.materialId), c]),
  ).values()];
  if (uniqueContexts.length === 0) return new Map();

  const parentIds = [...new Set(uniqueContexts.map(c => c.parentProductId))];
  const materialIds = [...new Set(uniqueContexts.map(c => c.materialId))];

  const [globalRule, parents, materials, billsByProduct] = await Promise.all([
    loadGlobalMaterialPriceRule(tenantId),
    db.product.findMany({
      where: { id: { in: parentIds } },
      select: { id: true, economicsBomMaterialPrice: true },
    }),
    db.product.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, purchasePrice: true },
    }),
    loadPurchaseBillsByProductIds(db, materialIds),
  ]);

  const parentBomById = new Map(
    parents.map(p => [p.id, parseEconomicsBomMaterialPrice(p.economicsBomMaterialPrice)]),
  );
  const materialMetaById = new Map(materials.map(m => [m.id, m]));

  const map = new Map<string, number>();
  for (const ctx of uniqueContexts) {
    const bills = billsByProduct.get(ctx.materialId) ?? [];
    const meta = materialMetaById.get(ctx.materialId);
    const { unitPrice } = computeUnitPriceForContext(
      globalRule,
      parentBomById.get(ctx.parentProductId) ?? null,
      ctx.materialId,
      bills,
      meta?.purchasePrice,
    );
    if (unitPrice != null && unitPrice > 0) {
      map.set(materialPriceContextKey(ctx.parentProductId, ctx.materialId), unitPrice);
    }
  }
  return map;
}

export async function getMaterialPriceSettings(
  tenantId: string,
  permissions: string[],
  tenantRole?: string,
): Promise<MaterialPriceSettingsResponse> {
  const config = await settingsService.getConfig(tenantId);
  const materialPriceRule = parseProductEconomicsSettings(config.productEconomicsSettings).materialPriceRule;
  const isOwner = tenantRole === 'owner';
  const canEditGlobal =
    isOwner
    || permissions.includes('settings')
    || permissions.includes('settings:config')
    || permissions.includes('settings:config:edit');
  const canEditProduct =
    isOwner
    || permissions.includes('basic')
    || permissions.includes('basic:products')
    || permissions.includes('basic:products:edit');
  return { materialPriceRule, canEditGlobal, canEditProduct };
}

export async function updateMaterialPriceSettings(
  tenantId: string,
  materialPriceRule: MaterialPriceRule,
): Promise<MaterialPriceRule> {
  const parsed = parseMaterialPriceRule(materialPriceRule);
  if (!parsed) throw new AppError(400, '无效的全局物料采购均价规则');
  const config = await settingsService.getConfig(tenantId);
  const current = parseProductEconomicsSettings(config.productEconomicsSettings);
  await settingsService.updateConfig(tenantId, 'productEconomicsSettings', {
    ...current,
    materialPriceRule: parsed,
  });
  await invalidateProductEconomicsCache(tenantId);
  return parsed;
}

export async function listMaterialPriceParentProducts(
  db: TenantPrismaClient,
  tenantId: string,
  opts: { search?: string } = {},
): Promise<MaterialPriceParentProductRow[]> {
  const boms = await db.bom.findMany({
    select: {
      parentProductId: true,
      items: { select: { productId: true } },
    },
  });
  const materialCountByParent = new Map<string, Set<string>>();
  for (const b of boms) {
    const set = materialCountByParent.get(b.parentProductId) ?? new Set<string>();
    for (const item of b.items) set.add(item.productId);
    materialCountByParent.set(b.parentProductId, set);
  }
  const parentIds = [...materialCountByParent.keys()];
  if (parentIds.length === 0) return [];

  const parents = await db.product.findMany({
    where: { id: { in: parentIds } },
    select: {
      id: true,
      name: true,
      sku: true,
      economicsBomMaterialPrice: true,
    },
    orderBy: { name: 'asc' },
  });

  const q = opts.search?.trim().toLowerCase() ?? '';
  const rows: MaterialPriceParentProductRow[] = [];
  for (const p of parents) {
    const materialCount = materialCountByParent.get(p.id)?.size ?? 0;
    if (materialCount === 0) continue;
    if (q) {
      const hit =
        p.name.toLowerCase().includes(q)
        || (p.sku ?? '').toLowerCase().includes(q)
        || p.id.toLowerCase().includes(q);
      if (!hit) continue;
    }
    rows.push({
      productId: p.id,
      name: p.name,
      sku: p.sku ?? '',
      materialCount,
    });
  }
  return rows;
}

export async function listMaterialPriceBomMaterials(
  db: TenantPrismaClient,
  tenantId: string,
  parentProductId: string,
): Promise<MaterialPriceBomMaterialsResponse> {
  const parent = await db.product.findUnique({
    where: { id: parentProductId },
    select: { id: true, economicsBomMaterialPrice: true },
  });
  if (!parent) throw new AppError(404, '成品不存在');

  const boms = await db.bom.findMany({
    where: { parentProductId },
    include: { items: true },
  });
  const materialIds = [...new Set(boms.flatMap(b => b.items.map(i => i.productId)))];
  if (materialIds.length === 0) {
    const globalRule = await loadGlobalMaterialPriceRule(tenantId);
    const parentBomCfg = parseEconomicsBomMaterialPrice(parent.economicsBomMaterialPrice);
    return {
      rows: [],
      parentDefaultRule: parentBomCfg?.defaultRule ?? null,
      tenantGlobalRule: globalRule,
    };
  }

  const [globalRule, materials, billsByProduct] = await Promise.all([
    loadGlobalMaterialPriceRule(tenantId),
    db.product.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, name: true, sku: true, purchasePrice: true },
      orderBy: { name: 'asc' },
    }),
    loadPurchaseBillsByProductIds(db, materialIds),
  ]);
  const parentBomCfg = parseEconomicsBomMaterialPrice(parent.economicsBomMaterialPrice);

  const rows = materials.map(m => {
    const bills = billsByProduct.get(m.id) ?? [];
    const computed = computeUnitPriceForContext(
      globalRule,
      parentBomCfg,
      m.id,
      bills,
      m.purchasePrice,
    );
    return {
      materialId: m.id,
      name: m.name,
      sku: m.sku ?? '',
      ...computed,
    };
  });
  return {
    rows,
    parentDefaultRule: parentBomCfg?.defaultRule ?? null,
    tenantGlobalRule: globalRule,
  };
}

export async function updateParentMaterialPriceDefaultRule(
  db: TenantPrismaClient,
  tenantId: string,
  parentProductId: string,
  defaultRule: MaterialPriceRule | null,
): Promise<{ defaultRule: MaterialPriceRule | null }> {
  const existing = await db.product.findUnique({
    where: { id: parentProductId },
    select: { id: true, economicsBomMaterialPrice: true },
  });
  if (!existing) throw new AppError(404, '成品不存在');

  const parsedRule = parseMaterialPriceRule(defaultRule);
  if (!parsedRule) throw new AppError(400, '无效的批量统计规则');

  // 变更成品批量规则时，清除全部单物料覆盖，统一走新规则
  const next: EconomicsBomMaterialPrice = { defaultRule: parsedRule };

  await db.product.update({
    where: { id: parentProductId },
    data: { economicsBomMaterialPrice: next as Prisma.InputJsonValue },
  });
  await invalidateProductEconomicsCache(tenantId);
  return { defaultRule: parsedRule };
}

export async function updateBomMaterialPriceOverride(
  db: TenantPrismaClient,
  tenantId: string,
  parentProductId: string,
  materialId: string,
  rule: MaterialPriceRuleOverride,
): Promise<MaterialPriceBomMaterialRow> {
  const parsed = parseMaterialPriceRuleOverride(rule);
  if (!parsed) throw new AppError(400, '无效的物料统计规则');

  const parent = await db.product.findUnique({
    where: { id: parentProductId },
    select: { id: true, economicsBomMaterialPrice: true },
  });
  if (!parent) throw new AppError(404, '成品不存在');

  const material = await db.product.findUnique({
    where: { id: materialId },
    select: { id: true, name: true, sku: true, purchasePrice: true },
  });
  if (!material) throw new AppError(404, '物料不存在');

  const current = parseEconomicsBomMaterialPrice(parent.economicsBomMaterialPrice) ?? {};
  const overrides = { ...(current.materialOverrides ?? {}) };
  if ('inherit' in parsed && parsed.inherit === true) {
    delete overrides[materialId];
  } else {
    overrides[materialId] = parsed;
  }
  const next: EconomicsBomMaterialPrice = {
    defaultRule: current.defaultRule ?? null,
    materialOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  };
  const stored =
    next.defaultRule == null && !next.materialOverrides
      ? Prisma.DbNull
      : (next as Prisma.InputJsonValue);

  await db.product.update({
    where: { id: parentProductId },
    data: { economicsBomMaterialPrice: stored },
  });
  await invalidateProductEconomicsCache(tenantId);

  const { rows } = await listMaterialPriceBomMaterials(db, tenantId, parentProductId);
  const row = rows.find(r => r.materialId === materialId);
  if (!row) throw new AppError(404, '物料不在该成品 BOM 中');
  return row;
}

export { MATERIAL_PRICE_RULE_SOURCE_LABEL };
