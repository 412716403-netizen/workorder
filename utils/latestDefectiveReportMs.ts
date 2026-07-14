/** 报工列表中最近一次含不良品的提交时间（ms）；无则 0 */
export function latestDefectiveReportMs(
  reports: { timestamp?: string | null; defectiveQuantity?: number | null }[] | undefined
): number {
  if (!reports?.length) return 0;
  let max = 0;
  for (const r of reports) {
    if ((Number(r.defectiveQuantity) || 0) <= 0) continue;
    const t = Date.parse(r.timestamp || '');
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max;
}
