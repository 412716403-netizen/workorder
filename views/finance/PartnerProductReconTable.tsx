import React from 'react';
import { Clock } from 'lucide-react';
import type { PartnerProductReconRow } from '../../utils/partnerReconProductLedger';
import { fmtDT } from '../../utils/formatTime';
import FlowListProductCell from '../../components/flow/FlowListProductCell';

interface PartnerProductReconTableProps {
  rows: PartnerProductReconRow[];
  emptyMessage?: string;
}

/** 与 FinanceOpsView 合作单位「按单据」表头一致 */
const thClass = 'px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest';

function formatQty(n: number | null): string {
  if (n == null) return '—';
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatUnitPrice(n: number | null): string {
  if (n == null) return '—';
  return `¥ ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}`;
}

const PartnerProductReconTable: React.FC<PartnerProductReconTableProps> = ({
  rows,
  emptyMessage = '该条件下暂无对账数据',
}) => {
  const colSpan = 9;

  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-slate-50/50">
          <th className={thClass}>时间</th>
          <th className={thClass}>单据类型</th>
          <th className={thClass}>单据编号</th>
          <th className={thClass}>产品</th>
          <th className={`${thClass} text-right`}>数量</th>
          <th className={`${thClass} text-right`}>单价</th>
          <th className={`${thClass} text-right`}>应收增加</th>
          <th className={`${thClass} text-right`}>应收减少</th>
          <th className={`${thClass} text-right`}>应收余额</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={colSpan} className="px-8 py-20 text-center text-slate-300 italic text-sm">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row, idx) => (
            <tr key={`line-${row.docNo}-${row.timestamp}-${idx}`} className="hover:bg-slate-50/30 transition-colors">
              <td className="px-8 py-4 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  <span className="text-xs font-bold text-slate-600">{row.timestamp ? fmtDT(row.timestamp) : '—'}</span>
                </div>
              </td>
              <td className="px-8 py-4">
                <span className="text-xs font-bold text-slate-600">{row.docType}</span>
              </td>
              <td className="px-8 py-4">
                <span className="text-xs font-bold text-slate-800">{row.docNo}</span>
              </td>
              <td className="px-8 py-4 text-sm">
                {row.product ? (
                  <FlowListProductCell product={row.product} name={row.productName} />
                ) : (
                  <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                )}
              </td>
              <td className="px-8 py-4 text-right">
                <span className="text-sm font-bold text-slate-800">{formatQty(row.quantity)}</span>
              </td>
              <td className="px-8 py-4 text-right">
                <span className="text-sm font-black text-slate-800">{formatUnitPrice(row.unitPrice)}</span>
              </td>
              <td className="px-8 py-4 text-right">
                <span className="text-sm font-black text-slate-800">
                  {row.receivableInc > 0 ? `¥ ${row.receivableInc.toLocaleString()}` : '—'}
                </span>
              </td>
              <td className="px-8 py-4 text-right">
                <span className="text-sm font-black text-emerald-600">
                  {row.receivableDec > 0 ? `¥ ${row.receivableDec.toLocaleString()}` : '—'}
                </span>
              </td>
              <td className="px-8 py-4 text-right">
                <span className="text-sm font-black text-indigo-600">¥ {row.balance.toLocaleString()}</span>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
};

export default PartnerProductReconTable;
