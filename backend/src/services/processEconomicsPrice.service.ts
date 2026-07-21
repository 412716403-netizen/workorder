import type { TenantPrismaClient } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';
import { invalidateProductEconomicsCache } from './productEconomicsCache.js';
import { formatMaterialPriceRuleLabel } from '../../../shared/materialPurchasePrice.js';
import {
  processNodePriceContextKey,
  resolveEffectiveNodePriceRule,
  resolveOutsourceUnitPriceFromRule,
  resolveReportUnitPriceFromRule,
  type OutsourcePriceLine,
  type ReportRateLine,
} from '../../../shared/processEconomicsPrice.js';
import {
  parseEconomicsNodePriceRules,
  parseMaterialPriceRule,
  parseMaterialPriceRuleOverride,
  PROCESS_NODE_PRICE_RULE_SOURCE_LABEL,
  type EconomicsNodePriceRules,
  type MaterialPriceRule,
  type MaterialPriceRuleOverride,
  type ProcessPriceNodeRow,
  type ProcessPriceNodesResponse,
  type ProcessPriceParentProductRow,
} from '../../../shared/types.js';

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseMilestoneNodeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
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

export type ProcessPriceContext = { productId: string; nodeId: string };

type PriceKind = 'report' | 'outsource';

function configField(kind: PriceKind): 'economicsReportNodePrice' | 'economicsOutsourceNodePrice' {
  return kind === 'report' ? 'economicsReportNodePrice' : 'economicsOutsourceNodePrice';
}

async function loadReportLinesByContext(
  db: TenantPrismaClient,
  productIds: string[],
): Promise<Map<string, ReportRateLine[]>> {
  const out = new Map<string, ReportRateLine[]>();
  if (productIds.length === 0) return out;

  const append = (productId: string, nodeId: string, line: ReportRateLine) => {
    if (!productId || !nodeId) return;
    const key = processNodePriceContextKey(productId, nodeId);
    const list = out.get(key) ?? [];
    list.push(line);
    out.set(key, list);
  };

  const [msReports, pmpReports] = await Promise.all([
    db.milestoneReport.findMany({
      where: { milestone: { productionOrder: { productId: { in: productIds } } } },
      select: {
        rate: true,
        quantity: true,
        timestamp: true,
        milestone: {
          select: {
            templateId: true,
            productionOrder: { select: { productId: true } },
          },
        },
      },
    }),
    db.productProgressReport.findMany({
      where: { progress: { productId: { in: productIds } } },
      select: {
        rate: true,
        quantity: true,
        timestamp: true,
        progress: {
          select: { productId: true, milestoneTemplateId: true },
        },
      },
    }),
  ]);

  for (const r of msReports) {
    append(
      r.milestone.productionOrder.productId,
      r.milestone.templateId,
      { rate: r.rate, quantity: r.quantity, timestamp: r.timestamp },
    );
  }
  for (const r of pmpReports) {
    append(
      r.progress.productId,
      r.progress.milestoneTemplateId,
      { rate: r.rate, quantity: r.quantity, timestamp: r.timestamp },
    );
  }
  return out;
}

async function loadOutsourceLinesByContext(
  db: TenantPrismaClient,
  productIds: string[],
): Promise<Map<string, OutsourcePriceLine[]>> {
  const out = new Map<string, OutsourcePriceLine[]>();
  if (productIds.length === 0) return out;

  const rows = await db.productionOpRecord.findMany({
    where: {
      productId: { in: productIds },
      type: 'OUTSOURCE',
      status: '已收回',
    },
    select: {
      productId: true,
      nodeId: true,
      unitPrice: true,
      amount: true,
      quantity: true,
      timestamp: true,
    },
  });

  for (const r of rows) {
    if (!r.productId || !r.nodeId) continue;
    const key = processNodePriceContextKey(r.productId, r.nodeId);
    const list = out.get(key) ?? [];
    list.push({
      unitPrice: r.unitPrice,
      amount: r.amount,
      quantity: r.quantity,
      timestamp: r.timestamp,
    });
    out.set(key, list);
  }
  return out;
}

