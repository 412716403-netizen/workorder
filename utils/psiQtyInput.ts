/**
 * 无颜色尺码的 PSI 明细数量输入解析（与 `PsiRecord.quantity` Decimal(12,2) 对齐）。
 */
export function parsePsiNonVariantQuantityInput(raw: string): number {
  const normalized = String(raw).trim().replace(',', '.');
  if (normalized === '' || normalized === '.' || normalized === '-')
    return 0;
  const v = parseFloat(normalized);
  if (!Number.isFinite(v) || v < 0)
    return 0;
  return Math.round(v * 100) / 100;
}
