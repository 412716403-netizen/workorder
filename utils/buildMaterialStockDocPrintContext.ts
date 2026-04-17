import type {
  AppDictionaries,
  MaterialFormSettings,
  PlanListPrintSettings,
  PrintRenderContext,
  PrintTemplate,
  ProductionOpRecord,
  ProductionOrder,
  Product,
  Warehouse,
} from '../types';
import { formatLocalDateTimeZh, parseProductionOpTimestampMs } from './localDateTime';
import {
  isOutsourceMaterialPartner,
  materialStockCustomDataCollabKey,
  type MaterialStockCollabDataKey,
} from './productionOpCollab/material';

/** 与领料/退料详情、流水打印一致的最小单据形状 */
export interface MaterialStockDocForPrint {
  docNo: string;
  type: 'STOCK_OUT' | 'STOCK_RETURN';
  orderId: string;
  sourceProductId?: string | null;
  timestamp?: string;
  warehouseId: string;
  lines: { productId: string; quantity: number }[];
  reason?: string;
  operator?: string;
  partner?: string;
}

export function readMaterialStockCustomSnapshot(
  records: ProductionOpRecord[],
  docNo: string,
  type: 'STOCK_OUT' | 'STOCK_RETURN',
  partner?: string | null,
): Record<string, unknown> {
  const docRecords = records.filter(r => r.docNo === docNo && r.type === type);
  const first = docRecords[0] as ProductionOpRecord & { collabData?: Record<string, unknown> };
  const primaryKey = materialStockCustomDataCollabKey(type, partner);
  const parseObj = (raw: unknown): Record<string, unknown> =>
    typeof raw === 'object' && raw != null && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  let obj = parseObj(first?.collabData?.[primaryKey]);
  if (isOutsourceMaterialPartner(partner) && Object.keys(obj).length === 0) {
    const legacyKey: MaterialStockCollabDataKey =
      type === 'STOCK_RETURN' ? 'materialReturnCustomData' : 'materialIssueCustomData';
    obj = parseObj(first?.collabData?.[legacyKey]);
  }
  return obj;
}

export function materialStockDocPrintSlot(
  materialFormSettings: MaterialFormSettings,
  detail: Pick<MaterialStockDocForPrint, 'type' | 'partner'>,
): PlanListPrintSettings | undefined {
  const m = materialFormSettings.materialCenterPrint;
  const isReturn = detail.type === 'STOCK_RETURN';
  if (isOutsourceMaterialPartner(detail.partner)) {
    return isReturn ? m?.outsourceStockReturnFlowDetail : m?.outsourceStockOutFlowDetail;
  }
  return isReturn ? m?.stockReturnFlowDetail : m?.stockOutFlowDetail;
}

export interface BuildMaterialStockDocPrintContextArgs {
  detail: MaterialStockDocForPrint;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  warehouses: Warehouse[];
  dictionaries?: AppDictionaries;
  /** 与详情展示一致的自定义快照（已含外协 legacy 回退） */
  customSnapshot: Record<string, unknown>;
}

export function buildMaterialStockDocPrintContext(
  _template: PrintTemplate,
  args: BuildMaterialStockDocPrintContextArgs,
): PrintRenderContext {
  const { detail: stockDocDetail, records, orders, products, warehouses, dictionaries, customSnapshot } = args;
  const isReturn = stockDocDetail.type === 'STOCK_RETURN';
  const outsource = isOutsourceMaterialPartner(stockDocDetail.partner);
  const order = orders.find(o => o.id === stockDocDetail.orderId);
  const sourceProd = stockDocDetail.sourceProductId
    ? products.find(p => p.id === stockDocDetail.sourceProductId)
    : null;
  const docRecordsForPrint = records.filter(r => r.docNo === stockDocDetail.docNo && r.type === stockDocDetail.type);
  const firstRec = docRecordsForPrint[0];
  const totalQtyPrint = stockDocDetail.lines.reduce((s, l) => s + l.quantity, 0);
  const tsMs = parseProductionOpTimestampMs(stockDocDetail.timestamp);
  const tsDisplay =
    tsMs > 0 ? formatLocalDateTimeZh(new Date(tsMs)) : (stockDocDetail.timestamp?.trim() || '—');
  const productNamePrint =
    sourceProd?.name ??
    (order ? (products.find(p => p.id === order.productId)?.name ?? order.productName) : undefined) ??
    '—';
  const getUnitName = (productId: string) => {
    const p = products.find(x => x.id === productId);
    return (p?.unitId && (dictionaries?.units ?? []).find(u => u.id === p.unitId)?.name) || '件';
  };
  const wh = warehouses.find(w => w.id === stockDocDetail.warehouseId);
  const head = {
    docNo: stockDocDetail.docNo,
    warehouseName: wh?.name ? `${wh.name}${wh.code ? ` (${wh.code})` : ''}` : '',
    operator: (firstRec as ProductionOpRecord | undefined)?.operator ?? stockDocDetail.operator ?? '',
    timestamp: tsDisplay,
    partner: stockDocDetail.partner ?? '',
    reason: stockDocDetail.reason ?? '',
    orderNumber: order?.orderNumber ?? '—',
    productName: productNamePrint,
    totalQty: totalQtyPrint,
    custom: customSnapshot,
  };
  const rows = stockDocDetail.lines.map((l, i) => {
    const p = products.find(x => x.id === l.productId);
    return {
      index: i + 1,
      productName: p?.name ?? l.productId,
      sku: p?.sku ?? '',
      quantity: l.quantity,
      unit: getUnitName(l.productId),
    };
  });
  const productCtx = sourceProd ?? (order ? products.find(p => p.id === order.productId) : undefined) ?? undefined;
  if (isReturn) {
    if (outsource) {
      return {
        order: order ?? undefined,
        product: productCtx,
        outsourceMaterialReturnPrint: head,
        printListRows: rows,
      };
    }
    return {
      order: order ?? undefined,
      product: productCtx,
      materialReturnPrint: head,
      printListRows: rows,
    };
  }
  if (outsource) {
    return {
      order: order ?? undefined,
      product: productCtx,
      outsourceMaterialIssuePrint: head,
      printListRows: rows,
    };
  }
  return {
    order: order ?? undefined,
    product: productCtx,
    materialIssuePrint: head,
    printListRows: rows,
  };
}
