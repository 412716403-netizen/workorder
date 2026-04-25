import type { AppDictionaries, PrintRenderContext, Product, PsiRecord, SalesOrderPrintContext } from '../types';
import { buildPurchaseOrderPrintListRows, type PurchaseOrderLineInput } from './buildPurchaseOrderPrintContext';
import { sumPsiLineQty, sumPsiLineAmount, groupPsiDocLines } from './psiPrintShared';

export type SalesOrderLineInput = {
  id: string;
  productId: string;
  quantity?: number;
  salesPrice: number;
  variantQuantities?: Record<string, number>;
};

function toPoLines(lines: SalesOrderLineInput[]): PurchaseOrderLineInput[] {
  return lines.map(l => ({
    id: l.id,
    productId: l.productId,
    quantity: l.quantity,
    purchasePrice: Number(l.salesPrice) || 0,
    variantQuantities: l.variantQuantities,
  }));
}

export function buildSalesOrderPrintListRows(
  lines: SalesOrderLineInput[],
  productMap: Map<string, Product>,
  dictionaries: AppDictionaries,
) {
  return buildPurchaseOrderPrintListRows(toPoLines(lines), productMap, dictionaries);
}

/**
 * 组装销售订单打印上下文：表头 `salesOrderPrint` + 明细 `printListRows`（列表与登记/详情共用）。
 */
export function buildSalesOrderPrintRenderContext(params: {
  docNumber: string;
  partner: string;
  operator?: string;
  customData?: Record<string, unknown>;
  lines: SalesOrderLineInput[];
  productMap: Map<string, Product>;
  dictionaries: AppDictionaries;
}): PrintRenderContext {
  const { docNumber, partner, operator, customData, lines, productMap, dictionaries } = params;
  const printListRows = buildSalesOrderPrintListRows(lines, productMap, dictionaries);
  const firstProductId = lines.find(l => l.productId)?.productId;
  const product = firstProductId ? productMap.get(firstProductId) : undefined;
  const salesOrderPrint: SalesOrderPrintContext = {
    docNumber,
    partner,
    operator: operator ?? '',
    docTotalQty: sumPsiLineQty(lines, productMap),
    docTotalAmount: sumPsiLineAmount(lines, productMap, l => Number(l.salesPrice) || 0),
    custom: customData && Object.keys(customData).length > 0 ? { ...customData } : undefined,
  };
  return {
    salesOrderPrint,
    printListRows,
    product,
  };
}

/** 从同一销售订单下的 PSI 行记录聚合为打印行输入 */
export function buildSalesOrderLinesFromPsiRecords(docItems: PsiRecord[]): SalesOrderLineInput[] {
  return groupPsiDocLines<SalesOrderLineInput>(docItems, (lgId, first, _recs, hasVar, vq, lineQtyNoVar) => ({
    id: lgId,
    productId: first.productId,
    quantity: hasVar ? undefined : lineQtyNoVar,
    salesPrice: Number(first.salesPrice) || 0,
    variantQuantities: hasVar ? vq : undefined,
  }));
}

/** 列表打印：由单号与行记录直接组装 `PrintRenderContext` */
export function buildSalesOrderPrintContextFromPsiDoc(params: {
  docNumber: string;
  docItems: PsiRecord[];
  productMap: Map<string, Product>;
  dictionaries: AppDictionaries;
}): PrintRenderContext {
  const { docNumber, docItems, productMap, dictionaries } = params;
  const main = docItems[0] ?? {};
  const lines = buildSalesOrderLinesFromPsiRecords(docItems);
  return buildSalesOrderPrintRenderContext({
    docNumber,
    partner: String(main.partner ?? ''),
    operator: String(main.operator ?? ''),
    customData: main.customData,
    lines,
    productMap,
    dictionaries,
  });
}
