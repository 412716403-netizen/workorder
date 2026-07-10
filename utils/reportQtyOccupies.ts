import { ReportApprovalStatus } from '../types';

/** 与后端 orders.service reportQtyOccupies 一致：APPROVED + PENDING 占用；REJECTED 不占 */
export function reportQtyOccupies(approvalStatus: string | null | undefined): boolean {
  return (
    approvalStatus === ReportApprovalStatus.APPROVED ||
    approvalStatus === ReportApprovalStatus.PENDING ||
    !approvalStatus
  );
}

export function sumOccupyingReportQty(
  reports: ReadonlyArray<{
    quantity?: number | null;
    approvalStatus?: string | null;
    variantId?: string | null;
  }> | undefined,
  variantId?: string,
): number {
  const vid = variantId === undefined ? undefined : variantId || '';
  return (reports ?? [])
    .filter((r) => reportQtyOccupies(r.approvalStatus))
    .filter((r) => vid === undefined || (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
}

export function sumOccupyingDefectiveQty(
  reports: ReadonlyArray<{
    defectiveQuantity?: number | null;
    approvalStatus?: string | null;
    variantId?: string | null;
  }> | undefined,
  variantId?: string,
): number {
  const vid = variantId === undefined ? undefined : variantId || '';
  return (reports ?? [])
    .filter((r) => reportQtyOccupies(r.approvalStatus))
    .filter((r) => vid === undefined || (r.variantId || '') === vid)
    .reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);
}

export function sumPendingReportQty(
  reports: ReadonlyArray<{ quantity?: number | null; approvalStatus?: string | null }> | undefined,
): number {
  return (reports ?? [])
    .filter((r) => r.approvalStatus === ReportApprovalStatus.PENDING)
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
}
