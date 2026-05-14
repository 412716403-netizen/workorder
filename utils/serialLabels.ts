/** 批次码编号前缀字母（与单品码编号区分：单品码为「计划单号-四位序号」无字母前缀） */
export const BATCH_SERIAL_LETTER = 'B';

/** 单品码展示/打印编号，如 PLN12-0001 */
export function formatItemCodeSerialLabel(planNumber: string, serialNo: number): string {
  return `${planNumber}-${String(serialNo).padStart(4, '0')}`;
}

/** 批次码展示/打印编号，如 B-PLN12-0003 */
export function formatBatchSerialLabel(planNumber: string, sequenceNo: number): string {
  return `${BATCH_SERIAL_LETTER}-${planNumber}-${String(sequenceNo).padStart(4, '0')}`;
}
