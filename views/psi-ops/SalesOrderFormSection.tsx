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
import { CustomerSelect } from '../../components/CustomerSelect';
import type { PlanListPrintSettings, PrintRenderContext, PrintTemplate } from '../../types';
import { Product, ProductCategory, Partner, PartnerCategory, AppDictionaries } from '../../types';
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
  psiOrderBillFormSectionIconIndigoClass,
  psiOrderBillFormSectionIconEmeraldClass,
  psiOrderBillCompactLineLabelClass,
  psiOrderBillCompactLineInputClass,
  psiOrderBillCompactLineReadonlyClass,
  psiOrderBillCompactDocReadonlyInnerClass,
  psiOrderBillCompactSummaryBarClass,
  psiOrderBillCompactSummaryLabelClass,
  psiOrderBillCompactSummaryValueClass,
  psiOrderBillCompactSummaryUnitClass,
  formStandardLabelClass,
} from '../../styles/uiDensity';
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
  /** 新增时展示的将生成单号（保存时由系统自动生成，不可手改） */
  previewAutoSODocNumber?: string;
  formSettings: { standardFields: any[]; customFields: any[] };
  /** 列表与详情页共用：进销存销售订单表单配置 `listPrint` */
  listPrintSlot?: PlanListPrintSettings;
  printTemplates?: PrintTemplate[];
  buildSalesOrderPrintContext?: (template: PrintTemplate) => PrintRenderContext;
  /** 按合作单位 + 商品 解析默认销售价（优先上次成交价，回退产品档案价） */
  resolveDefaultSalesPrice?: (productId: string) => number;
}

