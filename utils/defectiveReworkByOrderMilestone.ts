import type { ProductionOrder, ProductionOpRecord } from '../types';

/** 与工单中心一致：本工序不良、来源工序返工完成（按规格） */
export function buildDefectiveReworkByOrderMilestone(
  orders: ProductionOrder[],
  prodRecords: ProductionOpRecord[] | undefined
): Map<string, { defective: number; rework: number; reworkByVariant: Record<string, number> }> {
  const map = new Map<string, { defective: number; rework: number; reworkByVariant: Record<string, number> }>();
  orders.forEach(o => {
    o.milestones.forEach(m => {
      const defective = (m.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
      map.set(`${o.id}|${m.templateId}`, { defective, rework: 0, reworkByVariant: {} });
    });
  });

  const reworkReports = (prodRecords || []).filter((r): r is ProductionOpRecord => r.type === 'REWORK_REPORT');
  if (reworkReports.length === 0) return map;

  const orderIdToParent = new Map<string, string>();
  orders.forEach(o => {
    if (o.parentOrderId) orderIdToParent.set(o.id, o.parentOrderId);
  });

  const getParentOrderId = (orderId: string) => orderIdToParent.get(orderId) ?? orderId;
  const orderProduct = (oid: string) => orders.find(o => o.id === oid)?.productId;
  const getOriginalSourceNodeId = (r: ProductionOpRecord): string | undefined => {
    const pid = orderProduct(r.orderId ?? '');
    const pathIncludes = (x: ProductionOpRecord, node: string) => {
      const path = x.reworkNodeIds?.length ? x.reworkNodeIds : x.nodeId ? [x.nodeId] : [];
      return path.includes(node);
    };
    const rework = (prodRecords || []).find(
      x =>
        x.type === 'REWORK' &&
        pathIncludes(x, r.nodeId ?? '') &&
        (x.orderId === r.orderId ||
          x.orderId === orderIdToParent.get(r.orderId ?? '') ||
          (!x.orderId && pid != null && x.productId === pid))
    ) as ProductionOpRecord | undefined;
    return rework?.sourceNodeId ?? (r.sourceNodeId ?? r.nodeId ?? undefined);
  };
  const getReworkNodeIdsForOrder = (orderId: string, sourceNodeId: string): string[] => {
    const o = orders.find(x => x.id === orderId);
    let r = (prodRecords || []).find(
      x => x.type === 'REWORK' && x.orderId === orderId && (x.sourceNodeId ?? x.nodeId) === sourceNodeId
    ) as ProductionOpRecord | undefined;
    if (!r && o) {
      r = (prodRecords || []).find(
        x => x.type === 'REWORK' && !x.orderId && x.productId === o.productId && (x.sourceNodeId ?? x.nodeId) === sourceNodeId
      ) as ProductionOpRecord | undefined;
    }
    if (r?.reworkNodeIds?.length) return r.reworkNodeIds;
    if (r?.nodeId) return [r.nodeId];
    return [];
  };
  const getReworkNodeIds = (parentOrderId: string, sourceNodeId: string, orderIdsInGroup: string[]): string[] => {
    const tried = new Set<string>([parentOrderId, ...orderIdsInGroup]);
    for (const oid of tried) {
      const ids = getReworkNodeIdsForOrder(oid, sourceNodeId);
      if (ids.length > 0) return ids;
    }
    return [];
  };

  const bySourceKey = new Map<
    string,
    { byVariant: Record<string, Record<string, number>>; orderIds: Set<string>; reworkNodeIds?: string[] }
  >();

  const ensureEntry = (key: string, oid: string) => {
    if (!bySourceKey.has(key)) bySourceKey.set(key, { byVariant: {}, orderIds: new Set() });
    const e = bySourceKey.get(key)!;
    e.orderIds.add(oid);
    return e;
  };

  reworkReports.forEach(r => {
    const rw =
      r.sourceReworkId != null && r.sourceReworkId !== ''
        ? ((prodRecords || []).find(x => x.id === r.sourceReworkId && x.type === 'REWORK') as ProductionOpRecord | undefined)
        : undefined;
    let parentOrderId: string;
    let originalSourceNodeId: string;
    let reworkNodeIdsFromRw: string[] | undefined;

    if (rw) {
      parentOrderId = rw.orderId ? getParentOrderId(rw.orderId) : getParentOrderId(r.orderId ?? '');
      originalSourceNodeId = (rw.sourceNodeId || r.sourceNodeId || r.nodeId) ?? '';
      const nodes = rw.reworkNodeIds?.length ? rw.reworkNodeIds : rw.nodeId ? [rw.nodeId] : [];
      reworkNodeIdsFromRw = nodes.length > 0 ? nodes : undefined;
    } else {
      originalSourceNodeId = getOriginalSourceNodeId(r) ?? r.sourceNodeId ?? r.nodeId ?? '';
      if (!originalSourceNodeId) return;
      parentOrderId = getParentOrderId(r.orderId ?? '');
      reworkNodeIdsFromRw = undefined;
    }
    if (!originalSourceNodeId) return;

    const key = `${parentOrderId}|${originalSourceNodeId}`;
    const entry = ensureEntry(key, r.orderId ?? parentOrderId);
    if (reworkNodeIdsFromRw?.length && (!entry.reworkNodeIds || entry.reworkNodeIds.length === 0)) {
      entry.reworkNodeIds = reworkNodeIdsFromRw;
    }
    const byVariant = entry.byVariant;
    const vid = r.variantId ?? '';
    if (!byVariant[vid]) byVariant[vid] = {};
    const nodeId = r.nodeId ?? '';
    byVariant[vid][nodeId] = (byVariant[vid][nodeId] ?? 0) + (r.quantity ?? 0);
  });

  bySourceKey.forEach((entry, key) => {
    const [parentOrderId, sourceNodeId] = key.split('|');
    const reworkNodeIds =
      entry.reworkNodeIds?.length && entry.reworkNodeIds.length > 0
        ? entry.reworkNodeIds
        : getReworkNodeIds(parentOrderId, sourceNodeId, Array.from(entry.orderIds));
    const byVariant = entry.byVariant;
    const reworkByVariant: Record<string, number> = {};
    Object.entries(byVariant).forEach(([vid, byNode]) => {
      const contribution =
        reworkNodeIds.length > 0
          ? Math.min(...reworkNodeIds.map(nid => byNode[nid] ?? 0))
          : Object.values(byNode).reduce((s, q) => s + q, 0);
      reworkByVariant[vid] = contribution;
    });
    const rework = Object.values(reworkByVariant).reduce((s, q) => s + q, 0);
    const existing = map.get(`${parentOrderId}|${sourceNodeId}`);
    if (existing) {
      existing.rework = rework;
      existing.reworkByVariant = reworkByVariant;
    } else {
      map.set(`${parentOrderId}|${sourceNodeId}`, { defective: 0, rework, reworkByVariant });
    }
  });
  return map;
}
