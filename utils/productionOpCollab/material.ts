/** 生产物料领退：collabData 中自定义快照键名 */

export function isOutsourceMaterialPartner(partner?: string | null): boolean {
  return Boolean(partner?.trim());
}

export type MaterialStockCollabDataKey =
  | 'materialIssueCustomData'
  | 'materialReturnCustomData'
  | 'outsourceMaterialIssueCustomData'
  | 'outsourceMaterialReturnCustomData';

export function materialStockCustomDataCollabKey(
  recordType: 'STOCK_OUT' | 'STOCK_RETURN',
  partner?: string | null,
): MaterialStockCollabDataKey {
  if (isOutsourceMaterialPartner(partner)) {
    return recordType === 'STOCK_RETURN' ? 'outsourceMaterialReturnCustomData' : 'outsourceMaterialIssueCustomData';
  }
  return recordType === 'STOCK_RETURN' ? 'materialReturnCustomData' : 'materialIssueCustomData';
}

/** 将「新增时」填写的自定义项写入 collabData（与生产物料确认领退同一套键名规则） */
export function buildMaterialStockCustomCollabPayload(
  values: Record<string, unknown>,
  recordType: 'STOCK_OUT' | 'STOCK_RETURN',
  partner?: string | null,
): { collabData?: Record<string, unknown> } {
  const dataKey = materialStockCustomDataCollabKey(recordType, partner);
  const clean = Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== '' && v != null && v !== undefined),
  );
  if (!Object.keys(clean).length) return {};
  return { collabData: { [dataKey]: clean } };
}
