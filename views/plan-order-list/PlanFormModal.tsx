
import React, { useMemo, useState } from 'react';
import { useAsyncSubmitLock } from '../../hooks/useAsyncSubmitLock';
import {
  CalendarClock,
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
  PlanItem,
  PlanFormSettings,
  Partner,
  PartnerCategory,
} from '../../types';
import { PlanStatus } from '../../types';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';
import { CustomerSelect } from '../../components/CustomerSelect';
import { formStandardControlClass, formStandardLabelClass, sectionTitleClass } from '../../styles/uiDensity';
import { localTodayYmd } from '../../utils/localDateTime';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';

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
  onSave: (plan: PlanOrder) => void | Promise<void>;
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
  const createLock = useAsyncSubmitLock();
  const [form, setForm] = useState<{
    categoryId: string;
    productId: string;
    customer: string;
    dueDate: string;
    variantQuantities: Record<string, number>;
    singleQuantity: number;
    customData: Record<string, any>;
  }>({
    categoryId: '',
    productId: '',
    customer: '',
    dueDate: '',
    variantQuantities: {},
    singleQuantity: 0,
    customData: {},
  });

  const selectedProduct = products.find(p => p.id === form.productId);
  const activeCategory = categories.find(c => c.id === form.categoryId);
  const usePlanVariantMatrix = productHasColorSizeMatrix(selectedProduct, activeCategory);

  const canSave = useMemo(() => {
    if (!form.productId) return false;
    if (usePlanVariantMatrix) return (Object.values(form.variantQuantities) as number[]).some(q => (q as number) > 0);
    return (form.singleQuantity as number) > 0;
  }, [form, usePlanVariantMatrix]);

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

  const handleCreate = async () => {
    if (!selectedProduct) return;
    if ((selectedProduct.milestoneNodeIds?.length ?? 0) === 0) {
      toast.error('该产品未配置工序，不允许创建生产计划。请先在产品管理中为该产品添加工序。');
      return;
    }
    const items: PlanItem[] = [];
    if (usePlanVariantMatrix && selectedProduct.variants && selectedProduct.variants.length > 0) {
      (Object.entries(form.variantQuantities) as [string, number][]).forEach(([vId, qty]) => {
        if (qty > 0) items.push({ variantId: vId, quantity: qty });
      });
    } else {
      if ((form.singleQuantity as number) > 0) items.push({ quantity: form.singleQuantity as number });
    }
    if (items.length === 0) return;

    const dueTrim = String(form.dueDate ?? '').trim();
    const newPlan: PlanOrder = {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      planNumber: getNextPlanNumber(),
      productId: form.productId,
      items,
      startDate: localTodayYmd(),
      status: PlanStatus.APPROVED,
      customer: form.customer,
      priority: 'Medium',
      assignments: {},
      customData: Object.keys(form.customData || {}).length ? form.customData : undefined,
      createdAt: localTodayYmd(),
      ...(dueTrim ? { dueDate: dueTrim } : {}),
    };

    const ok = await createLock.run(async () => {
      await Promise.resolve(onSave(newPlan));
      return true;
    });
    if (!ok) return;
    onClose();
    setForm({ categoryId: '', productId: '', customer: '', dueDate: '', variantQuantities: {}, singleQuantity: 0, customData: {} });
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
              onClick={() => void handleCreate()}
              disabled={!canSave || createLock.busy}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4 shrink-0" /> {createLock.busy ? '提交中…' : '确认保存计划单'}
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
                  <label className={formStandardLabelClass}>目标生产品项</label>
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
                    <label className={formStandardLabelClass}>计划客户（合作单位）</label>
                    <CustomerSelect
                      options={partners}
                      categories={partnerCategories}
                      value={form.customer}
                      onChange={customerName => setForm({ ...form, customer: customerName })}
                      placeholder="搜索并选择合作单位..."
                    />
                  </div>
                )}
                {planFormSettings.listDisplay?.showDeliveryDate === true && (
                  <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                      <CalendarClock className="h-3 w-3" /> 交货日期
                    </label>
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={e => setForm({ ...form, dueDate: e.target.value })}
                      className={formStandardControlClass}
                    />
                  </div>
                )}
                {planFormSettings.customFields.filter(f => f.showInCreate).map(cf => (
                  <div key={cf.id} className="space-y-1">
                    <label className={formStandardLabelClass}>{cf.label}</label>
                    <PlanFormCustomFieldInput
                      cf={cf}
                      value={form.customData?.[cf.id]}
                      onChange={next => setForm({ ...form, customData: { ...form.customData, [cf.id]: next } })}
                      controlClassName={formStandardControlClass}
                      onFilePreview={onFilePreview}
                    />
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

                {usePlanVariantMatrix && selectedProduct.variants && selectedProduct.variants.length > 0 ? (
                  <div className="space-y-4">
                    <VariantQtyMatrixInputs
                      product={selectedProduct}
                      dictionaries={dictionaries}
                      quantities={form.variantQuantities}
                      onVariantQtyChange={(variantId, qty) => updateVariantQty(variantId, String(qty))}
                    />
                    <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100">
                       <div className="flex items-center gap-4">
                          <p className="text-xs font-bold opacity-80">计划生产汇总总量:</p>
                          <p className="text-xl font-black">{(Object.values(form.variantQuantities) as number[]).reduce((s, q) => s + q, 0)} <span className="text-xs font-medium">{getUnitName(form.productId)}</span></p>
                       </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-xs space-y-2">
                    <label className={formStandardLabelClass}>计划生产总量 ({getUnitName(form.productId)})</label>
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
