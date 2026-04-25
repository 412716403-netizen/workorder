import type { AppDictionaries, PrintListRow, PrintRenderContext, Product, PurchaseOrderPrintContext, PsiRecord } from '../types';
import { buildSalesBillPrintListRows, type SalesBillLineInput } from './buildSalesBillPrintContext';
import { sumPsiLineQty, sumPsiLineAmount, groupPsiDocLines } from './psiPrintShared';

export type PurchaseOrderLineInput = {
  id: string;
  productId: string;
  quantity?: number;
  purchasePrice: number;
  variantQuantities?: Record<string, number>;
};

/** 采购订单动态列表行：与 `buildSalesBillPrintListRows` 列键一致（`行.lineNo` 等） */
export function buildPurchaseOrderPrintListRows(
  lines: PurchaseOrderLineInput[],
  productMap: Map<string, Product>,
  dictionaries: AppDictionaries,
): PrintListRow[] {
  const asSales: SalesBillLineInput[] = lines.map(l => ({
    id: l.id,
    productId: l.productId,
    quantity: l.quantity,
    salesPrice: Number(l.purchasePrice) || 0,
    variantQuantities: l.variantQuantities,
  }));
  return buildSalesBillPrintListRows(asSales, productMap, dictionaries);
}

/**
 * 组装采购订单打印上下文：表头 `purchaseOrderPrint` + 明细 `printListRows`（列表与登记/详情共用）。
 * `product` 取首行有货号的商品，便于表头 `{{产品.xxx}}`。
 */
export function buildPurchaseOrderPrintRenderContext(params: {
  docNumber: string;
  partner: string;
  operator?: string;
  customData?: Record<string, unknown>;
  lines: PurchaseOrderLineInput[];
  productMap: Map<string, Product>;
  dictionaries: AppDictionaries;
}): PrintRenderContext {
  const { docNumber, partner, operator, customData, lines, productMap, dictionaries } = params;
  const printListRows = buildPurchaseOrderPrintListRows(lines, productMap, dictionaries);
  const firstProductId = lines.find(l => l.productId)?.productId;
  const product = firstProductId ? productMap.get(firstProductId) : undefined;
  const purchaseOrderPrint: PurchaseOrderPrintContext = {
    docNumber,
    partner,
    operator: operator ?? '',
    docTotalQty: sumPsiLineQty(lines, productMap),
    docTotalAmount: sumPsiLineAmount(lines, productMap, l => Number(l.purchasePrice) || 0),
    custom: customData && Object.keys(customData).length > 0 ? { ...customData } : undefined,
  };
  return {
    purchaseOrderPrint,
    printListRows,
    product,
  };
}

/** 从同一采购订单下的 PSI 行记录聚合为打印行输入（与 OrderBillFormPage 行分组一致） */
export function buildPurchaseOrderLinesFromPsiRecords(docItems: PsiRecord[]): PurchaseOrderLineInput[] {
  return groupPsiDocLines<PurchaseOrderLineInput>(docItems, (lgId, first, _recs, hasVar, vq, lineQtyNoVar) => ({
    id: lgId,
    productId: first.productId,
    quantity: hasVar ? undefined : lineQtyNoVar,
    purchasePrice: Number(first.purchasePrice) || 0,
    variantQuantities: hasVar ? vq : undefined,
  }));
}

/** 列表打印：由单号与行记录直接组装 `PrintRenderContext` */
export function buildPurchaseOrderPrintContextFromPsiDoc(params: {
  docNumber: string;
  docItems: PsiRecord[];
  productMap: Map<string, Product>;
  dictionaries: AppDictionaries;
}): PrintRenderContext {
  const { docNumber, docItems, productMap, dictionaries } = params;
  const main = docItems[0] ?? {};
  const lines = buildPurchaseOrderLinesFromPsiRecords(docItems);
  return buildPurchaseOrderPrintRenderContext({
    docNumber,
    partner: String(main.partner ?? ''),
    operator: String(main.operator ?? ''),
    customData: main.customData,
    lines,
    productMap,
    dictionaries,
  });
}
