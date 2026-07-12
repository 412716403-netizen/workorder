import React from 'react';
import { Layers } from 'lucide-react';
import type { OrderMilestoneStripItem } from '../../utils/orderMilestoneProgressStrip';

export interface OrderMilestoneProgressStripProps {
  items: OrderMilestoneStripItem[];
  /** 为 false 时不展示区块标题（嵌在其它区块下时用） */
  showTitle?: boolean;
  className?: string;
}

/** 工单中心列表同款工序进度小卡（只读） */
const OrderMilestoneProgressStrip: React.FC<OrderMilestoneProgressStripProps> = ({
  items,
  showTitle = true,
  className = '',
}) => {
  if (items.length === 0) return null;

  return (
    <div className={className}>
      {showTitle ? (
        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2">
          <Layers className="w-3.5 h-3.5" /> 工序进度
        </h4>
      ) : null}
      <div className="overflow-x-auto overflow-y-hidden scroll-smooth custom-scrollbar -mx-0.5">
        <div className="flex items-stretch gap-1.5 flex-nowrap py-0.5 w-max px-0.5">
          {items.map(item => (
            <div
              key={item.milestoneId}
              title={item.tooltip}
              className={`flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border transition-colors ${
                item.completed > 0 || item.availableQty > 0
                  ? 'bg-slate-50 border-slate-100'
                  : 'bg-slate-50/60 border-slate-100 opacity-60'
              }`}
            >
              <span className="text-[10px] font-bold text-emerald-600 mb-1 leading-tight truncate w-full text-center">
                {item.name}
              </span>
              <div
                className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${
                  item.isCompleted ? 'border-emerald-400' : 'border-indigo-300'
                }`}
              >
                <span className="text-base font-black text-slate-900 leading-none tabular-nums">
                  {item.completed}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 leading-tight tabular-nums">
                <span>
                  {item.availableQty} /{' '}
                  <span className={item.remainingDisplay < 0 ? 'text-rose-500' : ''}>
                    {item.remainingDisplay}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default React.memo(OrderMilestoneProgressStrip);
