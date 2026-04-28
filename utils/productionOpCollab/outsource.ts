/** 与 `ProductionOpRecord.collabData` 中键名一致 */
export const OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY = 'outsourceDispatchCustomData';
export const OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY = 'outsourceReceiveCustomData';

export function outsourceCustomCollabPart(
  values: Record<string, unknown>,
  kind: 'dispatch' | 'receive',
): { collabData?: Record<string, unknown> } {
  const dataKey = kind === 'dispatch' ? OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY : OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY;
  const clean = Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== '' && v != null && v !== undefined),
  );
  if (!Object.keys(clean).length) return {};
  return { collabData: { [dataKey]: clean } };
}

/**
 * 外协流水详情编辑保存：把表单自定义合并进从首条记录保留的 collabData。
 * `clean` 为 `{}` 时仍写回 `customDataKey`，以清空库里该段旧值（与生产入库 `stockInCustomData` 语义一致）。
 */
export function mergeOutsourceDetailEditCollab(
  preserved: Record<string, unknown> | undefined,
  customDataKey: typeof OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY | typeof OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY,
  flowDetailEditCustom: Record<string, unknown>,
): { collabData?: Record<string, unknown> } {
  const base: Record<string, unknown> = preserved && typeof preserved === 'object' ? { ...preserved } : {};
  const clean = Object.fromEntries(
    Object.entries(flowDetailEditCustom).filter(([, v]) => v !== '' && v != null && v !== undefined),
  );
  base[customDataKey] = clean;
  return Object.keys(base).length ? { collabData: base } : {};
}
