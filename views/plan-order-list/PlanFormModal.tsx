
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAsyncSubmitLock } from '../../hooks/useAsyncSubmitLock';
import { ModalPortal } from '../../components/ModalPortal';
import {
  AlertCircle,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  FileText,
  Layers,
  Package,
  Plus,
  Save,
  Search,
  Square,
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
  PsiRecord,
} from '../../types';
import { PlanStatus } from '../../types';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';
import { CustomerSelect } from '../../components/CustomerSelect';
import { formStandardControlClass, formStandardLabelClass, sectionTitleClass } from '../../styles/uiDensity';
import { localTodayYmd } from '../../utils/localDateTime';
import {
  defaultEntryDatetimeLocal,
  planEntryDatetimeToCreatedAt,
} from '../../utils/docEntryTime';
import DocEntryTimeField from '../../components/DocEntryTimeField';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { psi as psiApi } from '../../services/api';
import { normalizeDecimals } from '../../contexts/formSettingsDefaults';
import { fetchAllPages, type PaginatedLike } from '../../utils/fetchAllPages';
import {
  buildPlanDraftFromSalesOrder,
  buildUsedSalesOrderProductKeys,
  listPendingSalesOrdersForPlan,
  salesOrderDocMatchesPlanSearch,
  salesOrderLinesForPlan,
  shouldImportCustomerFromSalesOrder,
} from '../../utils/planFromSalesOrder';
import { productThumbSrc } from '../../utils/productImageSrc';

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
  /** 有进销存销售订单查看权限时才展示「引用销售订单」入口 */
  canReferenceSalesOrder?: boolean;
  onSave: (plan: PlanOrder) => void | Promise<void>;
  onImagePreview?: (product: Product) => void;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
}

type CreationMethod = 'MANUAL' | 'FROM_SALES_ORDER';

const emptyForm = () => ({
  categoryId: '',
  productId: '',
  customer: '',
  entryDatetime: defaultEntryDatetimeLocal(),
  dueDate: '',
  variantQuantities: {} as Record<string, number>,
  singleQuantity: 0,
  customData: {} as Record<string, unknown>,
});

