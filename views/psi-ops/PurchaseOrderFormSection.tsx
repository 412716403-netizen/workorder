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

export interface PurchaseOrderLineItem {
  id: string;
  productId: string;
  quantity?: number;
  purchasePrice: number;
  variantQuantities?: Record<string, number>;
  sourceRecordIds?: string[];
}

interface PurchaseOrderFormSectionProps {
  form: any;
  setForm: (form: any) => void;
  purchaseOrderItems: PurchaseOrderLineItem[];
  onAddItem: () => void;
  onUpdateItem: (id: string, updates: Partial<{ productId: string; quantity?: number; purchasePrice: number; variantQuantities?: Record<string, number> }>) => void;
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
  formSettings: { standardFields: any[]; customFields: any[] };
  partnerLabel: string;
  receivedByOrderLine: Record<string, number>;
}

const PurchaseOrderFormSection: React.FC<PurchaseOrderFormSectionProps> = ({
  form, setForm,
  purchaseOrderItems, onAddItem, onUpdateItem, onUpdateVariantQty, onRemoveItem,
  onSave, onBack, onDeleteRecords,
  editingDocNumber, hasPsiPerm,
  products, categories, partners, partnerCategories, dictionaries,
  productMapPSI, formatQtyDisplay, getUnitName,
  formSettings, partnerLabel, receivedByOrderLine,
}) => {
  const confirm = useConfirm();

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 pb-24">
      <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-bold text-sm">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        <div className="flex items-center gap-3">
          {editingDocNumber && onDeleteRecords && hasPsiPerm('psi:purchase_order:delete') && (
            <button
              type="button"
              onClick={() => {
                void confirm({ message: '确定要删除该采购订单吗？', danger: true }).then((ok) => {
                  if (!ok) return;
                  onDeleteRecords!('PURCHASE_ORDER', editingDocNumber!);
                  onBack();
                });
              }}
              className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold transition-all border border-rose-200"
            >
              <Trash2 className="w-4 h-4" /> 删除
            </button>
          )}
          <button
            type="button"
            onClick={() => onSave()}
            disabled={!form.partner || purchaseOrderItems.length === 0 || !purchaseOrderItems.some(i => {
              if (!i.productId) return false;
              const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
              return q > 0;
            })}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {editingDocNumber ? '保存修改' : '确认保存采购订单'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-10">
        <div className="space-y-8">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
            <h3 className={sectionTitleClass}>1. 采购订单基础信息</h3>
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
                triggerClassName="text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号 (选填)</label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({ ...form, docNumber: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
              </div>
            </div>
            {formSettings.standardFields.find(f => f.id === 'dueDate')?.showInCreate !== false && (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">期望到货日期</label>
                <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
              <input type="date" value={form.createdAt} onChange={e => setForm({ ...form, createdAt: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
            </div>
            {formSettings.standardFields.find(f => f.id === 'note')?.showInCreate !== false && (
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据备注</label>
                <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
              </div>
            )}
            {formSettings.customFields.filter(f => f.showInCreate).map(cf => (
              <div key={cf.id} className={cf.type === 'text' || cf.type === undefined ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
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

        <div className="pt-10 border-t border-slate-50 space-y-8">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><Layers className="w-5 h-5" /></div>
              <h3 className={sectionTitleClass}>2. 采购明细录入</h3>
            </div>
            <button type="button" onClick={onAddItem} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all">
              <Plus className="w-4 h-4 shrink-0" /> 添加明细行
            </button>
          </div>
          <div className="space-y-4">
            {purchaseOrderItems.map((line) => {
              const prod = productMapPSI.get(line.productId);
              const hasVariants = prod?.variants && prod.variants.length > 0;
              const lineQty = hasVariants
                ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                : (line.quantity ?? 0);
              const lineAmount = lineQty * (line.purchasePrice || 0);
              const groupedByColor: Record<string, ProductVariant[]> = {};
              if (prod?.variants) {
                prod.variants.forEach(v => {
                  if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                  groupedByColor[v.colorId].push(v);
                });
              }
              const poDocNum = editingDocNumber || form.docNumber || '';
              const received = poDocNum && line.sourceRecordIds
                ? line.sourceRecordIds.reduce((s, rid) => s + (receivedByOrderLine[`${poDocNum}::${rid}`] ?? 0), 0)
                : (poDocNum ? (receivedByOrderLine[`${poDocNum}::${line.id}`] ?? 0) : 0);
              const progress = lineQty > 0 ? Math.min(1, received / lineQty) : 0;
              return (
              <div key={line.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4 shadow-sm hover:border-indigo-100/80 transition-all">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[200px] space-y-2 min-w-0">
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block tracking-widest">目标采购品项 (支持搜索与分类筛选)</label>
                    <SearchableProductSelect
                      compact
                      categories={categories}
                      options={products}
                      value={line.productId}
                      placeholder="搜索并选择产品型号..."
                      onChange={(id) => {
                        const p = productMapPSI.get(id);
                        const hv = p?.variants && p.variants.length > 0;
                        onUpdateItem(line.id, {
                          productId: id,
                          purchasePrice: p?.purchasePrice ?? 0,
                          quantity: hv ? undefined : 0,
                          variantQuantities: hv ? {} : undefined
                        });
                      }}
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">采购价 (元)</label>
                    <input type="number" min={0} step={0.01} value={line.purchasePrice || ''} onChange={e => onUpdateItem(line.id, { purchasePrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                  </div>
                  {hasVariants && (
                    <>
                      <div className="w-24 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">总数</label>
                        <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                          {formatQtyDisplay(lineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                        </div>
                      </div>
                      <div className="w-28 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                        <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                          {lineAmount.toFixed(2)}
                        </div>
                      </div>
                    </>
                  )}
                  {!hasVariants && (
                    <>
                      <div className="w-24 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">数量</label>
                        <div className="flex items-center gap-1.5">
                          <input type="number" min={0} value={line.quantity || ''} onChange={e => onUpdateItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                          <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                        </div>
                      </div>
                      <div className="w-28 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                        <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                          {lineAmount.toFixed(2)}
                        </div>
                      </div>
                    </>
                  )}
                  {poDocNum && received > 0 && (
                    <div className="w-40 space-y-1 shrink-0">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">入库进度</label>
                      <div className="flex flex-col gap-1">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                          {received > lineQty ? (
                            <>
                              <div className="h-full bg-emerald-500" style={{ width: `${(lineQty / received) * 100}%` }} />
                              <div className="h-full bg-rose-500" style={{ width: `${((received - lineQty) / received) * 100}%` }} />
                            </>
                          ) : (
                            <div className={`h-full rounded-full ${progress >= 1 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, progress * 100)}%` }} />
                          )}
                        </div>
                        <span className="text-[9px] font-bold text-slate-500">
                          {received > lineQty ? `已收 ${received} / ${lineQty}（已超收）` : `已收 ${received} / ${lineQty}`}
                        </span>
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => onRemoveItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all" aria-label="删除明细行"><Trash2 className="w-5 h-5" /></button>
                </div>
                {hasVariants && line.productId && (
                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                      <Layers className="w-3.5 h-3.5" /> 颜色尺码数量
                    </label>
                    {sortedVariantColorEntries(groupedByColor, prod?.colorIds, prod?.sizeIds).map(([colorId, colorVariants]) => {
                      const color = dictionaries.colors.find(c => c.id === colorId);
                      return (
                        <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white/80 p-3 rounded-xl border border-slate-100">
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
                          <div className="ml-auto text-right shrink-0">
                            <span className="text-[9px] font-black text-slate-400">小计</span>
                            <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );})}
            {purchaseOrderItems.length === 0 && (
              <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入采购明细</p>
              </div>
            )}
          </div>
          <div className="flex justify-end p-5 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100 gap-8">
            <div className="flex items-center gap-4">
              <p className="text-xs font-bold opacity-90">采购总量</p>
              <p className="text-xl font-black tabular-nums">{purchaseOrderItems.reduce((s, i) => {
              const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
              return s + q;
            }, 0)} <span className="text-xs font-semibold opacity-90">PCS</span></p>
            </div>
            <div className="flex items-center gap-4 border-l border-white/30 pl-8">
              <p className="text-xs font-bold opacity-90">订单金额</p>
              <p className="text-xl font-black tabular-nums">¥{purchaseOrderItems.reduce((s, i) => {
                const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                return s + q * (i.purchasePrice || 0);
              }, 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(PurchaseOrderFormSection);
