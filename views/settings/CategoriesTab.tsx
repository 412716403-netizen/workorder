import React, { useState } from 'react';
import { useAsyncSubmitLock } from '../../hooks/useAsyncSubmitLock';
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
  Trash2,
  Building2,
} from 'lucide-react';
import { ProductCategory, type CustomDocFieldType, normalizeTenantIndustryKind } from '../../types';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { useAuthOptional } from '../../contexts/AuthContext';
import { ExtFieldLabelInput } from './shared';
import { ReportCustomFieldsConfigTable } from '../../components/form-config/CustomFieldsEditorTable';
import { formStandardControlClass } from '../../styles/uiDensity';
import { useFeaturePlugins } from '../../hooks/useFeaturePlugins';
import { hasSettingsNameConflict } from '../../utils/settingsNameUnique';

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
  const addLock = useAsyncSubmitLock();
  const { isPluginEnabled } = useFeaturePlugins();
  const auth = useAuthOptional();
  /** 「启用颜色尺码」仅对毛衣工厂行业租户开放（平台在企业管理中指定行业类型） */
  const colorSizeIndustryEnabled =
    normalizeTenantIndustryKind(auth?.tenantCtx?.industryKind) === 'sweater_factory';
  const customFieldAllowedTypes: CustomDocFieldType[] = isPluginEnabled('knowledge_base')
    ? ['text', 'date', 'select', 'file', 'knowledge']
    : ['text', 'date', 'select', 'file'];

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const trimmed = newCatName.trim();
    if (hasSettingsNameConflict(categories, trimmed)) { toast.warning(`分类"${trimmed}"已存在`); return; }
    await addLock.run(async () => {
      try {
        const created = await api.settings.categories.create({
          name: newCatName, color: 'bg-indigo-600', hasProcess: false,
          hasSalesPrice: false, hasPurchasePrice: false, linkPartner: false, hasColorSize: false,
          hasBatchManagement: false, customFields: []
        }) as ProductCategory;
        setNewCatName('');
        setEditingCatId(created.id);
        setCategoryNameDraft((created as ProductCategory).name || newCatName.trim());
        await onRefreshCategories();
      } catch (err: any) { toast.error(err.message || '操作失败'); }
    });
  };

  const removeCategory = async (id: string) => {
    try {
      await api.settings.categories.delete(id);
      if (editingCatId === id) setEditingCatId(null);
      await onRefreshCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const updateCategoryConfig = async (id: string, updates: Partial<ProductCategory>) => {
    const cat = categories.find(c => c.id === id);
    if (cat) {
      const nextColor = updates.hasColorSize !== undefined ? updates.hasColorSize : cat.hasColorSize;
      const nextBatch =
        updates.hasBatchManagement !== undefined ? updates.hasBatchManagement : Boolean(cat.hasBatchManagement);
      if (nextColor && nextBatch) {
        toast.warning('颜色尺码与批次管理互斥，不能同时启用');
        return;
      }
    }
    try {
      await api.settings.categories.update(id, updates);
      await onRefreshCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const handleCategoryToggle = (cat: ProductCategory, key: string, nextVal: boolean) => {
    if (key === 'hasPurchasePrice' && nextVal) {
      void updateCategoryConfig(cat.id, { hasPurchasePrice: true, linkPartner: true });
      return;
    }
    if (key === 'linkPartner' && !nextVal && cat.hasPurchasePrice) {
      toast.warning('已启用采购价时需保持关联合作单位');
      return;
    }
    void updateCategoryConfig(cat.id, { [key]: nextVal } as Partial<ProductCategory>);
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
              <input type="text" placeholder="分类名称" value={newCatName} onChange={e => setNewCatName(e.target.value)} className={formStandardControlClass} />
              <button type="button" onClick={() => void addCategory()} disabled={!newCatName.trim() || addLock.busy} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed">{addLock.busy ? '提交中…' : '确认添加'}</button>
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
                            if (hasSettingsNameConflict(categories, next, cat.id)) {
                              toast.error(`分类"${next}"已存在`);
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
                        { label: '启用采购价', key: 'hasPurchasePrice', desc: '开启后可在产品档案中维护参考采购单价。', icon: ShoppingCart },
                        { label: '关联合作单位', key: 'linkPartner', desc: '开启后可关联首选供应商；开发管理可录入客户并按客户排序。', icon: Building2 },
                        { label: '启用颜色尺码', key: 'hasColorSize', desc: '开启后支持颜色、尺码库选择。', icon: Maximize },
                        { label: '启用批次管理', key: 'hasBatchManagement', desc: '开启后该类产品在采购、出入库和生产入库中按批次记录库存。', icon: Tag },
                      ]
                        // 非毛衣工厂行业隐藏颜色尺码开关；已开启的分类仍显示，便于关闭
                        .filter(toggle => toggle.key !== 'hasColorSize' || colorSizeIndustryEnabled || cat.hasColorSize)
                        .map(toggle => {
                        const curVal = Boolean((cat as unknown as Record<string, unknown>)[toggle.key]);
                        const nextVal = !curVal;
                        const toggleBlocked =
                          (toggle.key === 'hasColorSize' && nextVal && Boolean(cat.hasBatchManagement)) ||
                          (toggle.key === 'hasBatchManagement' && nextVal && cat.hasColorSize) ||
                          (toggle.key === 'linkPartner' && !nextVal && cat.hasPurchasePrice);
                        return (
                        <div key={toggle.key} className={`bg-slate-50/50 p-4 rounded-2xl border border-slate-100 ${toggleBlocked ? 'opacity-60' : ''}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <toggle.icon className="w-4 h-4 text-indigo-400" />
                              <span className="text-sm font-bold text-slate-800">{toggle.label}</span>
                            </div>
                            <button
                              type="button"
                              title={
                                toggleBlocked
                                  ? toggle.key === 'linkPartner'
                                    ? '已启用采购价时需保持关联合作单位'
                                    : '与另一项特性互斥，请先关闭对方开关'
                                  : undefined
                              }
                              disabled={toggleBlocked}
                              onClick={() => {
                                if (toggleBlocked) {
                                  if (toggle.key === 'linkPartner') {
                                    toast.warning('已启用采购价时需保持关联合作单位');
                                  } else {
                                    toast.warning('颜色尺码与批次管理互斥，请先关闭另一项后再开启');
                                  }
                                  return;
                                }
                                handleCategoryToggle(cat, toggle.key, nextVal);
                              }}
                            >
                              {curVal ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 font-medium">{toggle.desc}</p>
                          {toggle.key === 'hasBatchManagement' && cat.hasColorSize ? (
                            <p className="text-[10px] text-amber-600 font-bold mt-1">已启用颜色尺码时不可开启批次</p>
                          ) : null}
                          {toggle.key === 'hasColorSize' && Boolean(cat.hasBatchManagement) ? (
                            <p className="text-[10px] text-amber-600 font-bold mt-1">已启用批次管理时不可开启颜色尺码</p>
                          ) : null}
                          {toggle.key === 'linkPartner' && cat.hasPurchasePrice ? (
                            <p className="text-[10px] text-amber-600 font-bold mt-1">已启用采购价时需保持开启</p>
                          ) : null}
                        </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <ReportCustomFieldsConfigTable
                      showRequiredColumn
                      allowedTypes={customFieldAllowedTypes}
                      fields={cat.customFields}
                      onChange={next => updateCategoryConfig(cat.id, { customFields: next })}
                      title={
                        <span className="flex items-center gap-2">
                          <ListPlus className="w-4 h-4" /> 3. 分类专属扩展字段
                        </span>
                      }
                      addButtonLabel="新增扩展项"
                      idPrefix={`cf-${cat.id}-`}
                    />
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
