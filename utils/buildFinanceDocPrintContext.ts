import type {
  FinanceCategory,
  FinanceDocPrintContext,
  FinanceRecord,
  PrintRenderContext,
  Product,
  ProductionOrder,
  Worker,
} from '../types';
import { amountToChineseRmbUppercase } from './numberToChineseRmb';

function resolveOrderForRelated(
  related: string,
  orderMap: Map<string, ProductionOrder>,
  orders: ProductionOrder[],
): ProductionOrder | undefined {
  if (!related) return undefined;
  const byId = orderMap.get(related);
  if (byId) return byId;
  return orders.find(o => o.orderNumber === related);
}

export function financeDocPrintContextFromRecord(
  record: FinanceRecord,
  opts: {
    docKind: '收款单' | '付款单';
    categoryMap: Map<string, FinanceCategory>;
    productMap: Map<string, Product>;
    workerMap: Map<string, Worker>;
    orderMap: Map<string, ProductionOrder>;
    orders: ProductionOrder[];
  },
): FinanceDocPrintContext {
  const { docKind, categoryMap, productMap, workerMap, orderMap, orders } = opts;
  const cat = record.categoryId ? categoryMap.get(record.categoryId) : undefined;
  const categoryName = cat?.name ?? '';
  const product = record.productId ? productMap.get(record.productId) : undefined;
  const worker = record.workerId ? workerMap.get(record.workerId) : undefined;
  const related = record.relatedId?.trim() ?? '';
  const order = resolveOrderForRelated(related, orderMap, orders);

  const amt = Number(record.amount) || 0;
  const custom: Record<string, unknown> = { ...(record.customData ?? {}) };

  return {
    docNo: record.docNo || record.id,
    type: docKind,
    amount: amt,
    amountText: amountToChineseRmbUppercase(amt),
    partner: record.partner ?? '',
    operator: record.operator ?? '',
    timestamp: record.timestamp ?? '',
    category: categoryName,
    paymentAccount: record.paymentAccount ?? '',
    workerName: worker?.name ?? '',
    productName: product?.name ?? '',
    productSku: product?.sku ?? '',
    relatedDocNo: order?.orderNumber ?? related,
    note: record.note ?? '',
    custom,
  };
}

export function buildReceiptPrintRenderContext(args: {
  record: FinanceRecord;
  categoryMap: Map<string, FinanceCategory>;
  productMap: Map<string, Product>;
  workerMap: Map<string, Worker>;
  orderMap: Map<string, ProductionOrder>;
  orders: ProductionOrder[];
}): PrintRenderContext {
  const ctx = financeDocPrintContextFromRecord(args.record, {
    docKind: '收款单',
    categoryMap: args.categoryMap,
    productMap: args.productMap,
    workerMap: args.workerMap,
    orderMap: args.orderMap,
    orders: args.orders,
  });
  return { receiptPrint: ctx };
}

export function buildPaymentPrintRenderContext(args: {
  record: FinanceRecord;
  categoryMap: Map<string, FinanceCategory>;
  productMap: Map<string, Product>;
  workerMap: Map<string, Worker>;
  orderMap: Map<string, ProductionOrder>;
  orders: ProductionOrder[];
}): PrintRenderContext {
  const ctx = financeDocPrintContextFromRecord(args.record, {
    docKind: '付款单',
    categoryMap: args.categoryMap,
    productMap: args.productMap,
    workerMap: args.workerMap,
    orderMap: args.orderMap,
    orders: args.orders,
  });
  return { paymentPrint: ctx };
}

export function buildReceiptPrintContextFromRecord(args: {
  record: FinanceRecord;
  categoryMap: Map<string, FinanceCategory>;
  productMap: Map<string, Product>;
  workerMap: Map<string, Worker>;
  orderMap: Map<string, ProductionOrder>;
  orders: ProductionOrder[];
}): PrintRenderContext {
  return buildReceiptPrintRenderContext(args);
}

export function buildPaymentPrintContextFromRecord(args: {
  record: FinanceRecord;
  categoryMap: Map<string, FinanceCategory>;
  productMap: Map<string, Product>;
  workerMap: Map<string, Worker>;
  orderMap: Map<string, ProductionOrder>;
  orders: ProductionOrder[];
}): PrintRenderContext {
  return buildPaymentPrintRenderContext(args);
}
