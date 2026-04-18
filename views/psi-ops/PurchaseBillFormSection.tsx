import React, { useState, useMemo } from 'react';
import {
  Plus,
  ArrowLeft,
  Save,
  Trash2,
  Layers,
  FileText,
  ClipboardList,
  ArrowDownToLine,
  ListFilter,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';
import type { PlanListPrintSettings, PrintRenderContext, PrintTemplate } from '../../types';
import { Product, Warehouse, ProductCategory, Partner, PartnerCategory, AppDictionaries, ProductVariant } from '../../types';
import { PsiListPrintPicker } from '../../components/psi/PsiListPrintPicker';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';
import { localTodayYmd, localCalendarYmdStartToIso } from '../../utils/localDateTime';
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
  psiOrderBillFormPartnerTriggerClass,
} from '../../styles/uiDensity';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { effectivePlanFormFieldType } from '../../utils/planFormCustomField';

export interface PurchaseBillLineItem {
  id: string;
  productId: string;
  quantity?: number;
  purchasePrice: number;
  variantQuantities?: Record<string, number>;
  batch?: string;
}

interface PurchaseBillFormSectionProps {
  form: any;
  setForm: (form: any) => void;
  purchaseBillItems: PurchaseBillLineItem[];
  onAddItem: () => void;
  onUpdateItem: (id: string, updates: Partial<{ productId: string; quantity?: number; purchasePrice: number; variantQuantities?: Record<string, number>; batch?: string }>) => void;
  onUpdateVariantQty: (lineId: string, variantId: string, qty: number) => void;
  onRemoveItem: (id: string) => void;
  onResetItems: () => void;
  onSaveManual: () => void;
  onBack: () => void;
  /** 单条写入（与进销存「添加一条」一致，须为对象不可传数组） */
  onSaveRecord: (record: any) => void | Promise<void>;
  /** 多条一次写入（推荐：由采购订单转化时整单批量保存） */
  onSaveBatch?: (records: any[]) => Promise<void>;
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
  categoryMapPSI: Map<string, ProductCategory>;
  formatQtyDisplay: (q: number | string | undefined | null) => number;
  getUnitName: (productId: string) => string;
  formSettings: { standardFields: any[]; customFields: any[] };
  partnerLabel: string;
  recordsList: any[];
  receivedByOrderLine: Record<string, number>;
  generatePBDocNumber: (partnerId: string, partnerName: string) => string;
  /** 手动新建时根据当前供应商预览将生成的单号（保存时由父组件自动生成） */
  previewAutoPbDocNumber?: string;
  /** 列表与详情页共用：`purchaseBillFormSettings.listPrint` */
  listPrintSlot?: PlanListPrintSettings;
  printTemplates?: PrintTemplate[];
  buildPurchaseBillPrintContext?: (template: PrintTemplate) => PrintRenderContext;
  /** 按合作单位 + 商品 解析默认采购价（优先上次成交价，回退产品档案价） */
  resolveDefaultPurchasePrice?: (productId: string) => number;
}

