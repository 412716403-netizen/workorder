
import React, { useState } from 'react';
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Scale, 
  Coins
} from 'lucide-react';
import { ProductionOrder, FinanceRecord, FinanceOpType } from '../types';
import FinanceOpsView from './FinanceOpsView';

interface FinanceViewProps {
  orders: ProductionOrder[];
  records: FinanceRecord[];
  onAddRecord: (record: FinanceRecord) => void;
}

const FinanceView: React.FC<FinanceViewProps> = ({ orders, records, onAddRecord }) => {
  const [activeTab, setActiveTab] = useState<FinanceOpType>('RECEIPT');

  // 严格排序：收款单、付款单、财务对账、工人工资
  const tabs = [
    { id: 'RECEIPT', label: '收款单', icon: ArrowDownCircle, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '客户款项回收记录' },
    { id: 'PAYMENT', label: '付款单', icon: ArrowUpCircle, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '供应商及费用支出记录' },
    { id: 'RECONCILIATION', label: '财务对账', icon: Scale, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '往来款项核对与差异分析' },
    { id: 'SETTLEMENT', label: '工人工资', icon: Coins, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '核算并登记工人的计件工资发放' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* 顶部统一导航栏 */}
      <div className="flex bg-white p-1.5 rounded-[24px] border border-slate-200 shadow-sm w-full lg:w-fit overflow-x-auto no-scrollbar">
        <div className="flex gap-1 min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as FinanceOpType)}
              className={`flex items-center gap-3 px-6 py-3 rounded-[18px] text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id 
                ? `${tab.bg} ${tab.color} shadow-sm` 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? tab.color : 'text-slate-300'}`} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 统一视图容器 */}
      <div className="animate-in slide-in-from-bottom-4 duration-500 min-h-[600px]">
        <FinanceOpsView 
          type={activeTab}
          orders={orders}
          records={records.filter(r => r.type === activeTab)}
          onAddRecord={onAddRecord}
        />
      </div>
    </div>
  );
};

export default FinanceView;
