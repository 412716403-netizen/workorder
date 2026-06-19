import type {
  GlobalNodeTemplate,
  ProductionOpRecord,
  ProductionOrder,
  ProductMilestoneProgress,
} from '../types';
import { combinedCompletedAtTemplate } from './productReportAggregates';
import { toLocalDateYmd } from './localDateTime';

export type ProductOutsourcePartnerRow = {
  partner: string;
  nodeId: string;
  nodeName: string;
  dispatched: number;
  received: number;
  pending: number;
};

export type ProductReportSummaryRow = {
  nodeId: string;
  name: string;
  goodQty: number;
  defQty: number;
  scrapQty: number;
};

/** 产品维度外协：与 OutsourcePanel 产品模式 byProduct 切片一致 */
export function aggregateProductOutsourcePartners(
  productId: string,
  prodRecords: ProductionOpRecord[],
  globalNodes: GlobalNodeTemplate[],
): ProductOutsourcePartnerRow[] {
  const nodeNameById = new Map(globalNodes.map(n => [n.id, n.name]));
  const byKey: Record<string, { partner: string; nodeId: string; dispatched: number; received: number }> = {};
  prodRecords
    .filter(r => r.type === 'OUTSOURCE' && !r.sourceReworkId && r.partner && r.productId === productId)
    .forEach(r => {
      const nodeId = r.nodeId ?? '';
      const key = `${r.partner}|${nodeId}`;
      if (!byKey[key]) byKey[key] = { partner: r.partner!, nodeId, dispatched: 0, received: 0 };
      if (r.status === '加工中') byKey[key].dispatched += r.quantity;
      else if (r.status === '已收回') byKey[key].received += r.quantity;
    });
  return Object.values(byKey)
    .map(v => ({
      partner: v.partner,
      nodeId: v.nodeId,
      nodeName: (nodeNameById.get(v.nodeId) ?? v.nodeId) || '—',
      dispatched: v.dispatched,
      received: v.received,
      pending: Math.max(0, v.dispatched - v.received),
    }))
    .filter(v => v.dispatched > 0 || v.received > 0)
    .sort((a, b) => {
      const na = nodeNameById.get(a.nodeId) ?? a.nodeId;
      const nb = nodeNameById.get(b.nodeId) ?? b.nodeId;
      const d = na.localeCompare(nb);
      if (d !== 0) return d;
      return (a.partner || '').localeCompare(b.partner || '');
    });
}

/** 收集产品下需参与汇总的工序模板 id */
function collectTemplateIds(
  productId: string,
  productOrders: ProductionOrder[],
  pmps: ProductMilestoneProgress[],
  milestoneNodeIds: string[],
): string[] {
  const tplIds = new Set<string>();
  pmps.filter(p => p.productId === productId).forEach(p => tplIds.add(p.milestoneTemplateId));
  productOrders.forEach(o => {
    o.milestones.forEach(m => {
      if ((m.completedQuantity ?? 0) > 0 || (m.reports?.length ?? 0) > 0) tplIds.add(m.templateId);
    });
  });
  milestoneNodeIds.forEach(id => tplIds.add(id));
  const order = (id: string) => {
    const i = milestoneNodeIds.indexOf(id);
    return i >= 0 ? i : 9999;
  };
  return Array.from(tplIds).sort((a, b) => {
    const d = order(a) - order(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
}

function defectiveFromPmp(pmps: ProductMilestoneProgress[], productId: string, nodeId: string): number {
  return pmps
    .filter(p => p.productId === productId && p.milestoneTemplateId === nodeId)
    .reduce((s, p) => s + (p.reports ?? []).reduce((a, r) => a + (r.defectiveQuantity ?? 0), 0), 0);
}

function defectiveFromOrders(productOrders: ProductionOrder[], nodeId: string): number {
  return productOrders.reduce(
    (s, o) =>
      s +
      (o.milestones.find(m => m.templateId === nodeId)?.reports ?? []).reduce(
        (a, r) => a + (r.defectiveQuantity ?? 0),
        0,
      ),
    0,
  );
}

function scrapQtyForNode(
  productId: string,
  productOrders: ProductionOrder[],
  prodRecords: ProductionOpRecord[],
  nodeId: string,
): number {
  const orderIds = new Set(productOrders.map(o => o.id));
  return prodRecords
    .filter(
      r =>
        r.type === 'SCRAP' &&
        r.nodeId === nodeId &&
        (r.productId === productId || (r.orderId != null && orderIds.has(r.orderId))),
    )
    .reduce((s, r) => s + r.quantity, 0);
}

/** 各工序报工汇总：良品 PMP+milestone 双路；不良 PMP+milestone.reports；报损 SCRAP */
export function aggregateProductReportSummaryByNode(
  productId: string,
  productOrders: ProductionOrder[],
  pmps: ProductMilestoneProgress[],
  prodRecords: ProductionOpRecord[],
  globalNodes: GlobalNodeTemplate[],
  milestoneNodeIds: string[] = [],
): ProductReportSummaryRow[] {
  const nodeNameById = new Map(globalNodes.map(n => [n.id, n.name]));
  const templateIds = collectTemplateIds(productId, productOrders, pmps, milestoneNodeIds);
  const rows: ProductReportSummaryRow[] = [];
  for (const nodeId of templateIds) {
    const goodQty = combinedCompletedAtTemplate(productOrders, pmps, productId, nodeId);
    const defQty = defectiveFromPmp(pmps, productId, nodeId) + defectiveFromOrders(productOrders, nodeId);
    const scrapQty = scrapQtyForNode(productId, productOrders, prodRecords, nodeId);
    if (goodQty === 0 && defQty === 0 && scrapQty === 0) continue;
    const name =
      nodeNameById.get(nodeId) ??
      productOrders.flatMap(o => o.milestones).find(m => m.templateId === nodeId)?.name ??
      nodeId;
    rows.push({ nodeId, name, goodQty, defQty, scrapQty });
  }
  return rows;
}

/** 按 variantId 汇总旗下工单计划数量 */
export function aggregateProductVariantQuantities(
  productOrders: ProductionOrder[],
): Map<string, number> {
  const byVariant = new Map<string, number>();
  for (const o of productOrders) {
    for (const item of o.items) {
      const vid = item.variantId ?? '';
      byVariant.set(vid, (byVariant.get(vid) ?? 0) + item.quantity);
    }
  }
  return byVariant;
}

/** 从产品工单与 PMP 报工时间推导流水默认日期范围 */
export function reportDateRangeFromProductOrders(
  productOrders: ProductionOrder[],
  pmps: ProductMilestoneProgress[],
  productId: string,
): { dateFrom: string; dateTo: string } {
  const ymds: string[] = [];
  const pushYmd = (ts: string | undefined) => {
    const y = toLocalDateYmd(ts ?? '');
    if (y) ymds.push(y);
  };
  productOrders.forEach(o => {
    o.milestones.forEach(m => (m.reports ?? []).forEach(r => pushYmd(r.timestamp)));
  });
  pmps
    .filter(p => p.productId === productId)
    .forEach(p => (p.reports ?? []).forEach(r => pushYmd(r.timestamp)));
  const today = toLocalDateYmd(new Date().toISOString());
  if (ymds.length === 0) return { dateFrom: today, dateTo: today };
  return {
    dateFrom: ymds.reduce((a, b) => (a < b ? a : b)),
    dateTo: ymds.reduce((a, b) => (a > b ? a : b)),
  };
}
