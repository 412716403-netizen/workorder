import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  parseProductEconomicsSettings,
  type ProductMaterialCostMode,
} from '../../../shared/types.js';
import {
  computeReportMaterialCost,
  computeReportMaterialConsumableQty,
  type MaterialBreakdownRowIn,
} from '../../../shared/productMaterialConsumableCost.js';
import {
  resolveWorkbenchCustomStatsPeriodRange,
  resolveWorkbenchStatsPeriodRange,
  resolveWorkbenchStatsQuery,
  type ProductEconomicsCustomRange,
  type ProductEconomicsListQuery,
  type WorkbenchOrderStatsPeriod,
} from '../../../shared/workbenchOrderStats.js';
import { computeMaterialSurplusLossByProduct } from './productMaterialSurplusLoss.service.js';
import {
  loadLinkedFinanceByProduct,
  loadLinkedPurchaseCostByProduct,
} from './productDocumentLinkedCost.service.js';
import * as settingsService from './settings.service.js';
import * as psiService from './psi.service.js';

type PeriodRange = { start: Date; end: Date } | null;

function resolveProductEconomicsPeriod(
  query: ProductEconomicsListQuery = {},
): {
  periodRange: PeriodRange;
  period: WorkbenchOrderStatsPeriod | null;
  customRange: ProductEconomicsCustomRange | null;
} {
  if (query.startDate && query.endDate) {
    const custom = resolveWorkbenchCustomStatsPeriodRange(query.startDate, query.endDate);
    if (custom) {
      return {
        periodRange: custom,
        period: null,
        customRange: { startDate: query.startDate, endDate: query.endDate },
      };
    }
  }
  if (query.period) {
    return {
      periodRange: resolveWorkbenchStatsPeriodRange(query.period),
      period: query.period,
      customRange: null,
    };
  }
  return { periodRange: null, period: null, customRange: null };
}

function timestampWhere(range: PeriodRange): { timestamp?: { gte: Date; lte: Date } } {
  if (!range) return {};
  return { timestamp: { gte: range.start, lte: range.end } };
}

type MaterialBreakdownIn = MaterialBreakdownRowIn;

type BomWithItems = Awaited<ReturnType<typeof loadBoms>>[number];

export interface ProductEconomicsRow {
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  /** 是否配置了标准生产路线（milestoneNodeIds 非空） */
  hasProcessNodes: boolean;
  materialCost: number;
  reportCost: number;
  outsourceFee: number;
  reworkFee: number;
  materialSurplusLoss: number;
  /** document_linked 口径：关联采购入库金额 */
  linkedPurchaseCost: number;
  /** document_linked 口径：关联付款金额 */
  linkedPaymentCost: number;
  /** document_linked 口径：关联收款金额（收入侧） */
  linkedReceiptAmount: number;
  scrapQty: number;
  scrapAmount: number;
  stockQty: number;
  salesQty: number;
  salesAmount: number;
  /** 收入合计：consumable = salesAmount；document_linked = salesAmount + linkedReceiptAmount */
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
}

export interface ProductEconomicsNodeRow {
  nodeId: string;
  nodeName: string;
  /** 该工序是否配置了 BOM 子项（无 BOM 时不展示物料行） */
  hasNodeBom: boolean;
  materialCost: number;
  materialQty: number;
  reportCost: number;
  outsourceFee: number;
  reworkFee: number;
  reportQty: number;
  outsourceQty: number;
  reworkQty: number;
}

export interface ProductEconomicsListResponse {
  canProduction: boolean;
  canPsi: boolean;
  canFinance: boolean;
  materialCostMode: ProductMaterialCostMode;
  /** 未传 period / 自定义区间时为 null（累计） */
  period: WorkbenchOrderStatsPeriod | null;
  /** 自定义日期范围（YYYY-MM-DD）；与 period 互斥 */
  customRange: ProductEconomicsCustomRange | null;
  summary: {
    productCount: number;
    totalCost: number;
    totalSalesAmount: number;
    totalRevenue: number;
    grossProfit: number;
  };
  rows: ProductEconomicsRow[];
}

export interface ProductEconomicsDetailResponse {
  canProduction: boolean;
  canPsi: boolean;
  canFinance: boolean;
  materialCostMode: ProductMaterialCostMode;
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  materialCost: number;
  reportCost: number;
  outsourceFee: number;
  reworkFee: number;
  materialSurplusLoss: number;
  linkedPurchaseCost: number;
  linkedPaymentCost: number;
  linkedReceiptAmount: number;
  scrapQty: number;
  scrapAmount: number;
  stockQty: number;
  salesQty: number;
  salesAmount: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  totalOrderQty: number;
  stockInQty: number;
  byNode: ProductEconomicsNodeRow[];
}

function canAccessProduction(permissions: string[]): boolean {
  return permissions.includes('production') || permissions.some(p => p.startsWith('production:'));
}

