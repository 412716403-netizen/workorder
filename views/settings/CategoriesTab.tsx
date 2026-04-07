import React, { useState } from 'react';
import {
  Tag,
  ArrowRight,
  LayoutGrid,
  ToggleLeft,
  ToggleRight,
  Info,
  DollarSign,
  ShoppingCart,
  Maximize,
  ListPlus,
  PlusSquare,
  Trash2,
} from 'lucide-react';
import { ProductCategory, ReportFieldDefinition, FieldType } from '../../types';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { ExtFieldLabelInput, ProductCategorySelectOptions } from './shared';

interface CategoriesTabProps {
  categories: ProductCategory[];
  onRefreshCategories: () => Promise<void>;
  canCreate: boolean;
  canDelete: boolean;
}

const CategoriesTab: React.FC<CategoriesTabProps> = ({
  categories,
  onRefreshCategories,
  canCreate,
  canDelete,
}) => {
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [categoryNameDraft, setCategoryNameDraft] = useState('');

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    if (categories.some(c => c.name === newCatName.trim())) { toast.warning(`分类"${newCatName.trim()}"已存在`); return; }
    try {
      const created = await api.settings.categories.create({
        name: newCatName, color: 'bg-indigo-600', hasProcess: false,
        hasSalesPrice: false, hasPurchasePrice: false, hasColorSize: false,
        hasBatchManagement: false, customFields: []
      }) as ProductCategory;
      setNewCatName('');
      setEditingCatId(created.id);
      setCategoryNameDraft((created as ProductCategory).name || newCatName.trim());
      await onRefreshCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const removeCategory = async (id: string) => {
    try {
      await api.settings.categories.delete(id);
      if (editingCatId === id) setEditingCatId(null);
      await onRefreshCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const updateCategoryConfig = async (id: string, updates: Partial<ProductCategory>) => {
    try {
      await api.settings.categories.update(id, updates);
      await onRefreshCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const addCustomField = (catId: string) => {
    const newField: ReportFieldDefinition = { id: `cf-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label: '新属性名称', type: 'text', required: false };
    const cat = categories.find(c => c.id === catId);
    if (cat) {
      updateCategoryConfig(catId, { customFields: [...cat.customFields, newField] });
    }
  };

  const updateCustomField = (catId: string, fieldId: string, updates: Partial<ReportFieldDefinition>) => {
    const cat = categories.find(c => c.id === catId);
    if (cat) {
      const newFields = cat.customFields.map(f => f.id === fieldId ? { ...f, ...updates } : f);
      updateCategoryConfig(catId, { customFields: newFields });
    }
  };

  const removeCustomField = (catId: string, fieldId: string) => {
    const cat = categories.find(c => c.id === catId);
    if (cat) {
      updateCategoryConfig(catId, { customFields: cat.customFields.filter(f => f.id !== fieldId) });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
            <Tag className="w-4 h-4 text-indigo-600" />
            产品分类库
          </h2>
          <div className="space-y-3 mb-8">
            {categories.map(cat => (
              <div 
                key={cat.id} 
                onClick={() => {
                  setEditingCatId(cat.id);
                  setCategoryNameDraft(cat.name);
                }}
                className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all group ${
                  editingCatId === cat.id 
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                  : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${editingCatId === cat.id ? 'text-indigo-900' : 'text-slate-600'}`}>{cat.name}</span>
                </div>
                <ArrowRight className={`w-4 h-4 transition-all ${editingCatId === cat.id ? 'text-indigo-600 translate-x-1' : 'text-slate-200'}`} />
              </div>
            ))}
          </div>
          {canCreate && (
          <div className="pt-6 border-t border-slate-50">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速新增产品分类</h3>
            <div className="space-y-4">
              <input type="text" placeholder="分类名称" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
              <button onClick={addCategory} disabled={!newCatName.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50">确认添加</button>
            </div>
          </div>
          )}
        </div>
      </div>
      <div className="lg:col-span-8">
        {editingCatId ? (
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
            {categories.filter(c => c.id === editingCatId).map(cat => (
              <div key={cat.id}>
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <h2 className="font-black text-slate-800 text-lg">编辑产品分类：{categoryNameDraft || cat.name}</h2>
                  {canDelete && <button onClick={() => removeCategory(cat.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>}
                </div>
                <div className="p-8 space-y-12">
                  <div className="space-y-4">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4" /> 1. 分类基础信息
                    </h3>
                    <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                      <div className="space-y-1 max-w-sm">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分类名称</label>
                        <input
                          type="text"
                          value={categoryNameDraft}
                          onChange={(e) => setCategoryNameDraft(e.target.value)}
                          onBlur={async () => {
                            const cur = categories.find((x) => x.id === cat.id);
                            if (!cur) return;
                            const next = categoryNameDraft.trim();
                            if (next === cur.name) return;
                            if (!next) {
                              toast.error('分类名称不能为空');
                              setCategoryNameDraft(cur.name);
                              return;
                            }
                            try {
                              await api.settings.categories.update(cat.id, { name: next });
                              await onRefreshCategories();
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : '保存失败');
                              setCategoryNameDraft(cur.name);
                            }
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4" /> 2. 模块权限与特性开关
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { label: '启用工序设置', key: 'hasProcess', desc: '开启后支持配置生产工序路线。', icon: Info },
                        { label: '启用销售价格', key: 'hasSalesPrice', desc: '是否在该类产品中录入销售标价。', icon: DollarSign },
                        { label: '启用采购价和供应商', key: 'hasPurchasePrice', desc: '开启后可维护参考采购单价并关联首选供应商。', icon: ShoppingCart },
                        { label: '启用颜色尺码', key: 'hasColorSize', desc: '开启后支持颜色、尺码库选择。', icon: Maximize },
                        { label: '启用批次管理', key: 'hasBatchManagement', desc: '开启后该类产品在采购、出入库和生产入库中按批次记录库存。', icon: Tag },
                      ].map(toggle => (
                        <div key={toggle.key} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <toggle.icon className="w-4 h-4 text-indigo-400" />
                              <span className="text-sm font-bold text-slate-800">{toggle.label}</span>
                            </div>
                            <button onClick={() => updateCategoryConfig(cat.id, { [toggle.key]: !(cat as any)[toggle.key] })}>
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
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <ListPlus className="w-4 h-4" /> 3. 分类专属扩展字段
                        </h3>
                        <button onClick={() => addCustomField(cat.id)} className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black hover:bg-black transition-all">
                          <PlusSquare className="w-3.5 h-3.5" /> 新增扩展项
                        </button>
                     </div>
                     <div className="space-y-3">
                        {cat.customFields.map((field) => (
                          <div key={field.id} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex flex-col gap-3 group hover:bg-white hover:border-indigo-200 transition-all">
                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                <ExtFieldLabelInput
                                  inputKey={`prod-cf-${cat.id}-${field.id}`}
                                  label={field.label}
                                  placeholder="属性名称"
                                  onPersist={(t) => updateCustomField(cat.id, field.id, { label: t })}
                                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <select
                                  value={field.type}
                                  onChange={(e) => {
                                    const v = e.target.value as FieldType;
                                    if (v === 'file') {
                                      updateCustomField(cat.id, field.id, { type: v, showInForm: false, options: undefined });
                                    } else if (v === 'select') {
                                      updateCustomField(cat.id, field.id, {
                                        type: v,
                                        options: field.type === 'select' && Array.isArray(field.options) && field.options.length > 0 ? field.options : [],
                                      });
                                    } else {
                                      updateCustomField(cat.id, field.id, { type: v, options: undefined });
                                    }
                                  }}
                                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer"
                                >
                                  <option value="text">文本输入</option><option value="number">数字录入</option><option value="select">下拉选择</option><option value="file">文件上传</option>
                                </select>
                                <div className="flex items-center gap-4 px-2 flex-wrap">
                                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.required} onChange={e => updateCustomField(cat.id, field.id, { required: e.target.checked })} className="w-4 h-4 rounded text-indigo-600" /><span className="text-[10px] font-black text-slate-400 uppercase">必填</span></label>
                                  {field.type !== 'file' && (
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.showInForm !== false} onChange={e => updateCustomField(cat.id, field.id, { showInForm: e.target.checked })} className="w-4 h-4 rounded text-indigo-600" /><span className="text-[10px] font-black text-slate-400 uppercase">生产/进销存列表中显示</span></label>
                                  )}
                                </div>
                              </div>
                              <button type="button" onClick={() => removeCustomField(cat.id, field.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-all self-start md:self-center shrink-0"><Trash2 className="w-4 h-4" /></button>
                            </div>
                            {field.type === 'select' && (
                              <ProductCategorySelectOptions
                                catId={cat.id}
                                fieldId={field.id}
                                options={field.options || []}
                                onPersist={(cid, fid, next) => {
                                  const c = categories.find((x) => x.id === cid);
                                  if (!c) return;
                                  updateCategoryConfig(cid, {
                                    customFields: c.customFields.map((f) => (f.id === fid ? { ...f, options: next } : f)),
                                  });
                                }}
                              />
                            )}
                          </div>
                        ))}
                     </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-[32px] border border-dashed border-slate-200 p-20 text-center opacity-60">
             <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4"><Tag className="w-8 h-8 text-slate-300" /></div>
             <h3 className="text-lg font-bold text-slate-400">请选择左侧分类进行配置</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(CategoriesTab);
