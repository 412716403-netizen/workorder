import React, { useState, useMemo } from 'react';
import { MaterialIssueBatchSelect } from '../../components/MaterialIssueBatchSelect';
import { usePsiStockIndex } from '../../hooks/usePsiStockIndex';
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
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';
import { SupplierSelect } from '../../components/SupplierSelect';
import type { PlanListPrintSettings, PrintRenderContext, PrintTemplate } from '../../types';
import {
  Product,
  Warehouse,
  ProductCategory,
  Partner,
  PartnerCategory,
  AppDictionaries,
  ProductVariant,
  categoryUsesBatchManagement,
} from '../../types';
import { PsiListPrintPicker } from '../../components/psi/PsiListPrintPicker';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { localTodayYmd, localCalendarYmdStartToIso } from '../../utils/localDateTime';
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
  psiOrderBillCompactLineLabelClass,
  psiOrderBillCompactLineInputClass,
  psiOrderBillCompactLineReadonlyClass,
  psiOrderBillCompactDocReadonlyInnerClass,
  psiOrderBillCompactWarehouseSelectClass,
  psiOrderBillCompactSummaryBarClass,
  psiOrderBillCompactSummaryLabelClass,
  psiOrderBillCompactSummaryValueClass,
  psiOrderBillCompactSummaryUnitClass,
} from '../../styles/uiDensity';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { effectivePlanFormFieldType } from '../../utils/planFormCustomField';
import { formatPsiDocNumForList } from './psiOpsListFormatting';

export interface PurchaseBillLineItem {
  id: string;
  productId: string;
  quantity?: number;
  purchasePrice: number;
  variantQuantities?: Record<string, number>;
  batch?: string;
  /** 行级 `customData.relatedProductId`：本行采购物料主要服务的成品 */
  relatedProductId?: string;
}

interface PurchaseBillFormSectionProps {
  form: any;
  setForm: (form: any) => void;
  purchaseBillItems: PurchaseBillLineItem[];
  onAddItem: () => void;
  onUpdateItem: (id: string, updates: Partial<{ productId: string; quantity?: number; purchasePrice: number; variantQuantities?: Record<string, number>; batch?: string; relatedProductId?: string }>) => void;
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
  formSettings: { standardFields: any[]; customFields: any[]; relatedProductEnabled?: boolean };
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
  const { listAvailableBatches } = usePsiStockIndex(recordsList ?? [], []);

  const [creationMethod, setCreationMethod] = useState<'MANUAL' | 'FROM_ORDER'>('MANUAL');
  const [selectedPOOrderNums, setSelectedPOOrderNums] = useState<string[]>([]);
  const [selectedPOItemIds, setSelectedPOItemIds] = useState<string[]>([]);
  const [selectedPOItemQuantities, setSelectedPOItemQuantities] = useState<Record<string, number>>({});
  const [selectedPOItemBatches, setSelectedPOItemBatches] = useState<Record<string, string>>({});
  /** 来源订单卡片区：单号/供应商/行内品名 SKU */
  const [fromOrderPODocSearch, setFromOrderPODocSearch] = useState('');
  /** 待入库明细分组：品名/编号/SKU/单号 */
  const [fromOrderLineSearch, setFromOrderLineSearch] = useState('');

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

  const filteredPendingPOs = useMemo(() => {
    const q = fromOrderPODocSearch.trim().toLowerCase();
    if (!q) return pendingPOs;
    return pendingPOs.filter(([docNum, items]) => {
      const parts: string[] = [docNum, formatPsiDocNumForList(docNum)];
      const first = items[0] as { partner?: string } | undefined;
      if (first?.partner) parts.push(String(first.partner));
      for (const it of items as { productId?: string }[]) {
        const p = it.productId ? productMapPSI.get(it.productId) : undefined;
        if (p?.name) parts.push(p.name);
        if (p?.sku) parts.push(p.sku);
      }
      return parts.join('\0').toLowerCase().includes(q);
    });
  }, [pendingPOs, fromOrderPODocSearch, productMapPSI]);

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

  const displayAvailableLineItems = useMemo(() => {
    const q = fromOrderLineSearch.trim().toLowerCase();
    if (!q) return availableItemsFromSelectedPOs;
    return availableItemsFromSelectedPOs.filter((item) => {
      const p = productMapPSI.get(item.productId);
      const parts = [
        item.docNumber,
        formatPsiDocNumForList(String(item.docNumber || '')),
        p?.name,
        p?.sku,
      ];
      return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
    });
  }, [availableItemsFromSelectedPOs, fromOrderLineSearch, productMapPSI]);

