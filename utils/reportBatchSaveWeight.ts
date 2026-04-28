/**
 * 报工批次保存时，单行应随 `onUpdateReport` / `onUpdateReportProduct` 传入的 `weight`。
 * - `undefined`：不展开进 payload（后端保留原值）
 * - `null`：传入后端，触发 `'weight' in body` 清空并重算 materialBreakdown
 */
export function reportBatchRowWeightForPayload(args: {
  usesWeight: boolean;
  isMatrix: boolean;
  batchTotalWeightKg: number | '';
  distributedParts: number[] | null;
  rowIndex: number;
  rowWeightKg: number | '';
}): number | null | undefined {
  if (!args.usesWeight) return undefined;
  if (args.isMatrix) {
    if (args.batchTotalWeightKg === '') return null;
    if (args.distributedParts) return args.distributedParts[args.rowIndex];
    return undefined;
  }
  if (args.rowWeightKg === '') return null;
  if (typeof args.rowWeightKg === 'number' && Number.isFinite(args.rowWeightKg)) {
    return args.rowWeightKg;
  }
  return undefined;
}
