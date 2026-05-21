/**
 * 采购订单：意向/数量与单价约定，不落 PSI 库存；行级无批次列。
 * 批次在转采购入库时由采购入库表单按分类规则录入，见 `docs/01-business-rules.md`「采购订单与批次」。
 */
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
import { SupplierSelect } from '../../components/SupplierSelect';
import { Product, ProductCategory, Partner, PartnerCategory, AppDictionaries } from '../../types';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { parsePsiNonVariantQuantityInput } from '../../utils/psiQtyInput';
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
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { effectivePlanFormFieldType } from '../../utils/planFormCustomField';
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
  onUpdateItem: (
    id: string,
    updates: Partial<{
      productId: string;
      quantity?: number;
      purchasePrice: number;
      variantQuantities?: Record<string, number>;
    }>,
  ) => void;
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
  formSettings: { standardFields: any[]; customFields: any[]; relatedProductEnabled?: boolean };
  /** 新增时展示的「将生成的单号」预览（保存逻辑在父组件强制自动生成） */
  previewAutoPoDocNumber?: string;
  partnerLabel: string;
  receivedByOrderLine: Record<string, number>;
  /** 按合作单位 + 商品 解析默认采购价（优先上次成交价，回退产品档案价） */
  resolveDefaultPurchasePrice?: (productId: string) => number;
}

