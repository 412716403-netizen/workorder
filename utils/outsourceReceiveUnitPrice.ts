/** 外协收回 entry key → 行级 baseKey（`工单|工序` 或 `产品|工序`） */
export function outsourceReceiveBaseKey(entryKey: string): string {
  const parts = entryKey.split('|');
  if (parts.length >= 3) return `${parts[0]}|${parts[1]}`;
  return entryKey;
}

/** 从行级 / 规格级单价 map 解析某 entry 应写入的单价 */
export function resolveOutsourceReceiveLineUnitPrice(
  unitPrices: Readonly<Record<string, number | undefined>>,
  entryKey: string,
  baseKey?: string,
): number | undefined {
  const bk = baseKey ?? outsourceReceiveBaseKey(entryKey);
  const raw = unitPrices[entryKey] ?? unitPrices[bk];
  if (raw == null) return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** 行级单价变更时同步到该行下所有 quantity key（含矩阵规格后缀） */
export function propagateLineUnitPriceToEntries(
  unitPrices: Record<string, number>,
  lineKey: string,
  price: number | undefined,
  quantityKeys: Iterable<string>,
): Record<string, number> {
  const next = { ...unitPrices };
  const apply = (k: string) => {
    if (price == null || !Number.isFinite(price)) delete next[k];
    else next[k] = price;
  };
  apply(lineKey);
  for (const k of quantityKeys) {
    if (k === lineKey || k.startsWith(`${lineKey}|`)) apply(k);
  }
  return next;
}
