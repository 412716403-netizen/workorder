/** 待审报工按 reportBatchId 聚合计数，与报工审核弹窗列表行数一致。 */
export function countPendingApprovalBatches(
  orderReports: Array<{ reportBatchId?: string | null; reportId?: string; id?: string }>,
  productReports: Array<{ reportBatchId?: string | null; reportId?: string; id?: string }>,
): number {
  const keys = new Set<string>();
  const add = (r: { reportBatchId?: string | null; reportId?: string; id?: string }) => {
    const key = r.reportBatchId || r.reportId || r.id;
    if (key) keys.add(String(key));
  };
  orderReports.forEach(add);
  productReports.forEach(add);
  return keys.size;
}
