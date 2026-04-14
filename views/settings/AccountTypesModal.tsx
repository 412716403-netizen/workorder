import React, { useState } from 'react';
import { useAsyncSubmitLock } from '../../hooks/useAsyncSubmitLock';
import {
  X,
  FileText,
  Trash2,
} from 'lucide-react';
import { FinanceAccountType } from '../../types';
import { toast } from 'sonner';
import * as api from '../../services/api';

interface AccountTypesModalProps {
  financeAccountTypes: FinanceAccountType[];
  onRefreshFinanceAccountTypes: () => Promise<void>;
  onClose: () => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const AccountTypesModal: React.FC<AccountTypesModalProps> = ({
  financeAccountTypes,
  onRefreshFinanceAccountTypes,
  onClose,
  canCreate,
  canEdit,
  canDelete,
}) => {
  const [newAccountTypeName, setNewAccountTypeName] = useState('');
  const [editingAccountTypeId, setEditingAccountTypeId] = useState<string | null>(null);
  const [editingAccountTypeName, setEditingAccountTypeName] = useState('');
  const addLock = useAsyncSubmitLock();

  const addFinanceAccountType = async () => {
    if (!newAccountTypeName.trim()) return;
    await addLock.run(async () => {
      try {
        await api.settings.financeAccountTypes.create({ name: newAccountTypeName.trim() });
        setNewAccountTypeName('');
        await onRefreshFinanceAccountTypes();
      } catch (err: any) { toast.error(err.message || '操作失败'); }
    });
  };

  const removeFinanceAccountType = async (id: string) => {
    try {
      await api.settings.financeAccountTypes.delete(id);
      if (editingAccountTypeId === id) setEditingAccountTypeId(null);
      await onRefreshFinanceAccountTypes();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const updateFinanceAccountTypeConfig = async (id: string, updates: Partial<FinanceAccountType>) => {
    try {
      await api.settings.financeAccountTypes.update(id, updates);
      await onRefreshFinanceAccountTypes();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <h2 className="text-lg font-bold text-slate-800">收支账户类型</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {canCreate && (
          <div className="space-y-4 mb-6">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">新增账户类型</label>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="如：现金、银行存款、微信、支付宝"
                value={newAccountTypeName}
                onChange={e => setNewAccountTypeName(e.target.value)}
                className="flex-1 bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button type="button" onClick={() => void addFinanceAccountType()} disabled={!newAccountTypeName.trim() || addLock.busy} className="px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0">
                {addLock.busy ? '提交中…' : '确认添加'}
              </button>
            </div>
          </div>
          )}
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">已配置类型</p>
            {financeAccountTypes.length === 0 ? (
              <p className="py-8 text-center text-slate-400 text-sm">暂无收支账户类型，请在上方新增</p>
            ) : (
              financeAccountTypes.map(acc => (
                <div key={acc.id} className="flex items-center gap-3 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-200 transition-all">
                  {editingAccountTypeId === acc.id ? (
                    <>
                      <input
                        type="text"
                        value={editingAccountTypeName}
                        onChange={e => setEditingAccountTypeName(e.target.value)}
                        className="flex-1 bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button type="button" onClick={() => { updateFinanceAccountTypeConfig(acc.id, { name: editingAccountTypeName.trim() }); setEditingAccountTypeId(null); }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700">
                        保存
                      </button>
                      <button type="button" onClick={() => setEditingAccountTypeId(null)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200">
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-bold text-slate-800">{acc.name}</span>
                      {canEdit && (
                      <button type="button" onClick={() => { setEditingAccountTypeId(acc.id); setEditingAccountTypeName(acc.name); }} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="编辑">
                        <FileText className="w-4 h-4" />
                      </button>
                      )}
                      {canDelete && (
                      <button type="button" onClick={() => { removeFinanceAccountType(acc.id); }} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all" title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AccountTypesModal);