const SalesOrderFormSection: React.FC<SalesOrderFormSectionProps> = ({
  form, setForm,
  salesOrderItems, onAddItem, onUpdateItem, onUpdateVariantQty, onRemoveItem,
  onSave, onBack, onDeleteRecords,
  editingDocNumber, hasPsiPerm,
  products, categories, partners, partnerCategories, dictionaries,
  productMapPSI, formatQtyDisplay, getUnitName,
  partnerLabel,
  previewAutoSODocNumber,
  formSettings,
  listPrintSlot,
  printTemplates = [],
  buildSalesOrderPrintContext,
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
          {editingDocNumber && (
            <PsiListPrintPicker
              slot={listPrintSlot}
              printTemplates={printTemplates}
              buildContext={buildSalesOrderPrintContext}
              pickerSubtitle={editingDocNumber}
            />
          )}
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
              className="flex items-center gap-2 px-4 py-2 text-rose-600 font-bold rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-all"
            >
              <Trash2 className="w-4 h-4" /> 删除
            </button>
          )}
          <button
            type="button"
            onClick={() => onSave()}
            disabled={!form.partner || salesOrderItems.length === 0 || !salesOrderItems.some(i => {
              if (!i.productId) return false;
              const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
              return q > 0;
            })}
            className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {editingDocNumber ? '保存修改' : '确认保存销售订单'}
          </button>
        </div>
      </div>

      <div className={psiOrderBillFormCardClass}>
        <div className={psiOrderBillFormSectionStackClass}>
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
            <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
            <h3 className={sectionTitleClass}>1. 销售订单基础信息</h3>
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
            <div className={`md:col-span-2 grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
              <div className="space-y-1.5 min-w-0">
                <label className={formStandardLabelClass}>{partnerLabel}</label>
                <CustomerSelect
                  options={partners}
                  categories={partnerCategories}
                  value={form.partner}
                  onChange={(name, id) => setForm({ ...form, partner: name, partnerId: id })}
                  placeholder={`选择${partnerLabel}...`}
                />
              </div>
              <div className="space-y-1 min-w-0">
                <label className={formStandardLabelClass}>单据编号</label>
                <div className="relative">
                  <FileText className="absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-slate-300 pointer-events-none" />
                  <div className={psiOrderBillCompactDocReadonlyInnerClass}>
                    {editingDocNumber ? (
                      <span className="truncate">{editingDocNumber}</span>
                    ) : form.partner ? (
                      <span className="truncate">{previewAutoSODocNumber || '保存时自动生成'}</span>
                    ) : (
                      <span className="truncate font-bold text-slate-400">选择合作单位后自动生成</span>
                    )}
                  </div>
                </div>
                <p className="text-[10px] font-bold text-slate-400 ml-1 leading-snug">由系统自动生成，不可修改</p>
              </div>
            </div>
            {formSettings.customFields.filter(f => f.showInCreate).map(cf => {
              const eff = effectivePlanFormFieldType(cf);
              return (
                <div key={cf.id} className={eff === 'text' || eff === 'file' ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
                  <label className={formStandardLabelClass}>{cf.label}</label>
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
              <h3 className={sectionTitleClass}>2. 销售明细录入</h3>
            </div>
          </div>
          <div className="space-y-3">
            {salesOrderItems.map((line) => {
              const prod = productMapPSI.get(line.productId);
              const hasVariants = prod?.variants && prod.variants.length > 0;
              const lineQty = hasVariants
                ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                : (line.quantity ?? 0);
              const lineAmount = lineQty * (line.salesPrice || 0);
              return (
              <div key={line.id} className="p-2.5 bg-slate-50/50 rounded-xl border border-slate-100 space-y-2.5 shadow-sm hover:border-indigo-100/80 transition-all">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <label className={psiOrderBillCompactLineLabelClass}>目标商品</label>
                    <SearchableProductSelect
                      compact
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
                  <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                    <label className={psiOrderBillCompactLineLabelClass}>销售价 (元)</label>
                    <input type="number" min={0} step={0.01} value={line.salesPrice || ''} onChange={e => onUpdateItem(line.id, { salesPrice: parseFloat(e.target.value) || 0 })} className={psiOrderBillCompactLineInputClass} placeholder="0" />
                  </div>
                  {hasVariants && (
                    <>
                      <div className="w-20 shrink-0 space-y-0.5">
                        <label className={psiOrderBillCompactLineLabelClass}>总数</label>
                        <div className={psiOrderBillCompactLineReadonlyClass}>
                          {formatQtyDisplay(lineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                        </div>
                      </div>
                      <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                        <label className={psiOrderBillCompactLineLabelClass}>金额 (元)</label>
                        <div className={psiOrderBillCompactLineReadonlyClass}>
                          {lineAmount.toFixed(2)}
                        </div>
                      </div>
                    </>
                  )}
                  {!hasVariants && (
                    <>
                      <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                        <label className={psiOrderBillCompactLineLabelClass}>数量</label>
                        <div className="flex h-9 min-h-9 items-stretch gap-1">
                          <input type="number" min={0} value={line.quantity || ''} onChange={e => onUpdateItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className={`${psiOrderBillCompactLineInputClass} min-w-0 flex-1`} placeholder="0" />
                          <span className="flex shrink-0 items-center text-[9px] font-bold text-slate-400">{line.productId ? getUnitName(line.productId) : '—'}</span>
                        </div>
                      </div>
                      <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                        <label className={psiOrderBillCompactLineLabelClass}>金额 (元)</label>
                        <div className={psiOrderBillCompactLineReadonlyClass}>
                          {lineAmount.toFixed(2)}
                        </div>
                      </div>
                    </>
                  )}
                  <button type="button" onClick={() => onRemoveItem(line.id)} className="shrink-0 rounded-lg p-1 text-slate-300 transition-all hover:bg-rose-50 hover:text-rose-500" aria-label="删除明细行"><Trash2 className="h-3.5 w-3.5" /></button>
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
            {salesOrderItems.length === 0 && (
              <div className="py-8 border-2 border-dashed border-slate-100 rounded-xl text-center">
                <Layers className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入销售明细</p>
              </div>
            )}
          </div>
          <div className="flex justify-start pt-3">
            <button type="button" onClick={onAddItem} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all">
              <Plus className="w-4 h-4" /> 添加明细行
            </button>
          </div>
          <div className={psiOrderBillCompactSummaryBarClass}>
            <div className="flex items-baseline gap-2">
              <span className={psiOrderBillCompactSummaryLabelClass}>销售总量</span>
              <span className={psiOrderBillCompactSummaryValueClass}>
                {salesOrderItems.reduce((s, i) => {
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                  return s + q;
                }, 0)}
                <span className={psiOrderBillCompactSummaryUnitClass}>PCS</span>
              </span>
            </div>
            <div className="flex items-baseline gap-2 border-l border-white/25 pl-4">
              <span className={psiOrderBillCompactSummaryLabelClass}>订单金额</span>
              <span className={psiOrderBillCompactSummaryValueClass}>
                ¥
                {salesOrderItems.reduce((s, i) => {
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                  return s + q * (i.salesPrice || 0);
                }, 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SalesOrderFormSection);
