/** 采购入库行金额：优先 amount，否则 quantity × purchasePrice */
export function psiLineAmount(row: {
  amount?: unknown;
  quantity?: unknown;
  purchasePrice?: unknown;
}): number {
  const amount = num(row.amount);
  if (amount > 0) return amount;
  const qty = num(row.quantity);
  const price = num(row.purchasePrice);
  if (qty <= 0 || price <= 0) return 0;
  return qty * price;
}

export function extractRelatedProductId(customData: unknown): string {
  if (!customData || typeof customData !== 'object') return '';
  return String((customData as Record<string, unknown>).relatedProductId ?? '').trim();
}

/** 按成品 relatedProductId 累加采购入库金额 */
export function aggregatePurchaseByRelatedProduct(
  rows: Array<{
    customData: unknown;
    amount?: unknown;
    quantity?: unknown;
    purchasePrice?: unknown;
  }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const productId = extractRelatedProductId(row.customData);
    if (!productId) continue;
    map.set(productId, (map.get(productId) ?? 0) + psiLineAmount(row));
  }
  return map;
}

/** 按 productId 累加财务流水金额 */
export function aggregateFinanceByProductId(
  rows: Array<{ productId: string | null; amount: unknown }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const productId = String(row.productId ?? '').trim();
    if (!productId) continue;
    const amount = num(row.amount);
    if (amount <= 0) continue;
    map.set(productId, (map.get(productId) ?? 0) + amount);
  }
  return map;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
