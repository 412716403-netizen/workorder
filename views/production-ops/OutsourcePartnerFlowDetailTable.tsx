import React from 'react';
import type { AppDictionaries, Product } from '../../types';
import { formatOutsourceVariantLabel } from '../../utils/buildOutsourceFlowPrintContext';
import type { PartnerFlowDocRow } from '../../utils/outsourcePartnerFlowDetail';

export interface OutsourcePartnerFlowDetailTableProps {
  productId: string;
  products: Product[];
  dictionaries?: AppDictionaries;
  /** 本弹窗维度是否曾有任何往来单（用于区分「无数据」与「筛选无匹配」） */
  hasAnyDoc: boolean;
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

function rowTint(typeLabel: string): string {
  if (typeLabel.includes('发出') && typeLabel.includes('收回')) return 'bg-slate-50/80';
  if (typeLabel.includes('收回')) return 'bg-amber-50/35';
  if (typeLabel.includes('发出')) return 'bg-sky-50/35';
  return 'bg-white';
}

const OutsourcePartnerFlowDetailTable: React.FC<OutsourcePartnerFlowDetailTableProps> = ({
  productId,
  products,
  dictionaries,
  hasAnyDoc,
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
  if (!hasAnyDoc) {
    return <p className="text-sm font-medium text-slate-500 text-center py-12">暂无往来数量明细</p>;
  }

  const variantLabel = (vid: string) => formatOutsourceVariantLabel(productId, vid, products, dictionaries);
  const colCount = 3 + (showDeliveryDateColumn ? 1 : 0) + (showVariantCols ? variantColumnIds.length : 0);
  const labelColSpan = showDeliveryDateColumn ? 3 : 2;

  return (
    <div className="w-full max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[280px] border-collapse text-center text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">日期</th>
            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">单据类型</th>
            {showDeliveryDateColumn ? (
              <th className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">交货日期</th>
            ) : null}
            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">商品数量</th>
            {showVariantCols &&
              variantColumnIds.map(vid => (
                <th
                  key={vid}
                  className="px-2 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 max-w-[7rem] truncate"
                  title={variantLabel(vid)}
                >
                  {variantLabel(vid)}
                </th>
              ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {docRows.length === 0 ? (
            <tr>
              <td
                className="px-3 py-8 text-center text-sm font-bold text-slate-500"
                colSpan={colCount}
              >
                无匹配单据，请调整筛选条件
              </td>
            </tr>
          ) : (
            docRows.map((row, idx) => (
              <tr key={`${row.docNo}-${idx}`} className={rowTint(row.typeLabel)}>
                <td className="px-3 py-2.5 font-bold text-slate-600 whitespace-nowrap tabular-nums">{row.dateDisplay}</td>
                <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">{row.typeLabel}</td>
                {showDeliveryDateColumn ? (
                  <td className="px-3 py-2.5 font-bold text-slate-600 whitespace-nowrap tabular-nums">
                    {row.deliveryDateDisplay}
                  </td>
                ) : null}
                <td className="px-3 py-2.5 font-bold text-slate-800 tabular-nums">{row.totalQty} 件</td>
                {showVariantCols &&
                  variantColumnIds.map(vid => {
                    const q = row.variantQty[vid];
                    return (
                      <td key={vid} className="px-2 py-2.5 font-bold text-slate-700 tabular-nums">
                        {q != null && q > 0 ? `${q} 件` : '—'}
                      </td>
                    );
                  })}
              </tr>
            ))
          )}
          <tr className="border-t-2 border-slate-200 bg-sky-50/90">
            <td className="px-3 py-3 font-black text-indigo-800 whitespace-nowrap text-left" colSpan={labelColSpan}>
              外协发出
            </td>
            <td className="px-3 py-3 font-black text-indigo-900 tabular-nums">{dispatchTotal} 件</td>
            {showVariantCols &&
              variantColumnIds.map(vid => {
                const q = dispatchByVariant[vid] ?? 0;
                return (
                  <td key={vid} className="px-2 py-3 font-black text-indigo-900 tabular-nums">
                    {q > 0 ? `${q} 件` : '—'}
                  </td>
                );
              })}
          </tr>
          <tr className="border-t border-slate-200 bg-amber-50/80">
            <td className="px-3 py-3 font-black text-amber-900 whitespace-nowrap text-left" colSpan={labelColSpan}>
              外协收回
            </td>
            <td className="px-3 py-3 font-black text-amber-950 tabular-nums">{receiveTotal} 件</td>
            {showVariantCols &&
              variantColumnIds.map(vid => {
                const q = receiveByVariant[vid] ?? 0;
                return (
                  <td key={vid} className="px-2 py-3 font-black text-amber-950 tabular-nums">
                    {q > 0 ? `${q} 件` : '—'}
                  </td>
                );
              })}
          </tr>
          <tr className="border-t border-slate-200 bg-slate-100/90">
            <td className="px-3 py-3 font-black text-slate-800 whitespace-nowrap text-left" colSpan={labelColSpan}>
              剩余数量
            </td>
            <td className="px-3 py-3 font-black text-slate-900 tabular-nums">{remainingTotal} 件</td>
            {showVariantCols &&
              variantColumnIds.map(vid => {
                const q = remainingByVariant[vid] ?? 0;
                return (
                  <td key={vid} className="px-2 py-3 font-black text-slate-900 tabular-nums">
                    {q > 0 ? `${q} 件` : '—'}
                  </td>
                );
              })}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default React.memo(OutsourcePartnerFlowDetailTable);