  const firstSelectedPOItem = useMemo(
    () => availableItemsFromSelectedPOs.find(i => selectedPOItemIds.includes(i.id)),
    [availableItemsFromSelectedPOs, selectedPOItemIds],
  );
  const previewPbFromOrder = !editingDocNumber && firstSelectedPOItem
    ? generatePBDocNumber(String(firstSelectedPOItem.partnerId || ''), String(firstSelectedPOItem.partner || ''))
    : undefined;

  const readPoLineRelatedId = (row: { customData?: unknown }): string => {
    const cd = row?.customData;
    if (!cd || typeof cd !== 'object' || Array.isArray(cd)) return '';
    return String((cd as Record<string, unknown>).relatedProductId ?? '').trim();
  };

  const formatRelatedProductLine = (id: string) => {
    const p = productMapPSI.get(id);
    if (p) return p.sku ? `${p.name || '—'}（${p.sku}）` : (p.name || id);
    return id;
  };

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
    const formBaseCustom = (() => {
      const next = { ...(form.customData || {}) } as Record<string, unknown>;
      delete next.relatedProductId;
      return next;
    })();
    const lineCustomDataFor = (row: (typeof itemsToBill)[0]) => {
      const next = { ...formBaseCustom } as Record<string, unknown>;
      if (formSettings.relatedProductEnabled) {
        const rid = readPoLineRelatedId(row);
        if (rid) next.relatedProductId = rid;
      }
      return Object.keys(next).length > 0 ? next : undefined;
    };

