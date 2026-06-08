import type { PrintRenderContext } from '../types';

/** 打印/导出前脱敏：清空上下文中的单价、金额与合计字段 */
export function maskPrintContextAmounts(ctx: PrintRenderContext): PrintRenderContext {
  const printListRows = ctx.printListRows?.map(row => ({
    ...row,
    unitPrice: undefined,
    amount: undefined,
  }));

  const next: PrintRenderContext = { ...ctx, printListRows };

  if (next.purchaseOrderPrint) {
    next.purchaseOrderPrint = { ...next.purchaseOrderPrint, docTotalAmount: 0 };
  }
  if (next.salesOrderPrint) {
    next.salesOrderPrint = { ...next.salesOrderPrint, docTotalAmount: 0 };
  }
  if (next.purchaseBillPrint) {
    next.purchaseBillPrint = { ...next.purchaseBillPrint, docTotalAmount: 0 };
  }
  if (next.salesBill) {
    next.salesBill = {
      ...next.salesBill,
      docTotalAmount: 0,
      previousBalance: 0,
      currentDebt: 0,
      accumulatedDebt: 0,
    };
  }
  if (next.outsourceReceivePrint) {
    next.outsourceReceivePrint = { ...next.outsourceReceivePrint, totalAmount: 0 };
  }

  return next;
}
