/**
 * 返工报工：同工序多产品路径分组与数量 key 约定。
 */
import type { ProductionOpRecord, ProcessSequenceMode, GlobalNodeTemplate } from '../types';
import { buildOutOfSequenceTemplateIds, findGatingPredecessorIndex, isProcessSequential } from '../shared/processSequence';

export interface ReworkReportPathRow {
  productId: string;
  pathKey: string;
  pathLabel: string;
  nodeIds: string[];
  records: ProductionOpRecord[];
  totalPending: number;
  pendingByVariant: Record<string, number>;
}

export interface ReworkProductGroup {
  productId: string;
  paths: ReworkReportPathRow[];
  totalPending: number;
}

export function reworkRemainingAtNode(
  r: ProductionOpRecord,
  nodeId: string,
  processSequenceMode: ProcessSequenceMode,
  outOfSequenceTemplateIds: ReadonlySet<string>,
): number {
  const pathNodes =
    r.reworkNodeIds && r.reworkNodeIds.length > 0 ? r.reworkNodeIds : r.nodeId ? [r.nodeId] : [];
  const idx = pathNodes.indexOf(nodeId);
  if (idx < 0) return 0;
  const doneAtNode =
    r.reworkCompletedQuantityByNode?.[nodeId] ??
    ((r.completedNodeIds ?? []).includes(nodeId) ? r.quantity : 0);
  if (isProcessSequential(processSequenceMode, nodeId, outOfSequenceTemplateIds)) {
    const gateIdx = findGatingPredecessorIndex(pathNodes, idx, outOfSequenceTemplateIds);
    if (gateIdx >= 0) {
      const prevNodeId = pathNodes[gateIdx];
      const doneAtPrev = r.reworkCompletedQuantityByNode?.[prevNodeId] ?? 0;
      return Math.max(0, Math.min(doneAtPrev, r.quantity) - doneAtNode);
    }
  }
  return Math.max(0, r.quantity - doneAtNode);
}

export function reworkQtyKey(productId: string, pathKey: string, variantId?: string): string {
  if (variantId === undefined) return `${productId}__${pathKey}`;
  return `${productId}__${pathKey}__${variantId}`;
}

export function parseReworkQtyKey(key: string): { productId: string; pathKey: string; variantId?: string } | null {
  const parts = key.split('__');
  if (parts.length < 2) return null;
  const [productId, ...rest] = parts;
  if (!productId) return null;
  if (rest.length === 1) return { productId, pathKey: rest[0]! };
  const pathKey = rest.slice(0, -1).join('__');
  const variantId = rest[rest.length - 1]!;
  return { productId, pathKey, variantId };
}

export interface BuildReworkReportPathsArgs {
  records: ProductionOpRecord[];
  currentNodeId: string;
  isOutsourceRework: boolean;
  outsourcePartner?: string;
  processSequenceMode: ProcessSequenceMode;
  globalNodes: GlobalNodeTemplate[];
  /** 入口工单 productId：排序时置顶 */
  anchorProductId?: string;
  /** 从某产品入口打开时，仅展示该产品的待返工路径 */
  scopeProductId?: string;
  /** 关联工单模式：从某工单入口打开时，仅展示该工单的待返工记录 */
  scopeOrderId?: string;
}

export function buildReworkReportPaths(args: BuildReworkReportPathsArgs): ReworkReportPathRow[] {
  const {
    records,
    currentNodeId,
    isOutsourceRework,
    outsourcePartner,
    processSequenceMode,
    globalNodes,
    anchorProductId,
    scopeProductId,
    scopeOrderId,
  } = args;
  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(globalNodes);

  const reworkList = records.filter(r => {
    if (r.type !== 'REWORK') return false;
    if (scopeProductId && r.productId !== scopeProductId) return false;
    if (scopeOrderId && r.orderId !== scopeOrderId) return false;
    const recPartner = (r.partner ?? '').trim();
    if (isOutsourceRework) {
      if (recPartner !== (outsourcePartner ?? '').trim()) return false;
    } else if (recPartner) {
      return false;
    }
    const pathNodes =
      r.reworkNodeIds && r.reworkNodeIds.length > 0 ? r.reworkNodeIds : r.nodeId ? [r.nodeId] : [];
    if (!pathNodes.includes(currentNodeId)) return false;
    if (r.status === '已完成') return false;
    const remaining = reworkRemainingAtNode(r, currentNodeId, processSequenceMode, outOfSequenceTemplateIds);
    if (remaining <= 0) return false;
    return true;
  });

  const byKey = new Map<string, { productId: string; records: ProductionOpRecord[]; pendingByVariant: Record<string, number> }>();
  reworkList.forEach(r => {
    const productId = r.productId;
    if (!productId) return;
    const pathNodes =
      r.reworkNodeIds && r.reworkNodeIds.length > 0 ? r.reworkNodeIds : r.nodeId ? [r.nodeId] : [];
    const pathKey = pathNodes.join('|');
    const mapKey = `${productId}::${pathKey}`;
    const cur = byKey.get(mapKey) ?? { productId, records: [], pendingByVariant: {} };
    cur.records.push(r);
    const remaining = reworkRemainingAtNode(r, currentNodeId, processSequenceMode, outOfSequenceTemplateIds);
    const vid = r.variantId ?? '';
    cur.pendingByVariant[vid] = (cur.pendingByVariant[vid] ?? 0) + remaining;
    byKey.set(mapKey, cur);
  });

  const rows = Array.from(byKey.entries()).map(([, { productId, records: recs, pendingByVariant }]) => {
    const pathKey = recs[0]
      ? ((recs[0].reworkNodeIds && recs[0].reworkNodeIds.length > 0
          ? recs[0].reworkNodeIds
          : recs[0].nodeId
            ? [recs[0].nodeId]
            : [])
        .join('|'))
      : '';
    const nodeIds = pathKey.split('|').filter(Boolean);
    const pathLabel =
      nodeIds.length <= 1
        ? (globalNodes.find(n => n.id === nodeIds[0])?.name ?? nodeIds[0])
        : nodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、');
    const totalPending = Object.values(pendingByVariant).reduce((s, q) => s + q, 0);
    return { productId, pathKey, pathLabel, nodeIds, records: recs, totalPending, pendingByVariant };
  }).filter(p => p.totalPending > 0);

  if (anchorProductId) {
    rows.sort((a, b) => {
      if (a.productId === anchorProductId && b.productId !== anchorProductId) return -1;
      if (b.productId === anchorProductId && a.productId !== anchorProductId) return 1;
      return a.productId.localeCompare(b.productId);
    });
  } else {
    rows.sort((a, b) => a.productId.localeCompare(b.productId));
  }
  return rows;
}

