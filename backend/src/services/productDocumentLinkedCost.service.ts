import type { TenantPrismaClient } from '../lib/prisma.js';
import {
  aggregateFinanceByProductId,
  aggregatePurchaseByRelatedProduct,
} from '../../../shared/productDocumentLinkedCost.js';

type PeriodRange = { start: Date; end: Date } | null;

function timestampWhere(range: PeriodRange): { timestamp?: { gte: Date; lte: Date } } {
  if (!range) return {};
  return { timestamp: { gte: range.start, lte: range.end } };
}

export async function loadLinkedPurchaseCostByProduct(
  db: TenantPrismaClient,
  productIds: string[],
  periodRange: PeriodRange = null,
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();

  const rows = await db.psiRecord.findMany({
    where: {
      type: 'PURCHASE_BILL',
      ...timestampWhere(periodRange),
    },
    select: {
      customData: true,
      amount: true,
      quantity: true,
      purchasePrice: true,
    },
  });

  const aggregated = aggregatePurchaseByRelatedProduct(rows);
  if (periodRange == null) return aggregated;

  const allowed = new Set(productIds);
  const filtered = new Map<string, number>();
  for (const [pid, amount] of aggregated) {
    if (allowed.has(pid)) filtered.set(pid, amount);
  }
  return filtered;
}

export async function loadLinkedFinanceByProduct(
  db: TenantPrismaClient,
  productIds: string[],
  periodRange: PeriodRange = null,
): Promise<{ paymentCostMap: Map<string, number>; receiptAmountMap: Map<string, number> }> {
  const empty = { paymentCostMap: new Map<string, number>(), receiptAmountMap: new Map<string, number>() };
  if (productIds.length === 0) return empty;

  const linkProductCategories = await db.financeCategory.findMany({
    where: { linkProduct: true },
    select: { id: true },
  });
  const categoryIds = linkProductCategories.map(c => c.id);
  if (categoryIds.length === 0) return empty;

  const records = await db.financeRecord.findMany({
    where: {
      categoryId: { in: categoryIds },
      productId: { in: productIds },
      status: 'COMPLETED',
      type: { in: ['PAYMENT', 'RECEIPT'] },
      ...timestampWhere(periodRange),
    },
    select: {
      type: true,
      productId: true,
      amount: true,
    },
  });

  const payments: Array<{ productId: string | null; amount: unknown }> = [];
  const receipts: Array<{ productId: string | null; amount: unknown }> = [];
  for (const r of records) {
    if (r.type === 'PAYMENT') payments.push(r);
    else if (r.type === 'RECEIPT') receipts.push(r);
  }

  return {
    paymentCostMap: aggregateFinanceByProductId(payments),
    receiptAmountMap: aggregateFinanceByProductId(receipts),
  };
}
