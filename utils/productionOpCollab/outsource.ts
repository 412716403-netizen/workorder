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
