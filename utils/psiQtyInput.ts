function parsePsiQuantityCore(raw: string, allowNegative: boolean): number {
  const normalized = String(raw).trim().replace(',', '.');
  if (normalized === '' || normalized === '.' || normalized === '-')
    return 0;
  const v = parseFloat(normalized);
  if (!Number.isFinite(v) || (!allowNegative && v < 0))
    return 0;
  return Math.round(v * 100) / 100;
}

/**
 * 无颜色尺码的 PSI 明细数量输入解析（与 `PsiRecord.quantity` Decimal(12,2) 对齐）。
 * 仅允许非负数，用于采购订单等意向单。
 */
export function parsePsiNonVariantQuantityInput(raw: string): number {
  return parsePsiQuantityCore(raw, false);
}

/**
 * 允许负数的 PSI 明细数量输入解析（采购入库/销售单退货等）。
 */
export function parsePsiSignedQuantityInput(raw: string): number {
  return parsePsiQuantityCore(raw, true);
}

/**
 * 与 `parsePsiSignedQuantityInput` 相同，但空输入返回 `undefined`（便于数量框清空，不强制回显 0）。
 */
export function parsePsiSignedQuantityInputOptional(raw: string): number | undefined {
  const normalized = String(raw).trim().replace(',', '.');
  if (normalized === '') return undefined;
  const v = parsePsiQuantityCore(raw, true);
  return v;
}

/**
 * 与 `parsePsiNonVariantQuantityInput` 相同，但空输入返回 `undefined`。
 */
export function parsePsiNonVariantQuantityInputOptional(raw: string): number | undefined {
  const normalized = String(raw).trim().replace(',', '.');
  if (normalized === '') return undefined;
  return parsePsiQuantityCore(raw, false);
}

/**
 * 非负整数数量（销售订单等）；空输入返回 `undefined`。
 */
export function parsePsiIntegerQuantityInputOptional(raw: string): number | undefined {
  const normalized = String(raw).trim();
  if (normalized === '') return undefined;
  const v = parseInt(normalized, 10);
  if (!Number.isFinite(v) || v < 0) return undefined;
  return v;
}

/**
 * 允许负数的整数数量（销售单退货等）；空输入返回 `undefined`。
 */
export function parsePsiSignedIntegerQuantityInputOptional(raw: string): number | undefined {
  const normalized = String(raw).trim();
  if (normalized === '' || normalized === '-') return undefined;
  const v = parseInt(normalized, 10);
  if (!Number.isFinite(v)) return undefined;
  return v;
}
