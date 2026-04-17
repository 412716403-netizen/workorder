import type {
  AppDictionaries,
  GlobalNodeTemplate,
  MaterialFlowPrintContext,
  PrintListRow,
  PrintRenderContext,
  ProductionOpRecord,
  ProductionOrder,
  Product,
} from '../types';
import { formatLocalDateTimeZh, parseProductionOpTimestampMs } from './localDateTime';
import { OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY, OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY } from './productionOpCollab/outsource';

function variantLabelForRecord(r: ProductionOpRecord, products: Product[], dictionaries?: AppDictionaries): string {
  if (!r.variantId) return '—';
  const p = products.find(x => x.id === r.productId);
  const v = p?.variants?.find(x => x.id === r.variantId);
  if (!v) return r.variantId;
  const color = dictionaries?.colors?.find(c => c.id === v.colorId)?.name ?? v.colorId;
  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId)?.name ?? v.sizeId;
  return `${color} / ${size}`;
}

/**
 * 外协流水详情弹窗：由同一 docNo 的 OUTSOURCE 记录构建打印上下文。
 */
export function buildOutsourceFlowPrintContext(opts: {
  docRecords: ProductionOpRecord[];
  isReceiveDoc: boolean;
  orders: ProductionOrder[];
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
}): PrintRenderContext {
  const { docRecords, isReceiveDoc, orders, products, globalNodes, dictionaries } = opts;
  const first = docRecords[0];
  const docNo = first.docNo ?? '—';
  const partner = first.partner ?? '';
  const operator = first.operator ?? '';
  const tsMs = parseProductionOpTimestampMs(first.timestamp);
  const tsDisplay = tsMs > 0 ? formatLocalDateTimeZh(new Date(tsMs)) : first.timestamp?.trim() || '—';
  const reason = docRecords.map(r => r.reason).filter(Boolean)[0] ?? '';
  const totalQty = docRecords.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const dataKey = isReceiveDoc ? OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY : OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY;
  const raw = first.collabData?.[dataKey];
  const custom =
    typeof raw === 'object' && raw != null && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};

  const byGroup = new Map<string, ProductionOpRecord[]>();
  for (const r of docRecords) {
    const k = r.orderId ? `${r.orderId}|${r.nodeId ?? ''}|${r.variantId ?? ''}` : `${r.productId}|${r.nodeId ?? ''}|${r.variantId ?? ''}`;
    const arr = byGroup.get(k) ?? [];
    arr.push(r);
    byGroup.set(k, arr);
  }

  const printListRows: PrintListRow[] = [];
  let idx = 0;
  for (const recs of byGroup.values()) {
    const r0 = recs[0];
    const qty = recs.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    idx += 1;
    const order = r0.orderId ? orders.find(o => o.id === r0.orderId) : undefined;
    const product = products.find(p => p.id === (order?.productId ?? r0.productId));
    const nodeName = r0.nodeId ? globalNodes.find(n => n.id === r0.nodeId)?.name ?? r0.nodeId : '—';
    const unitPrice = isReceiveDoc ? (r0.unitPrice ?? recs.find(x => x.unitPrice != null)?.unitPrice ?? 0) : undefined;
    const amount = isReceiveDoc ? recs.reduce((s, r) => s + (Number(r.amount) || 0), 0) : undefined;
    printListRows.push({
      index: idx,
      orderNumber: order?.orderNumber ?? (r0.orderId ? r0.orderId : '—'),
      productName: product?.name ?? '—',
      nodeName,
      variantLabel: variantLabelForRecord(r0, products, dictionaries),
      quantity: qty,
      unitPrice: unitPrice != null ? unitPrice : undefined,
      amount: amount != null ? amount : undefined,
    });
  }

  const headBase: MaterialFlowPrintContext = {
    docNo,
    partner,
    operator,
    timestamp: tsDisplay,
    reason,
    totalQty,
    custom,
  };

  if (isReceiveDoc) {
    const totalAmount = docRecords.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const order = first.orderId ? orders.find(o => o.id === first.orderId) : undefined;
    const product = products.find(p => p.id === (order?.productId ?? first.productId));
    return {
      order: order ?? undefined,
      product: product ?? undefined,
      outsourceReceivePrint: { ...headBase, totalAmount },
      printListRows,
    };
  }

  const order = first.orderId ? orders.find(o => o.id === first.orderId) : undefined;
  const product = products.find(p => p.id === (order?.productId ?? first.productId));
  return {
    order: order ?? undefined,
    product: product ?? undefined,
    outsourceDispatchPrint: headBase,
    printListRows,
  };
}
