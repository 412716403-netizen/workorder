/**
 * 报工弹窗 - 产品/工单数量汇总 hint（合计、已报、剩、待审、外协、返工剩余）。
 * 口径对齐小程序 orderReportForm.buildQtyHintText。
 */
import React from 'react';

export interface ReportProductQtyHintsProps {
  detailUnit: string;
  hintTotalQty: number;
  hintMaxReportable: number;
  hintCompletedDisplay: number;
  hintRemaining: number;
  pendingApprovalQty: number;
  totalOutsourcedAtNode: number;
  defectiveQtyForHint: number;
  totalRework: number;
  /** hintTotalQty <= 0 时显示的工单号 */
  fallbackOrderNumber?: string;
}

const ReportProductQtyHints: React.FC<ReportProductQtyHintsProps> = ({
  detailUnit,
  hintTotalQty,
  hintMaxReportable,
  hintCompletedDisplay,
  hintRemaining,
  pendingApprovalQty,
  totalOutsourcedAtNode,
  defectiveQtyForHint,
  totalRework,
  fallbackOrderNumber,
}) => {
  const reworkRemaining = Math.max(0, defectiveQtyForHint - totalRework);

  if (hintTotalQty <= 0) {
    return fallbackOrderNumber ? (
      <span className="text-slate-500 text-[10px] sm:text-[11px]">工单 {fallbackOrderNumber}</span>
    ) : null;
  }
  return (
    <span className="block mt-0.5">
      {hintMaxReportable !== hintTotalQty ? (
        <>可报 {hintMaxReportable}/{hintTotalQty} {detailUnit} · </>
      ) : (
        <>合计 {hintTotalQty} {detailUnit} · </>
      )}
      已报 {hintCompletedDisplay} · 剩 {hintRemaining} {detailUnit}
      {pendingApprovalQty > 0 ? (
        <span className="text-slate-400" title="待审核报工占用可报额度，通过后计入已报">
          {' '}· 待审 {pendingApprovalQty} {detailUnit}
        </span>
      ) : null}
      {totalOutsourcedAtNode > 0 ? (
        <span className="text-slate-400" title="本工序已发外协、尚未收回的在制数量（外协剩余）">
          {' '}· 外协剩余 {totalOutsourcedAtNode} {detailUnit}
        </span>
      ) : null}
      {reworkRemaining > 0 ? (
        <span className="text-slate-400" title="本工序报不良等尚未通过返工报工回缴的件数">
          {' '}· 返工剩余 {reworkRemaining} {detailUnit}
        </span>
      ) : null}
    </span>
  );
};

export default ReportProductQtyHints;