const PurchaseBillFormSection: React.FC<PurchaseBillFormSectionProps> = ({
  form, setForm,
  purchaseBillItems, onAddItem, onUpdateItem, onUpdateVariantQty, onRemoveItem, onResetItems,
  onSaveManual, onBack, onSaveRecord, onSaveBatch, onDeleteRecords,
  editingDocNumber, hasPsiPerm,
  products, categories, partners, partnerCategories, dictionaries, warehouses,
  productMapPSI, categoryMapPSI, formatQtyDisplay, getUnitName,
  formSettings, partnerLabel, recordsList, receivedByOrderLine, generatePBDocNumber,
  previewAutoPbDocNumber,
  listPrintSlot,
  printTemplates = [],
  buildPurchaseBillPrintContext,
  resolveDefaultPurchasePrice,
}) => {
  const { currentUser } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const confirm = useConfirm();

  const [creationMethod, setCreationMethod] = useState<'MANUAL' | 'FROM_ORDER'>('MANUAL');
  const [selectedPOOrderNums, setSelectedPOOrderNums] = useState<string[]>([]);
  const [selectedPOItemIds, setSelectedPOItemIds] = useState<string[]>([]);
  const [selectedPOItemQuantities, setSelectedPOItemQuantities] = useState<Record<string, number>>({});
  const [selectedPOItemBatches, setSelectedPOItemBatches] = useState<Record<string, string>>({});

  const allPOByGroups = useMemo(() => {
    const filtered = recordsList.filter(r => r.type === 'PURCHASE_ORDER');
    const groups: Record<string, any[]> = {};
    filtered.forEach(r => {
      const key = r.docNumber;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [recordsList]);

  const getReceivedQty = (docNum: string, lineId: string) => receivedByOrderLine[`${docNum}::${lineId}`] ?? 0;

  const pendingPOs = useMemo(() => {
    return Object.entries(allPOByGroups).filter(([, items]) => {
      return items.some((item: any) => {
        const received = getReceivedQty(item.docNumber, item.id);
        return (item.quantity ?? 0) > received;
      });
    });
  }, [allPOByGroups, receivedByOrderLine]);

  const availableItemsFromSelectedPOs = useMemo(() => {
    const items: any[] = [];
    selectedPOOrderNums.forEach(num => {
      if (allPOByGroups[num]) {
        allPOByGroups[num].forEach((item: any) => {
          const orderQty = item.quantity ?? 0;
          const received = getReceivedQty(item.docNumber, item.id);
          const remaining = Math.max(0, orderQty - received);
          if (remaining > 0) {
            items.push({ ...item, receivedQty: received, remainingQty: remaining });
          }
        });
      }
    });
    return items;
  }, [selectedPOOrderNums, allPOByGroups, receivedByOrderLine]);

  const firstSelectedPOItem = useMemo(
    () => availableItemsFromSelectedPOs.find(i => selectedPOItemIds.includes(i.id)),
    [availableItemsFromSelectedPOs, selectedPOItemIds],
  );
  const previewPbFromOrder = !editingDocNumber && firstSelectedPOItem
    ? generatePBDocNumber(String(firstSelectedPOItem.partnerId || ''), String(firstSelectedPOItem.partner || ''))
    : undefined;

  const handleConvertPOToBill = () => {
    if (selectedPOItemIds.length === 0 || !form.warehouseId) return;

    const itemsToBill = availableItemsFromSelectedPOs.filter(item => selectedPOItemIds.includes(item.id));
    const timestampIso = new Date().toISOString();
    const firstItem = itemsToBill[0];
    let pbDocNumber = generatePBDocNumber(firstItem?.partnerId || '', firstItem?.partner || '');
    const exists = (n: string) => recordsList.some((r: any) => r.type === 'PURCHASE_BILL' && r.docNumber === n);
    let attempts = 0;
    while (exists(pbDocNumber) && attempts < 50) {
      pbDocNumber = generatePBDocNumber(firstItem?.partnerId || '', firstItem?.partner || '');
      attempts++;
    }
    const baseId = Date.now();

    let addedCount = 0;
    const newRecords: any[] = [];
    itemsToBill.forEach((item, idx) => {
      const qty = Math.max(0, selectedPOItemQuantities[item.id] ?? item.remainingQty ?? 0);
      if (qty <= 0) return;
      addedCount++;
      const batchVal = selectedPOItemBatches[item.id]?.trim();
      const { receivedQty: _rq, remainingQty: _rm, ...poBase } = item;
      newRecords.push({
        ...poBase,
        id: `psi-pb-${baseId}-${idx}`,
        type: 'PURCHASE_BILL',
        docNumber: pbDocNumber,
        quantity: qty,
        sourceOrderNumber: item.docNumber,
        sourceLineId: item.id,
        warehouseId: form.warehouseId,
        timestamp: timestampIso,
        _savedAtMs: Date.now(),
        note: `由订单[${item.docNumber}]商品明细转化`,
        operator: `${docOperator}(订单转化)`,
        lineGroupId: item.lineGroupId ?? item.id,
        createdAt: localCalendarYmdStartToIso(localTodayYmd()),
        ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {}),
        ...(batchVal && { batch: batchVal })
      });
    });

    void (async () => {
      try {
        if (onSaveBatch && newRecords.length > 0) {
          await onSaveBatch(newRecords);
        } else {
          for (const r of newRecords) await Promise.resolve(onSaveRecord(r));
        }
        onBack();
        toast.success(`采购单 ${pbDocNumber} 已成功创建，包含 ${addedCount} 条入库明细`);
      } catch {
        /* onSaveBatch / onSaveRecord 已 toast */
      }
    })();
  };

  return (
    <div className={psiOrderBillFormShellClass}>
      <div className={psiOrderBillFormStickyBarClass}>
        <button
          type="button"
          onClick={() => {
            onBack();
          }}
          className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        <div className="flex items-center gap-3">
          <PsiListPrintPicker
            slot={listPrintSlot}
            printTemplates={printTemplates}
            buildContext={buildPurchaseBillPrintContext}
            pickerSubtitle={editingDocNumber || previewAutoPbDocNumber || undefined}
          />
          {editingDocNumber && onDeleteRecords && hasPsiPerm('psi:purchase_bill:delete') && (
            <button
              type="button"
              onClick={() => {
                void confirm({ message: '确定要删除该采购单吗？', danger: true }).then((ok) => {
                  if (!ok) return;
                  onDeleteRecords!('PURCHASE_BILL', editingDocNumber!);
                  onBack();
                });
              }}
              className="flex items-center gap-2 px-4 py-2 text-rose-600 font-bold rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-all"
            >
              <Trash2 className="w-4 h-4" /> 删除
            </button>
          )}
          {!editingDocNumber && (
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-sm">
            <button type="button" onClick={() => { setCreationMethod('MANUAL'); onResetItems(); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${creationMethod === 'MANUAL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <Plus className="w-3 h-3" /> 直接手动创建
            </button>
            <button type="button" onClick={() => { setCreationMethod('FROM_ORDER'); onResetItems(); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${creationMethod === 'FROM_ORDER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <ClipboardList className="w-3 h-3" /> 引用采购订单生成
            </button>
          </div>
          )}
          {(!editingDocNumber ? creationMethod === 'MANUAL' : true) ? (
            <button
              type="button"
              onClick={() => onSaveManual()}
              disabled={!form.partner || !form.warehouseId || purchaseBillItems.length === 0 || !purchaseBillItems.some(i => {
              if (!i.productId) return false;
              const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
              return q > 0;
            })}
              className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {editingDocNumber ? '保存修改' : '确认保存采购单'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConvertPOToBill}
              disabled={!form.warehouseId || selectedPOItemIds.length === 0 || selectedPOItemIds.every(id => (selectedPOItemQuantities[id] ?? 0) <= 0)}
              className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
            >
              <ArrowDownToLine className="w-4 h-4" />
              执行入库 ({selectedPOItemIds.filter(id => (selectedPOItemQuantities[id] ?? 0) > 0).length} 条)
            </button>
          )}
        </div>
      </div>

      <div className={psiOrderBillFormCardClass}>
        {(!editingDocNumber ? creationMethod === 'MANUAL' : true) ? (
          <>
            <div className={psiOrderBillFormSectionStackClass}>
              <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
                <h3 className={sectionTitleClass}>1. 采购单基础信息</h3>
              </div>
              <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">供应商</label>
                  <SearchablePartnerSelect
                    options={partners}
                    categories={partnerCategories}
                    value={form.partner}
                    onChange={(name, id) => setForm({ ...form, partner: name, partnerId: id })}
                    placeholder="选择供应商..."
                    triggerClassName={psiOrderBillFormPartnerTriggerClass}
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号</label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                    <div className={psiOrderBillFormReadonlyBoxClass}>
                      {editingDocNumber ? (
                        <span className="truncate">{editingDocNumber}</span>
                      ) : form.partner ? (
                        <span className="truncate">{previewAutoPbDocNumber || '保存时自动生成'}</span>
                      ) : (
                        <span className="text-slate-400 font-bold text-sm truncate">选择合作单位后自动生成</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 ml-1 leading-snug">由系统自动生成，不可修改</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">入库仓库</label>
                  <select value={form.warehouseId} onChange={e => setForm({...form, warehouseId: e.target.value})} className={`${psiOrderBillFormFieldControlClass} text-sm`}>
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
                  <div className={psiOrderBillFormSectionIconIndigoClass}><Layers className="w-4 h-4" /></div>
                  <h3 className={sectionTitleClass}>2. 入库明细录入</h3>
                </div>
              </div>
              <div className="space-y-3">
                {purchaseBillItems.map((line) => {
                  const pbProd = productMapPSI.get(line.productId);
                  const pbHasVariants = pbProd?.variants && pbProd.variants.length > 0;
                  const pbLineQty = pbHasVariants
                    ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                    : (line.quantity ?? 0);
                  const pbLineAmount = pbLineQty * (line.purchasePrice || 0);
                  const pbGroupedByColor: Record<string, ProductVariant[]> = {};
                  if (pbProd?.variants) {
                    pbProd.variants.forEach(v => {
                      if (!pbGroupedByColor[v.colorId]) pbGroupedByColor[v.colorId] = [];
                      pbGroupedByColor[v.colorId].push(v);
                    });
                  }
                  return (
                  <div key={line.id} className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 space-y-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[200px] space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">目标采购品项 (支持搜索与分类筛选)</label>
                        <SearchableProductSelect options={products} categories={categories} value={line.productId} onChange={(id) => {
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
                            batch: undefined
                          });
                        }} />
                      </div>
                      <div className="w-28 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">采购价 (元)</label>
                        <input type="number" min={0} step={0.01} value={line.purchasePrice || ''} onChange={e => onUpdateItem(line.id, { purchasePrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                      </div>
                      {pbHasVariants && (
                        <>
                          <div className="w-24 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">总数</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {formatQtyDisplay(pbLineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                            </div>
                          </div>
                          <div className="w-28 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {pbLineAmount.toFixed(2)}
                            </div>
                          </div>
                          {pbProd && categoryMapPSI.get(pbProd.categoryId)?.hasBatchManagement && (
                            <div className="w-28 space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">批次</label>
                              <input type="text" value={line.batch || ''} onChange={e => onUpdateItem(line.id, { batch: e.target.value.trim() || undefined })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="批号" />
                            </div>
                          )}
                        </>
                      )}
                      {!pbHasVariants && (
                        <>
                          <div className="w-24 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">数量</label>
                            <div className="flex items-center gap-1.5">
                              <input type="number" min={0} value={line.quantity || ''} onChange={e => onUpdateItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                              <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                            </div>
                          </div>
                          <div className="w-28 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {pbLineAmount.toFixed(2)}
                            </div>
                          </div>
                          {pbProd && categoryMapPSI.get(pbProd.categoryId)?.hasBatchManagement && (
                            <div className="w-28 space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">批次</label>
                              <input type="text" value={line.batch || ''} onChange={e => onUpdateItem(line.id, { batch: e.target.value.trim() || undefined })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="批号" />
                            </div>
                          )}
                        </>
                      )}
                      <button type="button" onClick={() => onRemoveItem(line.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    {pbHasVariants && line.productId && (
                      <div className="pt-2 border-t border-slate-100 space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">颜色尺码数量</label>
                        {sortedVariantColorEntries(pbGroupedByColor, pbProd?.colorIds, pbProd?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries.colors.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-wrap items-center gap-3 bg-white/80 p-2.5 rounded-lg border border-slate-100">
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
                {purchaseBillItems.length === 0 && (
                  <div className="py-8 border-2 border-dashed border-slate-100 rounded-xl text-center">
                    <Layers className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入入库明细</p>
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
                  <p className="text-xs font-bold opacity-80">入库总量:</p>
                  <p className="text-lg font-black">{purchaseBillItems.reduce((s, i) => s + (i.quantity || 0), 0)} <span className="text-xs font-medium">PCS</span></p>
                </div>
                <div className="flex items-center gap-3 border-l border-white/30 pl-6">
                  <p className="text-xs font-bold opacity-80">总金额:</p>
                  <p className="text-lg font-black">¥{purchaseBillItems.reduce((s, i) => s + (i.quantity || 0) * (i.purchasePrice || 0), 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-5">
            <div className="space-y-3">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ClipboardList className="w-4 h-4" /> 1. 选择来源订单</h4>
              {pendingPOs.length === 0 ? (
                <div className="py-8 border-2 border-dashed border-slate-100 rounded-xl text-center">
                  <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 font-bold italic text-xs">暂无未入库完成的采购订单</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {pendingPOs.map(([docNum, items]) => {
                    const isSelected = selectedPOOrderNums.includes(docNum);
                    const partnerName = items[0]?.partner;
                    return (
                      <button
                        key={docNum}
                        onClick={() => {
                          if (selectedPOOrderNums.length > 0) {
                            const currentPartner = allPOByGroups[selectedPOOrderNums[0]][0]?.partner;
                            if (partnerName !== currentPartner) {
                              toast.error("不可跨供应商引用订单！");
                              return;
                            }
                          }
                          setSelectedPOOrderNums(prev => prev.includes(docNum) ? prev.filter(n => n !== docNum) : [...prev, docNum]);
                        }}
                        className={`p-3 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${isSelected ? 'border-indigo-600 bg-indigo-50' : 'border-slate-50 bg-slate-50 hover:border-indigo-200'}`}
                      >
                        <div>
                          <p className="text-sm font-black text-slate-800">{docNum}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{partnerName}</p>
                        </div>
                        {isSelected ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-slate-200" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedPOOrderNums.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ListFilter className="w-4 h-4" /> 2. 勾选并填写本次入库数量 (支持部分到货)</h4>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        <th className="px-3 py-2 w-10 text-center">
                          <button onClick={(e) => {
                            e.stopPropagation();
                            if (selectedPOItemIds.length === availableItemsFromSelectedPOs.length) {
                              setSelectedPOItemIds([]);
                              setSelectedPOItemQuantities({});
                              setSelectedPOItemBatches({});
                            } else {
                              const ids = availableItemsFromSelectedPOs.map(i => i.id);
                              setSelectedPOItemIds(ids);
                              setSelectedPOItemQuantities(prev => {
                                const next = { ...prev };
                                availableItemsFromSelectedPOs.forEach(i => { next[i.id] = i.remainingQty; });
                                return next;
                              });
                            }
                          }} className="text-slate-400 hover:text-indigo-600">
                            {selectedPOItemIds.length === availableItemsFromSelectedPOs.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </button>
                        </th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">源订单 / 商品</th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">采购价</th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">订单数量</th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已收</th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">待收</th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">本次入库数量</th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">批次</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {availableItemsFromSelectedPOs.map((item) => {
                        const product = productMapPSI.get(item.productId);
                        const prodCategory = product && categoryMapPSI.get(product.categoryId);
                        const hasBatch = prodCategory?.hasBatchManagement;
                        const isChecked = selectedPOItemIds.includes(item.id);
                        const qty = selectedPOItemQuantities[item.id] ?? item.remainingQty;
                        const handleToggle = () => {
                          if (isChecked) {
                            setSelectedPOItemIds(prev => prev.filter(id => id !== item.id));
                            setSelectedPOItemQuantities(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                            setSelectedPOItemBatches(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                          } else {
                            setSelectedPOItemIds(prev => [...prev, item.id]);
                            setSelectedPOItemQuantities(prev => ({ ...prev, [item.id]: item.remainingQty }));
                          }
                        };
                        return (
                          <tr key={item.id} onClick={() => handleToggle()} className={`cursor-pointer transition-colors ${isChecked ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}>
                            <td className="px-3 py-2 text-center">
                              {isChecked ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col">
                                <span className="text-[9px] font-black text-slate-300 uppercase">{item.docNumber}</span>
                                <span className="text-xs font-bold text-slate-700">{product?.name}</span>
                                <span className="text-[8px] text-slate-400 uppercase tracking-tighter">
                                  SKU: {product?.sku}
                                  {item.variantId && product?.variants && (() => {
                                    const v = product.variants.find((x: ProductVariant) => x.id === item.variantId);
                                    if (!v) return '';
                                    const c = dictionaries.colors.find(x => x.id === v.colorId)?.name;
                                    const s = dictionaries.sizes.find(x => x.id === v.sizeId)?.name;
                                    return (c || s) ? ` · ${[c, s].filter(Boolean).join(' / ')}` : '';
                                  })()}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right"><span className="text-xs font-bold text-slate-500">¥{(item.purchasePrice ?? 0).toFixed(2)}</span></td>
                            <td className="px-3 py-2 text-right"><span className="text-sm font-bold text-slate-600">{formatQtyDisplay(item.quantity)} {item.productId ? getUnitName(item.productId) : 'PCS'}</span></td>
                            <td className="px-3 py-2 text-right"><span className="text-xs font-bold text-slate-400">{item.receivedQty}</span></td>
                            <td className="px-3 py-2 text-right"><span className="text-sm font-black text-indigo-600">{item.remainingQty}</span></td>
                            <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                              {isChecked ? (
                                <input type="number" min={0} value={qty} onChange={e => {
                                  const v = parseFloat(e.target.value);
                                  const val = Number.isFinite(v) ? Math.max(0, v) : 0;
                                  setSelectedPOItemQuantities(prev => ({ ...prev, [item.id]: val }));
                                }} className="w-20 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none" title="允许超过采购订单数量（如超收）" />
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                              {isChecked && hasBatch ? (
                                <input type="text" value={selectedPOItemBatches[item.id] ?? ''} onChange={e => setSelectedPOItemBatches(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="批号" className="w-24 py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedPOItemIds.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
                  <div className="space-y-1 md:col-span-2 md:max-w-lg">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">单据编号</label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                      <div className={psiOrderBillFormReadonlyBoxClass}>
                        <span className="truncate">{previewPbFromOrder || '保存时自动生成'}</span>
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 ml-1 leading-snug">由系统自动生成，不可修改</p>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">入库至指定仓库 <span className="text-rose-500">*</span></label>
                    <select value={form.warehouseId} onChange={e => setForm({...form, warehouseId: e.target.value})} className={`${psiOrderBillFormFieldControlClass} text-sm`}>
                      <option value="">点击选择入库仓...</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
                {formSettings.customFields.filter(f => f.showInCreate).map(cf => {
                  const eff = effectivePlanFormFieldType(cf);
                  return (
                  <div key={cf.id} className={eff === 'text' || eff === 'file' ? 'space-y-1 md:col-span-2' : 'space-y-1'}>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{cf.label}</label>
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(PurchaseBillFormSection);
