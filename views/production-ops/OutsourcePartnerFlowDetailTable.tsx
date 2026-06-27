import React from 'react';
import { ArrowUpFromLine, Undo2 } from 'lucide-react';
import type { AppDictionaries, Product } from '../../types';
import { formatOutsourceVariantLabel } from '../../utils/buildOutsourceFlowPrintContext';
import type { PartnerFlowDocRow } from '../../utils/outsourcePartnerFlowDetail';

export interface OutsourcePartnerFlowDetailTableProps {
  productId: string;
  products: Product[];
  dictionaries?: AppDictionaries;
  /** 与表单配置「列表显示」中的「外协发出显示交货日期」一致时在「单据类型」后展示列 */
  showDeliveryDateColumn?: boolean;
  docRows: PartnerFlowDocRow[];
  variantColumnIds: string[];
  showVariantCols: boolean;
  dispatchTotal: number;
  dispatchByVariant: Record<string, number>;
  receiveTotal: number;
  receiveByVariant: Record<string, number>;
  remainingTotal: number;
  remainingByVariant: Record<string, number>;
}

const HEAD_CELL = 'px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap';

const DispatchBadge = () => (
  <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-800">
    <ArrowUpFromLine className="h-3 w-3" /> 发出
  </span>
);

const ReceiveBadge = () => (
  <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800">
    <Undo2 className="h-3 w-3" /> 收回
  </span>
);

const OutsourcePartnerFlowDetailTable: React.FC<OutsourcePartnerFlowDetailTableProps> = ({
  productId,
  products,
  dictionaries,
  showDeliveryDateColumn = false,
  docRows,
  variantColumnIds,
  showVariantCols,
  dispatchTotal,
  dispatchByVariant,
  receiveTotal,
  receiveByVariant,
  remainingTotal,
  remainingByVariant,
}) => {
  const variantLabel = (vid: string) => formatOutsourceVariantLabel(productId, vid, products, dictionaries);
  const colCount = 3 + (showDeliveryDateColumn ? 1 : 0) + (showVariantCols ? variantColumnIds.length : 0);
  const labelColSpan = showDeliveryDateColumn ? 3 : 2;

  const summaryRows: {
    label: string;
    total: number;
    byVariant: Record<string, number>;
    accent: string;
    warn?: boolean;
  }[] = [
    { label: '发出', total: dispatchTotal, byVariant: dispatchByVariant, accent: 'text-indigo-600' },
    { label: '收回', total: receiveTotal, byVariant: receiveByVariant, accent: 'text-amber-600' },
    {
      label: '剩余',
      total: remainingTotal,
      byVariant: remainingByVariant,
      accent: 'text-slate-700',
      warn: remainingTotal < 0,
    },
  ];

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50">
          <th className={HEAD_CELL}>日期</th>
          <th className={HEAD_CELL}>单据类型</th>
          {showDeliveryDateColumn ? <th className={HEAD_CELL}>交货日期</th> : null}
          <th className={`${HEAD_CELL} text-right`}>商品数量</th>
          {showVariantCols &&
            variantColumnIds.map(vid => (
              <th
                key={vid}
                className={`${HEAD_CELL} max-w-[7rem] truncate text-right`}
                title={variantLabel(vid)}
              >
                {variantLabel(vid)}
              </th>
            ))}
        </tr>
      </thead>
      <tbody>
        {docRows.length === 0 ? (
          <tr>
            <td className="px-4 py-10 text-center text-sm font-semibold text-slate-400" colSpan={colCount}>
              无匹配单据，请调整筛选条件
            </td>
          </tr>
        ) : (
          docRows.map((row, idx) => {
            const hasDispatch = row.typeLabel.includes('发出');
            const hasReceive = row.typeLabel.includes('收回');
            return (
              <tr key={`${row.docNo}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular-nums">{row.dateDisplay}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {hasDispatch && <DispatchBadge />}
                    {hasReceive && <ReceiveBadge />}
                  </span>
                </td>
                {showDeliveryDateColumn ? (
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular-nums">{row.deliveryDateDisplay}</td>
                ) : null}
                <td className="px-4 py-3 text-right font-black text-indigo-600 tabular-nums">{row.totalQty}</td>
                {showVariantCols &&
                  variantColumnIds.map(vid => {
                    const q = row.variantQty[vid];
                    return (
                      <td key={vid} className="px-4 py-3 text-right font-semibold text-slate-600 tabular-nums">
                        {q != null && q > 0 ? q : <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })}
              </tr>
            );
          })
        )}
      </tbody>
      <tfoot>
        {summaryRows.map((s, i) => (
          <tr
            key={s.label}
            className={`bg-slate-50/60 font-bold ${i === 0 ? 'border-t border-slate-200' : 'border-t border-slate-100'}`}
          >
            <td className={`px-4 py-3 text-left font-black whitespace-nowrap ${s.accent}`} colSpan={labelColSpan}>
              {s.label}
            </td>
            <td className={`px-4 py-3 text-right font-black tabular-nums ${s.warn ? 'text-rose-600' : 'text-slate-900'}`}>
              {s.total}
            </td>
            {showVariantCols &&
              variantColumnIds.map(vid => {
                const q = s.byVariant[vid] ?? 0;
                return (
                  <td
                    key={vid}
                    className={`px-4 py-3 text-right font-black tabular-nums ${q < 0 ? 'text-rose-600' : 'text-slate-800'}`}
                  >
                    {q !== 0 ? q : <span className="text-slate-300">—</span>}
                  </td>
                );
              })}
          </tr>
        ))}
      </tfoot>
    </table>
  );
};

export default React.memo(OutsourcePartnerFlowDetailTable);
