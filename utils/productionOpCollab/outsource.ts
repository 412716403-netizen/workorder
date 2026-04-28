/** 与 `ProductionOpRecord.collabData` 中键名一致 */
export const OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY = 'outsourceDispatchCustomData';
export const OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY = 'outsourceReceiveCustomData';
/** 外协发出交货日期，存 `YYYY-MM-DD` 字符串 */
export const OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY = 'outsourceDispatchDeliveryDate';

const cleanCustomEntries = (values: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v != null && v !== undefined));

/**
 * 外协发出写入 collabData：自定义内容键 + 可选交货日期。
 */
export function buildOutsourceDispatchCollabSnapshot(
  customValues: Record<string, unknown>,
  deliveryDate?: string | null,
): { collabData?: Record<string, unknown> } {
  const customClean = cleanCustomEntries(customValues);
  const dd = (deliveryDate ?? '').trim();
  const collab: Record<string, unknown> = {};
  if (Object.keys(customClean).length) {
    collab[OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY] = customClean;
  }
  if (dd) {
    collab[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY] = dd;
  }
  return Object.keys(collab).length ? { collabData: collab } : {};
}

export function outsourceCustomCollabPart(
  values: Record<string, unknown>,
  kind: 'dispatch' | 'receive',
): { collabData?: Record<string, unknown> } {
  if (kind === 'dispatch') {
    return buildOutsourceDispatchCollabSnapshot(values, undefined);
  }
  const dataKey = OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY;
  const clean = cleanCustomEntries(values);
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
  options?: {
    /** 为 true 时按 `dispatchDeliveryDate` 写入或清除发出交货日期键 */
    updateDispatchDeliveryDate?: boolean;
    dispatchDeliveryDate?: string | null;
  },
): { collabData?: Record<string, unknown> } {
  const base: Record<string, unknown> = preserved && typeof preserved === 'object' ? { ...preserved } : {};
  const clean = Object.fromEntries(
    Object.entries(flowDetailEditCustom).filter(([, v]) => v !== '' && v != null && v !== undefined),
  );
  base[customDataKey] = clean;
  if (options?.updateDispatchDeliveryDate) {
    const dd = (options.dispatchDeliveryDate ?? '').trim();
    if (dd) base[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY] = dd;
    else delete base[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY];
  }
  return Object.keys(base).length ? { collabData: base } : {};
}
