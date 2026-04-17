import type {
  GlobalNodeTemplate,
  PrintListRow,
  PrintRenderContext,
  PrintTemplate,
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ReworkFlowPrintContext,
  Worker,
} from '../types';
import { groupProductionOpBatchByVariant } from './groupProductionOpBatchByVariant';
import { formatTimestamp } from './formatTime';
import { readReworkReportCustomSnapshot } from './productionOpCollab/rework';

export function buildReworkReportFlowPrintContext(
  _template: PrintTemplate,
  opts: {
    productionLinkMode: 'order' | 'product';
    detailBatch: ProductionOpRecord[];
    records: ProductionOpRecord[];
    orders: ProductionOrder[];
    products: Product[];
    globalNodes: GlobalNodeTemplate[];
    workers?: Worker[];
    equipment?: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  },
): PrintRenderContext {
  const { productionLinkMode, detailBatch, records, orders, products, globalNodes, workers = [], equipment = [] } =
    opts;
  const first = detailBatch[0];
  if (!first) {
    return { reworkReportPrint: { custom: {} } };
  }
  const order = first.orderId ? orders.find(o => o.id === first.orderId) : undefined;
  const product = products.find(p => p.id === first.productId);
  const reworkOrigin = (records || []).find(
    x =>
      x.type === 'REWORK' &&
      (x.orderId === first.orderId || (orders.find(o => o.id === first.orderId)?.parentOrderId === x.orderId)) &&
      ((x.reworkNodeIds?.length ? x.reworkNodeIds : x.nodeId ? [x.nodeId] : []).includes(first.nodeId ?? '')),
  );
  const resolvedSourceNodeId = (reworkOrigin?.sourceNodeId != null ? reworkOrigin.sourceNodeId : first.sourceNodeId) ?? undefined;
  const sourceNodeName = resolvedSourceNodeId ? globalNodes.find(n => n.id === resolvedSourceNodeId)?.name ?? resolvedSourceNodeId : '—';
  const totalQty = detailBatch.reduce((s, x) => s + (x.quantity ?? 0), 0);
  const nodeNamesInBatch = [
    ...new Set(detailBatch.map(x => x.nodeId ? (globalNodes.find(n => n.id === x.nodeId)?.name ?? '') : '').filter(Boolean)),
  ] as string[];
  const nodeNamesLabel =
    nodeNamesInBatch.length === 0 ? '—' : nodeNamesInBatch.length === 1 ? nodeNamesInBatch[0]! : nodeNamesInBatch.join('、');
  const opsInBatch = [...new Set(detailBatch.map(x => (x.operator ?? '').trim()).filter(Boolean))];
  const operatorsLabel =
    opsInBatch.length === 0 ? '—' : opsInBatch.length === 1 ? opsInBatch[0]! : `${opsInBatch[0]} 等${opsInBatch.length}人`;
  const latestBatchTimestamp = detailBatch.reduce<{ t: number; ts?: string }>((best, x) => {
    const t = new Date(x.timestamp || 0).getTime();
    if (isNaN(t)) return best;
    return t >= best.t ? { t, ts: x.timestamp } : best;
  }, { t: -1 }).ts;
  const pricesInBatch = detailBatch.map(x => x.unitPrice).filter((p): p is number => p != null && p > 0);
  const unitPriceLabel =
    pricesInBatch.length === 0 ? '' : pricesInBatch.every(p => p === pricesInBatch[0]) ? String(pricesInBatch[0]!) : '';
  const batchTotalAmount = detailBatch.reduce((s, x) => {
    if (x.amount != null && x.amount > 0) return s + x.amount;
    const up = x.unitPrice ?? 0;
    const q = x.quantity ?? 0;
    return up > 0 ? s + q * up : s;
  }, 0);

  const workerName = first.workerId ? workers.find(w => w.id === first.workerId)?.name ?? first.workerId : '';
  const equipmentName = first.equipmentId
    ? equipment.find(e => e.id === first.equipmentId)?.name ?? first.equipmentId
    : '';

  const custom = readReworkReportCustomSnapshot(records, first.docNo, first.productId);
  const reworkReportPrint: ReworkFlowPrintContext = {
    docNo: first.docNo ?? '—',
    nodeNames: nodeNamesLabel,
    sourceNodeName: sourceNodeName === '—' ? undefined : sourceNodeName,
    totalQty,
    timestamp: formatTimestamp(latestBatchTimestamp),
    operators: operatorsLabel,
    workerName: workerName || undefined,
    equipmentName: equipmentName || undefined,
    unitPrice: unitPriceLabel || undefined,
    batchTotalAmount: batchTotalAmount > 0 ? String(batchTotalAmount) : undefined,
    reason: first.reason ?? '',
    orderNumber: order?.orderNumber ?? '—',
    productName: product?.name ?? '—',
    custom,
  };

  const displayVariantRows = groupProductionOpBatchByVariant(detailBatch, product);
  const printListRows: PrintListRow[] = displayVariantRows.map((g, i) => {
    const rec0 = detailBatch.find(r => g.recordIds.includes(r.id));
    const nodeName = rec0?.nodeId ? globalNodes.find(n => n.id === rec0.nodeId)?.name ?? rec0.nodeId : '—';
    return {
      index: i + 1,
      variantLabel: g.label,
      quantity: g.quantity,
      nodeName,
    };
  });

  return {
    order: productionLinkMode === 'order' ? order : undefined,
    product: product ?? undefined,
    reworkReportPrint,
    printListRows,
  };
}
