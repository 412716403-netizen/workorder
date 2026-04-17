import type {
  AppDictionaries,
  PrintListRow,
  PrintRenderContext,
  Product,
  PurchaseBillPrintContext,
  Warehouse,
} from '../types';
import { buildSalesBillPrintListRows, type SalesBillLineInput } from './buildSalesBillPrintContext';

export type PurchaseBillLineInput = {
  id: string;
  productId: string;
  quantity?: number;
  purchasePrice: number;
  variantQuantities?: Record<string, number>;
};

/** 采购单动态列表行：与采购订单/销售单明细列键一致 */
export function buildPurchaseBillPrintListRows(
  lines: PurchaseBillLineInput[],
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

function sumLineAmount(lines: PurchaseBillLineInput[], productMap: Map<string, Product>): number {
  let total = 0;
  for (const line of lines) {
    const price = Number(line.purchasePrice) || 0;
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

function sumLineQty(lines: PurchaseBillLineInput[], productMap: Map<string, Product>): number {
  let total = 0;
  for (const line of lines) {
    const prod = productMap.get(line.productId);
    const hasVar = prod?.variants?.length && line.variantQuantities && Object.keys(line.variantQuantities).length > 0;
    if (hasVar) {
      for (const q of Object.values(line.variantQuantities ?? {})) {
        total += Number(q) || 0;
      }
    } else {
      total += Number(line.quantity) || 0;
    }
  }
  return total;
}

/**
 * 组装采购单（入库）打印上下文：表头 `purchaseBillPrint` + 明细 `printListRows`。
 */
export function buildPurchaseBillPrintRenderContext(params: {
  docNumber: string;
  partner: string;
  operator?: string;
  warehouseName: string;
  customData?: Record<string, unknown>;
  lines: PurchaseBillLineInput[];
  productMap: Map<string, Product>;
  dictionaries: AppDictionaries;
}): PrintRenderContext {
  const { docNumber, partner, operator, warehouseName, customData, lines, productMap, dictionaries } = params;
  const printListRows = buildPurchaseBillPrintListRows(lines, productMap, dictionaries);
  const firstProductId = lines.find(l => l.productId)?.productId;
  const product = firstProductId ? productMap.get(firstProductId) : undefined;
  const purchaseBillPrint: PurchaseBillPrintContext = {
    docNumber,
    partner,
    operator: operator ?? '',
    warehouseName: warehouseName || '',
    docTotalQty: sumLineQty(lines, productMap),
    docTotalAmount: sumLineAmount(lines, productMap),
    custom: customData && Object.keys(customData).length > 0 ? { ...customData } : undefined,
  };
  return {
    purchaseBillPrint,
    printListRows,
    product,
  };
}

/** 从同一采购单下的 PSI 行记录聚合为打印行输入 */
export function buildPurchaseBillLinesFromPsiRecords(docItems: any[]): PurchaseBillLineInput[] {
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
      purchasePrice: first.purchasePrice ?? 0,
      variantQuantities: hasVar ? vq : undefined,
    };
  });
}

export function buildPurchaseBillPrintContextFromPsiDoc(params: {
  docNumber: string;
  docItems: any[];
  productMap: Map<string, Product>;
  warehouseMap: Map<string, Warehouse>;
  dictionaries: AppDictionaries;
}): PrintRenderContext {
  const { docNumber, docItems, productMap, warehouseMap, dictionaries } = params;
  const main = docItems[0] ?? {};
  const wid = main.warehouseId as string | undefined;
  const warehouseName = wid ? warehouseMap.get(wid)?.name ?? wid : '';
  const lines = buildPurchaseBillLinesFromPsiRecords(docItems);
  return buildPurchaseBillPrintRenderContext({
    docNumber,
    partner: String(main.partner ?? ''),
    operator: String(main.operator ?? ''),
    warehouseName,
    customData: main.customData,
    lines,
    productMap,
    dictionaries,
  });
}
