import type { PlanVirtualBatch, VirtualBatchPrintRow } from '../types';
import { formatBatchSerialLabel } from './serialLabels';

export function buildVirtualBatchPrintRow(
  batch: PlanVirtualBatch,
  opts: {
    planNumber: string;
    productName: string;
    sku: string;
    orderNumbers: string;
    variantLabel: string;
    colorName: string;
    sizeName: string;
  },
  baseUrl: string,
): VirtualBatchPrintRow {
  const base = baseUrl.replace(/\/$/, '');
  const serialLabel = formatBatchSerialLabel(opts.planNumber, batch.sequenceNo);
  return {
    scanUrl: `${base}/scan/batch/${batch.scanToken}`,
    scanToken: batch.scanToken,
    sequenceNo: String(batch.sequenceNo),
    serialLabel,
    quantity: String(batch.quantity),
    planNumber: opts.planNumber,
    orderNumbers: opts.orderNumbers,
    productName: opts.productName,
    sku: opts.sku,
    variantLabel: opts.variantLabel,
    colorName: opts.colorName,
    sizeName: opts.sizeName,
    status: batch.status === 'ACTIVE' ? '正常' : '已作废',
  };
}
