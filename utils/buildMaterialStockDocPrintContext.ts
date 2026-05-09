import type {
  AppDictionaries,
  MaterialFormSettings,
  PlanListPrintSettings,
  PrintListRow,
  PrintRenderContext,
  PrintTemplate,
  ProductionOpRecord,
  ProductionOrder,
  Product,
  Warehouse,
} from '../types';
import { BATCH_NO_UNTAGGED } from '../shared/types';
import { buildMatrixJsonAndTotalQtyFromVariantLine } from './buildSalesBillPrintContext';
import { COLOR_SIZE_MATRIX_JSON_KEY } from './colorSizeMatrixPrint';
import { formatLocalDateTimeZh, parseProductionOpTimestampMs } from './localDateTime';
import {
  isOutsourceMaterialPartner,
  materialStockCustomDataCollabKey,
  type MaterialStockCollabDataKey,
} from './productionOpCollab/material';

const EMPTY_DICTIONARIES: AppDictionaries = { colors: [], sizes: [], units: [] };

function buildMaterialStockMatrixPrintRows(
  lines: MaterialStockDocForPrint['lines'],
  docRecords: ProductionOpRecord[],
  products: Product[],
  dictionaries: AppDictionaries | undefined,
  getUnitName: (productId: string) => string,
): PrintListRow[] {
  const dict = dictionaries ?? EMPTY_DICTIONARIES;
  const productMap = new Map(products.map(p => [p.id, p] as const));
  return lines.map((l, i) => {
    const batchNorm = (l.batchNo ?? '').trim();
    const recs = docRecords.filter(r => {
      if (r.productId !== l.productId) return false;
      const rB = (r.batchNo ?? '').trim();
      if (batchNorm) return rB === batchNorm;
      return !rB;
    });
    const variantQuantities: Record<string, number> = {};
    for (const r of recs) {
      const vid = r.variantId?.trim();
      if (!vid) continue;
      variantQuantities[vid] = (variantQuantities[vid] ?? 0) + (Number(r.quantity) || 0);
    }
    const hasVar = Object.keys(variantQuantities).length > 0;
    const p = products.find(x => x.id === l.productId);
    const matrixSlice = p
      ? hasVar
        ? buildMatrixJsonAndTotalQtyFromVariantLine({
            productId: l.productId,
            productMap,
            dictionaries: dict,
            variantQuantities,
          })
        : buildMatrixJsonAndTotalQtyFromVariantLine({
            productId: l.productId,
            productMap,
            dictionaries: dict,
            quantity: l.quantity,
          })
      : null;
    const qty = matrixSlice?.totalQty ?? l.quantity;
    return {
      index: i + 1,
      productName: p?.name ?? l.productId,
      sku: p?.sku ?? '',
      quantity: qty,
      unit: getUnitName(l.productId),
      batchNo: l.batchNo?.trim() ? l.batchNo : BATCH_NO_UNTAGGED,
      ...(matrixSlice ? { [COLOR_SIZE_MATRIX_JSON_KEY]: matrixSlice.colorSizeMatrixJson } : {}),
    };
  });
}

/** 与领料/退料详情、流水打印一致的最小单据形状 */
export interface MaterialStockDocForPrint {
  docNo: string;
  type: 'STOCK_OUT' | 'STOCK_RETURN';
  orderId: string;
  sourceProductId?: string | null;
  timestamp?: string;
  warehouseId: string;
  lines: { productId: string; quantity: number; batchNo?: string }[];
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
  /** 当前租户名称；供 `{{租户.name}}` 等占位符 */
  tenantName?: string | null;
}

export function buildMaterialStockDocPrintContext(
  _template: PrintTemplate,
  args: BuildMaterialStockDocPrintContextArgs,
): PrintRenderContext {
  const { detail: stockDocDetail, records, orders, products, warehouses, dictionaries, customSnapshot, tenantName } =
    args;
  const tenantSlice: Pick<PrintRenderContext, 'tenantName'> | Record<string, never> = tenantName?.trim()
    ? { tenantName: tenantName.trim() }
    : {};
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
  const flatRows = stockDocDetail.lines.map((l, i) => {
    const p = products.find(x => x.id === l.productId);
    return {
      index: i + 1,
      productName: p?.name ?? l.productId,
      sku: p?.sku ?? '',
      quantity: l.quantity,
      unit: getUnitName(l.productId),
      batchNo: l.batchNo?.trim() ? l.batchNo : BATCH_NO_UNTAGGED,
    };
  });
  const matrixRows = buildMaterialStockMatrixPrintRows(
    stockDocDetail.lines,
    docRecordsForPrint,
    products,
    dictionaries,
    getUnitName,
  );
  const productCtx = sourceProd ?? (order ? products.find(p => p.id === order.productId) : undefined) ?? undefined;
  if (isReturn) {
    if (outsource) {
      return {
        ...tenantSlice,
        order: order ?? undefined,
        product: productCtx,
        outsourceMaterialReturnPrint: head,
        printListRows: matrixRows,
      };
    }
    return {
      ...tenantSlice,
      order: order ?? undefined,
      product: productCtx,
      materialReturnPrint: head,
      printListRows: matrixRows,
    };
  }
  if (outsource) {
    return {
      ...tenantSlice,
      order: order ?? undefined,
      product: productCtx,
      outsourceMaterialIssuePrint: head,
      printListRows: matrixRows,
    };
  }
  return {
    ...tenantSlice,
    order: order ?? undefined,
    product: productCtx,
    materialIssuePrint: head,
    printListRows: flatRows,
  };
}