async function fetchSalesOrdersForPlan(): Promise<PsiRecord[]> {
  const all = await fetchAllPages<PsiRecord>(
    page =>
      psiApi.listPaginated({
        type: 'SALES_ORDER',
        page: String(page),
        pageSize: '200',
      }) as Promise<PsiRecord[] | PaginatedLike<PsiRecord>>,
    { maxPages: 40, warnTag: 'planForm:salesOrders' },
  );
  return normalizeDecimals(all as never[]) as PsiRecord[];
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
  canReferenceSalesOrder = false,
  onSave,
  onImagePreview,
  onFilePreview,
}) => {
  const createLock = useAsyncSubmitLock();
  const [creationMethod, setCreationMethod] = useState<CreationMethod>('MANUAL');
  const [form, setForm] = useState(emptyForm);
  const [selectedSalesOrderDoc, setSelectedSalesOrderDoc] = useState<string | null>(null);
  const [selectedSalesOrderLineId, setSelectedSalesOrderLineId] = useState<string | null>(null);
  const [salesOrderSearch, setSalesOrderSearch] = useState('');

  const salesOrdersQuery = useQuery({
    queryKey: ['planFormSalesOrders'],
    queryFn: fetchSalesOrdersForPlan,
    enabled: open && canReferenceSalesOrder,
    staleTime: 15_000,
  });

  const productNameById = useMemo(
    () => new Map(products.map(p => [p.id, { name: p.name, sku: p.sku }])),
    [products],
  );

  const usedSalesOrderProductKeys = useMemo(() => buildUsedSalesOrderProductKeys(plans), [plans]);

  const pendingSalesOrders = useMemo(
    () => listPendingSalesOrdersForPlan(salesOrdersQuery.data ?? [], plans),
    [salesOrdersQuery.data, plans],
  );

  const filteredPendingSalesOrders = useMemo(() => {
    return pendingSalesOrders.filter(([docNum, items]) =>
      salesOrderDocMatchesPlanSearch(docNum, items, salesOrderSearch, productNameById),
    );
  }, [pendingSalesOrders, salesOrderSearch, productNameById]);

  const selectedSalesOrderItems = useMemo(() => {
    if (!selectedSalesOrderDoc) return [] as PsiRecord[];
    return (salesOrdersQuery.data ?? []).filter(
      r => r.type === 'SALES_ORDER' && r.docNumber === selectedSalesOrderDoc,
    );
  }, [salesOrdersQuery.data, selectedSalesOrderDoc]);

  const selectableSalesOrderLines = useMemo(
    () => salesOrderLinesForPlan(selectedSalesOrderItems, usedSalesOrderProductKeys),
    [selectedSalesOrderItems, usedSalesOrderProductKeys],
  );

  const selectedProduct = products.find(p => p.id === form.productId);
  const activeCategory = categories.find(c => c.id === form.categoryId);
  const usePlanVariantMatrix = productHasColorSizeMatrix(selectedProduct, activeCategory);

  const fromSalesOrderReady =
    creationMethod !== 'FROM_SALES_ORDER' ||
    (selectedSalesOrderDoc != null && selectedSalesOrderLineId != null && !!form.productId);

  const canSave = useMemo(() => {
    if (!fromSalesOrderReady) return false;
    if (!form.productId) return false;
    if (usePlanVariantMatrix) return (Object.values(form.variantQuantities) as number[]).some(q => (q as number) > 0);
    return (form.singleQuantity as number) > 0;
  }, [form, usePlanVariantMatrix, fromSalesOrderReady]);

  const resetAll = () => {
    setForm(emptyForm());
    setCreationMethod('MANUAL');
    setSelectedSalesOrderDoc(null);
    setSelectedSalesOrderLineId(null);
    setSalesOrderSearch('');
  };

  const handleClose = () => {
    onClose();
    resetAll();
  };

  const switchCreationMethod = (method: CreationMethod) => {
    setCreationMethod(method);
    setForm(emptyForm());
    setSelectedSalesOrderDoc(null);
    setSelectedSalesOrderLineId(null);
    setSalesOrderSearch('');
  };

  const applySalesOrderLine = (docNumber: string, docItems: PsiRecord[], lineId: string) => {
    const draft = buildPlanDraftFromSalesOrder({
      docNumber,
      docItems,
      lineId,
      importCustomer: shouldImportCustomerFromSalesOrder(planFormSettings, productionLinkMode),
    });
    if (!draft) {
      toast.error('无法从该销售订单行生成计划数量');
      return;
    }
    const product = products.find(p => p.id === draft.productId);
    // 保留 entryDatetime：此前直接整体 setForm 漏掉该字段，会把录入时间清成 undefined（真 bug）
    setForm(prev => ({
      ...prev,
      categoryId: product?.categoryId ?? '',
      productId: draft.productId,
      customer: draft.customer,
      dueDate: '',
      variantQuantities: { ...draft.variantQuantities },
      singleQuantity: draft.singleQuantity,
      customData: { ...draft.customData },
    }));
    setSelectedSalesOrderLineId(lineId);
  };

  const handleSelectSalesOrder = (docNumber: string) => {
    if (selectedSalesOrderDoc === docNumber) {
      setSelectedSalesOrderDoc(null);
      setSelectedSalesOrderLineId(null);
      setForm(emptyForm());
      return;
    }
    const docItems = (salesOrdersQuery.data ?? []).filter(
      r => r.type === 'SALES_ORDER' && r.docNumber === docNumber,
    );
    const lines = salesOrderLinesForPlan(docItems, usedSalesOrderProductKeys);
    setSelectedSalesOrderDoc(docNumber);
    setSelectedSalesOrderLineId(null);
    setForm(emptyForm());
    if (lines.length === 1) {
      applySalesOrderLine(docNumber, docItems, lines[0].id);
    }
  };

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
    const customData =
      form.customData && Object.keys(form.customData).length > 0
        ? (form.customData as Record<string, unknown>)
        : undefined;
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
      customData,
      createdAt: planEntryDatetimeToCreatedAt(form.entryDatetime),
      ...(dueTrim ? { dueDate: dueTrim } : {}),
    };

    const ok = await createLock.run(async () => {
      await Promise.resolve(onSave(newPlan));
      return true;
    });
    if (!ok) return;
    handleClose();
  };

  if (!open) return null;

  const showManualForm = creationMethod === 'MANUAL' || fromSalesOrderReady;
  const showSalesOrderPicker = creationMethod === 'FROM_SALES_ORDER' && !fromSalesOrderReady;

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-create-modal-title"
        className="relative z-10 flex max-h-[min(92vh,960px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 fade-in duration-200 sm:max-w-4xl md:max-w-5xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 id="plan-create-modal-title" className="text-lg font-semibold text-slate-900 tracking-tight">
              新建生产计划
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {creationMethod === 'FROM_SALES_ORDER'
                ? '引用销售订单未配货数量生成计划单'
                : '填写基础信息与生产数量后保存'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {canReferenceSalesOrder ? (
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-sm">
                <button
                  type="button"
                  onClick={() => switchCreationMethod('MANUAL')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${creationMethod === 'MANUAL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Plus className="w-3 h-3" /> 直接手动创建
                </button>
                <button
                  type="button"
                  onClick={() => switchCreationMethod('FROM_SALES_ORDER')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${creationMethod === 'FROM_SALES_ORDER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <ClipboardList className="w-3 h-3" /> 引用销售订单生成
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={handleClose}
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
            {showSalesOrderPicker ? (
              <div className="space-y-8">
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" /> 1. 选择销售订单
                  </h4>
                  {salesOrdersQuery.isLoading ? (
                    <p className="text-sm text-slate-500 py-6 text-center">加载销售订单…</p>
                  ) : salesOrdersQuery.isError ? (
                    <p className="text-sm text-rose-600 py-6 text-center">加载销售订单失败，请稍后重试</p>
                  ) : pendingSalesOrders.length === 0 ? (
                    <div className="py-8 border-2 border-dashed border-slate-100 rounded-xl text-center">
                      <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-slate-400 font-bold italic text-xs">暂无仍有未配货数量的销售订单</p>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="search"
                          value={salesOrderSearch}
                          onChange={e => setSalesOrderSearch(e.target.value)}
                          placeholder="搜索单号、客户或订单内品名/SKU…"
                          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      {filteredPendingSalesOrders.length === 0 ? (
                        <p className="text-center text-slate-400 text-sm py-6">无匹配订单，请调整搜索关键词</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {filteredPendingSalesOrders.map(([docNum, items]) => {
                            const isSelected = selectedSalesOrderDoc === docNum;
                            const lines = salesOrderLinesForPlan(items, usedSalesOrderProductKeys);
                            const totalUnshipped = lines.reduce((s, l) => {
                              if (l.variantQuantities) {
                                return s + Object.values(l.variantQuantities).reduce((a, q) => a + (Number(q) || 0), 0);
                              }
                              return s + (Number(l.quantity) || 0);
                            }, 0);
                            return (
                              <button
                                key={docNum}
                                type="button"
                                onClick={() => handleSelectSalesOrder(docNum)}
                                className={`p-3 rounded-2xl border-2 text-left transition-all flex items-center justify-between gap-2 ${isSelected ? 'border-indigo-600 bg-indigo-50' : 'border-slate-50 bg-slate-50 hover:border-indigo-200'}`}
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-black text-slate-800 truncate">{docNum}</p>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                    {items[0]?.partner ?? '—'}
                                  </p>
                                  <p className="text-[10px] text-indigo-600 font-bold mt-1">
                                    未配货 {totalUnshipped} 件 · {lines.length} 个品项
                                  </p>
                                </div>
                                {isSelected ? (
                                  <CheckSquare className="w-5 h-5 shrink-0 text-indigo-600" />
                                ) : (
                                  <Square className="w-5 h-5 shrink-0 text-slate-200" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {selectedSalesOrderDoc && selectableSalesOrderLines.length > 1 ? (
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      2. 选择要生产的品项
                    </h4>
                    <div className="space-y-2">
                      {selectableSalesOrderLines.map(line => {
                        const prod = products.find(p => p.id === line.productId);
                        const qty =
                          line.variantQuantities && Object.keys(line.variantQuantities).length > 0
                            ? Object.values(line.variantQuantities).reduce((s, q) => s + (Number(q) || 0), 0)
                            : (Number(line.quantity) || 0);
                        const isLineSelected = selectedSalesOrderLineId === line.id;
                        return (
                          <button
                            key={line.id}
                            type="button"
                            onClick={() =>
                              applySalesOrderLine(selectedSalesOrderDoc, selectedSalesOrderItems, line.id)
                            }
                            className={`w-full p-3 rounded-xl border-2 text-left flex items-center justify-between gap-3 transition-all ${isLineSelected ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 bg-white hover:border-indigo-200'}`}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate">
                                {prod?.name ?? line.productId}
                                {prod?.sku ? (
                                  <span className="ml-2 text-[10px] font-bold text-slate-400">{prod.sku}</span>
                                ) : null}
                              </p>
                              <p className="text-[10px] text-indigo-600 font-bold mt-0.5">未配货 {qty} 件</p>
                            </div>
                            {isLineSelected ? (
                              <CheckSquare className="w-5 h-5 shrink-0 text-indigo-600" />
                            ) : (
                              <Square className="w-5 h-5 shrink-0 text-slate-200" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {showManualForm ? (
              <>
                {creationMethod === 'FROM_SALES_ORDER' && selectedSalesOrderDoc ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/80 px-4 py-3">
                    <p className="text-xs font-bold text-indigo-800">
                      来源销售订单：<span className="font-mono">{selectedSalesOrderDoc}</span>
                      <span className="ml-2 font-normal text-indigo-600">（数量取未配货口径，可在下方调整）</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSalesOrderDoc(null);
                        setSelectedSalesOrderLineId(null);
                        setForm(emptyForm());
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      更换来源订单
                    </button>
                  </div>
                ) : null}

                <div className="space-y-8">
                  <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                      <FileText className="w-5 h-5" />
                    </div>
                    <h3 className={sectionTitleClass}>1. 计划基础信息</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2 space-y-1">
                      <label className={formStandardLabelClass}>目标生产品项</label>
                      <div className="flex items-stretch gap-4">
                        {selectedProduct && (
                          <div className="shrink-0">
                            {productThumbSrc(selectedProduct) ? (
                              <button
                                type="button"
                                onClick={() => onImagePreview?.(selectedProduct)}
                                className="rounded-xl overflow-hidden border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none block"
                              >
                                <img
                                  src={productThumbSrc(selectedProduct)}
                                  alt={selectedProduct.name}
                                  className="w-16 h-16 object-cover block"
                                />
                              </button>
                            ) : (
                              <div className="w-16 h-16 rounded-xl bg-slate-200 flex items-center justify-center border border-slate-100">
                                <Package className="w-8 h-8 text-slate-400" />
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <SearchableProductSelect
                            options={products}
                            categories={categories}
                            value={form.productId}
                            onChange={pId => {
                              const p = products.find(x => x.id === pId);
                              setForm({
                                ...form,
                                productId: pId,
                                categoryId: p?.categoryId ?? '',
                                variantQuantities: {},
                                singleQuantity: 0,
                              });
                            }}
                            onFilePreview={(url, type) => onFilePreview?.(url, type)}
                          />
                        </div>
                      </div>
                      <DocEntryTimeField
                        mode="datetime"
                        className="space-y-1 pt-3 w-full sm:max-w-xs"
                        label={
                          planFormSettings.standardFields.find(f => f.id === 'createdAt')?.label ?? '创建时间'
                        }
                        value={form.entryDatetime}
                        onChange={entryDatetime => setForm({ ...form, entryDatetime })}
                      />
                    </div>
                    {planFormSettings.standardFields.find(f => f.id === 'customer')?.showInCreate === true &&
                    productionLinkMode !== 'product' ? (
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
                    ) : null}
                    {productionLinkMode !== 'product' &&
                    planFormSettings.listDisplay?.showDeliveryDate === true ? (
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
                    ) : null}
                    {planFormSettings.customFields
                      .filter(f => f.showInCreate)
                      .map(cf => (
                        <div key={cf.id} className="space-y-1">
                          <label className={formStandardLabelClass}>{cf.label}</label>
                          <PlanFormCustomFieldInput
                            cf={cf}
                            value={form.customData?.[cf.id]}
                            onChange={next =>
                              setForm({ ...form, customData: { ...form.customData, [cf.id]: next } })
                            }
                            controlClassName={formStandardControlClass}
                            onFilePreview={onFilePreview}
                          />
                        </div>
                      ))}
                  </div>
                </div>

                {selectedProduct ? (
                  <div className="pt-10 border-t border-slate-50 space-y-8 animate-in fade-in slide-in-from-top-4">
                    <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                        <Layers className="w-5 h-5" />
                      </div>
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
                            <p className="text-xl font-black">
                              {(Object.values(form.variantQuantities) as number[]).reduce((s, q) => s + q, 0)}{' '}
                              <span className="text-xs font-medium">{getUnitName(form.productId)}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-xs space-y-2">
                        <label className={formStandardLabelClass}>
                          计划生产总量 ({getUnitName(form.productId)})
                        </label>
                        <input
                          type="number"
                          value={form.singleQuantity || ''}
                          onChange={e => setForm({ ...form, singleQuantity: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-50 border-none rounded-xl py-4 px-6 text-xl font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner"
                          placeholder="0"
                        />
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export default React.memo(PlanFormModal);
