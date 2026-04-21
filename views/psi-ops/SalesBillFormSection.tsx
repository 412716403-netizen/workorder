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
import type { PlanListPrintSettings, PrintRenderContext, PrintTemplate } from '../../types';
import { Product, Warehouse, ProductCategory, Partner, PartnerCategory, AppDictionaries } from '../../types';
import { PsiListPrintPicker } from '../../components/psi/PsiListPrintPicker';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { effectivePlanFormFieldType } from '../../utils/planFormCustomField';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import {
  sectionTitleClass,
  psiOrderBillFormShellClass,
  psiOrderBillFormStickyBarClass,
  psiOrderBillFormCardClass,
  psiOrderBillFormSectionStackClass,
  psiOrderBillFormDetailSplitClass,
  psiOrderBillFormGridGapClass,
  psiOrderBillFormFieldControlClass,
  psiOrderBillFormReadonlyBoxClass,
  psiOrderBillFormSectionIconIndigoClass,
  psiOrderBillFormSectionIconEmeraldClass,
  psiOrderBillFormPartnerTriggerClass,
} from '../../styles/uiDensity';
import { useConfirm } from '../../contexts/ConfirmContext';

export interface SalesBillLineItem {
  id: string;
  productId: string;
  quantity?: number;
  salesPrice: number;
  variantQuantities?: Record<string, number>;
  sourceRecordIds?: string[];
}

interface SalesBillFormSectionProps {
  form: any;
  setForm: (form: any) => void;
  /** 展示用单号：新建为系统预生成号，编辑为原单号（只读） */
  readonlyDocNumber: string;
  salesBillItems: SalesBillLineItem[];
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
  warehouses: Warehouse[];
  productMapPSI: Map<string, Product>;
  formatQtyDisplay: (q: number | string | undefined | null) => number;
  getUnitName: (productId: string) => string;
  partnerLabel: string;
  formSettings: { standardFields: any[]; customFields: any[] };
  /** 列表与登记/详情共用：`salesBillFormSettings.listPrint` */
  listPrintSlot?: PlanListPrintSettings;
  printTemplates?: PrintTemplate[];
  buildSalesBillPrintContext?: (template: PrintTemplate) => PrintRenderContext;
  /** 按合作单位 + 商品 解析默认销售价（优先上次成交价，回退产品档案价） */
  resolveDefaultSalesPrice?: (productId: string) => number;
}