function canAccessPsi(permissions: string[]): boolean {
  return permissions.includes('psi') || permissions.some(p => p.startsWith('psi:'));
}

function canAccessFinance(permissions: string[]): boolean {
  return permissions.includes('finance') || permissions.some(p => p.startsWith('finance:'));
}

async function resolveMaterialCostMode(
  tenantId: string,
  override?: ProductMaterialCostMode,
): Promise<ProductMaterialCostMode> {
  if (override) return override;
  const config = await settingsService.getConfig(tenantId);
  return parseProductEconomicsSettings(config.productEconomicsSettings).materialCostMode;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function productHasProcessNodes(milestoneNodeIds: unknown): boolean {
  if (!Array.isArray(milestoneNodeIds)) return false;
  return milestoneNodeIds.some(id => typeof id === 'string' && id.length > 0);
}

function parseNodeRates(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = num(v);
    if (n > 0) out[k] = n;
  }
  return out;
}

function parseMaterialBreakdown(raw: unknown): MaterialBreakdownIn[] {
  if (!Array.isArray(raw)) return [];
  return raw as MaterialBreakdownIn[];
}

async function loadBoms(db: TenantPrismaClient, productIds: string[]) {
  if (productIds.length === 0) return [];
  return db.bom.findMany({
    where: { parentProductId: { in: productIds } },
    include: { items: true },
  });
}