function computeNodeUnitPrice(
  kind: PriceKind,
  parentConfig: EconomicsNodePriceRules | null | undefined,
  nodeId: string,
  reportLines: ReportRateLine[],
  outsourceLines: OutsourcePriceLine[],
  archiveRate: number,
): Pick<
  ProcessPriceNodeRow,
  'unitPrice' | 'priceSource' | 'recordCountInPeriod' | 'ruleSource' | 'ruleLabel' | 'hasIndividualOverride'
> {
  const { rule, ruleSource } = resolveEffectiveNodePriceRule(parentConfig, nodeId);
  const override = parentConfig?.nodeOverrides?.[nodeId];
  const hasIndividualOverride =
    override != null && !('inherit' in override && override.inherit === true);

  const resolved =
    kind === 'report'
      ? resolveReportUnitPriceFromRule(reportLines, rule, archiveRate)
      : resolveOutsourceUnitPriceFromRule(outsourceLines, rule, archiveRate);

  return {
    unitPrice: resolved.unitPrice != null ? round2(resolved.unitPrice) : null,
    priceSource: resolved.priceSource,
    recordCountInPeriod: resolved.recordCountInPeriod,
    ruleSource,
    ruleLabel: formatMaterialPriceRuleLabel(rule),
    hasIndividualOverride: !!hasIndividualOverride,
  };
}

async function buildProcessPriceMapForEconomics(
  db: TenantPrismaClient,
  kind: PriceKind,
  contexts: ProcessPriceContext[],
): Promise<Map<string, number>> {
  const uniqueContexts = [
    ...new Map(
      contexts
        .filter(c => c.productId && c.nodeId)
        .map(c => [processNodePriceContextKey(c.productId, c.nodeId), c]),
    ).values(),
  ];
  if (uniqueContexts.length === 0) return new Map();

  const productIds = [...new Set(uniqueContexts.map(c => c.productId))];
  const field = configField(kind);

  const [parents, reportLinesByContext, outsourceLinesByContext] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        nodeRates: true,
        economicsReportNodePrice: true,
        economicsOutsourceNodePrice: true,
      },
    }),
    kind === 'report' ? loadReportLinesByContext(db, productIds) : Promise.resolve(new Map()),
    kind === 'outsource' ? loadOutsourceLinesByContext(db, productIds) : Promise.resolve(new Map()),
  ]);

  const parentById = new Map(parents.map(p => [p.id, p]));
  const map = new Map<string, number>();

  for (const ctx of uniqueContexts) {
    const parent = parentById.get(ctx.productId);
    if (!parent) continue;
    const rawConfig =
      field === 'economicsReportNodePrice'
        ? parent.economicsReportNodePrice
        : parent.economicsOutsourceNodePrice;
    const config = parseEconomicsNodePriceRules(rawConfig);
    const archiveRate = parseNodeRates(parent.nodeRates)[ctx.nodeId] ?? 0;
    const key = processNodePriceContextKey(ctx.productId, ctx.nodeId);
    const reportLines = reportLinesByContext.get(key) ?? [];
    const outsourceLines = outsourceLinesByContext.get(key) ?? [];
    const { unitPrice } = computeNodeUnitPrice(
      kind,
      config,
      ctx.nodeId,
      reportLines,
      outsourceLines,
      archiveRate,
    );
    if (unitPrice != null && unitPrice > 0) {
      map.set(key, unitPrice);
    }
  }
  return map;
}

export async function buildReportPriceMapForEconomics(
  db: TenantPrismaClient,
  contexts: ProcessPriceContext[],
): Promise<Map<string, number>> {
  return buildProcessPriceMapForEconomics(db, 'report', contexts);
}

export async function buildOutsourcePriceMapForEconomics(
  db: TenantPrismaClient,
  contexts: ProcessPriceContext[],
): Promise<Map<string, number>> {
  return buildProcessPriceMapForEconomics(db, 'outsource', contexts);
}

