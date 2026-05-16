import React, { useState } from 'react';
import { useAsyncSubmitLock } from '../../hooks/useAsyncSubmitLock';
import {
  Shapes,
  ArrowRight,
  Settings,
  Building2,
  Trash2,
} from 'lucide-react';
import { PartnerCategory, ReportFieldDefinition } from '../../types';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { ReportCustomFieldsConfigTable } from '../../components/form-config/CustomFieldsEditorTable';
import { formStandardControlClass } from '../../styles/uiDensity';

interface PartnerCategoriesTabProps {
  partnerCategories: PartnerCategory[];
  onRefreshPartnerCategories: () => Promise<void>;
  canCreate: boolean;
  canDelete: boolean;
}

const PartnerCategoriesTab: React.FC<PartnerCategoriesTabProps> = ({
  partnerCategories,
  onRefreshPartnerCategories,
  canCreate,
  canDelete,
}) => {
  const [newPCatName, setNewPCatName] = useState('');
  const [editingPCatId, setEditingPCatId] = useState<string | null>(null);
  const [partnerCatNameDraft, setPartnerCatNameDraft] = useState('');
  const addLock = useAsyncSubmitLock();

  const addPartnerCategory = async () => {
    if (!newPCatName.trim()) return;
    if (partnerCategories.some(c => c.name === newPCatName.trim())) { toast.warning(`分类"${newPCatName.trim()}"已存在`); return; }
    await addLock.run(async () => {
      try {
        const created = await api.settings.partnerCategories.create({ name: newPCatName, customFields: [] }) as PartnerCategory;
        setNewPCatName('');
        setEditingPCatId(created.id);
        setPartnerCatNameDraft((created as PartnerCategory).name || newPCatName.trim());
        await onRefreshPartnerCategories();
      } catch (err: any) { toast.error(err.message || '操作失败'); }
    });
  };

  const removePartnerCategory = async (id: string) => {
    try {
      await api.settings.partnerCategories.delete(id);
      if (editingPCatId === id) setEditingPCatId(null);
      await onRefreshPartnerCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const updatePCategoryConfig = async (id: string, updates: Partial<PartnerCategory>) => {
    try {
      await api.settings.partnerCategories.update(id, updates);
      await onRefreshPartnerCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
            <Shapes className="w-4 h-4 text-indigo-600" />
            合作单位分类库
          </h2>
          <div className="space-y-3 mb-8">
            {partnerCategories.map(cat => (
              <div 
                key={cat.id} 
                onClick={() => {
                  setEditingPCatId(cat.id);
                  setPartnerCatNameDraft(cat.name);
                }}
                className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all group ${
                  editingPCatId === cat.id 
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                  : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${editingPCatId === cat.id ? 'text-indigo-900' : 'text-slate-600'}`}>{cat.name}</span>
                </div>
                <ArrowRight className={`w-4 h-4 transition-all ${editingPCatId === cat.id ? 'text-indigo-600 translate-x-1' : 'text-slate-200'}`} />
              </div>
            ))}
          </div>
          {canCreate && (
          <div className="pt-6 border-t border-slate-50">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速新增单位分类</h3>
            <div className="space-y-4">
              <input type="text" placeholder="分类名称 (如：核心供应商)" value={newPCatName} onChange={e => setNewPCatName(e.target.value)} className={formStandardControlClass} />
              <button type="button" onClick={() => void addPartnerCategory()} disabled={!newPCatName.trim() || addLock.busy} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed">{addLock.busy ? '提交中…' : '确认添加'}</button>
            </div>
          </div>
          )}
        </div>
      </div>
      <div className="lg:col-span-8">
        {editingPCatId ? (
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
            {partnerCategories.filter(c => c.id === editingPCatId).map(cat => (
              <div key={cat.id}>
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <h2 className="font-black text-slate-800 text-lg">编辑单位分类：{partnerCatNameDraft || cat.name}</h2>
                  {canDelete && <button onClick={() => removePartnerCategory(cat.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>}
                </div>
                <div className="p-8 space-y-12">
                  <div className="space-y-4">
                     <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Settings className="w-4 h-4" /> 1. 基础信息设置</h3>
                     <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                        <div className="space-y-1 max-w-sm">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分类名称</label>
                           <input
                             type="text"
                             value={partnerCatNameDraft}
                             onChange={(e) => setPartnerCatNameDraft(e.target.value)}
                             onBlur={async () => {
                               const cur = partnerCategories.find((x) => x.id === cat.id);
                               if (!cur) return;
                               const next = partnerCatNameDraft.trim();
                               if (next === cur.name) return;
                               if (!next) {
                                 toast.error('分类名称不能为空');
                                 setPartnerCatNameDraft(cur.name);
                                 return;
                               }
                               try {
                                 await api.settings.partnerCategories.update(cat.id, { name: next });
                                 await onRefreshPartnerCategories();
                               } catch (err: unknown) {
                                 toast.error(err instanceof Error ? err.message : '保存失败');
                                 setPartnerCatNameDraft(cur.name);
                               }
                             }}
                             className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                           />
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <ReportCustomFieldsConfigTable
                      showRequiredColumn
                      showShowInFormColumn={false}
                      fields={cat.customFields}
                      onChange={next => updatePCategoryConfig(cat.id, { customFields: next })}
                      title={
                        <span className="flex items-center gap-2">
                          <Building2 className="w-4 h-4" /> 2. 单位专属扩展字段 (自定义内容)
                        </span>
                      }
                      addButtonLabel="增加信息字段"
                      idPrefix={`pcf-${cat.id}-`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-[32px] border border-dashed border-slate-200 p-20 text-center opacity-60">
             <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4"><Shapes className="w-8 h-8 text-slate-300" /></div>
             <h3 className="text-lg font-bold text-slate-400">请选择左侧分类进行配置</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(PartnerCategoriesTab);
