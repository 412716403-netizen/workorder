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
  PlusSquare,
  Trash2,
} from 'lucide-react';
import { FinanceCategory, FinanceCategoryKind, ReportFieldDefinition, FieldType } from '../../types';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { ExtFieldLabelInput } from './shared';

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

  const addFinanceCategory = async () => {
    if (!newFinanceCatName.trim()) return;
    await addLock.run(async () => {
      try {
        const created = await api.settings.financeCategories.create({
          kind: 'RECEIPT', name: newFinanceCatName.trim(), linkOrder: false,
          linkPartner: false, selectPaymentAccount: false, linkWorker: false,
          linkProduct: false, customFields: []
        }) as FinanceCategory;
        setNewFinanceCatName('');
        setEditingFinanceCatId(created.id);
        setFinanceCatNameDraft((created as FinanceCategory).name || newFinanceCatName.trim());
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

  const addFinanceCustomField = (catId: string) => {
    const newField: ReportFieldDefinition = { id: `fcf-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label: '新扩展项', type: 'text', required: false };
    const cat = financeCategories.find(c => c.id === catId);
    if (cat) {
      updateFinanceCategoryConfig(catId, { customFields: [...cat.customFields, newField] });
    }
  };

  const updateFinanceCustomField = (catId: string, fieldId: string, updates: Partial<ReportFieldDefinition>) => {
    const cat = financeCategories.find(c => c.id === catId);
    if (cat) {
      const newFields = cat.customFields.map(f => f.id === fieldId ? { ...f, ...updates } : f);
      updateFinanceCategoryConfig(catId, { customFields: newFields });
    }
  };

  const removeFinanceCustomField = (catId: string, fieldId: string) => {
    const cat = financeCategories.find(c => c.id === catId);
    if (cat) {
      updateFinanceCategoryConfig(catId, { customFields: cat.customFields.filter(f => f.id !== fieldId) });
    }
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
              <input type="text" placeholder="分类名称" value={newFinanceCatName} onChange={e => setNewFinanceCatName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
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
                  {canDelete && <button onClick={() => removeFinanceCategory(cat.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>}
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
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ListPlus className="w-4 h-4" /> 3. 自定义内容</h3>
                      <button onClick={() => addFinanceCustomField(cat.id)} className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black hover:bg-black transition-all">
                        <PlusSquare className="w-3.5 h-3.5" /> 新增扩展项
                      </button>
                    </div>
                    <div className="space-y-3">
                      {cat.customFields.length === 0 ? (
                        <div className="py-12 border-2 border-dashed border-slate-100 rounded-[24px] text-center text-slate-300 text-xs italic">
                          尚未定义自定义内容。可增加如：发票号、结算方式、备注等扩展字段。
                        </div>
                      ) : (
                        cat.customFields.map((field, fIdx) => (
                          <div key={field.id} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center gap-4 group hover:bg-white hover:border-indigo-200 transition-all">
                            <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-black text-[10px]">{fIdx + 1}</div>
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                              <ExtFieldLabelInput
                                inputKey={`finance-cf-${cat.id}-${field.id}`}
                                label={field.label}
                                placeholder="字段名称"
                                onPersist={(t) => updateFinanceCustomField(cat.id, field.id, { label: t })}
                                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <select value={field.type} onChange={e => updateFinanceCustomField(cat.id, field.id, { type: e.target.value as FieldType })} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer">
                                <option value="text">普通文本</option><option value="number">数字/金额</option><option value="select">下拉单选</option><option value="boolean">是否开关</option><option value="date">日期选择</option>
                              </select>
                              <div className="flex items-center gap-4 px-2">
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.required} onChange={e => updateFinanceCustomField(cat.id, field.id, { required: e.target.checked })} className="w-4 h-4 rounded text-indigo-600 border-slate-300" /><span className="text-[10px] font-black text-slate-400 uppercase">必填</span></label>
                              </div>
                            </div>
                            <button onClick={() => removeFinanceCustomField(cat.id, field.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        ))
                      )}
                    </div>
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
