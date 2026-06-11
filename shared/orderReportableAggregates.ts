/**
 * 工单工序「可报最多」聚合（与工单中心 OrderListView 口径一致）。
 * 前后端共用纯函数，避免工作台统计与工单中心数字漂移。
 */

import type { ProcessSequenceMode, ProductionLinkMode } from './types.js';

export interface ReportableOrderItem {
  quantity: number;
  variantId?: string | null;
}

export interface ReportableMilestoneReport {
  quantity?: number;
  defectiveQuantity?: number;
  variantId?: string | null;
}

export interface ReportableMilestone {
  id: string;
  templateId: string;
  completedQuantity?: number;
  reports?: ReportableMilestoneReport[];
}

export interface ReportableOrder {
  id: string;
  productId: string;
  parentOrderId?: string | null;
  items: ReportableOrderItem[];
  milestones: ReportableMilestone[];
}

export interface ReportablePmpReport {
  quantity?: number;
  defectiveQuantity?: number;
  variantId?: string | null;
}

export interface ReportablePmp {
  productId: string;
  milestoneTemplateId: string;
  variantId?: string | null;
  completedQuantity?: number;
  reports?: ReportablePmpReport[];
}

export interface ReportableProdRecord {
  id: string;
  type: string;
  orderId?: string | null;
  productId?: string | null;
  variantId?: string | null;
  quantity?: number;
  nodeId?: string | null;
  sourceNodeId?: string | null;
  sourceReworkId?: string | null;
  reworkNodeIds?: string[] | null;
}

export type DefectiveReworkEntry = {
  defective: number;
  rework: number;
  reworkByVariant: Record<string, number>;
};

export function reworkMergeBucketOrderId(
  orderId: string,
  orders: Pick<ReportableOrder, 'id' | 'parentOrderId'>[] | undefined,
): string {
  if (!orders?.length) return orderId;
  const o = orders.find(x => x.id === orderId);
  return o?.parentOrderId ?? orderId;
}

/** 返工单据 orderId 可能为子单或历史链上 id：沿 parent 上溯，判断是否仍属于该产品下的工单树 */
export function orderBelongsToProductInList(
  orderId: string | undefined,
  productId: string,
  orders: Pick<ReportableOrder, 'id' | 'parentOrderId' | 'productId'>[],
): boolean {
  if (!orderId) return true;
  const byId = new Map(orders.map(o => [o.id, o]));
  let cur = byId.get(orderId);
  let g = 0;
  while (cur && g++ < 40) {
    if (cur.productId === productId) return true;
    if (!cur.parentOrderId) return false;
    cur = byId.get(cur.parentOrderId);
  }
  return false;
}

export function sumBlockOrderQty(orders: ReportableOrder[]): number {
  return orders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
}

export function pmpCompletedAtTemplate(
  pmp: ReportablePmp[],
  productId: string,
  templateId: string,
  pmpByKey?: Map<string, number>,
): number {
  if (pmpByKey) return pmpByKey.get(`${productId}|${templateId}`) ?? 0;
  return pmp
    .filter(p => p.productId === productId && p.milestoneTemplateId === templateId)
    .reduce((s, p) => s + (p.completedQuantity ?? 0), 0);
}

export function pmpDefectiveTotalAtTemplate(
  pmp: ReportablePmp[],
  productId: string,
  templateId: string,
): number {
  return pmp
    .filter(p => p.productId === productId && p.milestoneTemplateId === templateId)
    .flatMap(p => p.reports || [])
    .reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
}

