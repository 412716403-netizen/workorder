/**
 * 非聚焦时展示：与数量框一致，0 / 空显示为空串，由 placeholder 灰色「0」占位。
 * 非零数字才写入 value，避免点入时先看到实心「0」再删。
 */
export function formatUnitPriceInputValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return '';
  return String(value);
}

/** 草稿是否已是可提交的完整数字（排除 "" / "." / "0." 等中间态）。 */
export function isUnitPriceDraftComplete(raw: string): boolean {
  const t = String(raw).trim().replace(',', '.');
  if (t === '' || t === '.' || t === '-' || t.endsWith('.')) return false;
  return Number.isFinite(Number(t));
}

/** 失焦/提交：空或非法 → emptyValue；合法非负 → 保留两位小数口径。 */
export function commitUnitPriceInput(raw: string, emptyValue = 0): number {
  const t = String(raw).trim().replace(',', '.');
  if (t === '' || t === '.' || t === '-') return emptyValue;
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return emptyValue;
  return Math.round(n * 100) / 100;
}

/** 仅允许非负小数中间态（含空、"."、"0."）。 */
export function isAllowedUnitPriceDraft(raw: string): boolean {
  const t = String(raw).replace(',', '.');
  return t === '' || /^\d*\.?\d*$/.test(t);
}
