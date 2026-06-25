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
import { formStandardControlClass } from '../../styles/uiDensity';
import { hasSettingsNameConflict } from '../../utils/settingsNameUnique';

interface AccountTypesModalProps {
  financeAccountTypes: FinanceAccountType[];
  onRefreshFinanceAccountTypes: () => Promise<void>;
  onClose: () => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/** 把 ISO/Date 字符串裁成 <input type="date"> 需要的 yyyy-MM-dd */
function toDateInputValue(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
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
  const [newInitialBalance, setNewInitialBalance] = useState('');
  const [newOpeningDate, setNewOpeningDate] = useState('');
  const [newAccountKind, setNewAccountKind] = useState('');
  const [editingAccountTypeId, setEditingAccountTypeId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingInitialBalance, setEditingInitialBalance] = useState('');
  const [editingOpeningDate, setEditingOpeningDate] = useState('');
  const [editingAccountKind, setEditingAccountKind] = useState('');
  const addLock = useAsyncSubmitLock();

  const addFinanceAccountType = async () => {
    const trimmed = newAccountTypeName.trim();
    if (!trimmed) return;
    if (hasSettingsNameConflict(financeAccountTypes, trimmed)) { toast.warning(`账户类型"${trimmed}"已存在`); return; }
    await addLock.run(async () => {
      try {
        await api.settings.financeAccountTypes.create({
          name: trimmed,
          initialBalance: newInitialBalance.trim() === '' ? 0 : Number(newInitialBalance),
          openingDate: newOpeningDate || null,
          accountKind: newAccountKind.trim() || null,
        });
        setNewAccountTypeName('');
        setNewInitialBalance('');
        setNewOpeningDate('');
        setNewAccountKind('');
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

  const beginEdit = (acc: FinanceAccountType) => {
    setEditingAccountTypeId(acc.id);
    setEditingName(acc.name);
    setEditingInitialBalance(acc.initialBalance != null ? String(acc.initialBalance) : '');
    setEditingOpeningDate(toDateInputValue(acc.openingDate));
    setEditingAccountKind(acc.accountKind ?? '');
  };

  const saveEdit = async (acc: FinanceAccountType) => {
    const next = editingName.trim();
    if (!next) { toast.error('账户类型名称不能为空'); return; }
    if (hasSettingsNameConflict(financeAccountTypes, next, acc.id)) {
      toast.error(`账户类型"${next}"已存在`);
      return;
    }
    try {
      await api.settings.financeAccountTypes.update(acc.id, {
        name: next,
        initialBalance: editingInitialBalance.trim() === '' ? 0 : Number(editingInitialBalance),
        openingDate: editingOpeningDate || null,
        accountKind: editingAccountKind.trim() || null,
      });
      setEditingAccountTypeId(null);
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
          <div className="space-y-3 mb-6">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">新增账户类型</label>
            <input
              type="text"
              placeholder="名称，如：现金、银行存款、微信、支付宝"
              value={newAccountTypeName}
              onChange={e => setNewAccountTypeName(e.target.value)}
              className={`${formStandardControlClass} w-full`}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 ml-1">期初余额</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newInitialBalance}
                  onChange={e => setNewInitialBalance(e.target.value)}
                  className={`${formStandardControlClass} w-full`}
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 ml-1">期初日期</span>
                <input
                  type="date"
                  value={newOpeningDate}
                  onChange={e => setNewOpeningDate(e.target.value)}
                  className={`${formStandardControlClass} w-full`}
                />
              </div>
            </div>
            <input
              type="text"
              placeholder="账户分类（可选），如 现金 / 银行 / 在线钱包"
              value={newAccountKind}
              onChange={e => setNewAccountKind(e.target.value)}
              className={`${formStandardControlClass} w-full`}
            />
            <button type="button" onClick={() => void addFinanceAccountType()} disabled={!newAccountTypeName.trim() || addLock.busy} className="w-full px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {addLock.busy ? '提交中…' : '确认添加'}
            </button>
          </div>
          )}
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">已配置类型</p>
            {financeAccountTypes.length === 0 ? (
              <p className="py-8 text-center text-slate-400 text-sm">暂无收支账户类型，请在上方新增</p>
            ) : (
              financeAccountTypes.map(acc => (
                <div key={acc.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-200 transition-all">
                  {editingAccountTypeId === acc.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        className={`${formStandardControlClass} w-full`}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 ml-1">期初余额</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editingInitialBalance}
                            onChange={e => setEditingInitialBalance(e.target.value)}
                            className={`${formStandardControlClass} w-full`}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 ml-1">期初日期</span>
                          <input
                            type="date"
                            value={editingOpeningDate}
                            onChange={e => setEditingOpeningDate(e.target.value)}
                            className={`${formStandardControlClass} w-full`}
                          />
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="账户分类（可选）"
                        value={editingAccountKind}
                        onChange={e => setEditingAccountKind(e.target.value)}
                        className={`${formStandardControlClass} w-full`}
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void saveEdit(acc)} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700">
                          保存
                        </button>
                        <button type="button" onClick={() => setEditingAccountTypeId(null)} className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200">
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-800 truncate">{acc.name}</span>
                          {acc.accountKind && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">{acc.accountKind}</span>}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          期初 {Number(acc.initialBalance ?? 0).toFixed(2)}
                          {acc.openingDate ? ` · ${toDateInputValue(acc.openingDate)}` : ''}
                        </p>
                      </div>
                      {canEdit && (
                      <button type="button" onClick={() => beginEdit(acc)} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all shrink-0" title="编辑">
                        <FileText className="w-4 h-4" />
                      </button>
                      )}
                      {canDelete && (
                      <button type="button" onClick={() => { removeFinanceAccountType(acc.id); }} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all shrink-0" title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      )}
                    </div>
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