async function listParentProductsWithRoute(
  db: TenantPrismaClient,
  opts: { search?: string } = {},
): Promise<ProcessPriceParentProductRow[]> {
  const products = await db.product.findMany({
    where: { enabled: true },
    select: { id: true, name: true, sku: true, milestoneNodeIds: true },
    orderBy: { name: 'asc' },
  });

  const q = opts.search?.trim().toLowerCase() ?? '';
  const rows: ProcessPriceParentProductRow[] = [];
  for (const p of products) {
    const nodeCount = parseMilestoneNodeIds(p.milestoneNodeIds).length;
    if (nodeCount === 0) continue;
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
      nodeCount,
    });
  }
  return rows;
}

async function listProcessPriceNodes(
  db: TenantPrismaClient,
  kind: PriceKind,
  parentProductId: string,
): Promise<ProcessPriceNodesResponse> {
  const field = configField(kind);
  const parent = await db.product.findUnique({
    where: { id: parentProductId },
    select: {
      id: true,
      milestoneNodeIds: true,
      nodeRates: true,
      economicsReportNodePrice: true,
      economicsOutsourceNodePrice: true,
    },
  });
  if (!parent) throw new AppError(404, '成品不存在');

  const rawConfig =
    field === 'economicsReportNodePrice'
      ? parent.economicsReportNodePrice
      : parent.economicsOutsourceNodePrice;
  const nodeIds = parseMilestoneNodeIds(parent.milestoneNodeIds);
  if (nodeIds.length === 0) {
    const parentCfg = parseEconomicsNodePriceRules(rawConfig);
    return { rows: [], parentDefaultRule: parentCfg?.defaultRule ?? null };
  }

  const [globalNodes, reportLinesByContext, outsourceLinesByContext] = await Promise.all([
    db.globalNodeTemplate.findMany({
      where: { id: { in: nodeIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    loadReportLinesByContext(db, [parentProductId]),
    loadOutsourceLinesByContext(db, [parentProductId]),
  ]);

  const nodeNameById = new Map(globalNodes.map(n => [n.id, n.name]));
  const parentCfg = parseEconomicsNodePriceRules(rawConfig);
  const archiveRates = parseNodeRates(parent.nodeRates);

  const rows: ProcessPriceNodeRow[] = nodeIds.map(nodeId => {
    const key = processNodePriceContextKey(parentProductId, nodeId);
    const computed = computeNodeUnitPrice(
      kind,
      parentCfg,
      nodeId,
      reportLinesByContext.get(key) ?? [],
      outsourceLinesByContext.get(key) ?? [],
      archiveRates[nodeId] ?? 0,
    );
    return {
      nodeId,
      nodeName: nodeNameById.get(nodeId) ?? nodeId,
      ...computed,
    };
  });

  return {
    rows,
    parentDefaultRule: parentCfg?.defaultRule ?? null,
  };
}

async function updateParentDefaultRule(
  db: TenantPrismaClient,
  kind: PriceKind,
  parentProductId: string,
  defaultRule: MaterialPriceRule | null,
): Promise<{ defaultRule: MaterialPriceRule | null }> {
  const field = configField(kind);
  const existing = await db.product.findUnique({
    where: { id: parentProductId },
    select: {
      id: true,
      economicsReportNodePrice: true,
      economicsOutsourceNodePrice: true,
    },
  });
  if (!existing) throw new AppError(404, '成品不存在');

  const parsedRule = parseMaterialPriceRule(defaultRule);
  if (!parsedRule) throw new AppError(400, '无效的批量统计规则');

  const next: EconomicsNodePriceRules = { defaultRule: parsedRule };
  await db.product.update({
    where: { id: parentProductId },
    data:
      field === 'economicsReportNodePrice'
        ? { economicsReportNodePrice: next as Prisma.InputJsonValue }
        : { economicsOutsourceNodePrice: next as Prisma.InputJsonValue },
  });
  return { defaultRule: parsedRule };
}

async function updateNodeOverride(
  db: TenantPrismaClient,
  kind: PriceKind,
  parentProductId: string,
  nodeId: string,
  rule: MaterialPriceRuleOverride,
): Promise<ProcessPriceNodeRow> {
  const field = configField(kind);
  const parsed = parseMaterialPriceRuleOverride(rule);
  if (!parsed) throw new AppError(400, '无效的工序统计规则');

  const parent = await db.product.findUnique({
    where: { id: parentProductId },
    select: {
      id: true,
      milestoneNodeIds: true,
      economicsReportNodePrice: true,
      economicsOutsourceNodePrice: true,
    },
  });
  if (!parent) throw new AppError(404, '成品不存在');

  const nodeIds = parseMilestoneNodeIds(parent.milestoneNodeIds);
  if (!nodeIds.includes(nodeId)) throw new AppError(404, '工序不在该成品标准路线中');

  const rawConfig =
    field === 'economicsReportNodePrice'
      ? parent.economicsReportNodePrice
      : parent.economicsOutsourceNodePrice;
  const current = parseEconomicsNodePriceRules(rawConfig) ?? {};
  const overrides = { ...(current.nodeOverrides ?? {}) };
  if ('inherit' in parsed && parsed.inherit === true) {
    delete overrides[nodeId];
  } else {
    overrides[nodeId] = parsed;
  }
  const next: EconomicsNodePriceRules = {
    defaultRule: current.defaultRule ?? null,
    nodeOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  };
  const stored =
    next.defaultRule == null && !next.nodeOverrides
      ? Prisma.DbNull
      : (next as Prisma.InputJsonValue);

  await db.product.update({
    where: { id: parentProductId },
    data:
      field === 'economicsReportNodePrice'
        ? { economicsReportNodePrice: stored }
        : { economicsOutsourceNodePrice: stored },
  });

  const { rows } = await listProcessPriceNodes(db, kind, parentProductId);
  const row = rows.find(r => r.nodeId === nodeId);
  if (!row) throw new AppError(404, '工序不存在');
  return row;
}

export const listReportPriceParentProducts = listParentProductsWithRoute;
export const listOutsourcePriceParentProducts = listParentProductsWithRoute;

export async function listReportPriceNodes(
  db: TenantPrismaClient,
  parentProductId: string,
): Promise<ProcessPriceNodesResponse> {
  return listProcessPriceNodes(db, 'report', parentProductId);
}

export async function listOutsourcePriceNodes(
  db: TenantPrismaClient,
  parentProductId: string,
): Promise<ProcessPriceNodesResponse> {
  return listProcessPriceNodes(db, 'outsource', parentProductId);
}

export async function updateParentReportPriceDefaultRule(
  db: TenantPrismaClient,
  tenantId: string,
  parentProductId: string,
  defaultRule: MaterialPriceRule | null,
) {
  const result = await updateParentDefaultRule(db, 'report', parentProductId, defaultRule);
  await invalidateProductEconomicsCache(tenantId);
  return result;
}

export async function updateParentOutsourcePriceDefaultRule(
  db: TenantPrismaClient,
  tenantId: string,
  parentProductId: string,
  defaultRule: MaterialPriceRule | null,
) {
  const result = await updateParentDefaultRule(db, 'outsource', parentProductId, defaultRule);
  await invalidateProductEconomicsCache(tenantId);
  return result;
}

export async function updateReportPriceNodeOverride(
  db: TenantPrismaClient,
  tenantId: string,
  parentProductId: string,
  nodeId: string,
  rule: MaterialPriceRuleOverride,
) {
  const result = await updateNodeOverride(db, 'report', parentProductId, nodeId, rule);
  await invalidateProductEconomicsCache(tenantId);
  return result;
}

export async function updateOutsourcePriceNodeOverride(
  db: TenantPrismaClient,
  tenantId: string,
  parentProductId: string,
  nodeId: string,
  rule: MaterialPriceRuleOverride,
) {
  const result = await updateNodeOverride(db, 'outsource', parentProductId, nodeId, rule);
  await invalidateProductEconomicsCache(tenantId);
  return result;
}

export { PROCESS_NODE_PRICE_RULE_SOURCE_LABEL };