/** 与 utils/defectiveReworkByOrderMilestone 一致 */
export function buildDefectiveReworkByOrderMilestone(
  orders: ReportableOrder[],
  prodRecords: ReportableProdRecord[] | undefined,
): Map<string, DefectiveReworkEntry> {
  const map = new Map<string, DefectiveReworkEntry>();
  orders.forEach(o => {
    o.milestones.forEach(m => {
      const defective = (m.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
      map.set(`${o.id}|${m.templateId}`, { defective, rework: 0, reworkByVariant: {} });
    });
  });

  const reworkReports = (prodRecords || []).filter(r => r.type === 'REWORK_REPORT');
  if (reworkReports.length === 0) return map;

  const ordersById = new Map(orders.map(o => [o.id, o]));
  const recordById = new Map(prodRecords!.map(r => [r.id, r]));
  const reworkRecords = (prodRecords || []).filter(r => r.type === 'REWORK');
  const reworkByOrderSource = new Map<string, ReportableProdRecord[]>();
  const reworkByProductSource = new Map<string, ReportableProdRecord[]>();
  for (const r of reworkRecords) {
    const src = r.sourceNodeId ?? r.nodeId ?? '';
    if (r.orderId) {
      const k = `${r.orderId}|${src}`;
      const arr = reworkByOrderSource.get(k) ?? [];
      arr.push(r);
      reworkByOrderSource.set(k, arr);
    } else if (r.productId) {
      const k = `${r.productId}|${src}`;
      const arr = reworkByProductSource.get(k) ?? [];
      arr.push(r);
      reworkByProductSource.set(k, arr);
    }
  }

  const orderIdToParent = new Map<string, string>();
  orders.forEach(o => {
    if (o.parentOrderId) orderIdToParent.set(o.id, o.parentOrderId);
  });

  const getParentOrderId = (orderId: string) => orderIdToParent.get(orderId) ?? orderId;
  const orderProduct = (oid: string) => ordersById.get(oid)?.productId;
  const getOriginalSourceNodeId = (r: ReportableProdRecord): string | undefined => {
    const pid = orderProduct(r.orderId ?? '');
    const nodeId = r.nodeId ?? '';
    const parentOid = orderIdToParent.get(r.orderId ?? '');
    const candidates = [
      ...(reworkByOrderSource.get(`${r.orderId}|${nodeId}`) ?? []),
      ...(parentOid ? (reworkByOrderSource.get(`${parentOid}|${nodeId}`) ?? []) : []),
      ...(pid ? (reworkByProductSource.get(`${pid}|${nodeId}`) ?? []) : []),
    ];
    const pathIncludes = (x: ReportableProdRecord, node: string) => {
      const path = x.reworkNodeIds?.length ? x.reworkNodeIds : x.nodeId ? [x.nodeId] : [];
      return path.includes(node);
    };
    const rework = candidates.find(x => pathIncludes(x, nodeId));
    return rework?.sourceNodeId ?? (r.sourceNodeId ?? r.nodeId ?? undefined);
  };
  const getReworkNodeIdsForOrder = (orderId: string, sourceNodeId: string): string[] => {
    const o = ordersById.get(orderId);
    const byOrder = reworkByOrderSource.get(`${orderId}|${sourceNodeId}`);
    let r = byOrder?.[0];
    if (!r && o) {
      r = reworkByProductSource.get(`${o.productId}|${sourceNodeId}`)?.[0];
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
    const rwCandidate = r.sourceReworkId ? recordById.get(r.sourceReworkId) : undefined;
    const rw = rwCandidate?.type === 'REWORK' ? rwCandidate : undefined;
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
    const reworkByVariant: Record<string, number> = {};
    Object.entries(entry.byVariant).forEach(([vid, byNode]) => {
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

export function orderMaxReportableAtTemplateProductAware(
  order: ReportableOrder,
  templateId: string,
  args: {
    processSequenceMode: ProcessSequenceMode;
    productId: string;
    pmp: ReportablePmp[];
    blockOrders: ReportableOrder[];
    defective: number;
    rework: number;
    pmpByKey?: Map<string, number>;
  },
): number {
  const { processSequenceMode, productId, pmp, blockOrders, defective, rework, pmpByKey } = args;
  const idx = order.milestones.findIndex(m => m.templateId === templateId);
  if (idx < 0) return 0;
  const orderQty = order.items.reduce((s, i) => s + i.quantity, 0);
  let baseQty = orderQty;
  if (processSequenceMode === 'sequential' && idx > 0) {
    const prevMs = order.milestones[idx - 1];
    const prevTid = prevMs.templateId;
    const blockQty = sumBlockOrderQty(blockOrders);
    const pmpPrevTotal = pmpCompletedAtTemplate(pmp, productId, prevTid, pmpByKey);
    const fromMilestone = prevMs.completedQuantity ?? 0;
    if (fromMilestone > 0) {
      baseQty = Math.min(orderQty, fromMilestone);
    } else if (blockQty > 0) {
      baseQty = (orderQty * pmpPrevTotal) / blockQty;
    } else {
      baseQty = 0;
    }
  }
  return Math.max(0, baseQty - defective + rework);
}

export function productGroupMaxReportableSum(
  blockOrders: ReportableOrder[],
  templateId: string,
  productId: string,
  pmp: ReportablePmp[],
  processSequenceMode: ProcessSequenceMode,
  getDefectiveRework: (orderId: string, tid: string) => DefectiveReworkEntry,
  pmpByKey?: Map<string, number>,
  orderForest?: Pick<ReportableOrder, 'id' | 'parentOrderId'>[],
): number {
  const qtyByBucket = new Map<string, number>();
  if (orderForest?.length) {
    for (const o of blockOrders) {
      const q = o.items.reduce((s, i) => s + i.quantity, 0);
      const b = reworkMergeBucketOrderId(o.id, orderForest);
      qtyByBucket.set(b, (qtyByBucket.get(b) ?? 0) + q);
    }
  }
  let sum = blockOrders.reduce((acc, o) => {
    const { defective } = getDefectiveRework(o.id, templateId);
    let rework = getDefectiveRework(o.id, templateId).rework;
    if (orderForest?.length) {
      const b = reworkMergeBucketOrderId(o.id, orderForest);
      const bucketRework = getDefectiveRework(b, templateId).rework;
      const tot = qtyByBucket.get(b) ?? 0;
      const qo = o.items.reduce((s, i) => s + i.quantity, 0);
      rework = tot > 0 ? (bucketRework * qo) / tot : 0;
    }
    return (
      acc +
      orderMaxReportableAtTemplateProductAware(o, templateId, {
        processSequenceMode,
        productId,
        pmp,
        blockOrders,
        defective,
        rework,
        pmpByKey,
      })
    );
  }, 0);
  const pmpDef = pmpDefectiveTotalAtTemplate(pmp, productId, templateId);
  const mileDef = blockOrders.reduce((s, o) => s + getDefectiveRework(o.id, templateId).defective, 0);
  return Math.max(0, Math.round(sum - Math.max(0, pmpDef - mileDef)));
}

function orderModeMaxReportable(
  order: ReportableOrder,
  templateId: string,
  processSequenceMode: ProcessSequenceMode,
  productionLinkMode: ProductionLinkMode,
  productTotalAcrossOrders: number,
  pmpByProductTpl: Map<string, number>,
  getDefectiveRework: (orderId: string, tid: string) => DefectiveReworkEntry,
): number {
  const msIdx = order.milestones.findIndex(m => m.templateId === templateId);
  if (msIdx < 0) return 0;
  const orderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  const shareRatio =
    productionLinkMode === 'product' && productTotalAcrossOrders > 0
      ? orderTotalQty / productTotalAcrossOrders
      : 0;
  const pmpShareAt = (tid: string) => {
    if (productionLinkMode !== 'product' || shareRatio <= 0) return 0;
    const total = pmpByProductTpl.get(`${order.productId}|${tid}`) ?? 0;
    return total * shareRatio;
  };
  let baseQty = orderTotalQty;
  if (processSequenceMode === 'sequential' && msIdx > 0) {
    const prev = order.milestones[msIdx - 1];
    baseQty = (prev?.completedQuantity ?? 0) + pmpShareAt(prev.templateId);
  }
  const { defective, rework } = getDefectiveRework(order.id, templateId);
  return Math.max(0, Math.round(baseQty - defective + rework));
}

function orderModeReported(
  order: ReportableOrder,
  templateId: string,
  productionLinkMode: ProductionLinkMode,
  productTotalAcrossOrders: number,
  pmpByProductTpl: Map<string, number>,
): number {
  const msIdx = order.milestones.findIndex(m => m.templateId === templateId);
  if (msIdx < 0) return 0;
  const ms = order.milestones[msIdx];
  const orderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  const shareRatio =
    productionLinkMode === 'product' && productTotalAcrossOrders > 0
      ? orderTotalQty / productTotalAcrossOrders
      : 0;
  const pmpShareAt = (tid: string) => {
    if (productionLinkMode !== 'product' || shareRatio <= 0) return 0;
    const total = pmpByProductTpl.get(`${order.productId}|${tid}`) ?? 0;
    return total * shareRatio;
  };
  return Math.round((ms.completedQuantity ?? 0) + pmpShareAt(templateId));
}

function productGroupReportedSum(
  blockOrders: ReportableOrder[],
  templateId: string,
  productId: string,
  pmp: ReportablePmp[],
  mergePmpAndMilestone: boolean,
): number {
  if (mergePmpAndMilestone) {
    let completed = 0;
    for (const row of pmp) {
      if (row.productId === productId && row.milestoneTemplateId === templateId) {
        completed += row.completedQuantity ?? 0;
      }
    }
    for (const o of blockOrders) {
      const m = o.milestones.find(x => x.templateId === templateId);
      if (m) completed += m.completedQuantity ?? 0;
    }
    return Math.round(completed);
  }
  return Math.round(
    blockOrders.reduce((s, o) => {
      const m = o.milestones.find(x => x.templateId === templateId);
      return s + (m?.completedQuantity ?? 0);
    }, 0),
  );
}

export interface TemplateReportSnapshot {
  maxReportableQty: number;
  reportedQty: number;
  remainingQty: number;
  progress: number;
  /** 当前生产任务数（不随统计周期变化） */
  taskCount: number;
}

function buildTemplateSnapshot(
  maxReportableQty: number,
  reportedQty: number,
  taskCount: number,
): TemplateReportSnapshot {
  const max = Math.max(0, Math.round(maxReportableQty));
  const reported = Math.max(0, Math.round(reportedQty));
  const remainingQty = Math.max(0, max - reported);
  const progress = max > 0 ? Math.min(100, Math.round((reported / max) * 100)) : 0;
  return { maxReportableQty: max, reportedQty: reported, remainingQty, progress, taskCount };
}

/** 各工序当前生产任务数（与工单中心列表块口径一致，非周期内报工去重） */
export function countActiveTasksAtTemplate(
  templateId: string,
  orders: ReportableOrder[],
  pmp: ReportablePmp[],
  useProductGroup: boolean,
): number {
  if (useProductGroup) {
    const products = new Set<string>();
    for (const o of orders) {
      if (o.milestones.some(m => m.templateId === templateId)) products.add(o.productId);
    }
    for (const row of pmp) {
      if (row.milestoneTemplateId === templateId) products.add(row.productId);
    }
    return products.size;
  }
  return orders.filter(o => o.milestones.some(m => m.templateId === templateId)).length;
}

/** 按工序汇总可报最多、已报数、剩余可报与进度（与工单中心一致） */
export function computeTemplateReportStatsByTemplate(opts: {
  templateIds: string[];
  orders: ReportableOrder[];
  pmp: ReportablePmp[];
  prodRecords: ReportableProdRecord[];
  processSequenceMode: ProcessSequenceMode;
  productionLinkMode: ProductionLinkMode;
}): Map<string, TemplateReportSnapshot> {
  const {
    templateIds,
    orders,
    pmp,
    prodRecords,
    processSequenceMode,
    productionLinkMode,
  } = opts;
  const drMap = buildDefectiveReworkByOrderMilestone(orders, prodRecords);
  const getDefectiveRework = (orderId: string, tid: string) =>
    drMap.get(`${orderId}|${tid}`) ?? { defective: 0, rework: 0, reworkByVariant: {} };

  const pmpByProductTpl = new Map<string, number>();
  for (const row of pmp) {
    const k = `${row.productId}|${row.milestoneTemplateId}`;
    pmpByProductTpl.set(k, (pmpByProductTpl.get(k) ?? 0) + (row.completedQuantity ?? 0));
  }

  const productTotals = new Map<string, number>();
  for (const o of orders) {
    const q = o.items.reduce((s, i) => s + i.quantity, 0);
    productTotals.set(o.productId, (productTotals.get(o.productId) ?? 0) + q);
  }

  const result = new Map<string, TemplateReportSnapshot>();
  const useProductGroup = productionLinkMode === 'product' && pmp.length > 0;

  for (const tid of templateIds) {
    let maxSum = 0;
    let reportedSum = 0;

    if (useProductGroup) {
      const byProduct = new Map<string, ReportableOrder[]>();
      for (const o of orders) {
        const list = byProduct.get(o.productId) ?? [];
        list.push(o);
        byProduct.set(o.productId, list);
      }
      for (const [productId, blockOrders] of byProduct) {
        const hasMs = blockOrders.some(o => o.milestones.some(m => m.templateId === tid));
        if (!hasMs) continue;
        const max = productGroupMaxReportableSum(
          blockOrders,
          tid,
          productId,
          pmp,
          processSequenceMode,
          getDefectiveRework,
          undefined,
          orders,
        );
        const reported = productGroupReportedSum(blockOrders, tid, productId, pmp, true);
        maxSum += max;
        reportedSum += reported;
      }
    } else {
      for (const order of orders) {
        const max = orderModeMaxReportable(
          order,
          tid,
          processSequenceMode,
          productionLinkMode,
          productTotals.get(order.productId) ?? 0,
          pmpByProductTpl,
          getDefectiveRework,
        );
        const reported = orderModeReported(
          order,
          tid,
          productionLinkMode,
          productTotals.get(order.productId) ?? 0,
          pmpByProductTpl,
        );
        maxSum += max;
        reportedSum += reported;
      }
    }

    result.set(tid, buildTemplateSnapshot(maxSum, reportedSum, countActiveTasksAtTemplate(tid, orders, pmp, useProductGroup)));
  }

  return result;
}

/** 按工序汇总当前「可报最多」，与工单中心展示口径一致 */
export function sumMaxReportableByTemplate(opts: {
  templateIds: string[];
  orders: ReportableOrder[];
  pmp: ReportablePmp[];
  prodRecords: ReportableProdRecord[];
  processSequenceMode: ProcessSequenceMode;
  productionLinkMode: ProductionLinkMode;
}): Map<string, number> {
  const stats = computeTemplateReportStatsByTemplate(opts);
  const totals = new Map<string, number>();
  for (const [tid, snap] of stats) {
    totals.set(tid, snap.maxReportableQty);
  }
  return totals;
}
