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
import { buildMatrixJsonAndTotalQtyFromVariantLine } from './buildSalesBillPrintContext';
import { formatLocalDateTimeZh, parseProductionOpTimestampMs } from './localDateTime';
import {
  OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY,
  OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY,
  OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY,
} from './productionOpCollab/outsource';
import { COLOR_SIZE_MATRIX_JSON_KEY } from './colorSizeMatrixPrint';

const EMPTY_DICTIONARIES: AppDictionaries = { colors: [], sizes: [], units: [] };

/** 外协/打印/列表共用：按产品 + 规格 id 解析颜色尺码标签 */
export function formatOutsourceVariantLabel(
  productId: string | undefined,
  variantId: string | undefined | null,
  products: Product[],
  dictionaries?: AppDictionaries,
): string {
  if (!variantId) return '—';
  const p = products.find(x => x.id === productId);
  const v = p?.variants?.find(x => x.id === variantId);
  if (!v) return variantId;
  const color = dictionaries?.colors?.find(c => c.id === v.colorId)?.name ?? v.colorId;
  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId)?.name ?? v.sizeId;
  return `${color} / ${size}`;
}

function variantLabelForRecord(r: ProductionOpRecord, products: Product[], dictionaries?: AppDictionaries): string {
  return formatOutsourceVariantLabel(r.productId, r.variantId, products, dictionaries);
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
  const dispatchDeliveryDateRaw =
    typeof first.collabData?.[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY] === 'string'
      ? first.collabData[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY]
      : '';
  const dispatchDeliveryDate = dispatchDeliveryDateRaw.trim();

  const byGroup = new Map<string, ProductionOpRecord[]>();
  for (const r of docRecords) {
    const k = r.orderId ? `${r.orderId}|${r.nodeId ?? ''}` : `${r.productId}|${r.nodeId ?? ''}`;
    const arr = byGroup.get(k) ?? [];
    arr.push(r);
    byGroup.set(k, arr);
  }

  const dict = dictionaries ?? EMPTY_DICTIONARIES;
  const productMap = new Map(products.map(p => [p.id, p] as const));

  const printListRows: PrintListRow[] = [];
  let idx = 0;
  for (const recs of byGroup.values()) {
    const r0 = recs[0];
    const qtySum = recs.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    idx += 1;
    const order = r0.orderId ? orders.find(o => o.id === r0.orderId) : undefined;
    const productId = order?.productId ?? r0.productId;
    const product = products.find(p => p.id === productId);
    const nodeName = r0.nodeId ? globalNodes.find(n => n.id === r0.nodeId)?.name ?? r0.nodeId : '—';
    const unitPrice = isReceiveDoc ? (r0.unitPrice ?? recs.find(x => x.unitPrice != null)?.unitPrice ?? 0) : undefined;
    const amount = isReceiveDoc ? recs.reduce((s, r) => s + (Number(r.amount) || 0), 0) : undefined;

    const variantQuantities: Record<string, number> = {};
    for (const r of recs) {
      const vid = r.variantId?.trim();
      if (!vid) continue;
      variantQuantities[vid] = (variantQuantities[vid] ?? 0) + (Number(r.quantity) || 0);
    }
    const hasVariantQty = Object.keys(variantQuantities).length > 0;
    const matrixSlice =
      product &&
      (hasVariantQty
        ? buildMatrixJsonAndTotalQtyFromVariantLine({
            productId,
            productMap,
            dictionaries: dict,
            variantQuantities,
          })
        : buildMatrixJsonAndTotalQtyFromVariantLine({
            productId,
            productMap,
            dictionaries: dict,
            quantity: qtySum,
          }));
    const qty = matrixSlice?.totalQty ?? qtySum;
    const remarkParts = recs.map(r => (r.reason ?? '').trim()).filter(Boolean);
    const remark = remarkParts.length ? Array.from(new Set(remarkParts)).join('；') : '';

    printListRows.push({
      index: idx,
      orderNumber: order?.orderNumber ?? (r0.orderId ? r0.orderId : '—'),
      productName: product?.name ?? '—',
      sku: product?.sku ?? '',
      nodeName,
      variantLabel: hasVariantQty ? '' : variantLabelForRecord(r0, products, dictionaries),
      quantity: qty,
      remark,
      unitPrice: unitPrice != null ? unitPrice : undefined,
      amount: amount != null ? amount : undefined,
      ...(matrixSlice ? { [COLOR_SIZE_MATRIX_JSON_KEY]: matrixSlice.colorSizeMatrixJson } : {}),
    });
  }

  const headBase: MaterialFlowPrintContext = {
    docNo,
    partner,
    operator,
    timestamp: tsDisplay,
    deliveryDate: !isReceiveDoc && dispatchDeliveryDate ? dispatchDeliveryDate : undefined,
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
