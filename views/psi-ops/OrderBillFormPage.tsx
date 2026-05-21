import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Product,
  Warehouse,
  ProductCategory,
  Partner,
  PartnerCategory,
  AppDictionaries,
  PurchaseOrderFormSettings,
  SalesOrderFormSettings,
  PurchaseBillFormSettings,
  SalesBillFormSettings,
  PrintTemplate,
  PsiRecord,
  ProductionOpRecord,
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID,
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER,
} from '../../types';
import PurchaseOrderFormSection from './PurchaseOrderFormSection';
import SalesOrderFormSection from './SalesOrderFormSection';
import SalesBillFormSection from './SalesBillFormSection';
import PurchaseBillFormSection from './PurchaseBillFormSection';
import { localTodayYmd, localCalendarYmdStartToIso, toLocalDateYmd } from '../../utils/localDateTime';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';
import { nextPsiDocNumber } from '../../utils/partnerDocNumber';
import { buildSalesOrderPrintRenderContext } from '../../utils/buildSalesOrderPrintContext';
import { buildPurchaseBillPrintRenderContext } from '../../utils/buildPurchaseBillPrintContext';
import { useAuth } from '../../contexts/AuthContext';
import { useConfigData } from '../../contexts/AppDataContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import {
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredSingleWarehouse,
  WAREHOUSE_DOC_KIND,
} from '../../utils/warehouseDocPreference';
import {
  buildPsiLastPriceIndex,
  lookupLastPrice,
} from '../../utils/psiPartnerProductLastPrice';
import { hasModulePerm } from '../../utils/hasModulePerm';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { categoryUsesBatchManagement } from '../../types';

type FormType = 'PURCHASE_ORDER' | 'PURCHASE_BILL' | 'SALES_ORDER' | 'SALES_BILL';

