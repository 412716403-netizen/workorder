import React, { useState } from 'react';
import { useAsyncSubmitLock } from '../../hooks/useAsyncSubmitLock';
import {
  Wallet,
  ArrowRight,
  Settings,
  LayoutGrid,
  ToggleLeft,
  ToggleRight,
  ClipboardList,
  Building2,
  CreditCard,
  UserPlus,
  Package,
  ListPlus,
  Trash2,
} from 'lucide-react';
import { FinanceCategory, FinanceCategoryKind } from '../../types';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { ExtFieldLabelInput } from './shared';
import { ReportCustomFieldsConfigTable } from '../../components/form-config/CustomFieldsEditorTable';
import { formStandardControlClass } from '../../styles/uiDensity';
import { hasSettingsNameConflict } from '../../utils/settingsNameUnique';
import { useSettingsUsedIds } from '../../hooks/useSettingsUsedIds';

interface FinanceCategoriesTabProps {
  financeCategories: FinanceCategory[];
  onRefreshFinanceCategories: () => Promise<void>;
  canCreate: boolean;
  canDelete: boolean;
}

const FinanceCategoriesTab: React.FC<FinanceCategoriesTabProps> = ({
  financeCategories,
  onRefreshFinanceCategories,
  canCreate,
  canDelete,
}) => {
  const [newFinanceCatName, setNewFinanceCatName] = useState('');
  const [editingFinanceCatId, setEditingFinanceCatId] = useState<string | null>(null);
  const [financeCatNameDraft, setFinanceCatNameDraft] = useState('');
  const addLock = useAsyncSubmitLock();
  const usedIds = useSettingsUsedIds(api.settings.financeCategories.usage);

  const addFinanceCategory = async () => {
    const trimmed = newFinanceCatName.trim();
    if (!trimmed) return;
    if (hasSettingsNameConflict(financeCategories, trimmed)) { toast.warning(`分类"${trimmed}"已存在`); return; }
    await addLock.run(async () => {
      try {
        const created = await api.settings.financeCategories.create({
          kind: 'RECEIPT', name: trimmed, linkOrder: false,
          linkPartner: false, selectPaymentAccount: false, linkWorker: false,
          linkProduct: false, customFields: []
        }) as FinanceCategory;
        setNewFinanceCatName('');
        setEditingFinanceCatId(created.id);
        setFinanceCatNameDraft((created as FinanceCategory).name || trimmed);
        await onRefreshFinanceCategories();
      } catch (err: any) { toast.error(err.message || '操作失败'); }
    });
  };

  const removeFinanceCategory = async (id: string) => {
    try {
      await api.settings.financeCategories.delete(id);
      if (editingFinanceCatId === id) setEditingFinanceCatId(null);
      await onRefreshFinanceCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const updateFinanceCategoryConfig = async (id: string, updates: Partial<FinanceCategory>) => {
    try {
      await api.settings.financeCategories.update(id, updates);
      await onRefreshFinanceCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
            <Wallet className="w-4 h-4 text-indigo-600" />
            收付款类型库
          </h2>
          <div className="space-y-3 mb-8">
            {financeCategories.map(cat => (
              <div
                key={cat.id}
                onClick={() => {
                  setEditingFinanceCatId(cat.id);
                  setFinanceCatNameDraft(cat.name);
                }}
                className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all group ${
                  editingFinanceCatId === cat.id
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                    : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className={`text-sm font-bold ${editingFinanceCatId === cat.id ? 'text-indigo-900' : 'text-slate-600'}`}>{cat.name}</span>
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-tight">{cat.kind === 'RECEIPT' ? '收款单' : '付款单'}</span>
                </div>
                <ArrowRight className={`w-4 h-4 transition-all ${editingFinanceCatId === cat.id ? 'text-indigo-600 translate-x-1' : 'text-slate-200'}`} />
              </div>
            ))}
          </div>
          {canCreate && (
          <div className="pt-6 border-t border-slate-50">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速新增收付款类型</h3>
            <div className="space-y-4">
              <input type="text" placeholder="分类名称" value={newFinanceCatName} onChange={e => setNewFinanceCatName(e.target.value)} className={formStandardControlClass} />
              <button type="button" onClick={() => void addFinanceCategory()} disabled={!newFinanceCatName.trim() || addLock.busy} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed">{addLock.busy ? '提交中…' : '确认添加'}</button>
            </div>
          </div>
          )}
        </div>
      </div>
      <div className="lg:col-span-8">
        {editingFinanceCatId ? (
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
            {financeCategories.filter(c => c.id === editingFinanceCatId).map(cat => (
              <div key={cat.id}>
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <h2 className="font-black text-slate-800 text-lg">编辑收付款类型：{financeCatNameDraft || cat.name}</h2>
                  {canDelete && (() => {
                    const inUse = usedIds.has(cat.id);
                    return (
                      <button
                        onClick={() => {
                          if (inUse) { toast.warning(`收付款类型"${cat.name}"已被财务记录调用，无法删除`); return; }
                          void removeFinanceCategory(cat.id);
                        }}
                        disabled={inUse}
                        title={inUse ? '该收付款类型已被财务记录调用，无法删除' : '删除收付款类型'}
                        className={`p-2 rounded-xl transition-all ${inUse ? 'text-slate-300 cursor-not-allowed' : 'text-rose-500 hover:bg-rose-50'}`}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    );
                  })()}
                </div>
                <div className="p-8 space-y-12">
                  <div className="space-y-4">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Settings className="w-4 h-4" /> 1. 基础信息</h3>
                    <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分类</label>
                        <select value={cat.kind} onChange={e => updateFinanceCategoryConfig(cat.id, { kind: e.target.value as FinanceCategoryKind })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                          <option value="RECEIPT">收款单</option>
                          <option value="PAYMENT">付款单</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分类名称</label>
                        <input
                          type="text"
                          value={financeCatNameDraft}
                          onChange={(e) => setFinanceCatNameDraft(e.target.value)}
                          onBlur={async () => {
                            const cur = financeCategories.find((x) => x.id === cat.id);
                            if (!cur) return;
                            const next = financeCatNameDraft.trim();
                            if (next === cur.name) return;
                            if (!next) {
                              toast.error('分类名称不能为空');
                              setFinanceCatNameDraft(cur.name);
                              return;
                            }
                            if (hasSettingsNameConflict(financeCategories, next, cat.id)) {
                              toast.error(`分类"${next}"已存在`);
                              setFinanceCatNameDraft(cur.name);
                              return;
                            }
                            try {
                              await api.settings.financeCategories.update(cat.id, { name: next });
                              await onRefreshFinanceCategories();
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : '保存失败');
                              setFinanceCatNameDraft(cur.name);
                            }
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><LayoutGrid className="w-4 h-4" /> 2. 关联与选项开关</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { label: '是否关联工单', key: 'linkOrder', desc: '登记时可选关联工单。', icon: ClipboardList },
                        { label: '是否关联合作单位', key: 'linkPartner', desc: '登记时选择或填写合作单位/客户/供应商。', icon: Building2 },
                        { label: '是否选择收支账户', key: 'selectPaymentAccount', desc: '登记时选择收支账户。', icon: CreditCard },
                        { label: '是否关联工人', key: 'linkWorker', desc: '登记时可选关联工人（如工资、补贴）。', icon: UserPlus },
                        { label: '是否关联产品', key: 'linkProduct', desc: '登记时可选关联产品。', icon: Package },
                      ].map(toggle => (
                        <div key={toggle.key} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <toggle.icon className="w-4 h-4 text-indigo-400" />
                              <span className="text-sm font-bold text-slate-800">{toggle.label}</span>
                            </div>
                            <button onClick={() => updateFinanceCategoryConfig(cat.id, { [toggle.key]: !(cat as any)[toggle.key] })}>
                              {(cat as any)[toggle.key] ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 font-medium">{toggle.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <ReportCustomFieldsConfigTable
                      showRequiredColumn
                      fields={cat.customFields}
                      onChange={next => updateFinanceCategoryConfig(cat.id, { customFields: next })}
                      title={
                        <span className="flex items-center gap-2">
                          <ListPlus className="w-4 h-4" /> 3. 自定义内容
                        </span>
                      }
                      addButtonLabel="新增扩展项"
                      idPrefix={`fcf-${cat.id}-`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-[32px] border border-dashed border-slate-200 p-20 text-center opacity-60">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4"><Wallet className="w-8 h-8 text-slate-300" /></div>
            <h3 className="text-lg font-bold text-slate-400">请选择左侧收付款类型进行配置</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(FinanceCategoriesTab);
