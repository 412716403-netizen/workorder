import React, { useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { FinanceAccountType } from '../../types';
import { useAsyncSubmitLock } from '../../hooks/useAsyncSubmitLock';
import { formStandardControlClass } from '../../styles/uiDensity';

interface AccountTransferModalProps {
  financeAccountTypes: FinanceAccountType[];
  onClose: () => void;
  onSuccess: () => void;
}

/** 账户间转账（内部调拨）：选转出/转入账户 + 金额，后端事务内落两条流水 */
const AccountTransferModal: React.FC<AccountTransferModalProps> = ({
  financeAccountTypes,
  onClose,
  onSuccess,
}) => {
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const lock = useAsyncSubmitLock();

  const submit = async () => {
    if (!fromAccountId || !toAccountId) { toast.warning('请选择转出与转入账户'); return; }
    if (fromAccountId === toAccountId) { toast.warning('转出与转入账户不能相同'); return; }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.warning('转账金额必须大于 0'); return; }
    await lock.run(async () => {
      try {
        await api.finance.transfer({
          fromAccountId,
          toAccountId,
          amount: amt,
          note: note.trim() || undefined,
        });
        toast.success('转账成功');
        onSuccess();
        onClose();
      } catch (err: any) { toast.error(err.message || '转账失败'); }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <h2 className="text-lg font-bold text-slate-800">账户间转账</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">转出账户</label>
              <select value={fromAccountId} onChange={e => setFromAccountId(e.target.value)} className={`${formStandardControlClass} w-full cursor-pointer`}>
                <option value="">请选择...</option>
                {financeAccountTypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-300 mb-2.5 shrink-0" />
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">转入账户</label>
              <select value={toAccountId} onChange={e => setToAccountId(e.target.value)} className={`${formStandardControlClass} w-full cursor-pointer`}>
                <option value="">请选择...</option>
                {financeAccountTypes.filter(a => a.id !== fromAccountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">转账金额</label>
            <input type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className={`${formStandardControlClass} w-full`} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">备注（可选）</label>
            <input type="text" placeholder="如：现金存入银行" value={note} onChange={e => setNote(e.target.value)} className={`${formStandardControlClass} w-full`} />
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 px-5 py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all">
            取消
          </button>
          <button type="button" onClick={() => void submit()} disabled={lock.busy} className="flex-1 px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {lock.busy ? '提交中…' : '确认转账'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AccountTransferModal);
