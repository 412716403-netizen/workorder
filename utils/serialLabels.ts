/** 单品码编号前缀字母（与批次码 B 区分） */
export const ITEM_CODE_SERIAL_LETTER = 'J';
/** 批次码编号前缀字母（与单品码 J 区分） */
export const BATCH_SERIAL_LETTER = 'B';

/** 单品码展示/打印编号，如 J-PLN12-0001 */
export function formatItemCodeSerialLabel(planNumber: string, serialNo: number): string {
  return `${ITEM_CODE_SERIAL_LETTER}-${planNumber}-${String(serialNo).padStart(4, '0')}`;
}

/** 批次码展示/打印编号，如 B-PLN12-0003 */
export function formatBatchSerialLabel(planNumber: string, sequenceNo: number): string {
  return `${BATCH_SERIAL_LETTER}-${planNumber}-${String(sequenceNo).padStart(4, '0')}`;
}
