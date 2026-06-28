import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import type {
  FinanceAccountType,
  FinanceCategory,
  Partner,
  PartnerCategory,
  Product,
  ProductCategory,
  ProductionOrder,
  Worker,
  GlobalNodeTemplate,
} from '../../types';
import { PartnerSelect } from '../../components/PartnerSelect';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';
import WorkerSelectWithTabs from './WorkerSelectWithTabs';
import ReportCustomFieldsEditor from '../../components/ReportCustomFieldsEditor';
import { formStandardControlClass, formStandardControlIconClass, formStandardTextareaClass } from '../../styles/uiDensity';

export interface FinanceRecordFormValues {
  amount: number;
  relatedId: string;
  partner: string;
  note: string;
  categoryId: string;
  workerId: string;
  productId: string;
  paymentAccount: string;
  customData: Record<string, any>;
}

interface FinanceRecordFormModalProps {
  open: boolean;
  onClose: () => void;
  editingRecordId: string | null;
  current: { partnerLabel: string; label?: string };
  isReceiptOrPayment: boolean;
  categoriesForType: FinanceCategory[];
  selectedCategory: FinanceCategory | null;
  form: FinanceRecordFormValues;
  setForm: React.Dispatch<React.SetStateAction<FinanceRecordFormValues>>;
  handleSave: () => void;
  canSave: boolean;
  orders: ProductionOrder[];
  products: Product[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  categories: ProductCategory[];
  workers: Worker[];
  globalNodes: GlobalNodeTemplate[];
  financeAccountTypes: FinanceAccountType[];
  /** 资金账户插件开启时：收款单/付款单需选择收支账户 */
  fundsAccountEnabled?: boolean;
}

function OrderSearchSelect({ orders, products, value, onChange, label }: { orders: ProductionOrder[]; products: Product[]; value: string; onChange: (orderNumber: string) => void; label: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const pMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const options = useMemo(() => [
    ...orders.map(o => ({ id: o.id, orderNumber: o.orderNumber, productName: o.productName, productId: o.productId })),
    { id: 'General-Wages', orderNumber: 'General-Wages', productName: '通用生产补贴/奖金', productId: '' }
  ], [orders]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return options;
    return options.filter(o => {
      const sku = o.productId ? (pMap.get(o.productId)?.sku ?? '') : '';
      return o.orderNumber.toLowerCase().includes(s) || (o.productName || '').toLowerCase().includes(s) || sku.toLowerCase().includes(s);
    });
  }, [options, pMap, search]);
  const selected = options.find(o => o.orderNumber === value);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <div className="space-y-1 relative" ref={containerRef}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className={`${formStandardControlClass} flex items-center justify-between`}>
        <span className={value ? 'text-slate-900 truncate' : 'text-slate-400'}>{selected ? `${selected.orderNumber} - ${selected.productName}` : '搜索工单号、商品名称或编号...'}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : 'text-slate-400'}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-[100] mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95">
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              autoFocus
              type="text"
              className={formStandardControlIconClass}
              placeholder="搜索工单号、商品名称、商品编号..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1">
            {filtered.map(o => (
              <button key={o.id} type="button" onClick={() => { onChange(o.orderNumber); setIsOpen(false); setSearch(''); }} className={`w-full text-left p-3 rounded-xl transition-all border-2 ${o.orderNumber === value ? 'bg-indigo-50 border-indigo-600/20 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'}`}>
                <p className="text-sm font-bold truncate">{o.orderNumber} - {o.productName}</p>
                {o.productId && <p className="text-[10px] text-slate-400 mt-0.5">{pMap.get(o.productId)?.sku ?? ''}</p>}
              </button>
            ))}
            {filtered.length === 0 && <p className="py-6 text-center text-slate-400 text-sm">未找到匹配工单</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function FinanceRecordFormModal({
  open,
  onClose,
  editingRecordId,
  current,
  isReceiptOrPayment,
  categoriesForType,
  selectedCategory,
  form,
  setForm,
  handleSave,
  canSave,
  orders,
  products,
  partners,
  partnerCategories,
  categories,
  workers,
  globalNodes,
  financeAccountTypes,
  fundsAccountEnabled = false,
}: FinanceRecordFormModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-3xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[95vh] flex flex-col">
        <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-indigo-50/40">
          <h2 className="text-xl font-bold text-slate-800">{editingRecordId ? '编辑单据' : `登记${current.label}`}</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-all"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-10 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {isReceiptOrPayment ? (
              <>
                {categoriesForType.length > 0 && (
                  <div className="space-y-1 lg:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">单据分类</label>
                    <select
                      value={form.categoryId}
                      onChange={e => setForm({ ...form, categoryId: e.target.value, customData: {} })}
                      className={`${formStandardControlClass} cursor-pointer`}
                    >
                      <option value="">请选择分类...</option>
                      {categoriesForType.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {selectedCategory && (
                  <>
                    {selectedCategory.linkPartner && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{current.partnerLabel}</label>
                        <PartnerSelect
                          options={partners}
                          categories={partnerCategories}
                          value={form.partner}
                          onChange={name => setForm({ ...form, partner: name })}
                          placeholder="请选择..."
                        />
                      </div>
                    )}
                    {selectedCategory.linkWorker && (
                      <WorkerSelectWithTabs workers={workers} processNodes={globalNodes} value={form.workerId} onChange={id => setForm({ ...form, workerId: id })} label="关联工人" />
                    )}
                    {selectedCategory.linkProduct && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">关联产品</label>
                        <SearchableProductSelect options={products} categories={categories} value={form.productId} onChange={id => setForm({ ...form, productId: id })} />
                      </div>
                    )}
                    {(selectedCategory.customFields || []).filter(f => f.showInForm !== false).length > 0 && (
                      <div className="lg:col-span-2 space-y-3">
                        <ReportCustomFieldsEditor
                          fields={(selectedCategory.customFields || []).filter(f => f.showInForm !== false)}
                          values={form.customData}
                          onChange={(fieldId, v) =>
                            setForm({ ...form, customData: { ...form.customData, [fieldId]: v } })
                          }
                          inputClassName={formStandardControlClass}
                        />
                      </div>
                    )}
                  </>
                )}
                {!selectedCategory && (
                  <div className="space-y-1 lg:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{current.partnerLabel}</label>
                    <PartnerSelect
                      options={partners}
                      categories={partnerCategories}
                      value={form.partner}
                      onChange={name => setForm({ ...form, partner: name })}
                      placeholder="请选择..."
                    />
                  </div>
                )}
                {fundsAccountEnabled && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">收支账户 <span className="text-rose-500">*</span></label>
                    <select value={financeAccountTypes.find(a => a.name === form.paymentAccount)?.id ?? ''} onChange={e => { const a = financeAccountTypes.find(x => x.id === e.target.value); setForm({ ...form, paymentAccount: a ? a.name : '' }); }} className={`${formStandardControlClass} cursor-pointer`}>
                      <option value="">请选择收支账户...</option>
                      {financeAccountTypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <>
                <OrderSearchSelect orders={orders} products={products} value={form.relatedId} onChange={v => setForm({ ...form, relatedId: v })} label="关联工单 / 计件参考" />
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{current.partnerLabel}</label>
                  <PartnerSelect
                    options={partners}
                    categories={partnerCategories}
                    value={form.partner}
                    onChange={name => setForm({ ...form, partner: name })}
                    placeholder="请选择..."
                  />
                </div>
              </>
            )}
            <div className="lg:col-span-2 mt-1 border-t border-slate-100" />
            <div className="space-y-1 lg:col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">结算金额 (CNY) <span className="text-rose-500">*</span></label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-black text-slate-400">¥</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.amount === 0 ? '' : form.amount}
                  onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full h-12 box-border bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 text-lg font-black text-slate-900 placeholder:text-slate-300 placeholder:font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-200 outline-none transition-all"
                />
              </div>
            </div>
            <div className="space-y-1 lg:col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">备注说明</label>
              <textarea
                rows={2}
                placeholder="输入备注..."
                value={form.note}
                onChange={e => setForm({ ...form, note: e.target.value })}
                className={formStandardTextareaClass}
              />
            </div>
          </div>
        </div>
        <div className="px-10 py-6 bg-slate-50/80 border-t border-slate-100 shrink-0">
          <button onClick={handleSave} disabled={!canSave} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-[0.98]">
            保存单据
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(FinanceRecordFormModal);
