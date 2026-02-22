
import React, { useState } from 'react';
import { Plus, X, Clock, DollarSign } from 'lucide-react';
import { FinanceRecord, FinanceOpType, ProductionOrder } from '../types';

interface FinanceOpsViewProps {
  type: FinanceOpType;
  orders: ProductionOrder[];
  records: FinanceRecord[];
  onAddRecord: (record: FinanceRecord) => void;
}

const FinanceOpsView: React.FC<FinanceOpsViewProps> = ({ type, orders, records, onAddRecord }) => {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    amount: 0,
    relatedId: '',
    partner: '',
    note: ''
  });

  const bizConfig: Record<FinanceOpType, any> = {
    'RECEIPT': { label: '收款单', sub: '登记从客户处收到的款项', partnerLabel: '缴款客户' },
    'PAYMENT': { label: '付款单', sub: '登记支付给供应商或员工的款项', partnerLabel: '收款单位/个人' },
    'RECONCILIATION': { label: '财务对账', sub: '记录往来对账确认结果', partnerLabel: '对账单位' },
    'SETTLEMENT': { label: '工资单', sub: '登记工人的生产计件工资结算记录', partnerLabel: '领薪工人' },
  };

  const current = bizConfig[type];

  const handleSave = () => {
    const newRec: FinanceRecord = {
      id: `fin-${Date.now()}`,
      type: type,
      timestamp: new Date().toLocaleString(),
      amount: form.amount,
      relatedId: form.relatedId,
      partner: form.partner,
      note: form.note,
      operator: '财务办-陈会计',
      status: 'COMPLETED'
    };
    onAddRecord(newRec);
    setShowModal(false);
    setForm({ amount: 0, relatedId: '', partner: '', note: '' });
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{current.label}</h1>
          <p className="text-slate-500 mt-1 italic text-sm">{current.sub}</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95"
        >
          <Plus className="w-4 h-4" /> 新增{current.label}
        </button>
      </div>

      {/* 数据列表 */}
      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">单据编号 / {current.partnerLabel}</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">业务金额</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">经办人</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">状态/备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center text-slate-300 italic text-sm">暂无该模块财务记录</td>
                </tr>
              ) : (
                records.map(rec => (
                  <tr key={rec.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-8 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-xs font-bold text-slate-600">{rec.timestamp}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">{rec.partner}</span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-tighter">REF: {rec.relatedId || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <span className={`text-sm font-black ${type === 'RECEIPT' ? 'text-emerald-600' : 'text-slate-900'}`}>
                        ¥ {rec.amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2">
                         <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">C</div>
                         <span className="text-xs font-bold text-slate-700">{rec.operator}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-right">
                       <span className="px-2 py-0.5 bg-emerald-50 text-emerald-500 text-[10px] font-bold rounded-lg mr-2">已结清</span>
                       <span className="text-[10px] text-slate-400 italic max-w-[120px] truncate inline-block align-middle">{rec.note || '-'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新增模态框 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-indigo-50/30">
              <h2 className="text-xl font-bold text-slate-800">登记{current.label}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-8 space-y-5">
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">关联工单 / 计件参考</label>
                  <select 
                    value={form.relatedId} 
                    onChange={e => setForm({...form, relatedId: e.target.value})} 
                    className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">点击选择关联工单...</option>
                    {orders.map(o => <option key={o.id} value={o.orderNumber}>{o.orderNumber} - {o.productName}</option>)}
                    <option value="General-Wages">通用生产补贴/奖金</option>
                  </select>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">结算金额 (CNY)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input type="number" value={form.amount} onChange={e => setForm({...form, amount: parseFloat(e.target.value)||0})} className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{current.partnerLabel}</label>
                    <input type="text" placeholder={`输入${current.partnerLabel}名称`} value={form.partner} onChange={e => setForm({...form, partner: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">发放说明</label>
                  <textarea rows={3} placeholder="输入薪资期间、件数核对或备注..." value={form.note} onChange={e => setForm({...form, note: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
               </div>
            </div>
            <div className="p-8 bg-slate-50/50 border-t border-slate-50">
               <button 
                  onClick={handleSave}
                  disabled={form.amount <= 0 || !form.partner}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-95"
               >
                 保存工资单据
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinanceOpsView;
