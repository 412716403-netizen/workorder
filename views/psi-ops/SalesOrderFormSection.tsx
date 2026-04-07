import React from 'react';
import {
  Plus,
  ArrowLeft,
  Save,
  Trash2,
  Layers,
  FileText,
} from 'lucide-react';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';
import { Product, ProductCategory, Partner, PartnerCategory, AppDictionaries, ProductVariant } from '../../types';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';
import { sectionTitleClass } from '../../styles/uiDensity';
import { useConfirm } from '../../contexts/ConfirmContext';

export interface SalesOrderLineItem {
  id: string;
  productId: string;
  quantity?: number;
  salesPrice: number;
  variantQuantities?: Record<string, number>;
  sourceRecordIds?: string[];
}

interface SalesOrderFormSectionProps {
  form: any;
  setForm: (form: any) => void;
  salesOrderItems: SalesOrderLineItem[];
  onAddItem: () => void;
  onUpdateItem: (id: string, updates: Partial<{ productId: string; quantity?: number; salesPrice: number; variantQuantities?: Record<string, number> }>) => void;
  onUpdateVariantQty: (lineId: string, variantId: string, qty: number) => void;
  onRemoveItem: (id: string) => void;
  onSave: () => void;
  onBack: () => void;
  onDeleteRecords?: (type: string, docNumber: string) => void;
  editingDocNumber: string | null;
  hasPsiPerm: (perm: string) => boolean;
  products: Product[];
  categories: ProductCategory[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  dictionaries: AppDictionaries;
  productMapPSI: Map<string, Product>;
  formatQtyDisplay: (q: number | string | undefined | null) => number;
  getUnitName: (productId: string) => string;
  partnerLabel: string;
}

const SalesOrderFormSection: React.FC<SalesOrderFormSectionProps> = ({
  form, setForm,
  salesOrderItems, onAddItem, onUpdateItem, onUpdateVariantQty, onRemoveItem,
  onSave, onBack, onDeleteRecords,
  editingDocNumber, hasPsiPerm,
  products, categories, partners, partnerCategories, dictionaries,
  productMapPSI, formatQtyDisplay, getUnitName,
  partnerLabel,
}) => {
  const confirm = useConfirm();

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 pb-24">
      <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        <div className="flex items-center gap-3">
          {editingDocNumber && onDeleteRecords && hasPsiPerm('psi:sales_order:delete') && (
            <button
              type="button"
              onClick={() => {
                void confirm({ message: '确定要删除该销售订单吗？', danger: true }).then((ok) => {
                  if (!ok) return;
                  onDeleteRecords!('SALES_ORDER', editingDocNumber!);
                  onBack();
                });
              }}
              className="flex items-center gap-2 px-4 py-2.5 text-rose-600 font-bold rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-all"
            >
              <Trash2 className="w-4 h-4" /> 删除
            </button>
          )}
          <button
            onClick={() => onSave()}
            disabled={!form.partner || salesOrderItems.length === 0 || !salesOrderItems.some(i => {
              if (!i.productId) return false;
              const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
              return q > 0;
            })}
            className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {editingDocNumber ? '保存修改' : '确认保存销售订单'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-10">
        <div className="space-y-8">
          <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
            <h3 className={sectionTitleClass}>1. 销售订单基础信息</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{partnerLabel}</label>
              <SearchablePartnerSelect
                options={partners}
                categories={partnerCategories}
                value={form.partner}
                onChange={(name, id) => setForm({ ...form, partner: name, partnerId: id })}
                placeholder={`选择${partnerLabel}...`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号 (选填)</label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({ ...form, docNumber: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">期望交货日期</label>
              <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
              <input type="date" value={form.createdAt} onChange={e => setForm({ ...form, createdAt: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
            </div>
            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据备注</label>
              <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
            </div>
          </div>
        </div>

        <div className="pt-10 border-t border-slate-50 space-y-8">
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><Layers className="w-5 h-5" /></div>
              <h3 className={sectionTitleClass}>2. 销售明细录入</h3>
            </div>
            <button onClick={onAddItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
              <Plus className="w-4 h-4" /> 添加明细行
            </button>
          </div>
          <div className="space-y-4">
            {salesOrderItems.map((line) => {
              const prod = productMapPSI.get(line.productId);
              const hasVariants = prod?.variants && prod.variants.length > 0;
              const lineQty = hasVariants
                ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                : (line.quantity ?? 0);
              const lineAmount = lineQty * (line.salesPrice || 0);
              const groupedByColor: Record<string, ProductVariant[]> = {};
              if (prod?.variants) {
                prod.variants.forEach(v => {
                  if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                  groupedByColor[v.colorId].push(v);
                });
              }
              return (
              <div key={line.id} className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[240px] space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">目标商品 (支持搜索与分类筛选)</label>
                    <SearchableProductSelect
                      options={products}
                      categories={categories}
                      value={line.productId}
                      onChange={(id) => {
                        const p = productMapPSI.get(id);
                        const hv = p?.variants && p.variants.length > 0;
                        onUpdateItem(line.id, {
                          productId: id,
                          salesPrice: p?.salesPrice ?? 0,
                          quantity: hv ? undefined : 0,
                          variantQuantities: hv ? {} : undefined
                        });
                      }}
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">销售价 (元)</label>
                    <input type="number" min={0} step={0.01} value={line.salesPrice || ''} onChange={e => onUpdateItem(line.id, { salesPrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                  </div>
                  {hasVariants && (
                    <>
                      <div className="w-24 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">总数</label>
                        <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                          {formatQtyDisplay(lineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                        </div>
                      </div>
                      <div className="w-28 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                        <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                          {lineAmount.toFixed(2)}
                        </div>
                      </div>
                    </>
                  )}
                  {!hasVariants && (
                    <>
                      <div className="w-28 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">销售数量（无颜色尺码）</label>
                        <div className="flex items-center gap-1.5">
                          <input type="number" min={0} value={line.quantity || ''} onChange={e => onUpdateItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                          <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                        </div>
                      </div>
                      <div className="w-28 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                        <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                          {lineAmount.toFixed(2)}
                        </div>
                      </div>
                    </>
                  )}
                  <button onClick={() => onRemoveItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                </div>
                {hasVariants && line.productId && (
                  <div className="pt-4 border-t border-slate-100 space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">数量明细（有颜色尺码）</p>
                    {sortedVariantColorEntries(groupedByColor, prod?.colorIds, prod?.sizeIds).map(([colorId, colorVariants]) => {
                      const color = dictionaries.colors.find(c => c.id === colorId);
                      return (
                        <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-2 w-28 shrink-0">
                            <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                            <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {colorVariants.map(v => {
                              const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                              return (
                                <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                  <span className="text-[9px] font-black text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    placeholder="0"
                                    value={line.variantQuantities?.[v.id] ?? ''}
                                    onChange={e => onUpdateVariantQty(line.id, v.id, parseInt(e.target.value) || 0)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div className="ml-auto text-right shrink-0 bg-slate-50/80 px-3 py-2 rounded-xl border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase">颜色小计</p>
                            <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );})}
            {salesOrderItems.length === 0 && (
              <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入销售明细</p>
              </div>
            )}
          </div>
          <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100 gap-8">
            <div className="flex items-center gap-4">
              <p className="text-xs font-bold opacity-80">销售总量:</p>
              <p className="text-xl font-black">{salesOrderItems.reduce((s, i) => {
              const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
              return s + q;
            }, 0)} <span className="text-xs font-medium">PCS</span></p>
            </div>
            <div className="flex items-center gap-4 border-l border-white/30 pl-8">
              <p className="text-xs font-bold opacity-80">订单金额:</p>
              <p className="text-xl font-black">¥{salesOrderItems.reduce((s, i) => {
                const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                return s + q * (i.salesPrice || 0);
              }, 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SalesOrderFormSection);
