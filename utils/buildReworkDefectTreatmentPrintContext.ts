import type {
  GlobalNodeTemplate,
  PrintListRow,
  PrintRenderContext,
  PrintTemplate,
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ReworkFlowPrintContext,
} from '../types';
import { groupProductionOpBatchByVariant } from './groupProductionOpBatchByVariant';
import { formatTimestamp } from './formatTime';
import { readDefectTreatmentCustomSnapshot } from './productionOpCollab/rework';

export function buildDefectTreatmentPrintContext(
  _template: PrintTemplate,
  opts: {
    productionLinkMode: 'order' | 'product';
    detailBatch: ProductionOpRecord[];
    records: ProductionOpRecord[];
    orders: ProductionOrder[];
    products: Product[];
    globalNodes: GlobalNodeTemplate[];
  },
): PrintRenderContext {
  const { productionLinkMode, detailBatch, records, orders, products, globalNodes } = opts;
  const first = detailBatch[0];
  if (!first) {
    return { defectTreatmentPrint: { custom: {} } };
  }
  const order = first.orderId ? orders.find(o => o.id === first.orderId) : undefined;
  const product = products.find(p => p.id === first.productId);
  const sourceNodeId = first.type === 'REWORK' ? (first.sourceNodeId ?? first.nodeId) : first.nodeId;
  const sourceNodeName = sourceNodeId ? globalNodes.find(n => n.id === sourceNodeId)?.name ?? sourceNodeId : '—';
  const totalQty = detailBatch.reduce((s, x) => s + (x.quantity ?? 0), 0);
  const opsInBatch = [...new Set(detailBatch.map(x => (x.operator ?? '').trim()).filter(Boolean))];
  const operatorsLabel =
    opsInBatch.length === 0 ? '—' : opsInBatch.length === 1 ? opsInBatch[0]! : `${opsInBatch[0]} 等${opsInBatch.length}人`;
  const latestBatchTimestamp = detailBatch.reduce<{ t: number; ts?: string }>((best, x) => {
    const t = new Date(x.timestamp || 0).getTime();
    if (isNaN(t)) return best;
    return t >= best.t ? { t, ts: x.timestamp } : best;
  }, { t: -1 }).ts;
  const typeLabel = first.type === 'REWORK' ? '返工' : '报损';
  const targetNodesLabel =
    first.type === 'REWORK' && (first.reworkNodeIds?.length ?? 0) > 0
      ? first.reworkNodeIds!.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、')
      : '';

  const custom = readDefectTreatmentCustomSnapshot(records, first.docNo);
  const defectTreatmentPrint: ReworkFlowPrintContext = {
    docNo: first.docNo ?? '—',
    typeLabel,
    sourceNodeName,
    targetNodesLabel: targetNodesLabel || undefined,
    totalQty,
    timestamp: formatTimestamp(latestBatchTimestamp),
    operators: operatorsLabel,
    reason: first.reason ?? '',
    orderNumber: order?.orderNumber ?? '—',
    productName: product?.name ?? '—',
    custom,
  };

  const displayVariantRows = groupProductionOpBatchByVariant(detailBatch, product);
  const printListRows: PrintListRow[] = displayVariantRows.map((g, i) => ({
    index: i + 1,
    variantLabel: g.label,
    quantity: g.quantity,
  }));

  return {
    order: productionLinkMode === 'order' ? order : undefined,
    product: product ?? undefined,
    defectTreatmentPrint,
    printListRows,
  };
}
