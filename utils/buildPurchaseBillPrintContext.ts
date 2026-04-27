import type {
  AppDictionaries,
  PrintListRow,
  PrintRenderContext,
  Product,
  PurchaseBillPrintContext,
  PsiRecord,
  Warehouse,
} from '../types';
import { buildSalesBillPrintListRowsByProductLine, type SalesBillLineInput } from './buildSalesBillPrintContext';
import { sumPsiLineQty, sumPsiLineAmount, groupPsiDocLines } from './psiPrintShared';

export type PurchaseBillLineInput = {
  id: string;
  productId: string;
  quantity?: number;
  purchasePrice: number;
  variantQuantities?: Record<string, number>;
  batchNo?: string;
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
    batchNo: l.batchNo,
  }));
  return buildSalesBillPrintListRowsByProductLine(asSales, productMap, dictionaries);
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
    docTotalQty: sumPsiLineQty(lines, productMap),
    docTotalAmount: sumPsiLineAmount(lines, productMap, l => Number(l.purchasePrice) || 0),
    custom: customData && Object.keys(customData).length > 0 ? { ...customData } : undefined,
  };
  return {
    purchaseBillPrint,
    printListRows,
    product,
  };
}

/** 从同一采购单下的 PSI 行记录聚合为打印行输入 */
export function buildPurchaseBillLinesFromPsiRecords(docItems: PsiRecord[]): PurchaseBillLineInput[] {
  return groupPsiDocLines<PurchaseBillLineInput>(docItems, (lgId, first, _recs, hasVar, vq, lineQtyNoVar) => {
    const bn = String(first.batchNo ?? (first as { batch?: string }).batch ?? '').trim();
    return {
      id: lgId,
      productId: first.productId,
      quantity: hasVar ? undefined : lineQtyNoVar,
      purchasePrice: Number(first.purchasePrice) || 0,
      variantQuantities: hasVar ? vq : undefined,
      ...(bn ? { batchNo: bn } : {}),
    };
  });
}

export function buildPurchaseBillPrintContextFromPsiDoc(params: {
  docNumber: string;
  docItems: PsiRecord[];
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
