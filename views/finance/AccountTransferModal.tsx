import React, { useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { FinanceAccountType } from '../../types';
import { useAsyncSubmitLock } from '../../hooks/useAsyncSubmitLock';
import { formStandardControlClass } from '../../styles/uiDensity';

/** 编辑模式入参：转账组 id + 预填的转出/转入账户、金额、备注 */
export interface TransferEditTarget {
  transferGroupId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note: string;
}

interface AccountTransferModalProps {
  financeAccountTypes: FinanceAccountType[];
  onClose: () => void;
  onSuccess: () => void;
  /** 传入则进入编辑模式，调用 updateTransfer 成对更新 */
  editing?: TransferEditTarget | null;
}

/** 账户间转账（内部调拨）：选转出/转入账户 + 金额，后端事务内落/改两条流水 */
const AccountTransferModal: React.FC<AccountTransferModalProps> = ({
  financeAccountTypes,
  onClose,
  onSuccess,
  editing,
}) => {
  const isEdit = !!editing;
  const [fromAccountId, setFromAccountId] = useState(editing?.fromAccountId ?? '');
  const [toAccountId, setToAccountId] = useState(editing?.toAccountId ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [note, setNote] = useState(editing?.note ?? '');
  const lock = useAsyncSubmitLock();

  const submit = async () => {
    if (!fromAccountId || !toAccountId) { toast.warning('请选择转出与转入账户'); return; }
    if (fromAccountId === toAccountId) { toast.warning('转出与转入账户不能相同'); return; }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.warning('转账金额必须大于 0'); return; }
    await lock.run(async () => {
      try {
        if (isEdit && editing) {
          await api.finance.updateTransfer(editing.transferGroupId, {
            fromAccountId,
            toAccountId,
            amount: amt,
            note: note.trim() || undefined,
          });
          toast.success('转账已更新');
        } else {
          await api.finance.transfer({
            fromAccountId,
            toAccountId,
            amount: amt,
            note: note.trim() || undefined,
          });
          toast.success('转账成功');
        }
        onSuccess();
        onClose();
      } catch (err: any) { toast.error(err.message || (isEdit ? '更新失败' : '转账失败')); }
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <h2 className="text-lg font-bold text-slate-800">{isEdit ? '编辑账户转账' : '账户间转账'}</h2>
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
            {lock.busy ? '提交中…' : isEdit ? '保存修改' : '确认转账'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AccountTransferModal);
