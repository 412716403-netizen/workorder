import {
  buildPartnerReconciliationExportSheet,
  type BuildPartnerReconciliationExportSheetInput,
} from './buildPartnerReconciliationExportSheet';

export type DownloadPartnerReconciliationXlsxInput = BuildPartnerReconciliationExportSheetInput;

function sanitizeFilePart(s: string): string {
  return s.replace(/[/\\?*[\]:"|<>]/g, '_').replace(/\s+/g, '_').trim().slice(0, 80) || '_';
}

/** 浏览器下载合作单位对账 xlsx（动态加载 xlsx 包） */
export async function downloadPartnerReconciliationXlsx(input: DownloadPartnerReconciliationXlsxInput): Promise<void> {
  const XLSX = await import('xlsx');
  const aoa = buildPartnerReconciliationExportSheet(input);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '合作单位对账');
  const name = sanitizeFilePart(input.partnerName || '合作单位');
  const df = sanitizeFilePart(input.dateFrom.trim() || '起');
  const dt = sanitizeFilePart(input.dateTo.trim() || '止');
  XLSX.writeFile(wb, `合作单位对账_${name}_${df}_${dt}.xlsx`);
}