export function groupReworkPathsByProduct(paths: ReworkReportPathRow[]): ReworkProductGroup[] {
  const byProduct = new Map<string, ReworkReportPathRow[]>();
  paths.forEach(p => {
    const list = byProduct.get(p.productId) ?? [];
    list.push(p);
    byProduct.set(p.productId, list);
  });
  return Array.from(byProduct.entries()).map(([productId, productPaths]) => ({
    productId,
    paths: productPaths,
    totalPending: productPaths.reduce((s, p) => s + p.totalPending, 0),
  }));
}

export function findReworkPathForScan(
  paths: ReworkReportPathRow[],
  productId: string,
  variantId: string,
): ReworkReportPathRow | undefined {
  const productPaths = paths.filter(p => p.productId === productId);
  if (variantId) {
    return productPaths.find(p => (p.pendingByVariant[variantId] ?? 0) > 0);
  }
  return productPaths.find(p => p.totalPending > 0) ?? productPaths[0];
}

export function collectReworkOrderIdsForProduct(
  paths: ReworkReportPathRow[],
  productId: string,
  fallbackOrderId?: string,
): string[] {
  const ids = new Set<string>();
  paths
    .filter(p => p.productId === productId)
    .forEach(p => {
      p.records.forEach(r => {
        if (r.orderId) ids.add(r.orderId);
      });
    });
  if (ids.size === 0 && fallbackOrderId) ids.add(fallbackOrderId);
  return [...ids];
}

export function sumReworkEnteredForPath(
  quantities: Record<string, number>,
  productId: string,
  path: ReworkReportPathRow,
  variantIds: string[],
  hasColorSize: boolean,
): number {
  if (!hasColorSize || variantIds.length === 0) {
    return quantities[reworkQtyKey(productId, path.pathKey)] ?? 0;
  }
  const pendingUndiff = path.pendingByVariant[''] ?? 0;
  const onlyUndiff =
    pendingUndiff > 0 &&
    Object.keys(path.pendingByVariant).every(k => k === '' || (path.pendingByVariant[k] ?? 0) <= 0);
  if (onlyUndiff) {
    return variantIds.reduce((s, vid) => s + (quantities[reworkQtyKey(productId, path.pathKey, vid)] ?? 0), 0);
  }
  const undiffQ = quantities[reworkQtyKey(productId, path.pathKey, '')] ?? 0;
  const variantQ = variantIds.reduce(
    (s, vid) => s + (quantities[reworkQtyKey(productId, path.pathKey, vid)] ?? 0),
    0,
  );
  return undiffQ + variantQ;
}

export function hasAnyReworkEnteredQty(
  paths: ReworkReportPathRow[],
  quantities: Record<string, number>,
  productHasColorSize: (productId: string) => boolean,
  getVariantIds: (productId: string) => string[],
): boolean {
  return paths.some(p => {
    const hasMatrix = productHasColorSize(p.productId);
    const variantIds = getVariantIds(p.productId);
    return sumReworkEnteredForPath(quantities, p.productId, p, variantIds, hasMatrix) > 0;
  });
}

export function sumTotalReworkEnteredQty(
  paths: ReworkReportPathRow[],
  quantities: Record<string, number>,
  productHasColorSize: (productId: string) => boolean,
  getVariantIds: (productId: string) => string[],
): number {
  return paths.reduce(
    (sum, p) =>
      sum +
      sumReworkEnteredForPath(
        quantities,
        p.productId,
        p,
        getVariantIds(p.productId),
        productHasColorSize(p.productId),
      ),
    0,
  );
}
