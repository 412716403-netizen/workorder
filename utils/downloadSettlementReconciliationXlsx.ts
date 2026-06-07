import {
  buildSettlementReconciliationExportSheet,
  type BuildSettlementReconciliationExportSheetInput,
} from './buildSettlementReconciliationExportSheet';

export type DownloadSettlementReconciliationXlsxInput = BuildSettlementReconciliationExportSheetInput;

function sanitizeFilePart(s: string): string {
  return s.replace(/[/\\?*[\]:"|<>]/g, '_').replace(/\s+/g, '_').trim().slice(0, 80) || '_';
}

/** 浏览器下载报工结算对账 xlsx（动态加载 xlsx 包） */
export async function downloadSettlementReconciliationXlsx(
  input: DownloadSettlementReconciliationXlsxInput,
): Promise<void> {
  const XLSX = await import('xlsx');
  const aoa = buildSettlementReconciliationExportSheet(input);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '报工结算对账');
  const name = sanitizeFilePart(input.workerName || '工人');
  const df = sanitizeFilePart(input.dateFrom.trim() || '起');
  const dt = sanitizeFilePart(input.dateTo.trim() || '止');
  XLSX.writeFile(wb, `报工结算对账_${name}_${df}_${dt}.xlsx`);
}