const SalesBillFormSection: React.FC<SalesBillFormSectionProps> = ({
  form, setForm, readonlyDocNumber,
  salesBillItems, onAddItem, onUpdateItem, onUpdateVariantQty, onRemoveItem,
  onSave, onBack, onDeleteRecords,
  editingDocNumber, hasPsiPerm,
  products, categories, partners, partnerCategories, dictionaries, warehouses,
  productMapPSI, formatQtyDisplay, getUnitName,
  partnerLabel,
  formSettings,
  listPrintSlot,
  printTemplates = [],
  buildSalesBillPrintContext,
  resolveDefaultSalesPrice,
}) => {
  const confirm = useConfirm();

  return (
    <div className={psiOrderBillFormShellClass}>
      <div className={psiOrderBillFormStickyBarClass}>
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        <div className="flex items-center gap-3">
          <PsiListPrintPicker
            slot={listPrintSlot}
            printTemplates={printTemplates}
            buildContext={buildSalesBillPrintContext}
            pickerSubtitle={readonlyDocNumber || undefined}
          />
          {editingDocNumber && onDeleteRecords && hasPsiPerm('psi:sales_bill:delete') && (
            <button
              type="button"
              onClick={() => {
                void confirm({ message: '确定要删除该销售单吗？', danger: true }).then((ok) => {
                  if (!ok) return;
                  onDeleteRecords!('SALES_BILL', editingDocNumber!);
                  onBack();
                });
              }}
              className="flex items-center gap-2 px-4 py-2 text-rose-600 font-bold rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-all"
            >
              <Trash2 className="w-4 h-4" /> 删除
            </button>
          )}
          <button
            type="button"
            onClick={() => onSave()}
            disabled={!form.partner || !form.warehouseId || salesBillItems.length === 0 || !salesBillItems.some(i => {
              if (!i.productId) return false;
              const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
              return q !== 0;
            })}
            className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {editingDocNumber ? '保存修改' : '确认保存销售单'}
          </button>
        </div>
      </div>

      <div className={psiOrderBillFormCardClass}>
        <div className={psiOrderBillFormSectionStackClass}>
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
            <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
            <h3 className={sectionTitleClass}>1. 销售单基础信息</h3>
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
            <div className={`md:col-span-2 grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass} items-start`}>
              <div className="w-full min-w-0 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{partnerLabel}</label>
                <SearchablePartnerSelect
                  options={partners}
                  categories={partnerCategories}
                  value={form.partner}
                  onChange={(name, id) => setForm({ ...form, partner: name, partnerId: id })}
                  placeholder={`选择${partnerLabel}...`}
                  showCategoryHint={false}
                  triggerClassName={psiOrderBillFormPartnerTriggerClass}
                />
              </div>
              <div className="w-full min-w-0 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号（系统自动生成，不可改）</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                  <div className={`${psiOrderBillFormReadonlyBoxClass} text-slate-700 box-border`}>
                    {readonlyDocNumber ? (
                      <span className="truncate">{readonlyDocNumber}</span>
                    ) : (
                      <span className="text-slate-400 font-bold text-sm truncate">选择合作单位后自动生成</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">出库仓库</label>
              <select value={form.warehouseId} onChange={e => setForm({ ...form, warehouseId: e.target.value })} className={`${psiOrderBillFormFieldControlClass} text-sm`}>
                <option value="">选择仓库...</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            {formSettings.customFields.filter(f => f.showInCreate).map(cf => {
              const eff = effectivePlanFormFieldType(cf);
              return (
                <div key={cf.id} className={eff === 'text' || eff === 'file' ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{cf.label}</label>
                  <PlanFormCustomFieldInput
                    cf={cf}
                    value={form.customData?.[cf.id]}
                    onChange={next => setForm({ ...form, customData: { ...form.customData, [cf.id]: next } })}
                    controlClassName={psiOrderBillFormFieldControlClass}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className={psiOrderBillFormDetailSplitClass}>
          <div className="flex items-center border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className={psiOrderBillFormSectionIconEmeraldClass}><Layers className="w-4 h-4" /></div>
              <h3 className={sectionTitleClass}>2. 销售出库明细</h3>
            </div>
          </div>
          <div className="space-y-3">
            {salesBillItems.map((line) => {
              const prod = productMapPSI.get(line.productId);
              const hasVariants = prod?.variants && prod.variants.length > 0;
              const lineQty = hasVariants
                ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                : (line.quantity ?? 0);
              const lineAmount = lineQty * (line.salesPrice || 0);
              return (
              <div key={line.id} className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px] space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">目标商品 (支持搜索与分类筛选)</label>
                    <SearchableProductSelect
                      options={products}
                      categories={categories}
                      value={line.productId}
                      onChange={(id) => {
                        const p = productMapPSI.get(id);
                        const hv = p?.variants && p.variants.length > 0;
                        const price = resolveDefaultSalesPrice
                          ? resolveDefaultSalesPrice(id)
                          : (p?.salesPrice ?? 0);
                        onUpdateItem(line.id, {
                          productId: id,
                          salesPrice: price,
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
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">出库数量（负数=退货）</label>
                        <div className="flex items-center gap-1.5">
                          <input type="number" value={line.quantity ?? ''} onChange={e => { const v = parseInt(e.target.value, 10); onUpdateItem(line.id, { quantity: Number.isNaN(v) ? 0 : v }); }} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
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
                  <button type="button" onClick={() => onRemoveItem(line.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                </div>
                {hasVariants && line.productId && prod && (
                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">数量明细（有颜色尺码）</p>
                    <VariantQtyMatrixInputs
                      product={prod}
                      dictionaries={dictionaries}
                      quantities={line.variantQuantities ?? {}}
                      onVariantQtyChange={(variantId, qty) => onUpdateVariantQty(line.id, variantId, qty)}
                    />
                  </div>
                )}
              </div>
            );})}
            {salesBillItems.length === 0 && (
              <div className="py-8 border-2 border-dashed border-slate-100 rounded-xl text-center">
                <Layers className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入销售出库明细（数量可填负数表示退货）</p>
              </div>
            )}
          </div>
          <div className="flex justify-start pt-3">
            <button type="button" onClick={onAddItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
              <Plus className="w-4 h-4" /> 添加明细行
            </button>
          </div>
          <div className="flex justify-end p-4 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-100/80 gap-6">
            <div className="flex items-center gap-3">
              <p className="text-xs font-bold opacity-80">出库总量:</p>
              <p className="text-lg font-black">{salesBillItems.reduce((s, i) => {
              const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
              return s + q;
            }, 0)} <span className="text-xs font-medium">PCS</span></p>
            </div>
            <div className="flex items-center gap-3 border-l border-white/30 pl-6">
              <p className="text-xs font-bold opacity-80">单据金额:</p>
              <p className="text-lg font-black">¥{salesBillItems.reduce((s, i) => {
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

export default React.memo(SalesBillFormSection);
