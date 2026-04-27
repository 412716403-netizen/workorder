import type {
  AppDictionaries,
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
import { buildMatrixJsonAndTotalQtyFromVariantLine } from './buildSalesBillPrintContext';
import { COLOR_SIZE_MATRIX_JSON_KEY } from './colorSizeMatrixPrint';
import { groupProductionOpBatchByVariant } from './groupProductionOpBatchByVariant';
import { formatTimestamp } from './formatTime';
import { readReworkReportCustomSnapshot } from './productionOpCollab/rework';

const EMPTY_DICTIONARIES: AppDictionaries = { colors: [], sizes: [], units: [] };

export function buildReworkReportFlowPrintContext(
  _template: PrintTemplate,
  opts: {
    productionLinkMode: 'order' | 'product';
    detailBatch: ProductionOpRecord[];
    records: ProductionOpRecord[];
    orders: ProductionOrder[];
    products: Product[];
    globalNodes: GlobalNodeTemplate[];
    dictionaries?: AppDictionaries;
    workers?: Worker[];
    equipment?: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  },
): PrintRenderContext {
  const {
    productionLinkMode,
    detailBatch,
    records,
    orders,
    products,
    globalNodes,
    dictionaries,
    workers = [],
    equipment = [],
  } = opts;
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
    ...new Set(
      detailBatch
        .map(x => (x.nodeId ? globalNodes.find(n => n.id === x.nodeId)?.name ?? '' : '').trim())
        .filter(Boolean),
    ),
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

  let printListRows: PrintListRow[];
  if (product) {
    const dict = dictionaries ?? EMPTY_DICTIONARIES;
    const productMap = new Map(products.map(p => [p.id, p] as const));
    const variantQuantities: Record<string, number> = {};
    for (const r of detailBatch) {
      const vid = r.variantId?.trim();
      if (!vid) continue;
      variantQuantities[vid] = (variantQuantities[vid] ?? 0) + (Number(r.quantity) || 0);
    }
    const qtySum = detailBatch.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
    const hasVariantQty = Object.keys(variantQuantities).length > 0;
    const matrixSlice = hasVariantQty
      ? buildMatrixJsonAndTotalQtyFromVariantLine({
          productId: first.productId,
          productMap,
          dictionaries: dict,
          variantQuantities,
        })
      : buildMatrixJsonAndTotalQtyFromVariantLine({
          productId: first.productId,
          productMap,
          dictionaries: dict,
          quantity: qtySum,
        });
    const printQty = matrixSlice?.totalQty ?? qtySum;
    printListRows = [
      {
        index: 1,
        variantLabel: hasVariantQty ? '' : '—',
        quantity: printQty,
        nodeName: nodeNamesLabel,
        sku: product.sku ?? '',
        productName: product.name ?? '—',
        ...(matrixSlice ? { [COLOR_SIZE_MATRIX_JSON_KEY]: matrixSlice.colorSizeMatrixJson } : {}),
      },
    ];
  } else {
    const displayVariantRows = groupProductionOpBatchByVariant(detailBatch, undefined);
    printListRows = displayVariantRows.map((g, i) => ({
      index: i + 1,
      variantLabel: g.label,
      quantity: g.quantity,
      nodeName: nodeNamesLabel,
    }));
  }

  return {
    order: productionLinkMode === 'order' ? order : undefined,
    product: product ?? undefined,
    reworkReportPrint,
    printListRows,
  };
}
