/** @deprecated 批次码已不再使用 B- 前缀；保留常量避免旧代码引用报错 */
export const BATCH_SERIAL_LETTER = 'B';

export {
  formatBatchSerialLabel,
  formatItemCodeSerialLabel,
  formatItemCodeSerialLabelFromCode,
  type ItemCodeSerialLabelOptions,
} from '../shared/serialLabels';
