import type { ProductionOpRecord } from '../../types';

export const DEFECT_TREATMENT_CUSTOM_DATA_KEY = 'defectTreatmentCustomData';
export const REWORK_REPORT_CUSTOM_DATA_KEY = 'reworkReportCustomData';

function parseCollabObject(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw != null && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
}

/** 处理不良批次（同 docNo 的 REWORK/SCRAP）首条上的自定义快照 */
export function readDefectTreatmentCustomSnapshot(records: ProductionOpRecord[], docNo: string | undefined): Record<string, unknown> {
  if (!docNo) return {};
  const docRecords = records.filter(r => r.docNo === docNo && (r.type === 'REWORK' || r.type === 'SCRAP'));
  const first = docRecords[0] as ProductionOpRecord & { collabData?: Record<string, unknown> };
  return parseCollabObject(first?.collabData?.[DEFECT_TREATMENT_CUSTOM_DATA_KEY]);
}

/** 返工报工批次（同 docNo 的 REWORK_REPORT）首条上的自定义快照 */
export function readReworkReportCustomSnapshot(
  records: ProductionOpRecord[],
  docNo: string | undefined,
  productId: string | undefined,
): Record<string, unknown> {
  if (!docNo || !productId) return {};
  const docRecords = records.filter(r => r.type === 'REWORK_REPORT' && r.docNo === docNo && r.productId === productId);
  const first = docRecords[0] as ProductionOpRecord & { collabData?: Record<string, unknown> };
  return parseCollabObject(first?.collabData?.[REWORK_REPORT_CUSTOM_DATA_KEY]);
}
