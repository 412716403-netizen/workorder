import React from 'react';

export interface FlowSummaryMetric {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export interface FlowListSummaryFooterProps {
  count: number;
  /** 条数后缀，默认「条」 */
  countSuffix?: string;
  metrics: FlowSummaryMetric[];
  mode: 'bar' | 'tableRow';
  /** tableRow 模式：左侧合并列数 */
  colSpan?: number;
  /** tableRow 模式：右侧空列数（如操作列） */
  trailingEmptyCols?: number;
  className?: string;
  /** bar 模式：右侧附加内容（如分页） */
  trailing?: React.ReactNode;
}

function SummaryContent({
  count,
  countSuffix = '条',
  metrics,
}: Pick<FlowListSummaryFooterProps, 'count' | 'countSuffix' | 'metrics'>) {
  return (
    <>
      <span className="text-xs text-slate-400 font-bold mr-3">
        共 {count} {countSuffix}
      </span>
      {metrics.length > 0 && (
        <>
          <span className="text-slate-300 mr-3">|</span>
          <span className="text-[10px] text-slate-500 uppercase mr-3">合计</span>
          {metrics.map((m, i) => (
            <React.Fragment key={m.label}>
              {i > 0 && <span className="text-slate-300 mx-2">|</span>}
              <span className={`text-xs ${m.className ?? 'text-slate-700'}`}>
                {m.label} {m.value}
              </span>
            </React.Fragment>
          ))}
        </>
      )}
    </>
  );
}

const FlowListSummaryFooter: React.FC<FlowListSummaryFooterProps> = ({
  count,
  countSuffix = '条',
  metrics,
  mode,
  colSpan = 1,
  trailingEmptyCols = 0,
  className = '',
  trailing,
}) => {
  if (mode === 'bar') {
    return (
      <div
        className={`shrink-0 bg-slate-50 border-t-2 border-slate-200 font-bold px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 ${trailing ? 'justify-between' : ''} ${className}`}
      >
        <div className="min-w-0">
          <SummaryContent count={count} countSuffix={countSuffix} metrics={metrics} />
        </div>
        {trailing}
      </div>
    );
  }

  return (
    <tr className={`bg-slate-50 border-t-2 border-slate-200 font-bold ${className}`}>
      <td className="px-4 py-3" colSpan={colSpan}>
        <SummaryContent count={count} countSuffix={countSuffix} metrics={metrics} />
      </td>
      {trailingEmptyCols > 0 &&
        Array.from({ length: trailingEmptyCols }).map((_, i) => (
          <td key={i} className="px-4 py-3" />
        ))}
    </tr>
  );
};

export default FlowListSummaryFooter;
