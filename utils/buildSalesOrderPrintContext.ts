import type { AppDictionaries, PrintRenderContext, Product, PsiRecord, SalesOrderPrintContext } from '../types';
import { buildPurchaseOrderPrintListRows, type PurchaseOrderLineInput } from './buildPurchaseOrderPrintContext';
import { sumPsiLineQty, sumPsiLineAmount, groupPsiDocLines } from './psiPrintShared';
import { effectiveAllocatedQuantity } from './psiAllocationDisplay';

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

/**
 * 把每条销售订单记录的 `quantity` 替换为未配货数量并丢弃为 0 的记录。
 * 未配货 = max(0, 订货数量 − 已配)，已配 = 已发 + 待发（effectiveAllocatedQuantity）。
 */
function toUnshippedRecords(docItems: PsiRecord[]): PsiRecord[] {
  const out: PsiRecord[] = [];
  for (const r of docItems) {
    const ordered = Number(r.quantity) || 0;
    const allocated = effectiveAllocatedQuantity(r.allocatedQuantity, r.shippedQuantity);
    const unshipped = Math.max(0, ordered - allocated);
    if (unshipped <= 0) continue;
    out.push({ ...r, quantity: unshipped });
  }
  return out;
}

/** 从同一销售订单下的 PSI 行记录聚合为打印行输入 */
export function buildSalesOrderLinesFromPsiRecords(
  docItems: PsiRecord[],
  opts?: { onlyUnshipped?: boolean },
): SalesOrderLineInput[] {
  const source = opts?.onlyUnshipped ? toUnshippedRecords(docItems) : docItems;
  return groupPsiDocLines<SalesOrderLineInput>(source, (lgId, first, _recs, hasVar, vq, lineQtyNoVar) => ({
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
  /** 「一个销售订单（未配货）」数据源：按行/规格仅取未配货数量，丢弃已全部配货的行 */
  onlyUnshipped?: boolean;
}): PrintRenderContext {
  const { docNumber, docItems, productMap, dictionaries, onlyUnshipped } = params;
  const main = docItems[0] ?? {};
  const lines = buildSalesOrderLinesFromPsiRecords(docItems, { onlyUnshipped });
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
