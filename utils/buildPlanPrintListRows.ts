import type { AppDictionaries, PlanOrder, PrintListRow, Product } from '../types';
import { buildSalesBillPrintListRowsByProductLine, type SalesBillLineInput } from './buildSalesBillPrintContext';

/**
 * 计划单列表打印：为动态列表提供 printListRows（一条计划产品块一行，含 colorSizeMatrixJson）。
 * 将计划 items 的 variantId+quantity 汇总为一条「销售明细样式」行，复用 buildSalesBillPrintListRowsByProductLine 的矩阵逻辑。
 */
export function buildPlanPrintListRows(
  plan: PlanOrder,
  product: Product | undefined,
  dictionaries: AppDictionaries,
): PrintListRow[] {
  if (!plan?.productId || !product) return [];

  const variantQuantities: Record<string, number> = {};
  for (const it of plan.items || []) {
    if (!it.variantId) continue;
    variantQuantities[it.variantId] = (variantQuantities[it.variantId] ?? 0) + (Number(it.quantity) || 0);
  }

  let qtyNoVariant = 0;
  for (const it of plan.items || []) {
    if (!it.variantId) qtyNoVariant += Number(it.quantity) || 0;
  }

  const hasVariantQty = Object.values(variantQuantities).some(q => q > 0);
  if (!hasVariantQty && qtyNoVariant <= 0) return [];

  const line: SalesBillLineInput = {
    id: `plan-${plan.id}`,
    productId: plan.productId,
    salesPrice: 0,
    quantity: hasVariantQty ? undefined : qtyNoVariant,
    variantQuantities: hasVariantQty ? variantQuantities : undefined,
  };

  const productMap = new Map<string, Product>([[product.id, product]]);
  return buildSalesBillPrintListRowsByProductLine([line], productMap, dictionaries);
}