/** 新建用当前 UTC ISO；编辑保留原单据组内最早可解析时间，便于列表排序与展示一致（避免 toLocaleString 不可解析） */
function psiDocTimestampIsoForSave(recordsList: PsiRecord[], formType: FormType, editingDocNumber: string | null): string {
  if (editingDocNumber) {
    const lines = recordsList.filter((r) => r.type === formType && r.docNumber === editingDocNumber);
    const ms = flowRecordsEarliestMs(lines);
    if (ms > 0) return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

/**
 * 重新保存销售订单时从原行带回已发、已配（待发）、配货仓；若订单数量改小则收敛到不超过新数量且已配 ≥ 已发。
 */
function preservedSalesOrderLinePsi(
  recordsList: PsiRecord[],
  sourceRecordIds: string[] | undefined,
  variantId: string | undefined,
  newQty: number,
): Partial<{ allocatedQuantity: number; shippedQuantity: number; allocationWarehouseId: string }> {
  const ids = sourceRecordIds?.filter(Boolean);
  if (!ids?.length || newQty <= 0) return {};
  const idSet = new Set(ids);
  const candidates = recordsList.filter(
    (r) =>
      r.type === 'SALES_ORDER' &&
      idSet.has(r.id) &&
      (variantId ? r.variantId === variantId : !r.variantId),
  );
  if (!candidates.length) return {};
  const shippedRaw = candidates.reduce((s, r) => s + (Number(r.shippedQuantity) || 0), 0);
  const allocatedRaw = candidates.reduce((s, r) => s + (Number(r.allocatedQuantity) || 0), 0);
  const shipped = Math.min(shippedRaw, newQty);
  const allocated = Math.min(Math.max(allocatedRaw, shipped), newQty);
  const allocationWarehouseId = candidates.map((r) => r.allocationWarehouseId).find((w) => w != null && w !== '') as string | undefined;
  const out: Record<string, unknown> = { shippedQuantity: shipped, allocatedQuantity: allocated };
  if (allocationWarehouseId) out.allocationWarehouseId = allocationWarehouseId;
  return out as Partial<{ allocatedQuantity: number; shippedQuantity: number; allocationWarehouseId: string }>;
}

interface OrderBillFormPageProps {
  formType: FormType;
  products: Product[];
  warehouses: Warehouse[];
  categories: ProductCategory[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  dictionaries: AppDictionaries;
  records: PsiRecord[];
  getStock: (pId: string, whId?: string, excludeDocNumber?: string) => number;
  getVariantDisplayQty: (pId: string, whId: string, variantId: string) => number;
  getNullVariantProdStock: (pId: string, whId?: string) => number;
  productMapPSI: Map<string, Product>;
  warehouseMapPSI: Map<string, Warehouse>;
  categoryMapPSI: Map<string, ProductCategory>;
  getUnitName: (productId: string) => string;
  formatQtyDisplay: (q: number | string | undefined | null) => number;
  onBack: () => void;
  /** 进销存四单：仅「新建」保存成功后由父层切到详情阶段；不传则仍 onBack 关闭 */
  onAfterNewDocSaved?: (docNumber: string) => void;
  /** 单条进销存写入（须传一条记录对象，勿传数组） */
  onSave: (record: Partial<PsiRecord>) => void;
  onSaveBatch: (records: Partial<PsiRecord>[]) => Promise<void>;
  onReplaceRecords?: (type: string, docNumber: string, newRecords: Partial<PsiRecord>[]) => void;
  onDeleteRecords?: (type: string, docNumber: string) => void;
  editingDocNumber: string | null;
  purchaseOrderFormSettings?: PurchaseOrderFormSettings;
  salesOrderFormSettings?: SalesOrderFormSettings;
  purchaseBillFormSettings?: PurchaseBillFormSettings;
  salesBillFormSettings?: SalesBillFormSettings;
  userPermissions?: string[];
  tenantRole?: string;
  partnerLabel: string;
  /** 生产外协收回等（打印销售单应收结余用） */
  prodRecords?: ProductionOpRecord[];
  /** 采购订单/采购入库详情打印模版列表（未传时回退到全局配置） */
  orderBillPrintTemplates?: PrintTemplate[];
}

const OrderBillFormPage: React.FC<OrderBillFormPageProps> = ({
  formType,
  products,
  warehouses,
  categories,
  partners,
  partnerCategories,
  dictionaries,
  records,
  getStock,
  getVariantDisplayQty,
  getNullVariantProdStock,
  productMapPSI,
  warehouseMapPSI,
  categoryMapPSI,
  getUnitName,
  formatQtyDisplay,
  onBack,
  onAfterNewDocSaved,
  onSave,
  onSaveBatch,
  onReplaceRecords,
  onDeleteRecords,
  editingDocNumber,
  purchaseOrderFormSettings = {
    standardFields: [],
    customFields: [],
    listPrint: { showPrintButton: true },
  },
  salesOrderFormSettings = {
    standardFields: [],
    customFields: [],
    listPrint: { showPrintButton: true },
  },
  purchaseBillFormSettings = { standardFields: [], customFields: [], listPrint: { showPrintButton: true } },
  salesBillFormSettings = { standardFields: [], customFields: [], listPrint: { showPrintButton: true } },
  userPermissions,
  tenantRole,
  partnerLabel,
  prodRecords = [],
  orderBillPrintTemplates,
}) => {
  const { currentUser, tenantCtx, userId } = useAuth();
  const { printTemplates: configPrintTemplates } = useConfigData();
  const mergedPrintTemplates = orderBillPrintTemplates ?? configPrintTemplates;
  const docOperator = currentOperatorDisplayName(currentUser);
  const recordsList = records ?? [];
  const _isOwner = tenantRole === 'owner';
  const hasPsiPerm = (perm: string) => hasModulePerm(tenantRole, userPermissions, 'psi', perm);
  const safePurchaseBillFormSettings = useMemo(
    () => ({
      standardFields: purchaseBillFormSettings?.standardFields ?? [],
      customFields: purchaseBillFormSettings?.customFields ?? [],
      listPrint: purchaseBillFormSettings?.listPrint ?? { showPrintButton: true },
      relatedProductEnabled: purchaseBillFormSettings?.relatedProductEnabled,
    }),
    [purchaseBillFormSettings],
  );
  const safeSalesBillFormSettings = useMemo(
    () => ({
      standardFields: salesBillFormSettings?.standardFields ?? [],
      customFields: salesBillFormSettings?.customFields ?? [],
      listPrint: salesBillFormSettings?.listPrint ?? { showPrintButton: true },
    }),
    [salesBillFormSettings],
  );

  // ── Form state ──
  const [form, setForm] = useState<any>(() => {
    const base: any = {
      productId: '',
      warehouseId: '',
      fromWarehouseId: '',
      toWarehouseId: '',
      quantity: 0,
      actualQuantity: 0,
      purchasePrice: 0,
      partner: '',
      partnerId: '',
      note: '',
      docNumber: '',
      dueDate: '',
      createdAt: localTodayYmd(),
      customData: {} as Record<string, any>,
    };
        if (editingDocNumber) {
      const existing = recordsList.filter((r) => r.type === formType && r.docNumber === editingDocNumber);
      if (existing.length > 0) {
        const first = existing[0];
        base.partner = first.partner ?? '';
        base.partnerId = first.partnerId ?? '';
        base.docNumber = editingDocNumber;
        base.warehouseId = first.warehouseId ?? '';
        if (formType !== 'PURCHASE_ORDER' && formType !== 'SALES_ORDER') {
          if (formType === 'SALES_BILL') {
            base.createdAt = toLocalDateYmd(first.createdAt) || localTodayYmd();
            base.note = '';
            base.dueDate = '';
          } else {
            base.dueDate = first.dueDate ?? '';
            base.note = first.note ?? '';
            base.createdAt = toLocalDateYmd(first.createdAt) || localTodayYmd();
          }
        }
        base.customData = first.customData && typeof first.customData === 'object' ? { ...first.customData } : {};
        if (formType === 'PURCHASE_BILL') {
          const cd = base.customData as Record<string, unknown>;
          delete cd.relatedProductId;
        }
      }
    } else if (formType === 'PURCHASE_BILL' || formType === 'SALES_BILL') {
      const pref = readWarehousePreference(
        tenantCtx?.tenantId,
        userId,
        formType === 'PURCHASE_BILL' ? WAREHOUSE_DOC_KIND.PURCHASE_BILL : WAREHOUSE_DOC_KIND.SALES_BILL,
      );
      const wid = resolvePreferredSingleWarehouse(warehouses, pref, '');
      if (wid) base.warehouseId = wid;
    }
    return base;
  });

  useEffect(() => {
    if (editingDocNumber) return;
    if (formType !== 'PURCHASE_BILL' && formType !== 'SALES_BILL') return;
    if (!warehouses.length) return;
    setForm((prev: any) => {
      if (prev?.warehouseId) return prev;
      const pref = readWarehousePreference(
        tenantCtx?.tenantId,
        userId,
        formType === 'PURCHASE_BILL' ? WAREHOUSE_DOC_KIND.PURCHASE_BILL : WAREHOUSE_DOC_KIND.SALES_BILL,
      );
      const wid = resolvePreferredSingleWarehouse(warehouses, pref, '');
      if (!wid) return prev;
      return { ...prev, warehouseId: wid };
    });
  }, [warehouses, editingDocNumber, formType, tenantCtx?.tenantId, userId]);

  // ── Purchase order items ──
  const [purchaseOrderItems, setPurchaseOrderItems] = useState<
    {
      id: string;
      productId: string;
      quantity?: number;
      purchasePrice: number;
      variantQuantities?: Record<string, number>;
      sourceRecordIds?: string[];
    }[]
  >(() => {
    if (formType !== 'PURCHASE_ORDER' || !editingDocNumber) return [];
    const existing = recordsList.filter((r) => r.type === 'PURCHASE_ORDER' && r.docNumber === editingDocNumber);
    if (existing.length === 0) return [];
    const lineMap: Record<string, PsiRecord[]> = {};
    existing.forEach((r) => {
      const lg = r.lineGroupId ?? r.id;
      if (!lineMap[lg]) lineMap[lg] = [];
      lineMap[lg].push(r);
    });
    return Object.entries(lineMap).map(([lgId, recs]) => {
      const first = recs[0];
      const hasVar = recs.some((r) => r.variantId);
      const vq: Record<string, number> = {};
      if (hasVar) recs.forEach((r) => { if (r.variantId) vq[r.variantId] = (vq[r.variantId] ?? 0) + (Number(r.quantity) || 0); });
      const lineQtyNoVar = recs.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      return {
        id: lgId,
        productId: first.productId,
        quantity: hasVar ? undefined : lineQtyNoVar,
        purchasePrice: first.purchasePrice ?? 0,
        variantQuantities: hasVar ? vq : undefined,
        sourceRecordIds: recs.map((r) => r.id),
      };
    });
  });

  const safePurchaseOrderFormSettings = useMemo(
    () => ({
      standardFields: purchaseOrderFormSettings?.standardFields ?? [],
      customFields: purchaseOrderFormSettings?.customFields ?? [],
      listPrint: purchaseOrderFormSettings?.listPrint ?? { showPrintButton: true },
      relatedProductEnabled: purchaseOrderFormSettings?.relatedProductEnabled,
    }),
    [purchaseOrderFormSettings],
  );

  const safeSalesOrderFormSettings = useMemo(
    () => ({
      standardFields: salesOrderFormSettings?.standardFields ?? [],
      customFields: salesOrderFormSettings?.customFields ?? [],
      listPrint: salesOrderFormSettings?.listPrint ?? { showPrintButton: true },
    }),
    [salesOrderFormSettings],
  );

  // ── Purchase bill items ──
  const [purchaseBillItems, setPurchaseBillItems] = useState<{
    id: string;
    productId: string;
    quantity?: number;
    purchasePrice: number;
    variantQuantities?: Record<string, number>;
    batch?: string;
    relatedProductId?: string;
    /** 引用采购订单行时存在；编辑保存必须带回，否则与订单的入库关联会断 */
    sourceOrderNumber?: string;
    sourceLineId?: string;
    /** 行备注（如「由订单[…]转化」）；编辑时从首条明细带出 */
    lineNote?: string;
  }[]>(() => {
    if (formType !== 'PURCHASE_BILL' || !editingDocNumber) return [];
    const existing = recordsList.filter((r) => r.type === 'PURCHASE_BILL' && r.docNumber === editingDocNumber);
    if (existing.length === 0) return [];
    const lineMap: Record<string, PsiRecord[]> = {};
    existing.forEach((r) => {
      const lg = r.lineGroupId ?? r.id;
      if (!lineMap[lg]) lineMap[lg] = [];
      lineMap[lg].push(r);
    });
    return Object.entries(lineMap).map(([lgId, recs]) => {
      const first = recs[0];
      let sourceOrderNumber: string | undefined;
      let sourceLineId: string | undefined;
      for (const r of recs as { sourceOrderNumber?: unknown; sourceLineId?: unknown }[]) {
        const son = r.sourceOrderNumber != null && String(r.sourceOrderNumber).trim() !== '' ? String(r.sourceOrderNumber).trim() : '';
        const sl = r.sourceLineId != null && String(r.sourceLineId).trim() !== '' ? String(r.sourceLineId).trim() : '';
        if (son) sourceOrderNumber = son;
        if (sl) sourceLineId = sl;
      }
      const hasVar = recs.some((r) => r.variantId);
      const vq: Record<string, number> = {};
      if (hasVar) recs.forEach((r) => { if (r.variantId) vq[r.variantId] = (vq[r.variantId] ?? 0) + (Number(r.quantity) || 0); });
      const lineQtyNoVar = recs.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      const firstCd = first.customData;
      const lineRel =
        firstCd && typeof firstCd === 'object' && !Array.isArray(firstCd)
          ? String((firstCd as Record<string, unknown>).relatedProductId ?? '').trim()
          : '';
      const lineNote = first.note != null && first.note !== '' ? String(first.note) : '';
      return {
        id: lgId,
        productId: first.productId,
        quantity: hasVar ? undefined : lineQtyNoVar,
        purchasePrice: first.purchasePrice ?? 0,
        variantQuantities: hasVar ? vq : undefined,
        batch: first.batchNo ?? first.batch,
        ...(lineRel ? { relatedProductId: lineRel } : {}),
        ...(sourceOrderNumber && sourceLineId ? { sourceOrderNumber, sourceLineId } : {}),
        ...(lineNote ? { lineNote } : {}),
      };
    });
  });

  // ── Sales order items ──
  const [salesOrderItems, setSalesOrderItems] = useState<{ id: string; productId: string; quantity?: number; salesPrice: number; variantQuantities?: Record<string, number>; sourceRecordIds?: string[] }[]>(() => {
    if (formType !== 'SALES_ORDER' || !editingDocNumber) return [];
    const existing = recordsList.filter((r) => r.type === 'SALES_ORDER' && r.docNumber === editingDocNumber);
    if (existing.length === 0) return [];
    const lineMap: Record<string, PsiRecord[]> = {};
    existing.forEach((r) => {
      const lg = r.lineGroupId ?? r.id;
      if (!lineMap[lg]) lineMap[lg] = [];
      lineMap[lg].push(r);
    });
    return Object.entries(lineMap).map(([lgId, recs]) => {
      const first = recs[0];
      const hasVar = recs.some((r) => r.variantId);
      const vq: Record<string, number> = {};
      if (hasVar) recs.forEach((r) => { if (r.variantId) vq[r.variantId] = (vq[r.variantId] ?? 0) + (Number(r.quantity) || 0); });
      const lineQtyNoVar = recs.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      return {
        id: lgId,
        productId: first.productId,
        quantity: hasVar ? undefined : lineQtyNoVar,
        salesPrice: first.salesPrice ?? 0,
        variantQuantities: hasVar ? vq : undefined,
        sourceRecordIds: recs.map((r) => r.id),
      };
    });
  });

  // ── Sales bill items ──
  const [salesBillItems, setSalesBillItems] = useState<
    {
      id: string;
      productId: string;
      quantity?: number;
      salesPrice: number;
      variantQuantities?: Record<string, number>;
      sourceRecordIds?: string[];
      batch?: string;
    }[]
  >(() => {
    if (formType !== 'SALES_BILL' || !editingDocNumber) return [];
    const existing = recordsList.filter((r) => r.type === 'SALES_BILL' && r.docNumber === editingDocNumber);
    if (existing.length === 0) return [];
    const lineMap: Record<string, PsiRecord[]> = {};
    existing.forEach((r) => {
      const lg = r.lineGroupId ?? r.id;
      if (!lineMap[lg]) lineMap[lg] = [];
      lineMap[lg].push(r);
    });
    return Object.entries(lineMap).map(([lgId, recs]) => {
      const first = recs[0];
      const hasVar = recs.some((r) => r.variantId);
      const vq: Record<string, number> = {};
      if (hasVar) recs.forEach((r) => { if (r.variantId) vq[r.variantId] = (vq[r.variantId] ?? 0) + (Number(r.quantity) || 0); });
      const lineQtyNoVar = recs.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      const batchRaw = first.batchNo ?? first.batch;
      const batch =
        typeof batchRaw === 'string' && batchRaw.trim() !== '' ? batchRaw.trim() : undefined;
      return {
        id: lgId,
        productId: first.productId,
        quantity: hasVar ? undefined : lineQtyNoVar,
        salesPrice: first.salesPrice ?? 0,
        variantQuantities: hasVar ? vq : undefined,
        sourceRecordIds: recs.map((r) => r.id),
        batch: hasVar ? undefined : batch,
      };
    });
  });

  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [allocationModal, setAllocationModal] = useState<{ docNumber: string; lineGroupId: string; product: Product; grp: PsiRecord[] } | null>(null);
  const [allocationQuantities, setAllocationQuantities] = useState<number | Record<string, number> | null>(null);
  const [allocationWarehouseId, setAllocationWarehouseId] = useState<string>('');

  /**
   * 「合作单位 + 商品」上次单价索引：采购/销售两侧共用一个 Map。
   * 编辑模式下排除本单（避免将本单旧行当作外部的上次成交价）。
   */
  const psiLastPriceIndex = useMemo(
    () => buildPsiLastPriceIndex(recordsList, { excludeDocNumber: editingDocNumber || '' }),
    [recordsList, editingDocNumber],
  );

  /** 新建时用；有合作单位且有历史则用上次价，否则用产品档案采购价。 */
  const resolveDefaultPurchasePrice = useCallback(
    (productId: string): number => {
      if (!productId) return 0;
      if (form.partner?.trim() || form.partnerId) {
        const last = lookupLastPrice(psiLastPriceIndex, 'PURCHASE', form.partnerId, form.partner, productId);
        if (last != null) return last;
      }
      return productMapPSI.get(productId)?.purchasePrice ?? 0;
    },
    [psiLastPriceIndex, form.partner, form.partnerId, productMapPSI],
  );

  /** 新建时用；有合作单位且有历史则用上次价，否则用产品档案销售价。 */
  const resolveDefaultSalesPrice = useCallback(
    (productId: string): number => {
      if (!productId) return 0;
      if (form.partner?.trim() || form.partnerId) {
        const last = lookupLastPrice(psiLastPriceIndex, 'SALES', form.partnerId, form.partner, productId);
        if (last != null) return last;
      }
      return productMapPSI.get(productId)?.salesPrice ?? 0;
    },
    [psiLastPriceIndex, form.partner, form.partnerId, productMapPSI],
  );

  /**
   * 新建模式下合作单位变更 → 对已有明细行整体按解析函数刷新单价。
   * 初始挂载不触发（初次没有「之前的合作单位」基线）；编辑模式不自动重算，避免覆盖用户在本单内的调整。
   */
  const prevPartnerKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const currentKey = `${form.partnerId || ''}::${(form.partner || '').trim()}`;
    if (editingDocNumber) {
      prevPartnerKeyRef.current = currentKey;
      return;
    }
    if (prevPartnerKeyRef.current === null) {
      prevPartnerKeyRef.current = currentKey;
      return;
    }
    if (prevPartnerKeyRef.current === currentKey) return;
    prevPartnerKeyRef.current = currentKey;
    if (formType === 'PURCHASE_ORDER') {
      setPurchaseOrderItems(prev =>
        prev.map(it => (it.productId ? { ...it, purchasePrice: resolveDefaultPurchasePrice(it.productId) } : it)),
      );
    } else if (formType === 'PURCHASE_BILL') {
      setPurchaseBillItems(prev =>
        prev.map(it => (it.productId ? { ...it, purchasePrice: resolveDefaultPurchasePrice(it.productId) } : it)),
      );
    } else if (formType === 'SALES_ORDER') {
      setSalesOrderItems(prev =>
        prev.map(it => (it.productId ? { ...it, salesPrice: resolveDefaultSalesPrice(it.productId) } : it)),
      );
    } else if (formType === 'SALES_BILL') {
      setSalesBillItems(prev =>
        prev.map(it => (it.productId ? { ...it, salesPrice: resolveDefaultSalesPrice(it.productId) } : it)),
      );
    }
  }, [
    form.partnerId,
    form.partner,
    editingDocNumber,
    formType,
    resolveDefaultPurchasePrice,
    resolveDefaultSalesPrice,
  ]);

  // ── Doc number generators ──
  const generatePODocNumber = (): string => {
    const pid = form.partnerId || partners.find(p => p.name === form.partner)?.id || '';
    return nextPsiDocNumber('PO', 'PURCHASE_ORDER', partners, recordsList, pid, form.partner || '');
  };

  const generatePBDocNumber = (partnerId: string, partnerName: string): string =>
    nextPsiDocNumber('PB', 'PURCHASE_BILL', partners, recordsList, partnerId || '', partnerName || '');

  const generateSODocNumber = (): string => {
    const pid = form.partnerId || partners.find(p => p.name === form.partner)?.id || '';
    return nextPsiDocNumber('SO', 'SALES_ORDER', partners, recordsList, pid, form.partner || '');
  };

  const generateSBDocNumber = (): string => {
    const pid = form.partnerId || partners.find(p => p.name === form.partner)?.id || '';
    return nextPsiDocNumber('XS', 'SALES_BILL', partners, recordsList, pid, form.partner || '', ['SB']);
  };

  const salesBillPreviewDocNumber = useMemo(() => {
    if (formType !== 'SALES_BILL' || editingDocNumber) return '';
    if (!form.partner?.trim()) return '';
    const pid = form.partnerId || partners.find(p => p.name === form.partner)?.id || '';
    return nextPsiDocNumber('XS', 'SALES_BILL', partners, recordsList, pid, form.partner || '', ['SB']);
  }, [formType, editingDocNumber, form.partnerId, form.partner, partners, recordsList]);

  const salesBillReadonlyDocNumber = editingDocNumber || salesBillPreviewDocNumber;

  // ── Item CRUD helpers ──
  const addPurchaseOrderItem = () =>
    setPurchaseOrderItems(prev => [...prev, { id: `line-${Date.now()}`, productId: '', quantity: 0, purchasePrice: 0 }]);
  const updatePurchaseOrderItem = (
    id: string,
    updates: Partial<{
      productId: string;
      quantity?: number;
      purchasePrice: number;
      variantQuantities?: Record<string, number>;
    }>,
  ) => {
    setPurchaseOrderItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updatePurchaseOrderVariantQty = (lineId: string, variantId: string, qty: number) => {
    setPurchaseOrderItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removePurchaseOrderItem = (id: string) => setPurchaseOrderItems(prev => prev.filter(i => i.id !== id));

  const addSalesOrderItem = () => setSalesOrderItems(prev => [...prev, { id: `so-line-${Date.now()}`, productId: '', quantity: 0, salesPrice: 0 }]);
  const updateSalesOrderItem = (id: string, updates: Partial<{ productId: string; quantity?: number; salesPrice: number; variantQuantities?: Record<string, number> }>) => {
    setSalesOrderItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updateSalesOrderVariantQty = (lineId: string, variantId: string, qty: number) => {
    setSalesOrderItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removeSalesOrderItem = (id: string) => setSalesOrderItems(prev => prev.filter(i => i.id !== id));

  const soDocNumberForPrint = useMemo(
    () =>
      editingDocNumber ||
      nextPsiDocNumber('SO', 'SALES_ORDER', partners, recordsList, form.partnerId || '', form.partner || ''),
    [editingDocNumber, partners, recordsList, form.partnerId, form.partner],
  );

  const buildSalesOrderPrintContext = useCallback(
    (_template: PrintTemplate) =>
      buildSalesOrderPrintRenderContext({
        docNumber: soDocNumberForPrint,
        partner: String(form.partner ?? ''),
        operator: docOperator,
        customData: form.customData,
        lines: salesOrderItems.map(l => ({
          id: l.id,
          productId: l.productId,
          quantity: l.quantity,
          salesPrice: l.salesPrice,
          variantQuantities: l.variantQuantities,
        })),
        productMap: productMapPSI,
        dictionaries,
      }),
    [soDocNumberForPrint, form.partner, form.customData, salesOrderItems, productMapPSI, dictionaries, docOperator],
  );

  const addSalesBillItem = () =>
    setSalesBillItems(prev => [...prev, { id: `sb-line-${Date.now()}`, productId: '', quantity: 0, salesPrice: 0, batch: undefined }]);
  const updateSalesBillItem = (
    id: string,
    updates: Partial<{
      productId: string;
      quantity?: number;
      salesPrice: number;
      variantQuantities?: Record<string, number>;
      batch?: string;
    }>,
  ) => {
    setSalesBillItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updateSalesBillVariantQty = (lineId: string, variantId: string, qty: number) => {
    setSalesBillItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removeSalesBillItem = (id: string) => setSalesBillItems(prev => prev.filter(i => i.id !== id));

  const pbDocNumberForPrint = useMemo(
    () =>
      editingDocNumber ||
      nextPsiDocNumber('PB', 'PURCHASE_BILL', partners, recordsList, form.partnerId || '', form.partner || ''),
    [editingDocNumber, partners, recordsList, form.partnerId, form.partner],
  );

  const buildPurchaseBillPrintContext = useCallback(
    (_template: PrintTemplate) => {
      const wid = form.warehouseId as string | undefined;
      const warehouseName = wid ? warehouseMapPSI.get(wid)?.name ?? wid : '';
      return buildPurchaseBillPrintRenderContext({
        docNumber: pbDocNumberForPrint,
        partner: String(form.partner ?? ''),
        operator: docOperator,
        warehouseName,
        customData: form.customData,
        lines: purchaseBillItems.map(({ id, productId, quantity, purchasePrice, variantQuantities }) => ({
          id,
          productId,
          quantity,
          purchasePrice,
          variantQuantities,
        })),
        productMap: productMapPSI,
        dictionaries,
      });
    },
    [pbDocNumberForPrint, form.partner, form.customData, form.warehouseId, purchaseBillItems, productMapPSI, warehouseMapPSI, dictionaries, docOperator],
  );

  const addPurchaseBillItem = () =>
    setPurchaseBillItems(prev => [...prev, { id: `pb-line-${Date.now()}`, productId: '', quantity: 0, purchasePrice: 0 }]);
  const updatePurchaseBillItem = (
    id: string,
    updates: Partial<{
      productId: string;
      quantity?: number;
      purchasePrice: number;
      variantQuantities?: Record<string, number>;
      batch?: string;
      relatedProductId?: string;
      sourceOrderNumber?: string;
      sourceLineId?: string;
      lineNote?: string;
    }>,
  ) => {
    setPurchaseBillItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updatePurchaseBillVariantQty = (lineId: string, variantId: string, qty: number) => {
    setPurchaseBillItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removePurchaseBillItem = (id: string) => setPurchaseBillItems(prev => prev.filter(i => i.id !== id));

  // ── PO received tracking (for PO progress bars and PB from-order) ──
  const receivedByOrderLine = useMemo(() => {
    const map: Record<string, number> = {};
    recordsList.filter(r => r.type === 'PURCHASE_BILL' && r.sourceOrderNumber && r.sourceLineId).forEach(r => {
      const key = `${r.sourceOrderNumber}::${r.sourceLineId}`;
      map[key] = (map[key] ?? 0) + (r.quantity ?? 0);
    });
    return map;
  }, [recordsList]);

  // ── Reset form ──
  const resetForm = () => {
    const t = localTodayYmd();
    setForm({ productId: '', warehouseId: '', fromWarehouseId: '', toWarehouseId: '', quantity: 0, actualQuantity: 0, purchasePrice: 0, partner: '', partnerId: '', note: '', docNumber: '', dueDate: '', createdAt: t, customData: {} });
    setPurchaseOrderItems([]);
    setPurchaseBillItems([]);
    setSalesOrderItems([]);
    setSalesBillItems([]);
  };

  // ── Save handler ──
  const handleSaveManual = async (submitType: string) => {
    if (submitType === 'PURCHASE_ORDER') {
      const hasValidLine = purchaseOrderItems.some(i => {
        if (!i.productId) return false;
        const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
        return q > 0;
      });
      if (!form.partner || purchaseOrderItems.length === 0 || !hasValidLine) return;
      const originalDocNumber = editingDocNumber || '';
      /** 采购订单单号：新增保存时自动生成；编辑沿用原单号且不可改 */
      let docNumber = editingDocNumber ? editingDocNumber : generatePODocNumber();
      if (!editingDocNumber) {
        const exists = (n: string) => recordsList.some((r) => r.type === 'PURCHASE_ORDER' && (r.docNumber || '').toLowerCase() === n.toLowerCase());
        let attempts = 0;
        while (exists(docNumber) && attempts < 100) {
          const m = docNumber.match(/-(\d+)$/);
          if (m) {
            const next = parseInt(m[1], 10) + 1;
            docNumber = docNumber.replace(/-\d+$/, `-${String(next).padStart(3, '0')}`);
          } else {
            docNumber = `${docNumber}-${Date.now().toString().slice(-6)}`;
          }
          attempts++;
        }
      }
      const timestamp = psiDocTimestampIsoForSave(recordsList, 'PURCHASE_ORDER', editingDocNumber);

      const poHeaderCustomData: Record<string, unknown> | null = (() => {
        const raw = form.customData && typeof form.customData === 'object' ? { ...form.customData } : {};
        const rp = String(raw.relatedProductId ?? '').trim();
        if (rp) raw.relatedProductId = rp;
        else delete raw.relatedProductId;
        if (editingDocNumber) {
          const first = recordsList.find(
            (r: { type?: string; docNumber?: string; customData?: unknown }) =>
              r.type === 'PURCHASE_ORDER' && String(r.docNumber || '') === String(editingDocNumber),
          ) as { customData?: Record<string, unknown> } | undefined;
          const exist =
            first?.customData && typeof first.customData === 'object' ? { ...first.customData } : {};
          const sid = String(exist[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID] ?? '').trim();
          const snum = String(exist[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER] ?? '').trim();
          if (sid) raw[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID] = sid;
          else delete raw[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID];
          if (snum) raw[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER] = snum;
          else delete raw[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER];
        }
        return Object.keys(raw).length > 0 ? raw : null;
      })();

      const poCreatedAtIso = (() => {
        if (!editingDocNumber) return localCalendarYmdStartToIso(localTodayYmd());
        const row = recordsList.find(
          (r) => r.type === 'PURCHASE_ORDER' && String(r.docNumber || '') === String(editingDocNumber),
        );
        if (!row) return localCalendarYmdStartToIso(localTodayYmd());
        const ca = row.createdAt;
        if (ca == null || ca === '') return localCalendarYmdStartToIso(localTodayYmd());
        if (typeof ca === 'string' && ca.includes('T')) return ca;
        return localCalendarYmdStartToIso(toLocalDateYmd(ca) || localTodayYmd());
      })();

      const newRecords: Partial<PsiRecord>[] = [];
      let recIdx = 0;
      purchaseOrderItems.forEach((item) => {
        if (!item.productId) return;
        const price = item.purchasePrice || 0;
        if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
          Object.entries(item.variantQuantities).forEach(([variantId, qty]: [string, number]) => {
            if (!qty || qty <= 0) return;
            const amount = qty * price;
            newRecords.push({
              id: `psi-po-${Date.now()}-${recIdx++}`,
              type: 'PURCHASE_ORDER',
              docNumber,
              timestamp,
              _savedAtMs: Date.now(),
              partner: form.partner,
              partnerId: form.partnerId,
              productId: item.productId,
              variantId,
              quantity: qty,
              purchasePrice: price,
              amount,
              dueDate: '',
              note: '',
              operator: docOperator,
              lineGroupId: item.id,
              createdAt: poCreatedAtIso,
              ...(poHeaderCustomData ? { customData: poHeaderCustomData } : {}),
            });
          });
        } else if ((item.quantity ?? 0) > 0) {
          const amount = item.quantity! * price;
          newRecords.push({
            id: `psi-po-${Date.now()}-${recIdx++}`,
            type: 'PURCHASE_ORDER',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            partner: form.partner,
            partnerId: form.partnerId,
            productId: item.productId,
            quantity: item.quantity,
            purchasePrice: price,
            amount,
            dueDate: '',
            note: '',
            operator: docOperator,
            lineGroupId: item.id,
            createdAt: poCreatedAtIso,
            ...(poHeaderCustomData ? { customData: poHeaderCustomData } : {}),
          });
        }
      });

      if (newRecords.length === 0) return;

      if (editingDocNumber && onReplaceRecords) {
        onReplaceRecords('PURCHASE_ORDER', originalDocNumber || docNumber, newRecords);
      } else {
        if (onSaveBatch) await onSaveBatch(newRecords);
        else { for (const r of newRecords) await onSave(r); }
      }

      if (editingDocNumber) {
        onBack();
      } else if (onAfterNewDocSaved) {
        onAfterNewDocSaved(docNumber);
      } else {
        onBack();
      }
      return;
    }

    if (submitType === 'PURCHASE_BILL') {
      const hasValidBillLine = purchaseBillItems.some(i => {
        if (!i.productId) return false;
        const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
        return q > 0;
      });
      if (!form.partner || !form.warehouseId || purchaseBillItems.length === 0 || !hasValidBillLine) return;
      const originalDocNumber = editingDocNumber || '';
      /** 采购入库单号：新增保存时自动生成；编辑沿用原单号且不可改 */
      let docNumber = editingDocNumber ? editingDocNumber : generatePBDocNumber(form.partnerId || '', form.partner || '');
      if (!editingDocNumber) {
        const exists = (n: string) => recordsList.some((r) => r.type === 'PURCHASE_BILL' && (r.docNumber || '').toLowerCase() === n.toLowerCase());
        let attempts = 0;
        while (exists(docNumber) && attempts < 100) {
          const m = docNumber.match(/-(\d+)$/);
          if (m) {
            const next = parseInt(m[1], 10) + 1;
            docNumber = docNumber.replace(/-\d+$/, `-${String(next).padStart(3, '0')}`);
          } else {
            docNumber = `${docNumber}-${Date.now().toString().slice(-6)}`;
          }
          attempts++;
        }
      }
      const timestamp = psiDocTimestampIsoForSave(recordsList, 'PURCHASE_BILL', editingDocNumber);
      const buildPurchaseBillLineCustomData = (lineRelatedProduct: string | undefined): Record<string, unknown> | null => {
        const raw: Record<string, unknown> = form.customData && typeof form.customData === 'object' ? { ...form.customData } : {};
        delete raw.relatedProductId;
        if (safePurchaseBillFormSettings.relatedProductEnabled) {
          const lr = String(lineRelatedProduct ?? '').trim();
          if (lr) raw.relatedProductId = lr;
        }
        return Object.keys(raw).length > 0 ? raw : null;
      };
      const pbCreatedAtIso = (() => {
        if (!editingDocNumber) return localCalendarYmdStartToIso(localTodayYmd());
        const row = recordsList.find(
          (r) => r.type === 'PURCHASE_BILL' && String(r.docNumber || '') === String(editingDocNumber),
        );
        if (!row) return localCalendarYmdStartToIso(localTodayYmd());
        const ca = row.createdAt;
        if (ca == null || ca === '') return localCalendarYmdStartToIso(localTodayYmd());
        if (typeof ca === 'string' && ca.includes('T')) return ca;
        return localCalendarYmdStartToIso(toLocalDateYmd(ca) || localTodayYmd());
      })();
      const pbNoteForLine = (item: (typeof purchaseBillItems)[number]): string => {
        const kept = item.lineNote != null && String(item.lineNote).trim() !== '' ? String(item.lineNote).trim() : '';
        if (kept) return kept;
        if (item.sourceOrderNumber && item.sourceLineId) {
          return `由订单[${item.sourceOrderNumber}]商品明细转化`;
        }
        return '';
      };
      const pbSourceLinkForLine = (
        item: (typeof purchaseBillItems)[number],
      ): { sourceOrderNumber: string; sourceLineId: string } | Record<string, never> => {
        const son = item.sourceOrderNumber != null && String(item.sourceOrderNumber).trim() !== '' ? String(item.sourceOrderNumber).trim() : '';
        const sl = item.sourceLineId != null && String(item.sourceLineId).trim() !== '' ? String(item.sourceLineId).trim() : '';
        if (son && sl) return { sourceOrderNumber: son, sourceLineId: sl };
        return {};
      };
      /** 与「引用采购订单生成」入库一致，便于列表「经办」栏展示来源提示 */
      const pbOperatorForLine = (item: (typeof purchaseBillItems)[number]): string => {
        if (item.sourceOrderNumber && item.sourceLineId) {
          return `${docOperator}(订单转化)`;
        }
        return docOperator;
      };
      const newRecords: Partial<PsiRecord>[] = [];
      let pbIdx = 0;
      purchaseBillItems.forEach((item) => {
        if (!item.productId) return;
        const price = item.purchasePrice || 0;
        const lineCustom = buildPurchaseBillLineCustomData(item.relatedProductId);
        if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
          Object.entries(item.variantQuantities).forEach(([variantId, qty]: [string, number]) => {
            if (!qty || qty <= 0) return;
            newRecords.push({
              id: `psi-pb-${Date.now()}-${pbIdx++}`,
              type: 'PURCHASE_BILL',
              docNumber,
              timestamp,
              _savedAtMs: Date.now(),
              partner: form.partner,
              partnerId: form.partnerId,
              productId: item.productId,
              variantId,
              quantity: qty,
              purchasePrice: price,
              amount: qty * price,
              warehouseId: form.warehouseId,
              note: pbNoteForLine(item),
              operator: pbOperatorForLine(item),
              lineGroupId: item.id,
              createdAt: pbCreatedAtIso,
              ...pbSourceLinkForLine(item),
              ...(lineCustom ? { customData: lineCustom } : {}),
              ...(item.batch != null && item.batch !== '' && { batch: item.batch })
            });
          });
        } else if ((item.quantity ?? 0) > 0) {
          newRecords.push({
            id: `psi-pb-${Date.now()}-${pbIdx++}`,
            type: 'PURCHASE_BILL',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            partner: form.partner,
            partnerId: form.partnerId,
            productId: item.productId,
            quantity: item.quantity!,
            purchasePrice: price,
            amount: item.quantity! * price,
            warehouseId: form.warehouseId,
            note: pbNoteForLine(item),
            operator: pbOperatorForLine(item),
            lineGroupId: item.id,
            createdAt: pbCreatedAtIso,
            ...pbSourceLinkForLine(item),
            ...(lineCustom ? { customData: lineCustom } : {}),
            ...(item.batch != null && item.batch !== '' && { batch: item.batch })
          });
        }
      });
      if (editingDocNumber && onReplaceRecords) {
        onReplaceRecords('PURCHASE_BILL', originalDocNumber || docNumber, newRecords);
      } else {
        if (onSaveBatch) await onSaveBatch(newRecords);
        else { for (const r of newRecords) await onSave(r); }
      }
      writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PURCHASE_BILL, {
        warehouseId: form.warehouseId,
      });
      if (editingDocNumber) {
        onBack();
      } else if (onAfterNewDocSaved) {
        onAfterNewDocSaved(docNumber);
      } else {
        onBack();
      }
      return;
    }

    if (submitType === 'SALES_ORDER') {
      const hasValidLine = salesOrderItems.some(i => {
        if (!i.productId) return false;
        const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
        return q > 0;
      });
      if (!form.partner || salesOrderItems.length === 0 || !hasValidLine) return;
      const originalDocNumber = editingDocNumber || '';
      /** 销售订单单号：新增保存时自动生成；编辑沿用原单号且不可改 */
      let docNumber = editingDocNumber ? editingDocNumber : generateSODocNumber();
      if (!editingDocNumber) {
        const exists = (n: string) => recordsList.some((r) => r.type === 'SALES_ORDER' && (r.docNumber || '').toLowerCase() === n.toLowerCase());
        let attempts = 0;
        while (exists(docNumber) && attempts < 100) {
          const m = docNumber.match(/-(\d+)$/);
          if (m) {
            const next = parseInt(m[1], 10) + 1;
            docNumber = docNumber.replace(/-\d+$/, `-${String(next).padStart(3, '0')}`);
          } else {
            docNumber = `${docNumber}-${Date.now().toString().slice(-6)}`;
          }
          attempts++;
        }
      }
      const soCreatedAtIso = (() => {
        if (!editingDocNumber) return localCalendarYmdStartToIso(localTodayYmd());
        const row = recordsList.find(
          (r) => r.type === 'SALES_ORDER' && String(r.docNumber || '') === String(editingDocNumber),
        );
        if (!row) return localCalendarYmdStartToIso(localTodayYmd());
        const ca = row.createdAt;
        if (ca == null || ca === '') return localCalendarYmdStartToIso(localTodayYmd());
        if (typeof ca === 'string' && ca.includes('T')) return ca;
        return localCalendarYmdStartToIso(toLocalDateYmd(ca) || localTodayYmd());
      })();
      const timestamp = psiDocTimestampIsoForSave(recordsList, 'SALES_ORDER', editingDocNumber);
      const newRecords: Partial<PsiRecord>[] = [];
      let recIdx = 0;
      salesOrderItems.forEach((item) => {
        if (!item.productId) return;
        const price = item.salesPrice || 0;
        if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
          Object.entries(item.variantQuantities).forEach(([variantId, qty]: [string, number]) => {
            if (!qty || qty <= 0) return;
            const amount = qty * price;
            newRecords.push({
              id: `psi-so-${Date.now()}-${recIdx++}`,
              type: 'SALES_ORDER',
              docNumber,
              timestamp,
              _savedAtMs: Date.now(),
              partner: form.partner,
              partnerId: form.partnerId,
              productId: item.productId,
              variantId,
              quantity: qty,
              salesPrice: price,
              amount,
              dueDate: null,
              note: '',
              operator: docOperator,
              lineGroupId: item.id,
              createdAt: soCreatedAtIso,
              ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {}),
              ...preservedSalesOrderLinePsi(recordsList, item.sourceRecordIds, variantId, Number(qty) || 0),
            });
          });
        } else if ((item.quantity ?? 0) > 0) {
          const amount = item.quantity! * price;
          const q0 = Number(item.quantity) || 0;
          newRecords.push({
            id: `psi-so-${Date.now()}-${recIdx++}`,
            type: 'SALES_ORDER',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            partner: form.partner,
            partnerId: form.partnerId,
            productId: item.productId,
            quantity: item.quantity,
            salesPrice: price,
            amount,
            dueDate: null,
            note: '',
            operator: docOperator,
            lineGroupId: item.id,
            createdAt: soCreatedAtIso,
            ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {}),
            ...preservedSalesOrderLinePsi(recordsList, item.sourceRecordIds, undefined, q0),
          });
        }
      });
      if (newRecords.length === 0) return;
      if (editingDocNumber && onReplaceRecords) {
        onReplaceRecords('SALES_ORDER', originalDocNumber || docNumber, newRecords);
      } else {
        if (onSaveBatch) await onSaveBatch(newRecords);
        else { for (const r of newRecords) await onSave(r); }
      }
      if (editingDocNumber) {
        onBack();
      } else if (onAfterNewDocSaved) {
        onAfterNewDocSaved(docNumber);
      } else {
        onBack();
      }
      return;
    }

    if (submitType === 'SALES_BILL') {
      const hasValidLine = salesBillItems.some(i => {
        if (!i.productId) return false;
        const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
        return q !== 0;
      });
      if (!form.partner || !form.warehouseId || salesBillItems.length === 0 || !hasValidLine) return;
      const wh = form.warehouseId;
      for (const item of salesBillItems) {
        if (!item.productId) continue;
        const prod = productMapPSI.get(item.productId);
        const hasVariants = Boolean(prod?.variants && prod.variants.length > 0);
        const cat = categories.find(c => c.id === prod?.categoryId);
        if (!categoryUsesBatchManagement(cat) || hasVariants) continue;
        const lineQty = item.variantQuantities
          ? Object.values(item.variantQuantities).reduce((s, v) => s + v, 0)
          : (item.quantity ?? 0);
        if (lineQty === 0) continue;
        const bn = String(item.batch ?? '').trim();
        if (!bn) {
          toast.error('启用批次管理的产品须选择出库批次');
          return;
        }
        if (wh && lineQty > 0) {
          try {
            const rows = await api.psi.getStockBatches({ productId: item.productId, warehouseId: wh });
            const avail = Array.isArray(rows)
              ? (rows as { batchNo: string; stock: number }[]).find(r => r.batchNo === bn)?.stock ?? 0
              : 0;
            if (lineQty > avail) {
              toast.error(`产品 ${prod?.name ?? item.productId} 批次「${bn}」可用库存不足（当前 ${avail}）`);
              return;
            }
          } catch (e) {
            toast.error(e instanceof Error ? e.message : '校验批次库存失败');
            return;
          }
        }
      }
      const originalDocNumber = editingDocNumber || '';
      let docNumber = (editingDocNumber || generateSBDocNumber()).trim();
      if (!editingDocNumber) {
        const exists = (n: string) => recordsList.some((r) => r.type === 'SALES_BILL' && (r.docNumber || '').toLowerCase() === n.toLowerCase());
        let attempts = 0;
        while (exists(docNumber) && attempts < 100) {
          const m = docNumber.match(/-(\d+)$/);
          if (m) {
            const next = parseInt(m[1], 10) + 1;
            docNumber = docNumber.replace(/-\d+$/, `-${String(next).padStart(3, '0')}`);
          } else {
            docNumber = `${docNumber}-${Date.now().toString().slice(-6)}`;
          }
          attempts++;
        }
      }
      const timestamp = psiDocTimestampIsoForSave(recordsList, 'SALES_BILL', editingDocNumber);
      const sbHead = editingDocNumber
        ? recordsList.find((r) => r.type === 'SALES_BILL' && r.docNumber === editingDocNumber)
        : undefined;
      const sbCreatedAtIso = sbHead?.createdAt
        ? (String(sbHead.createdAt).trim().includes('T')
          ? String(sbHead.createdAt).trim()
          : localCalendarYmdStartToIso(toLocalDateYmd(sbHead.createdAt) || localTodayYmd()))
        : localCalendarYmdStartToIso(localTodayYmd());
      const sbNotePreserve = sbHead && editingDocNumber ? (sbHead.note != null ? String(sbHead.note) : '') : '';
      const newRecords: Partial<PsiRecord>[] = [];
      let recIdx = 0;
      salesBillItems.forEach((item) => {
        if (!item.productId) return;
        const price = item.salesPrice || 0;
        if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
          Object.entries(item.variantQuantities).forEach(([variantId, qty]: [string, number]) => {
            if (qty === 0) return;
            newRecords.push({
              id: `psi-sb-${Date.now()}-${recIdx++}`,
              type: 'SALES_BILL',
              docNumber,
              timestamp,
              _savedAtMs: Date.now(),
              partner: form.partner,
              partnerId: form.partnerId,
              warehouseId: form.warehouseId,
              productId: item.productId,
              variantId,
              quantity: qty,
              salesPrice: price,
              amount: qty * price,
              note: sbNotePreserve,
              operator: docOperator,
              lineGroupId: item.id,
              createdAt: sbCreatedAtIso,
              ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {}),
            });
          });
        } else if ((item.quantity ?? 0) !== 0) {
          newRecords.push({
            id: `psi-sb-${Date.now()}-${recIdx++}`,
            type: 'SALES_BILL',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            partner: form.partner,
            partnerId: form.partnerId,
            warehouseId: form.warehouseId,
            productId: item.productId,
            quantity: item.quantity!,
            salesPrice: price,
            amount: item.quantity! * price,
            note: sbNotePreserve,
            operator: docOperator,
            lineGroupId: item.id,
            createdAt: sbCreatedAtIso,
            ...(item.batch != null && item.batch !== '' && { batch: item.batch }),
            ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {}),
          });
        }
      });
      if (newRecords.length === 0) return;
      if (editingDocNumber && onReplaceRecords) {
        onReplaceRecords('SALES_BILL', originalDocNumber || docNumber, newRecords);
      } else {
        if (onSaveBatch) await onSaveBatch(newRecords);
        else { for (const r of newRecords) await onSave(r); }
      }
      writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.SALES_BILL, {
        warehouseId: form.warehouseId,
      });
      if (editingDocNumber) {
        onBack();
      } else if (onAfterNewDocSaved) {
        onAfterNewDocSaved(docNumber);
      } else {
        onBack();
      }
      return;
    }
  };

  // ── Render ──
  if (formType === 'PURCHASE_ORDER') {
    return (
      <PurchaseOrderFormSection
        form={form}
        setForm={setForm}
        previewAutoPoDocNumber={!editingDocNumber ? generatePODocNumber() : undefined}
        purchaseOrderItems={purchaseOrderItems}
        onAddItem={addPurchaseOrderItem}
        onUpdateItem={updatePurchaseOrderItem}
        onUpdateVariantQty={updatePurchaseOrderVariantQty}
        onRemoveItem={removePurchaseOrderItem}
        onSave={() => handleSaveManual('PURCHASE_ORDER')}
        onBack={onBack}
        onDeleteRecords={onDeleteRecords}
        editingDocNumber={editingDocNumber}
        hasPsiPerm={hasPsiPerm}
        products={products}
        categories={categories}
        partners={partners}
        partnerCategories={partnerCategories}
        dictionaries={dictionaries}
        productMapPSI={productMapPSI}
        formatQtyDisplay={formatQtyDisplay}
        getUnitName={getUnitName}
        formSettings={safePurchaseOrderFormSettings}
        partnerLabel={partnerLabel}
        receivedByOrderLine={receivedByOrderLine}
        resolveDefaultPurchasePrice={resolveDefaultPurchasePrice}
      />
    );
  }

  if (formType === 'SALES_ORDER') {
    return (
      <SalesOrderFormSection
        form={form}
        setForm={setForm}
        previewAutoSODocNumber={!editingDocNumber ? generateSODocNumber() : undefined}
        salesOrderItems={salesOrderItems}
        onAddItem={addSalesOrderItem}
        onUpdateItem={updateSalesOrderItem}
        onUpdateVariantQty={updateSalesOrderVariantQty}
        onRemoveItem={removeSalesOrderItem}
        onSave={() => handleSaveManual('SALES_ORDER')}
        onBack={onBack}
        onDeleteRecords={onDeleteRecords}
        editingDocNumber={editingDocNumber}
        hasPsiPerm={hasPsiPerm}
        products={products}
        categories={categories}
        partners={partners}
        partnerCategories={partnerCategories}
        dictionaries={dictionaries}
        productMapPSI={productMapPSI}
        formatQtyDisplay={formatQtyDisplay}
        getUnitName={getUnitName}
        partnerLabel={partnerLabel}
        formSettings={safeSalesOrderFormSettings}
        listPrintSlot={safeSalesOrderFormSettings.listPrint}
        printTemplates={mergedPrintTemplates}
        buildSalesOrderPrintContext={buildSalesOrderPrintContext}
        resolveDefaultSalesPrice={resolveDefaultSalesPrice}
      />
    );
  }

  if (formType === 'SALES_BILL') {
    return (
      <SalesBillFormSection
        form={form}
        setForm={setForm}
        readonlyDocNumber={salesBillReadonlyDocNumber}
        salesBillItems={salesBillItems}
        onAddItem={addSalesBillItem}
        onUpdateItem={updateSalesBillItem}
        onUpdateVariantQty={updateSalesBillVariantQty}
        onRemoveItem={removeSalesBillItem}
        onSave={() => handleSaveManual('SALES_BILL')}
        onBack={onBack}
        onDeleteRecords={onDeleteRecords}
        editingDocNumber={editingDocNumber}
        hasPsiPerm={hasPsiPerm}
        products={products}
        categories={categories}
        partners={partners}
        partnerCategories={partnerCategories}
        dictionaries={dictionaries}
        warehouses={warehouses}
        productMapPSI={productMapPSI}
        formatQtyDisplay={formatQtyDisplay}
        getUnitName={getUnitName}
        partnerLabel={partnerLabel}
        formSettings={safeSalesBillFormSettings}
        resolveDefaultSalesPrice={resolveDefaultSalesPrice}
        recordsList={recordsList}
        prodRecords={prodRecords}
      />
    );
  }

  if (formType === 'PURCHASE_BILL') {
    return (
      <PurchaseBillFormSection
        form={form}
        setForm={setForm}
        purchaseBillItems={purchaseBillItems}
        onAddItem={addPurchaseBillItem}
        onUpdateItem={updatePurchaseBillItem}
        onUpdateVariantQty={updatePurchaseBillVariantQty}
        onRemoveItem={removePurchaseBillItem}
        onResetItems={() => setPurchaseBillItems([])}
        onSaveManual={() => handleSaveManual('PURCHASE_BILL')}
        onBack={onBack}
        onAfterNewDocSaved={onAfterNewDocSaved}
        onSaveRecord={onSave}
        onSaveBatch={onSaveBatch}
        onDeleteRecords={onDeleteRecords}
        editingDocNumber={editingDocNumber}
        hasPsiPerm={hasPsiPerm}
        products={products}
        categories={categories}
        partners={partners}
        partnerCategories={partnerCategories}
        dictionaries={dictionaries}
        warehouses={warehouses}
        productMapPSI={productMapPSI}
        categoryMapPSI={categoryMapPSI}
        formatQtyDisplay={formatQtyDisplay}
        getUnitName={getUnitName}
        formSettings={safePurchaseBillFormSettings}
        partnerLabel={partnerLabel}
        recordsList={recordsList}
        receivedByOrderLine={receivedByOrderLine}
        generatePBDocNumber={generatePBDocNumber}
        previewAutoPbDocNumber={!editingDocNumber ? generatePBDocNumber(form.partnerId || '', form.partner || '') : undefined}
        listPrintSlot={safePurchaseBillFormSettings.listPrint}
        printTemplates={mergedPrintTemplates}
        buildPurchaseBillPrintContext={buildPurchaseBillPrintContext}
        resolveDefaultPurchasePrice={resolveDefaultPurchasePrice}
      />
    );
  }

  return null;
};

export default React.memo(OrderBillFormPage);