    let addedCount = 0;
    const newRecords: any[] = [];
    itemsToBill.forEach((item, idx) => {
      const qty = Math.max(0, selectedPOItemQuantities[item.id] ?? item.remainingQty ?? 0);
      if (qty <= 0) return;
      addedCount++;
      const batchVal = selectedPOItemBatches[item.id]?.trim();
      const {
        receivedQty: _rq,
        remainingQty: _rm,
        customData: _poCustom,
        batchNo: _poBn,
        batch: _poB,
        ...poBase
      } = item;
      const lineCd = lineCustomDataFor(item);
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
        ...(lineCd ? { customData: lineCd } : {}),
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
          {editingDocNumber && (
            <PsiListPrintPicker
              slot={listPrintSlot}
              printTemplates={printTemplates}
              buildContext={buildPurchaseBillPrintContext}
              pickerSubtitle={editingDocNumber}
            />
          )}
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
                  <SupplierSelect
                    options={partners}
                    categories={partnerCategories}
                    value={form.partner}
                    onChange={(name, id) => setForm({ ...form, partner: name, partnerId: id })}
                    placeholder="选择供应商..."
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号</label>
                  <div className="relative">
                    <FileText className="absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-slate-300 pointer-events-none" />
                    <div className={psiOrderBillCompactDocReadonlyInnerClass}>
                      {editingDocNumber ? (
                        <span className="truncate">{editingDocNumber}</span>
                      ) : form.partner ? (
                        <span className="truncate">{previewAutoPbDocNumber || '保存时自动生成'}</span>
                      ) : (
                        <span className="truncate font-bold text-slate-400">选择合作单位后自动生成</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 ml-1 leading-snug">由系统自动生成，不可修改</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">入库仓库</label>
                  <select value={form.warehouseId} onChange={e => setForm({...form, warehouseId: e.target.value})} className={psiOrderBillCompactWarehouseSelectClass}>
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
                  return (
                  <div key={line.id} className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <label className={psiOrderBillCompactLineLabelClass}>目标采购品项</label>
                        <SearchableProductSelect
                          compact
                          options={products}
                          categories={categories}
                          value={line.productId}
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
                              batch: undefined
                            });
                          }}
                        />
                      </div>
                      {pbProd && categoryUsesBatchManagement(categoryMapPSI.get(pbProd.categoryId)) && (
                        <div className="w-[7.25rem] min-w-[7rem] max-w-[9rem] shrink-0 space-y-0.5">
                          <label className={psiOrderBillCompactLineLabelClass}>批次</label>
                          <MaterialIssueBatchSelect
                            product={pbProd}
                            categories={categories}
                            warehouseId={form.warehouseId || ''}
                            value={line.batch ?? ''}
                            onChange={v => onUpdateItem(line.id, { batch: (v && String(v).trim()) || undefined })}
                            mode="return"
                            hideLabel
                            returnPlaceholder="留空 = 无批号"
                            mergeBatches={listAvailableBatches(line.productId, form.warehouseId)}
                          />
                        </div>
                      )}
                      <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                        <label className={psiOrderBillCompactLineLabelClass}>采购价 (元)</label>
                        <input type="number" min={0} step={0.01} value={line.purchasePrice || ''} onChange={e => onUpdateItem(line.id, { purchasePrice: parseFloat(e.target.value) || 0 })} className={psiOrderBillCompactLineInputClass} placeholder="0" />
                      </div>
                      {pbHasVariants && (
                        <>
                          <div className="w-20 shrink-0 space-y-0.5">
                            <label className={psiOrderBillCompactLineLabelClass}>总数</label>
                            <div className={psiOrderBillCompactLineReadonlyClass}>
                              {formatQtyDisplay(pbLineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                            </div>
                          </div>
                          <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                            <label className={psiOrderBillCompactLineLabelClass}>金额 (元)</label>
                            <div className={psiOrderBillCompactLineReadonlyClass}>
                              {pbLineAmount.toFixed(2)}
                            </div>
                          </div>
                        </>
                      )}
                      {!pbHasVariants && (
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
                              {pbLineAmount.toFixed(2)}
                            </div>
                          </div>
                        </>
                      )}
                      <button type="button" onClick={() => onRemoveItem(line.id)} className="shrink-0 rounded-lg p-1 text-slate-300 transition-all hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {formSettings.relatedProductEnabled && (
                      <div className="space-y-1 min-w-0 w-full max-w-2xl">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">关联成品（与采购品项不同，可选）</label>
                        <SearchableProductSelect
                          compact
                          categories={categories}
                          options={products}
                          value={String(line.relatedProductId ?? '')}
                          placeholder="本行料主要服务于哪张成品…"
                          onChange={(id) => {
                            const t = String(id || '').trim();
                            onUpdateItem(line.id, { relatedProductId: t || undefined });
                          }}
                          triggerClassName={psiOrderBillCompactLineInputClass}
                        />
                      </div>
                    )}
                    {pbHasVariants && line.productId && pbProd && (
                      <div className="pt-2 border-t border-slate-100 space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">颜色尺码数量</label>
                        <VariantQtyMatrixInputs
                          product={pbProd}
                          dictionaries={dictionaries}
                          quantities={line.variantQuantities ?? {}}
                          onVariantQtyChange={(variantId, qty) => onUpdateVariantQty(line.id, variantId, qty)}
                        />
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
              <div className={psiOrderBillCompactSummaryBarClass}>
                <div className="flex items-baseline gap-2">
                  <span className={psiOrderBillCompactSummaryLabelClass}>入库总量</span>
                  <span className={psiOrderBillCompactSummaryValueClass}>
                    {purchaseBillItems.reduce((s, i) => s + (i.quantity || 0), 0)}
                    <span className={psiOrderBillCompactSummaryUnitClass}>PCS</span>
                  </span>
                </div>
                <div className="flex items-baseline gap-2 border-l border-white/25 pl-4">
                  <span className={psiOrderBillCompactSummaryLabelClass}>总金额</span>
                  <span className={psiOrderBillCompactSummaryValueClass}>
                    ¥{purchaseBillItems.reduce((s, i) => s + (i.quantity || 0) * (i.purchasePrice || 0), 0).toFixed(2)}
                  </span>
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
                <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="search"
                    value={fromOrderPODocSearch}
                    onChange={e => setFromOrderPODocSearch(e.target.value)}
                    placeholder="搜索单号、供应商或订单内品名/SKU…"
                    className={`w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500`}
                  />
                </div>
                {filteredPendingPOs.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-6">无匹配订单，请调整搜索关键词</p>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredPendingPOs.map(([docNum, items]) => {
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
                </>
              )}
            </div>

            {selectedPOOrderNums.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 shrink-0">
                    <ListFilter className="w-4 h-4" /> 2. 勾选并填写本次入库数量 (支持部分到货)
                  </h4>
                  <div className="relative w-full sm:max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="search"
                      value={fromOrderLineSearch}
                      onChange={e => setFromOrderLineSearch(e.target.value)}
                      placeholder="搜索品名、编号、SKU 或单号…"
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        <th className="px-3 py-2 w-10 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const vis = displayAvailableLineItems;
                              const allVisSelected = vis.length > 0 && vis.every(i => selectedPOItemIds.includes(i.id));
                              if (allVisSelected) {
                                setSelectedPOItemIds(prev => prev.filter(id => !vis.some(v => v.id === id)));
                                setSelectedPOItemQuantities(prev => {
                                  const n = { ...prev };
                                  vis.forEach(i => { delete n[i.id]; });
                                  return n;
                                });
                                setSelectedPOItemBatches(prev => {
                                  const n = { ...prev };
                                  vis.forEach(i => { delete n[i.id]; });
                                  return n;
                                });
                              } else {
                                setSelectedPOItemIds(prev => {
                                  const s = new Set(prev);
                                  vis.forEach(i => s.add(i.id));
                                  return Array.from(s);
                                });
                                setSelectedPOItemQuantities(prev => {
                                  const next = { ...prev };
                                  vis.forEach(i => { next[i.id] = i.remainingQty; });
                                  return next;
                                });
                              }
                            }}
                            className="text-slate-400 hover:text-indigo-600"
                            title="按当前筛选项全选/取消"
                          >
                            {displayAvailableLineItems.length > 0 && displayAvailableLineItems.every(i => selectedPOItemIds.includes(i.id)) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </button>
                        </th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">源订单 / 商品</th>
                        {formSettings.relatedProductEnabled && (
                          <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[6rem]">关联成品</th>
                        )}
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">采购价</th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">订单数量</th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已收</th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">待收</th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">本次入库数量</th>
                        <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">批次</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {displayAvailableLineItems.length === 0 && availableItemsFromSelectedPOs.length > 0 && (
                        <tr>
                          <td
                            colSpan={formSettings.relatedProductEnabled ? 9 : 8}
                            className="px-3 py-8 text-center text-slate-400 text-sm"
                          >
                            无匹配明细，请调整搜索关键词
                          </td>
                        </tr>
                      )}
                      {displayAvailableLineItems.map((item) => {
                        const relFromPo = readPoLineRelatedId(item);
                        const product = productMapPSI.get(item.productId);
                        const prodCategory = product && categoryMapPSI.get(product.categoryId);
                        const hasBatch = categoryUsesBatchManagement(prodCategory);
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
                            {formSettings.relatedProductEnabled && (
                              <td className="px-3 py-2 align-top max-w-[10rem]" onClick={e => e.stopPropagation()}>
                                <span className="text-[10px] font-bold text-slate-600 leading-snug">
                                  {relFromPo ? formatRelatedProductLine(relFromPo) : '—'}
                                </span>
                              </td>
                            )}
                            <td className="px-3 py-2 text-right"><span className="text-xs font-bold text-slate-500">¥{(item.purchasePrice ?? 0).toFixed(2)}</span></td>
                            <td className="px-3 py-2 text-right"><span className="text-sm font-bold text-slate-600">{formatQtyDisplay(item.quantity)} {item.productId ? getUnitName(item.productId) : 'PCS'}</span></td>
                            <td className="px-3 py-2 text-right"><span className="text-xs font-bold text-slate-400">{item.receivedQty}</span></td>
                            <td className="px-3 py-2 text-right"><span className="text-sm font-black text-indigo-600">{item.remainingQty}</span></td>
                            <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                              {isChecked ? (
                                <input type="number" min={0} step={0.01} value={qty} onChange={e => {
                                  setSelectedPOItemQuantities(prev => ({
                                    ...prev,
                                    [item.id]: parsePsiNonVariantQuantityInput(e.target.value),
                                  }));
                                }} className="w-20 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none" title="允许超过采购订单数量（如超收）" />
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right align-top" onClick={e => e.stopPropagation()}>
                              {isChecked && hasBatch && product ? (
                                <div className="ml-auto w-[7.25rem] min-w-[7rem] max-w-[10rem]">
                                  <MaterialIssueBatchSelect
                                    product={product}
                                    categories={categories}
                                    warehouseId={form.warehouseId || ''}
                                    value={selectedPOItemBatches[item.id] ?? ''}
                                    onChange={v =>
                                      setSelectedPOItemBatches(prev => ({
                                        ...prev,
                                        [item.id]: (v && String(v).trim()) || '',
                                      }))
                                    }
                                    mode="return"
                                    hideLabel
                                    returnPlaceholder="留空 = 无批号"
                                    mergeBatches={listAvailableBatches(item.productId, form.warehouseId)}
                                  />
                                </div>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
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
                      <FileText className="absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-slate-300 pointer-events-none" />
                      <div className={psiOrderBillCompactDocReadonlyInnerClass}>
                        <span className="truncate">{previewPbFromOrder || '保存时自动生成'}</span>
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 ml-1 leading-snug">由系统自动生成，不可修改</p>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">入库至指定仓库 <span className="text-rose-500">*</span></label>
                    <select value={form.warehouseId} onChange={e => setForm({...form, warehouseId: e.target.value})} className={psiOrderBillCompactWarehouseSelectClass}>
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