const PurchaseOrderFormSection: React.FC<PurchaseOrderFormSectionProps> = ({
  form, setForm,
  purchaseOrderItems, onAddItem, onUpdateItem, onUpdateVariantQty, onRemoveItem,
  onSave, onBack, onDeleteRecords,
  editingDocNumber, hasPsiPerm,
  products, categories, partners, partnerCategories, dictionaries,
  productMapPSI, formatQtyDisplay, getUnitName,
  formSettings,
  previewAutoPoDocNumber,
  partnerLabel,
  receivedByOrderLine,
  resolveDefaultPurchasePrice,
}) => {
  const confirm = useConfirm();

  return (
    <div className={psiOrderBillFormShellClass}>
      <div className={psiOrderBillFormStickyBarClass}>
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
            className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {editingDocNumber ? '保存修改' : '确认保存采购订单'}
          </button>
        </div>
      </div>

      <div className={psiOrderBillFormCardClass}>
        <div className={psiOrderBillFormSectionStackClass}>
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
            <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
            <h3 className={sectionTitleClass}>1. 采购订单基础信息</h3>
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
            <div className={`md:col-span-2 grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
              <div className="space-y-1.5 min-w-0">
                <label className={formStandardLabelClass}>{partnerLabel}</label>
                <SupplierSelect
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
                      <span className="truncate">{previewAutoPoDocNumber || '保存时自动生成'}</span>
                    ) : (
                      <span className="truncate font-bold text-slate-400">选择合作单位后自动生成</span>
                    )}
                  </div>
                </div>
                <p className="text-[10px] font-bold text-slate-400 ml-1 leading-snug">由系统自动生成，不可修改</p>
              </div>
            </div>
            {formSettings.relatedProductEnabled && (
              <div className="space-y-1.5 min-w-0 md:col-span-2">
                <label className={formStandardLabelClass}>
                  关联产品
                </label>
                <p className="text-[10px] font-bold text-slate-400 ml-1 mb-1 leading-snug">
                  可选：说明本单采购物料主要服务于哪个产品（与下方明细「采购品项」不同）
                </p>
                <SearchableProductSelect
                  compact
                  categories={categories}
                  options={products}
                  value={String(form.customData?.relatedProductId ?? '')}
                  placeholder="搜索并选择关联产品…"
                  onChange={(id) => {
                    const next = { ...(form.customData || {}) } as Record<string, unknown>;
                    const t = String(id || '').trim();
                    if (t) next.relatedProductId = t;
                    else delete next.relatedProductId;
                    setForm({ ...form, customData: next });
                  }}
                  triggerClassName={psiOrderBillCompactLineInputClass}
                />
              </div>
            )}
            {editingDocNumber && formSettings.standardFields.find(f => f.id === 'dueDate')?.showInCreate !== false && (
              <div className="space-y-1">
                <label className={formStandardLabelClass}>期望到货日期</label>
                <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className={psiOrderBillCompactLineInputClass} />
              </div>
            )}
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
              <h3 className={sectionTitleClass}>2. 采购明细录入</h3>
            </div>
          </div>
          <div className="space-y-3">
            {purchaseOrderItems.map((line) => {
              const prod = productMapPSI.get(line.productId);
              const hasVariants = prod?.variants && prod.variants.length > 0;
              const lineQty = hasVariants
                ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                : (line.quantity ?? 0);
              const lineAmount = lineQty * (line.purchasePrice || 0);
              const poDocNum = editingDocNumber || form.docNumber || '';
              const received = poDocNum && line.sourceRecordIds
                ? line.sourceRecordIds.reduce((s, rid) => s + (receivedByOrderLine[`${poDocNum}::${rid}`] ?? 0), 0)
                : (poDocNum ? (receivedByOrderLine[`${poDocNum}::${line.id}`] ?? 0) : 0);
              const progress = lineQty > 0 ? Math.min(1, received / lineQty) : 0;
              return (
              <div key={line.id} className="p-2.5 bg-slate-50/50 rounded-xl border border-slate-100 space-y-2.5 shadow-sm hover:border-indigo-100/80 transition-all">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <label className={psiOrderBillCompactLineLabelClass}>目标采购品项</label>
                    <SearchableProductSelect
                      compact
                      categories={categories}
                      options={products}
                      value={line.productId}
                      placeholder="搜索并选择产品型号..."
                      onChange={(id) => {
                        const p = productMapPSI.get(id);
                        const hv = p?.variants && p.variants.length > 0;
                        const price = resolveDefaultPurchasePrice
                          ? resolveDefaultPurchasePrice(id)
                          : (p?.purchasePrice ?? 0);
                        onUpdateItem(line.id, {
                          productId: id,
                          purchasePrice: price,
                          quantity: hv ? undefined : 0,
                          variantQuantities: hv ? {} : undefined,
                        });
                      }}
                    />
                  </div>
                  <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                    <label className={psiOrderBillCompactLineLabelClass}>采购价 (元)</label>
                    <input type="number" min={0} step={0.01} value={line.purchasePrice || ''} onChange={e => onUpdateItem(line.id, { purchasePrice: parseFloat(e.target.value) || 0 })} className={psiOrderBillCompactLineInputClass} placeholder="0" />
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
                          <input type="number" min={0} step={0.01} value={line.quantity || ''} onChange={e => onUpdateItem(line.id, { quantity: parsePsiNonVariantQuantityInput(e.target.value) })} className={`${psiOrderBillCompactLineInputClass} min-w-0 flex-1`} placeholder="0" />
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
                  <button type="button" onClick={() => onRemoveItem(line.id)} className="shrink-0 rounded-lg p-1 text-slate-300 transition-all hover:bg-rose-50 hover:text-rose-500" aria-label="删除明细行"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                {hasVariants && line.productId && prod && (
                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                      <Layers className="w-3.5 h-3.5" /> 颜色尺码数量
                    </label>
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
            {purchaseOrderItems.length === 0 && (
              <div className="py-8 border-2 border-dashed border-slate-100 rounded-xl text-center">
                <Layers className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入采购明细</p>
              </div>
            )}
          </div>
          <div className="flex justify-start pt-3">
            <button type="button" onClick={onAddItem} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all">
              <Plus className="w-4 h-4 shrink-0" /> 添加明细行
            </button>
          </div>
          <div className={psiOrderBillCompactSummaryBarClass}>
            <div className="flex items-baseline gap-2">
              <span className={psiOrderBillCompactSummaryLabelClass}>采购总量</span>
              <span className={psiOrderBillCompactSummaryValueClass}>
                {purchaseOrderItems.reduce((s, i) => {
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
                {purchaseOrderItems.reduce((s, i) => {
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                  return s + q * (i.purchasePrice || 0);
                }, 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(PurchaseOrderFormSection);
