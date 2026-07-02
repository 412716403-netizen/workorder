import React from 'react';
import { FileText } from 'lucide-react';

export interface OutsourcePartnerStatRow {
  partner: string;
  nodeId: string;
  nodeName: string;
  dispatched: number;
  received: number;
  pending: number;
}

export interface OutsourcePartnerStatCardProps {
  row: OutsourcePartnerStatRow;
  onOpenFlow: () => void;
  flowButtonTitle: string;
}

/** 外协管理列表 / 工单详情外协区块共用的工序+工厂小卡（尺寸与样式单一事实源） */
const OutsourcePartnerStatCard: React.FC<OutsourcePartnerStatCardProps> = ({
  row,
  onOpenFlow,
  flowButtonTitle,
}) => (
  <div className="flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border transition-colors border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200">
    <div className="mb-1 w-full text-center leading-tight">
      <div className="text-[10px] font-bold text-emerald-600 truncate" title={row.nodeName}>
        {row.nodeName}
      </div>
      <div className="text-[10px] font-bold text-slate-600 truncate" title={row.partner}>
        {row.partner}
      </div>
    </div>
    <div
      className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${row.pending > 0 ? 'border-indigo-300' : 'border-emerald-400'}`}
      title="已收回数量"
    >
      <span className="text-base font-black text-slate-900 leading-none">{row.received}</span>
    </div>
    <div className="flex items-center justify-center gap-1.5 leading-tight">
      <span className="text-[10px] font-bold text-slate-500" title="发出 / 剩余">
        {row.dispatched} / <span className={row.pending < 0 ? 'text-rose-500' : ''}>{row.pending}</span>
      </span>
      <button
        type="button"
        onClick={onOpenFlow}
        className="p-0.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
        title={flowButtonTitle}
      >
        <FileText className="w-3.5 h-3.5 shrink-0" />
      </button>
    </div>
  </div>
);

export default React.memo(OutsourcePartnerStatCard);
