/**
 * 报工弹窗 - 产品/工单数量汇总 hint（合计、已报、剩、外协、返工）。
 * 单规格与矩阵规格共用。
 */
import React from 'react';

export interface ReportProductQtyHintsProps {
  detailUnit: string;
  hintTotalQty: number;
  hintMaxReportable: number;
  hintCompletedDisplay: number;
  hintRemaining: number;
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
  totalOutsourcedAtNode,
  defectiveQtyForHint,
  totalRework,
  fallbackOrderNumber,
}) => {
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
      {totalOutsourcedAtNode > 0 ? (
        <span className="text-slate-400" title="本工序已发外协、尚未收回的在制数量（外协剩余）">
          {' '}· 外协剩余 {totalOutsourcedAtNode} {detailUnit}
        </span>
      ) : null}
      {defectiveQtyForHint > 0 ? (
        <span className="text-slate-400" title="本工序报不良等需走返工流程的件数">
          {' '}· 返工 {defectiveQtyForHint} {detailUnit}
        </span>
      ) : null}
      {totalRework > 0 ? (
        <span className="text-slate-400" title="返工报工已回缴到本工序的完成件数">
          {' '}·{defectiveQtyForHint > 0 ? ' 返工完成' : ' 返工'} {totalRework}
        </span>
      ) : null}
    </span>
  );
};

export default ReportProductQtyHints;
