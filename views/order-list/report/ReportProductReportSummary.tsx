/**
 * 报工弹窗 - 产品名/工单号 + 数量汇总 hint 标题区。
 */
import React from 'react';
import ReportProductQtyHints, { type ReportProductQtyHintsProps } from './ReportProductQtyHints';

interface Props {
  productionLinkMode: 'order' | 'product';
  productName: string;
  orderNumber?: string;
  hideProductTitle?: boolean;
  hints: ReportProductQtyHintsProps;
}

const ReportProductReportSummary: React.FC<Props> = ({
  productionLinkMode,
  productName,
  orderNumber,
  hideProductTitle = false,
  hints,
}) => {
  const hintsEl = (
    <div className="text-[10px] sm:text-[11px] text-slate-500 font-medium leading-snug">
      <ReportProductQtyHints {...hints} />
    </div>
  );

  if (hideProductTitle) {
    return hints.hintTotalQty > 0 || hints.fallbackOrderNumber ? hintsEl : null;
  }

  if (productionLinkMode === 'product') {
    return (
      <div className="flex min-w-0 flex-col gap-0.5 mb-2">
        <span className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{productName}</span>
        {hintsEl}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5 mb-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {orderNumber ? <span className="text-sm font-bold text-slate-900">{orderNumber}</span> : null}
        {orderNumber ? <span className="text-sm text-slate-400">·</span> : null}
        <span className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{productName}</span>
      </div>
      {hints.hintTotalQty > 0 ? hintsEl : null}
    </div>
  );
};

export default ReportProductReportSummary;
