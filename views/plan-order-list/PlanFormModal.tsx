
import React, { useMemo, useState } from 'react';
import {
  FileText,
  Layers,
  Package,
  Save,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  PlanOrder,
  Product,
  ProductCategory,
  AppDictionaries,
  ProductVariant,
  PlanItem,
  PlanFormSettings,
  Partner,
  PartnerCategory,
} from '../../types';
import { PlanStatus } from '../../types';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';
import { sectionTitleClass } from '../../styles/uiDensity';

export interface PlanFormModalProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  planFormSettings: PlanFormSettings;
  plans: PlanOrder[];
  productionLinkMode?: 'order' | 'product';
  onSave: (plan: PlanOrder) => void;
  onImagePreview?: (url: string) => void;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
}

const PlanFormModal: React.FC<PlanFormModalProps> = ({
  open,
  onClose,
  products,
  categories,
  dictionaries,
  partners,
  partnerCategories,
  planFormSettings,
  plans,
  productionLinkMode = 'order',
  onSave,
  onImagePreview,
  onFilePreview,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState<{
    categoryId: string;
    productId: string;
    customer: string;
    dueDate: string;
    createdAt: string;
    variantQuantities: Record<string, number>;
    singleQuantity: number;
    customData: Record<string, any>;
  }>({
    categoryId: '',
    productId: '',
    customer: '',
    dueDate: '',
    createdAt: today,
    variantQuantities: {},
    singleQuantity: 0,
    customData: {},
  });

  const selectedProduct = products.find(p => p.id === form.productId);
  const activeCategory = categories.find(c => c.id === form.categoryId);

  const groupedVariants = useMemo((): Record<string, ProductVariant[]> => {
    if (!selectedProduct || !selectedProduct.variants) return {};
    const groups: Record<string, ProductVariant[]> = {};
    selectedProduct.variants.forEach(v => {
      if (!groups[v.colorId]) groups[v.colorId] = [];
      groups[v.colorId].push(v);
    });
    return groups;
  }, [selectedProduct]);

  const canSave = useMemo(() => {
    if (!form.productId) return false;
    if (activeCategory?.hasColorSize) return (Object.values(form.variantQuantities) as number[]).some(q => (q as number) > 0);
    return (form.singleQuantity as number) > 0;
  }, [form, activeCategory]);

  const getUnitName = (productId: string) => {
    const p = products.find(x => x.id === productId);
    const u = (dictionaries.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };

  const getNextPlanNumber = (): string => {
    const nums = plans
      .map(p => {
        const m = p.planNumber.match(/^PLN-?(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter(n => n > 0);
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `PLN${next}`;
  };

  const updateVariantQty = (vId: string, val: string) => {
    const qty = parseInt(val) || 0;
    setForm(prev => ({
      ...prev,
      variantQuantities: { ...prev.variantQuantities, [vId]: qty },
    }));
  };

  const handleCreate = () => {
    if (!selectedProduct) return;
    if ((selectedProduct.milestoneNodeIds?.length ?? 0) === 0) {
      toast.error('该产品未配置工序，不允许创建生产计划。请先在产品管理中为该产品添加工序。');
      return;
    }
    const items: PlanItem[] = [];
    if (activeCategory?.hasColorSize && selectedProduct.variants && selectedProduct.variants.length > 0) {
      (Object.entries(form.variantQuantities) as [string, number][]).forEach(([vId, qty]) => {
        if (qty > 0) items.push({ variantId: vId, quantity: qty });
      });
    } else {
      if ((form.singleQuantity as number) > 0) items.push({ quantity: form.singleQuantity as number });
    }
    if (items.length === 0) return;

    const newPlan: PlanOrder = {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      planNumber: getNextPlanNumber(),
      productId: form.productId,
      items,
      startDate: new Date().toISOString().split('T')[0],
      dueDate: form.dueDate,
      status: PlanStatus.APPROVED,
      customer: form.customer,
      priority: 'Medium',
      assignments: {},
      customData: Object.keys(form.customData || {}).length ? form.customData : undefined,
      createdAt: form.createdAt || new Date().toISOString().split('T')[0],
    };

    onSave(newPlan);
    onClose();
    const nextToday = new Date().toISOString().split('T')[0];
    setForm({ categoryId: '', productId: '', customer: '', dueDate: '', createdAt: nextToday, variantQuantities: {}, singleQuantity: 0, customData: {} });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-create-modal-title"
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 fade-in duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 id="plan-create-modal-title" className="text-lg font-semibold text-slate-900 tracking-tight">
              新建生产计划
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">填写基础信息与生产数量后保存</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canSave}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4 shrink-0" /> 确认保存计划单
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80 p-4 sm:p-6 custom-scrollbar">
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-10">
            <div className="space-y-8">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
                <h3 className={sectionTitleClass}>1. 计划基础信息</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">目标生产品项 (支持搜索与分类筛选)</label>
                  <div className="flex items-stretch gap-4">
                    {selectedProduct && (
                      <div className="shrink-0">
                        {selectedProduct.imageUrl ? (
                          <button type="button" onClick={() => onImagePreview?.(selectedProduct.imageUrl!)} className="rounded-xl overflow-hidden border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none block">
                            <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-16 h-16 object-cover block" />
                          </button>
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-slate-200 flex items-center justify-center border border-slate-100"><Package className="w-8 h-8 text-slate-400" /></div>
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <SearchableProductSelect
                        options={products}
                        categories={categories}
                        value={form.productId}
                        onChange={(pId) => { const p = products.find(x => x.id === pId); setForm({ ...form, productId: pId, categoryId: p?.categoryId ?? '', variantQuantities: {}, singleQuantity: 0 }); }}
                        onFilePreview={(url, type) => onFilePreview?.(url, type)}
                      />
                    </div>
                  </div>
                </div>
                {planFormSettings.standardFields.find(f => f.id === 'customer')?.showInCreate !== false && productionLinkMode !== 'product' && (
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">计划客户（合作单位）</label>
                    <SearchablePartnerSelect
                      options={partners}
                      categories={partnerCategories}
                      value={form.customer}
                      onChange={customerName => setForm({ ...form, customer: customerName })}
                      placeholder="搜索并选择合作单位..."
                    />
                  </div>
                )}
                {planFormSettings.standardFields.find(f => f.id === 'dueDate')?.showInCreate !== false && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">期望交期截止</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
                  <input type="date" value={form.createdAt} onChange={e => setForm({...form, createdAt: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
                {planFormSettings.customFields.filter(f => f.showInCreate).map(cf => (
                  <div key={cf.id} className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{cf.label}</label>
                    {cf.type === 'date' ? (
                      <input type="date" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                    ) : cf.type === 'number' ? (
                      <input type="number" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value === '' ? '' : Number(e.target.value) } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                    ) : cf.type === 'select' ? (
                      <select value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]">
                        <option value="">请选择</option>
                        {(cf.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder={`${cf.label}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {selectedProduct && (
              <div className="pt-10 border-t border-slate-50 space-y-8 animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><Layers className="w-5 h-5" /></div>
                  <h3 className={sectionTitleClass}>2. 生产数量明细录入</h3>
                </div>

                {activeCategory?.hasColorSize && selectedProduct.variants && selectedProduct.variants.length > 0 ? (
                  <div className="space-y-4">
                    {sortedVariantColorEntries(groupedVariants, selectedProduct?.colorIds, selectedProduct?.sizeIds).map(([colorId, colorVariants]) => {
                      const color = dictionaries.colors.find(c => c.id === colorId);
                      return (
                        <div key={colorId} className="bg-slate-50/50 p-6 rounded-[32px] border border-slate-100 flex flex-col md:flex-row md:items-center gap-8 group hover:border-indigo-200 transition-all overflow-hidden">
                          <div className="flex items-center gap-3 w-40 shrink-0">
                            <div className="w-5 h-5 rounded-full border border-slate-200 shadow-inner" style={{backgroundColor: color?.value}}></div>
                            <span className="text-sm font-black text-slate-700">{color?.name}</span>
                          </div>
                          <div className="flex-1 flex flex-wrap gap-4">
                            {(colorVariants as ProductVariant[]).map(v => {
                              const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                              return (
                                <div key={v.id} className="flex flex-col gap-1.5 w-24">
                                  <span className="text-[10px] font-black text-slate-400 text-center uppercase tracking-tighter">{size?.name}</span>
                                  <input
                                    type="number"
                                    placeholder="0"
                                    value={form.variantQuantities[v.id] || ''}
                                    onChange={e => updateVariantQty(v.id, e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center shadow-sm"
                                  />
                                </div>
                              )
                            })}
                          </div>
                          <div className="hidden md:block shrink-0 text-right bg-white/60 px-4 py-2 rounded-2xl border border-slate-100">
                             <p className="text-[9px] font-black text-slate-300 uppercase">颜色小计</p>
                             <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (form.variantQuantities[v.id] || 0), 0)}</p>
                          </div>
                        </div>
                      )
                    })}
                    <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100">
                       <div className="flex items-center gap-4">
                          <p className="text-xs font-bold opacity-80">计划生产汇总总量:</p>
                          <p className="text-xl font-black">{(Object.values(form.variantQuantities) as number[]).reduce((s, q) => s + q, 0)} <span className="text-xs font-medium">{getUnitName(form.productId)}</span></p>
                       </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-xs space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">计划生产总量 ({getUnitName(form.productId)})</label>
                    <input
                      type="number"
                      value={form.singleQuantity || ''}
                      onChange={e => setForm({...form, singleQuantity: parseInt(e.target.value)||0})}
                      className="w-full bg-slate-50 border-none rounded-xl py-4 px-6 text-xl font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner"
                      placeholder="0"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(PlanFormModal);