/** 物料单价 = 该物料全部采购入库(PURCHASE_BILL)的数量加权平均单价；无入库记录时回退档案 purchasePrice */
async function buildMaterialPriceMap(
  db: TenantPrismaClient,
  materialIds: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(materialIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const [products, purchaseBills] = await Promise.all([
    db.product.findMany({
      where: { id: { in: unique } },
      select: { id: true, purchasePrice: true },
    }),
    db.psiRecord.findMany({
      where: {
        productId: { in: unique },
        type: 'PURCHASE_BILL',
        purchasePrice: { not: null },
        quantity: { not: null },
      },
      select: { productId: true, quantity: true, purchasePrice: true },
    }),
  ]);

  const weighted = new Map<string, { totalQty: number; totalAmount: number }>();
  for (const r of purchaseBills) {
    if (!r.productId) continue;
    const qty = num(r.quantity);
    const price = num(r.purchasePrice);
    if (qty === 0 || !(price > 0)) continue;
    const prev = weighted.get(r.productId) ?? { totalQty: 0, totalAmount: 0 };
    prev.totalQty += qty;
    prev.totalAmount += qty * price;
    weighted.set(r.productId, prev);
  }

  const map = new Map<string, number>();
  for (const id of unique) {
    const agg = weighted.get(id);
    if (agg && agg.totalQty > 0) {
      map.set(id, agg.totalAmount / agg.totalQty);
      continue;
    }
    const fallback = num(products.find(p => p.id === id)?.purchasePrice);
    if (fallback > 0) map.set(id, fallback);
  }

  return map;
}

async function loadMaterialUnitNameByProductId(
  db: TenantPrismaClient,
  materialIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(materialIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const [products, units] = await Promise.all([
    db.product.findMany({
      where: { id: { in: unique } },
      select: { id: true, unitId: true },
    }),
    db.dictionaryItem.findMany({
      where: { type: 'unit' },
      select: { id: true, name: true },
    }),
  ]);
  const unitNameById = new Map(units.map(u => [u.id, u.name]));
  const out = new Map<string, string>();
  for (const p of products) {
    if (p.unitId) out.set(p.id, unitNameById.get(p.unitId) ?? '');
  }
  return out;
}

function pickBom(
  boms: BomWithItems[],
  productId: string,
  nodeId: string,
  variantId?: string | null,
): BomWithItems | undefined {
  const productBoms = boms.filter(b => b.parentProductId === productId);
  if (variantId) {
    const exact = productBoms.find(b => b.variantId === variantId && b.nodeId === nodeId);
    if (exact) return exact;
  }
  const nodeDefault = productBoms.find(b => !b.variantId && b.nodeId === nodeId);
  if (nodeDefault) return nodeDefault;
  const root = productBoms.find(b => !b.variantId && !b.nodeId);
  if (root) return root;
  return productBoms.find(b => b.nodeId === nodeId);
}

function computeUnitMaterialCost(
  boms: BomWithItems[],
  productId: string,
  priceMap: Map<string, number>,
): number {
  const productBoms = boms.filter(b => b.parentProductId === productId);
  const chosen =
    productBoms.find(b => !b.variantId && !b.nodeId)
    ?? productBoms.find(b => !b.variantId)
    ?? productBoms[0];
  if (!chosen) return 0;
  return chosen.items.reduce(
    (sum, item) => sum + num(item.quantity) * (priceMap.get(item.productId) ?? 0),
    0,
  );
}

function resolveReportMaterialCost(
  boms: BomWithItems[],
  productId: string,
  nodeId: string,
  variantId: string | null | undefined,
  goodQty: number,
  breakdown: MaterialBreakdownIn[],
  weightEnabled: boolean,
  priceMap: Map<string, number>,
  unitNameByMaterialId: Map<string, string>,
): number {
  const bom = pickBom(boms, productId, nodeId, variantId);
  const bomItems = (bom?.items ?? []).map(item => ({
    productId: item.productId,
    quantity: num(item.quantity),
  }));
  return computeReportMaterialCost({
    weightEnabled,
    breakdown,
    goodQty,
    bomItems,
    priceMap,
    unitNameByMaterialId,
  });
}

function resolveReportMaterialQty(
  boms: BomWithItems[],
  productId: string,
  nodeId: string,
  variantId: string | null | undefined,
  goodQty: number,
  breakdown: MaterialBreakdownIn[],
  weightEnabled: boolean,
): number {
  const bom = pickBom(boms, productId, nodeId, variantId);
  const bomItems = (bom?.items ?? []).map(item => ({
    productId: item.productId,
    quantity: num(item.quantity),
  }));
  return computeReportMaterialConsumableQty({
    weightEnabled,
    breakdown,
    goodQty,
    bomItems,
  });
}

/** 工序是否配置了 BOM（仅匹配该 nodeId，不含无工序根 BOM 回退） */
function nodeHasBom(boms: BomWithItems[], productId: string, nodeId: string): boolean {
  return boms.some(
    b =>
      b.parentProductId === productId
      && b.nodeId === nodeId
      && b.items.some(item => num(item.quantity) > 0),
  );
}

type NodeCostAgg = {
  materialCost: number;
  materialQty: number;
  reportCost: number;
  outsourceFee: number;
  reworkFee: number;
};

type ProductAgg = {
  materialCost: number;
  reportCost: number;
  outsourceFee: number;
  reworkFee: number;
  scrapQty: number;
  salesQty: number;
  salesAmount: number;
  stockQty: number;
  byNode: Map<string, NodeCostAgg>;
};

function emptyAgg(): ProductAgg {
  return {
    materialCost: 0,
    reportCost: 0,
    outsourceFee: 0,
    reworkFee: 0,
    scrapQty: 0,
    salesQty: 0,
    salesAmount: 0,
    stockQty: 0,
    byNode: new Map(),
  };
}

function ensureNode(agg: ProductAgg, nodeId: string) {
  if (!agg.byNode.has(nodeId)) {
    agg.byNode.set(nodeId, {
      materialCost: 0,
      materialQty: 0,
      reportCost: 0,
      outsourceFee: 0,
      reworkFee: 0,
    });
  }
  return agg.byNode.get(nodeId)!;
}

type NodeQtyAgg = { reportQty: number; outsourceQty: number; reworkQty: number };

/** 单产品：累计下单/入库量 + 各工序报工/外协收回/返工报工数量 */
async function loadProductQuantityDetail(
  db: TenantPrismaClient,
  productId: string,
): Promise<{ totalOrderQty: number; stockInQty: number; nodeQty: Map<string, NodeQtyAgg> }> {
  const [
    orderQtyAgg,
    stockInAgg,
    msReports,
    pmpReports,
    outsourceReceived,
    reworkReports,
  ] = await Promise.all([
    db.orderItem.aggregate({
      where: { productionOrder: { productId } },
      _sum: { quantity: true },
    }),
    db.productionOpRecord.aggregate({
      where: {
        type: 'STOCK_IN',
        OR: [{ productId }, { productionOrder: { productId } }],
      },
      _sum: { quantity: true },
    }),
    db.milestoneReport.findMany({
      where: { milestone: { productionOrder: { productId } } },
      select: {
        quantity: true,
        milestone: { select: { templateId: true } },
      },
    }),
    db.productProgressReport.findMany({
      where: { progress: { productId } },
      select: {
        quantity: true,
        progress: { select: { milestoneTemplateId: true } },
      },
    }),
    db.productionOpRecord.groupBy({
      by: ['nodeId'],
      where: {
        productId,
        type: 'OUTSOURCE',
        status: '已收回',
        sourceReworkId: null,
      },
      _sum: { quantity: true },
    }),
    db.productionOpRecord.groupBy({
      by: ['nodeId'],
      where: { productId, type: 'REWORK_REPORT' },
      _sum: { quantity: true },
    }),
  ]);

  const nodeQty = new Map<string, NodeQtyAgg>();
  const ensureQty = (nodeId: string): NodeQtyAgg => {
    const key = nodeId || '';
    let row = nodeQty.get(key);
    if (!row) {
      row = { reportQty: 0, outsourceQty: 0, reworkQty: 0 };
      nodeQty.set(key, row);
    }
    return row;
  };

  for (const r of msReports) {
    const qty = num(r.quantity);
    if (!(qty > 0)) continue;
    ensureQty(r.milestone.templateId).reportQty += qty;
  }
  for (const r of pmpReports) {
    const qty = num(r.quantity);
    if (!(qty > 0)) continue;
    ensureQty(r.progress.milestoneTemplateId).reportQty += qty;
  }
  for (const r of outsourceReceived) {
    const qty = num(r._sum.quantity);
    if (!(qty > 0) || !r.nodeId) continue;
    ensureQty(r.nodeId).outsourceQty += qty;
  }
  for (const r of reworkReports) {
    const qty = num(r._sum.quantity);
    if (!(qty > 0) || !r.nodeId) continue;
    ensureQty(r.nodeId).reworkQty += qty;
  }

  // 外协收回会同步写入报工记录，报工数量需扣减同工序外协收回量，避免与 outsourceQty 重复展示
  for (const row of nodeQty.values()) {
    row.reportQty = Math.max(0, Math.round((row.reportQty - row.outsourceQty) * 100) / 100);
  }

  return {
    totalOrderQty: num(orderQtyAgg._sum.quantity),
    stockInQty: num(stockInAgg._sum.quantity),
    nodeQty,
  };
}

/** 外协收回会同步写入报工记录（quantity×rate），与 OUTSOURCE.amount 重复；按工序扣减后汇总为产品报工成本 */
function netReportCostAfterOutsourceDeduction(agg: ProductAgg): void {
  let total = 0;
  for (const node of agg.byNode.values()) {
    node.reportCost = Math.max(0, node.reportCost - node.outsourceFee);
    total += node.reportCost;
  }
  agg.reportCost = total;
}

async function loadProductionAggregates(
  db: TenantPrismaClient,
  boms: BomWithItems[],
  priceMap: Map<string, number>,
  nodeNameById: Map<string, string>,
  periodRange: PeriodRange = null,
): Promise<Map<string, ProductAgg>> {
  const ts = timestampWhere(periodRange);
  const opTs = periodRange ? { timestamp: { gte: periodRange.start, lte: periodRange.end } } : {};
  const aggs = new Map<string, ProductAgg>();
  const getAgg = (productId: string) => {
    let a = aggs.get(productId);
    if (!a) {
      a = emptyAgg();
      aggs.set(productId, a);
    }
    return a;
  };

  const [msReports, pmpReports, outsourceAgg, reworkAgg, scrapAgg, globalNodes, unitNameByMaterialId] =
    await Promise.all([
    db.milestoneReport.findMany({
      where: ts,
      select: {
        quantity: true,
        rate: true,
        materialBreakdown: true,
        variantId: true,
        milestone: {
          select: {
            templateId: true,
            productionOrder: { select: { productId: true } },
          },
        },
      },
    }),
    db.productProgressReport.findMany({
      where: ts,
      select: {
        quantity: true,
        rate: true,
        materialBreakdown: true,
        variantId: true,
        progress: {
          select: {
            productId: true,
            milestoneTemplateId: true,
            variantId: true,
          },
        },
      },
    }),
    db.productionOpRecord.groupBy({
      by: ['productId', 'nodeId'],
      where: { type: 'OUTSOURCE', amount: { not: null }, ...opTs },
      _sum: { amount: true },
    }),
    db.productionOpRecord.groupBy({
      by: ['productId', 'nodeId'],
      where: { type: 'REWORK_REPORT', amount: { not: null }, ...opTs },
      _sum: { amount: true },
    }),
    db.productionOpRecord.groupBy({
      by: ['productId', 'nodeId'],
      where: { type: 'SCRAP', ...opTs },
      _sum: { quantity: true },
    }),
    db.globalNodeTemplate.findMany({
      select: { id: true, enableWeightOnReport: true },
    }),
    loadMaterialUnitNameByProductId(
      db,
      boms.flatMap(b => b.items.map(i => i.productId)),
    ),
  ]);

  const nodeWeightEnabledMap = new Map(
    globalNodes.map(n => [n.id, n.enableWeightOnReport]),
  );

  const productsWithRates = await db.product.findMany({
    where: {
      id: {
        in: [
          ...new Set([
            ...msReports.map(r => r.milestone.productionOrder.productId),
            ...pmpReports.map(r => r.progress.productId),
          ]),
        ],
      },
    },
    select: { id: true, nodeRates: true },
  });
  const nodeRatesByProduct = new Map(
    productsWithRates.map(p => [p.id, parseNodeRates(p.nodeRates)]),
  );

  for (const report of msReports) {
    const productId = report.milestone.productionOrder.productId;
    const nodeId = report.milestone.templateId;
    const qty = num(report.quantity);
    if (!(qty > 0)) continue;
    const agg = getAgg(productId);
    const node = ensureNode(agg, nodeId);
    const rates = nodeRatesByProduct.get(productId) ?? {};
    const unitRate = report.rate != null ? num(report.rate) : (rates[nodeId] ?? 0);
    const reportAmt = qty * unitRate;
    agg.reportCost += reportAmt;
    node.reportCost += reportAmt;

    const breakdown = parseMaterialBreakdown(report.materialBreakdown);
    const weightOn = !!nodeWeightEnabledMap.get(nodeId);
    const matCost = resolveReportMaterialCost(
      boms,
      productId,
      nodeId,
      report.variantId,
      qty,
      breakdown,
      weightOn,
      priceMap,
      unitNameByMaterialId,
    );
    const matQty = resolveReportMaterialQty(
      boms,
      productId,
      nodeId,
      report.variantId,
      qty,
      breakdown,
      weightOn,
    );
    agg.materialCost += matCost;
    node.materialCost += matCost;
    node.materialQty += matQty;
  }

  for (const report of pmpReports) {
    const productId = report.progress.productId;
    const nodeId = report.progress.milestoneTemplateId;
    const qty = num(report.quantity);
    if (!(qty > 0)) continue;
    const agg = getAgg(productId);
    const node = ensureNode(agg, nodeId);
    const rates = nodeRatesByProduct.get(productId) ?? {};
    const unitRate = report.rate != null ? num(report.rate) : (rates[nodeId] ?? 0);
    const reportAmt = qty * unitRate;
    agg.reportCost += reportAmt;
    node.reportCost += reportAmt;

    const variantId = report.variantId ?? report.progress.variantId;
    const breakdown = parseMaterialBreakdown(report.materialBreakdown);
    const weightOn = !!nodeWeightEnabledMap.get(nodeId);
    const matCost = resolveReportMaterialCost(
      boms,
      productId,
      nodeId,
      variantId,
      qty,
      breakdown,
      weightOn,
      priceMap,
      unitNameByMaterialId,
    );
    const matQty = resolveReportMaterialQty(
      boms,
      productId,
      nodeId,
      variantId,
      qty,
      breakdown,
      weightOn,
    );
    agg.materialCost += matCost;
    node.materialCost += matCost;
    node.materialQty += matQty;
  }

  for (const row of outsourceAgg) {
    if (!row.productId) continue;
    const amt = num(row._sum.amount);
    if (!(amt > 0)) continue;
    const agg = getAgg(row.productId);
    agg.outsourceFee += amt;
    const nodeId = row.nodeId ?? '';
    if (nodeId) ensureNode(agg, nodeId).outsourceFee += amt;
  }

  for (const row of reworkAgg) {
    if (!row.productId) continue;
    const amt = num(row._sum.amount);
    if (!(amt > 0)) continue;
    const agg = getAgg(row.productId);
    agg.reworkFee += amt;
    const nodeId = row.nodeId ?? '';
    if (nodeId) ensureNode(agg, nodeId).reworkFee += amt;
  }

  for (const row of scrapAgg) {
    if (!row.productId) continue;
    const qty = num(row._sum.quantity);
    if (!(qty > 0)) continue;
    getAgg(row.productId).scrapQty += qty;
  }

  // Ensure node names exist for scrap-only nodes
  for (const agg of aggs.values()) {
    netReportCostAfterOutsourceDeduction(agg);
    for (const nodeId of agg.byNode.keys()) {
      if (!nodeNameById.has(nodeId)) nodeNameById.set(nodeId, nodeId);
    }
  }

  return aggs;
}

async function loadPsiAggregates(
  db: TenantPrismaClient,
  periodRange: PeriodRange = null,
): Promise<Map<string, Pick<ProductAgg, 'salesQty' | 'salesAmount' | 'stockQty'>>> {
  const salesWhere = periodRange
    ? {
        type: 'SALES_BILL' as const,
        productId: { not: null },
        quantity: { gt: 0 },
        timestamp: { gte: periodRange.start, lte: periodRange.end },
      }
    : { type: 'SALES_BILL' as const, productId: { not: null }, quantity: { gt: 0 } };

  const [salesAgg, stockRows] = await Promise.all([
    db.psiRecord.groupBy({
      by: ['productId'],
      where: salesWhere,
      _sum: { quantity: true, amount: true },
    }),
    periodRange ? Promise.resolve([]) : psiService.getStock(db, {}),
  ]);

  const map = new Map<string, Pick<ProductAgg, 'salesQty' | 'salesAmount' | 'stockQty'>>();
  for (const row of salesAgg) {
    if (!row.productId) continue;
    map.set(row.productId, {
      salesQty: num(row._sum.quantity),
      salesAmount: num(row._sum.amount),
      stockQty: 0,
    });
  }
  for (const row of stockRows) {
    const prev = map.get(row.productId) ?? { salesQty: 0, salesAmount: 0, stockQty: 0 };
    prev.stockQty = num(row.stock);
    map.set(row.productId, prev);
  }
  for (const row of stockRows) {
    if (!map.has(row.productId)) {
      map.set(row.productId, { salesQty: 0, salesAmount: 0, stockQty: num(row.stock) });
    }
  }
  return map;
}

function hasActivity(
  agg: ProductAgg,
  unitMaterialCost: number,
  materialSurplusLoss: number,
  periodScoped: boolean,
  materialCostMode: ProductMaterialCostMode,
  linkedPurchaseCost: number,
  linkedPaymentCost: number,
  linkedReceiptAmount: number,
): boolean {
  if (materialCostMode === 'document_linked') {
    return (
      linkedPurchaseCost > 0
      || linkedPaymentCost > 0
      || linkedReceiptAmount > 0
      || agg.reportCost > 0
      || agg.outsourceFee > 0
      || agg.reworkFee > 0
      || agg.scrapQty > 0
      || agg.salesQty > 0
      || agg.salesAmount > 0
      || agg.stockQty > 0
    );
  }
  return (
    agg.materialCost > 0
    || agg.reportCost > 0
    || agg.outsourceFee > 0
    || agg.reworkFee > 0
    || materialSurplusLoss > 0
    || agg.scrapQty > 0
    || agg.salesQty > 0
    || agg.salesAmount > 0
    || agg.stockQty > 0
    || (!periodScoped && unitMaterialCost > 0)
  );
}

function buildRow(
  productId: string,
  name: string,
  sku: string,
  imageUrl: string | null,
  hasProcessNodes: boolean,
  agg: ProductAgg,
  unitMaterialCost: number,
  materialSurplusLoss: number,
  materialCostMode: ProductMaterialCostMode,
  linkedPurchaseCost: number,
  linkedPaymentCost: number,
  linkedReceiptAmount: number,
  includeProduction: boolean,
  includePsi: boolean,
  includeFinance: boolean,
): ProductEconomicsRow {
  const scrapAmount = includeProduction ? agg.scrapQty * unitMaterialCost : 0;
  const reportCost = includeProduction ? agg.reportCost : 0;
  const outsourceFee = includeProduction ? agg.outsourceFee : 0;
  const reworkFee = includeProduction ? agg.reworkFee : 0;
  const scrapQty = includeProduction ? agg.scrapQty : 0;
  const stockQty = includePsi ? agg.stockQty : 0;
  const salesQty = includePsi ? agg.salesQty : 0;
  const salesAmount = includePsi ? agg.salesAmount : 0;

  if (materialCostMode === 'document_linked') {
    const purchaseCost = includeProduction ? linkedPurchaseCost : 0;
    const paymentCost = includeFinance ? linkedPaymentCost : 0;
    const receiptAmount = includeFinance ? linkedReceiptAmount : 0;
    const totalCost = purchaseCost + paymentCost + reportCost + outsourceFee + reworkFee + scrapAmount;
    const totalRevenue = salesAmount + receiptAmount;
    return {
      productId,
      name,
      sku,
      imageUrl,
      hasProcessNodes,
      materialCost: 0,
      reportCost,
      outsourceFee,
      reworkFee,
      materialSurplusLoss: 0,
      linkedPurchaseCost: purchaseCost,
      linkedPaymentCost: paymentCost,
      linkedReceiptAmount: receiptAmount,
      scrapQty,
      scrapAmount,
      stockQty,
      salesQty,
      salesAmount,
      totalRevenue,
      totalCost,
      grossProfit: totalRevenue - totalCost,
    };
  }

  const materialCost = includeProduction ? agg.materialCost : 0;
  const surplusLoss = includeProduction ? materialSurplusLoss : 0;
  const totalCost = materialCost + reportCost + outsourceFee + reworkFee + surplusLoss + scrapAmount;
  return {
    productId,
    name,
    sku,
    imageUrl,
    hasProcessNodes,
    materialCost,
    reportCost,
    outsourceFee,
    reworkFee,
    materialSurplusLoss: surplusLoss,
    linkedPurchaseCost: 0,
    linkedPaymentCost: 0,
    linkedReceiptAmount: 0,
    scrapQty,
    scrapAmount,
    stockQty,
    salesQty,
    salesAmount,
    totalRevenue: salesAmount,
    totalCost,
    grossProfit: salesAmount - totalCost,
  };
}

export async function computeProductEconomicsList(
  db: TenantPrismaClient,
  tenantId: string,
  permissions: string[],
  query: ProductEconomicsListQuery = {},
): Promise<ProductEconomicsListResponse | null> {
  const includeProduction = canAccessProduction(permissions);
  const includePsi = canAccessPsi(permissions);
  const includeFinance = canAccessFinance(permissions);
  if (!includeProduction && !includePsi) return null;

  const materialCostMode = await resolveMaterialCostMode(tenantId, query.materialCostMode);
  const { periodRange, period, customRange } = resolveProductEconomicsPeriod(query);
  const periodScoped = periodRange != null;
  const documentLinked = materialCostMode === 'document_linked';

  const [globalNodes, allProducts] = await Promise.all([
    db.globalNodeTemplate.findMany({ select: { id: true, name: true } }),
    db.product.findMany({
      where: { enabled: true },
      select: { id: true, name: true, sku: true, imageUrl: true, milestoneNodeIds: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const nodeNameById = new Map(globalNodes.map(n => [n.id, n.name]));
  const productIds = allProducts.map(p => p.id);

  const boms = includeProduction ? await loadBoms(db, productIds) : [];
  const materialIds = boms.flatMap(b => b.items.map(i => i.productId));
  const priceMap = includeProduction ? await buildMaterialPriceMap(db, materialIds) : new Map();
  const unitMaterialCostByProduct = new Map<string, number>();
  if (includeProduction) {
    for (const pid of productIds) {
      unitMaterialCostByProduct.set(pid, computeUnitMaterialCost(boms, pid, priceMap));
    }
  }

  const prodAggs = includeProduction
    ? await loadProductionAggregates(db, boms, priceMap, nodeNameById, periodRange)
    : new Map<string, ProductAgg>();
  const surplusLossByProduct = includeProduction && !periodScoped && !documentLinked
    ? await computeMaterialSurplusLossByProduct(db, productIds, priceMap)
    : new Map<string, number>();
  const psiAggs = includePsi ? await loadPsiAggregates(db, periodRange) : new Map();

  const linkedPurchaseByProduct = documentLinked && includeProduction
    ? await loadLinkedPurchaseCostByProduct(db, productIds, periodRange)
    : new Map<string, number>();
  const linkedFinance = documentLinked && includeFinance
    ? await loadLinkedFinanceByProduct(db, productIds, periodRange)
    : { paymentCostMap: new Map<string, number>(), receiptAmountMap: new Map<string, number>() };

  const merged = new Map<string, ProductAgg>();
  for (const pid of productIds) {
    const base = prodAggs.get(pid) ?? emptyAgg();
    const psi = psiAggs.get(pid);
    if (psi) {
      base.salesQty = psi.salesQty;
      base.salesAmount = psi.salesAmount;
      base.stockQty = psi.stockQty;
    }
    merged.set(pid, base);
  }
  for (const [pid, psi] of psiAggs) {
    if (merged.has(pid)) continue;
    const base = emptyAgg();
    base.salesQty = psi.salesQty;
    base.salesAmount = psi.salesAmount;
    base.stockQty = psi.stockQty;
    merged.set(pid, base);
  }

  const rows: ProductEconomicsRow[] = [];
  for (const p of allProducts) {
    const agg = merged.get(p.id) ?? emptyAgg();
    const unitMaterialCost = unitMaterialCostByProduct.get(p.id) ?? 0;
    const materialSurplusLoss = surplusLossByProduct.get(p.id) ?? 0;
    const linkedPurchaseCost = linkedPurchaseByProduct.get(p.id) ?? 0;
    const linkedPaymentCost = linkedFinance.paymentCostMap.get(p.id) ?? 0;
    const linkedReceiptAmount = linkedFinance.receiptAmountMap.get(p.id) ?? 0;
    if (
      !hasActivity(
        agg,
        unitMaterialCost,
        materialSurplusLoss,
        periodScoped,
        materialCostMode,
        linkedPurchaseCost,
        linkedPaymentCost,
        linkedReceiptAmount,
      )
    ) {
      continue;
    }
    rows.push(
      buildRow(
        p.id,
        p.name,
        p.sku,
        p.imageUrl ?? null,
        productHasProcessNodes(p.milestoneNodeIds),
        agg,
        unitMaterialCost,
        materialSurplusLoss,
        materialCostMode,
        linkedPurchaseCost,
        linkedPaymentCost,
        linkedReceiptAmount,
        includeProduction,
        includePsi,
        includeFinance,
      ),
    );
  }

  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const totalSalesAmount = rows.reduce((s, r) => s + r.salesAmount, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);

  return {
    canProduction: includeProduction,
    canPsi: includePsi,
    canFinance: includeFinance,
    materialCostMode,
    period,
    customRange,
    summary: {
      productCount: rows.length,
      totalCost,
      totalSalesAmount,
      totalRevenue,
      grossProfit: totalRevenue - totalCost,
    },
    rows,
  };
}

export async function computeProductEconomicsDetail(
  db: TenantPrismaClient,
  tenantId: string,
  permissions: string[],
  productId: string,
  materialCostModeOverride?: ProductMaterialCostMode,
): Promise<ProductEconomicsDetailResponse | null> {
  const includeProduction = canAccessProduction(permissions);
  const includePsi = canAccessPsi(permissions);
  const includeFinance = canAccessFinance(permissions);
  if (!includeProduction && !includePsi) return null;

  const materialCostMode = await resolveMaterialCostMode(tenantId, materialCostModeOverride);
  const documentLinked = materialCostMode === 'document_linked';

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, sku: true, imageUrl: true, enabled: true, milestoneNodeIds: true },
  });
  if (!product) throw new AppError(404, '产品不存在');

  const globalNodes = await db.globalNodeTemplate.findMany({ select: { id: true, name: true } });
  const nodeNameById = new Map(globalNodes.map(n => [n.id, n.name]));

  const boms = includeProduction ? await loadBoms(db, [productId]) : [];
  const materialIds = boms.flatMap(b => b.items.map(i => i.productId));
  const priceMap = includeProduction ? await buildMaterialPriceMap(db, materialIds) : new Map();
  const unitMaterialCost = includeProduction
    ? computeUnitMaterialCost(boms, productId, priceMap)
    : 0;

  const prodAgg = includeProduction
    ? (await loadProductionAggregates(db, boms, priceMap, nodeNameById)).get(productId) ?? emptyAgg()
    : emptyAgg();
  const materialSurplusLoss = includeProduction && !documentLinked
    ? (await computeMaterialSurplusLossByProduct(db, [productId], priceMap)).get(productId) ?? 0
    : 0;

  const linkedPurchaseCost = documentLinked && includeProduction
    ? (await loadLinkedPurchaseCostByProduct(db, [productId])).get(productId) ?? 0
    : 0;
  const linkedFinance = documentLinked && includeFinance
    ? await loadLinkedFinanceByProduct(db, [productId])
    : { paymentCostMap: new Map<string, number>(), receiptAmountMap: new Map<string, number>() };
  const linkedPaymentCost = linkedFinance.paymentCostMap.get(productId) ?? 0;
  const linkedReceiptAmount = linkedFinance.receiptAmountMap.get(productId) ?? 0;

  if (includePsi) {
    const psi = (await loadPsiAggregates(db)).get(productId);
    if (psi) {
      prodAgg.salesQty = psi.salesQty;
      prodAgg.salesAmount = psi.salesAmount;
      prodAgg.stockQty = psi.stockQty;
    }
  }

  const row = buildRow(
    product.id,
    product.name,
    product.sku,
    product.imageUrl ?? null,
    productHasProcessNodes(product.milestoneNodeIds),
    prodAgg,
    unitMaterialCost,
    materialSurplusLoss,
    materialCostMode,
    linkedPurchaseCost,
    linkedPaymentCost,
    linkedReceiptAmount,
    includeProduction,
    includePsi,
    includeFinance,
  );

  const quantityDetail = includeProduction
    ? await loadProductQuantityDetail(db, productId)
    : { totalOrderQty: 0, stockInQty: 0, nodeQty: new Map<string, NodeQtyAgg>() };

  const nodeIds = new Set<string>([
    ...prodAgg.byNode.keys(),
    ...quantityDetail.nodeQty.keys(),
  ]);

  const byNode: ProductEconomicsNodeRow[] = [...nodeIds]
    .map(nodeId => {
      const cost = prodAgg.byNode.get(nodeId);
      const qty = quantityDetail.nodeQty.get(nodeId);
      return {
        nodeId,
        nodeName: nodeNameById.get(nodeId) ?? nodeId,
        hasNodeBom: nodeHasBom(boms, productId, nodeId),
        materialCost: cost?.materialCost ?? 0,
        materialQty: Math.round((cost?.materialQty ?? 0) * 100) / 100,
        reportCost: cost?.reportCost ?? 0,
        outsourceFee: cost?.outsourceFee ?? 0,
        reworkFee: cost?.reworkFee ?? 0,
        reportQty: qty?.reportQty ?? 0,
        outsourceQty: qty?.outsourceQty ?? 0,
        reworkQty: qty?.reworkQty ?? 0,
      };
    })
    .filter(
      n =>
        n.materialCost > 0
        || n.reportCost > 0
        || n.outsourceFee > 0
        || n.reworkFee > 0
        || n.reportQty > 0
        || n.outsourceQty > 0
        || n.reworkQty > 0,
    )
    .sort((a, b) => a.nodeName.localeCompare(b.nodeName, 'zh-CN'));

  return {
    canProduction: includeProduction,
    canPsi: includePsi,
    canFinance: includeFinance,
    materialCostMode,
    productId: product.id,
    name: product.name,
    sku: product.sku,
    imageUrl: product.imageUrl ?? null,
    materialCost: row.materialCost,
    reportCost: row.reportCost,
    outsourceFee: row.outsourceFee,
    reworkFee: row.reworkFee,
    materialSurplusLoss: row.materialSurplusLoss,
    linkedPurchaseCost: row.linkedPurchaseCost,
    linkedPaymentCost: row.linkedPaymentCost,
    linkedReceiptAmount: row.linkedReceiptAmount,
    scrapQty: row.scrapQty,
    scrapAmount: row.scrapAmount,
    stockQty: row.stockQty,
    salesQty: row.salesQty,
    salesAmount: row.salesAmount,
    totalRevenue: row.totalRevenue,
    totalCost: row.totalCost,
    grossProfit: row.grossProfit,
    totalOrderQty: quantityDetail.totalOrderQty,
    stockInQty: quantityDetail.stockInQty,
    byNode,
  };
}
