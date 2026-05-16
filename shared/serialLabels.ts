export interface ItemCodeSerialLabelOptions {
  batchSequenceNo?: number | null;
  batchPieceNo?: number | null;
}

/**
 * 单品码展示/打印编号。
 * - 有批次：计划单号-批次序号-批次内件号，如 PLN47-1-1
 * - 无批次（历史纯计划单品码）：计划单号-全局序号，如 PLN47-12
 */
export function formatItemCodeSerialLabel(
  planNumber: string,
  serialNo: number,
  opts?: ItemCodeSerialLabelOptions,
): string {
  const batchSequenceNo = opts?.batchSequenceNo;
  const batchPieceNo = opts?.batchPieceNo;
  if (
    batchSequenceNo != null &&
    batchSequenceNo > 0 &&
    batchPieceNo != null &&
    batchPieceNo > 0
  ) {
    return `${planNumber}-${batchSequenceNo}-${batchPieceNo}`;
  }
  return `${planNumber}-${serialNo}`;
}

/** 从 ItemCode 列表行（含 batch / batchPieceNo）生成展示编号 */
export function formatItemCodeSerialLabelFromCode(
  planNumber: string,
  code: {
    serialNo: number;
    batchPieceNo?: number | null;
    batch?: { sequenceNo: number } | null;
  },
): string {
  return formatItemCodeSerialLabel(planNumber, code.serialNo, {
    batchSequenceNo: code.batch?.sequenceNo,
    batchPieceNo: code.batchPieceNo,
  });
}

/** 批次码展示/打印编号，如 PLN47-1 */
export function formatBatchSerialLabel(planNumber: string, sequenceNo: number): string {
  return `${planNumber}-${sequenceNo}`;
}
