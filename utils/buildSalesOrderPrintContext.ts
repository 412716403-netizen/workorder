import type { AppDictionaries, PrintRenderContext, Product, SalesOrderPrintContext } from '../types';
import { buildPurchaseOrderPrintListRows, type PurchaseOrderLineInput } from './buildPurchaseOrderPrintContext';

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

function sumLineAmount(lines: SalesOrderLineInput[], productMap: Map<string, Product>): number {
  let total = 0;
  for (const line of lines) {
    const price = Number(line.salesPrice) || 0;
    const prod = productMap.get(line.productId);
    const hasVar = prod?.variants?.length && line.variantQuantities && Object.keys(line.variantQuantities).length > 0;
    if (hasVar) {
      for (const [, q] of Object.entries(line.variantQuantities ?? {})) {
        total += (Number(q) || 0) * price;
      }
    } else {
      total += (Number(line.quantity) || 0) * price;
    }
  }
  return total;
}

function sumLineQty(lines: SalesOrderLineInput[], productMap: Map<string, Product>): number {
  return lines.reduce((acc, line) => {
    const prod = productMap.get(line.productId);
    const hasVar = prod?.variants?.length && line.variantQuantities && Object.keys(line.variantQuantities).length > 0;
    if (hasVar) {
      let sub = 0;
      for (const q of Object.values(line.variantQuantities ?? {})) {
        sub += Number(q) || 0;
      }
      return acc + sub;
    }
    return acc + (Number(line.quantity) || 0);
  }, 0);
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
    docTotalQty: sumLineQty(lines, productMap),
    docTotalAmount: sumLineAmount(lines, productMap),
    custom: customData && Object.keys(customData).length > 0 ? { ...customData } : undefined,
  };
  return {
    salesOrderPrint,
    printListRows,
    product,
  };
}

/** 从同一销售订单下的 PSI 行记录聚合为打印行输入 */
export function buildSalesOrderLinesFromPsiRecords(docItems: any[]): SalesOrderLineInput[] {
  const lineMap: Record<string, any[]> = {};
  docItems.forEach((r: any) => {
    const lg = r.lineGroupId ?? r.id;
    if (!lineMap[lg]) lineMap[lg] = [];
    lineMap[lg].push(r);
  });
  return Object.entries(lineMap).map(([lgId, recs]) => {
    const first = recs[0];
    const hasVar = recs.some((r: any) => r.variantId);
    const vq: Record<string, number> = {};
    if (hasVar) {
      recs.forEach((r: any) => {
        if (r.variantId) vq[r.variantId] = (vq[r.variantId] ?? 0) + (Number(r.quantity) || 0);
      });
    }
    const lineQtyNoVar = recs.reduce((s, r: any) => s + (Number(r.quantity) || 0), 0);
    return {
      id: lgId,
      productId: first.productId,
      quantity: hasVar ? undefined : lineQtyNoVar,
      salesPrice: first.salesPrice ?? 0,
      variantQuantities: hasVar ? vq : undefined,
    };
  });
}

/** 列表打印：由单号与行记录直接组装 `PrintRenderContext` */
export function buildSalesOrderPrintContextFromPsiDoc(params: {
  docNumber: string;
  docItems: any[];
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
