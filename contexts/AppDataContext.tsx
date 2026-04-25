import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import * as api from '../services/api';
import type {
  Product,
  ProductionOrder,
  PlanOrder,
  ProductionOpRecord,
  FinanceRecord,
  Warehouse,
  PlanFormSettings,
  OrderFormSettings,
  PurchaseOrderFormSettings,
  SalesOrderFormSettings,
  PurchaseBillFormSettings,
  SalesBillFormSettings,
  ReceiptFormSettings,
  PaymentFormSettings,
  ProductionLinkMode,
  ProductMilestoneProgress,
  ProcessSequenceMode,
  FinanceCategory,
  FinanceAccountType,
  AppDictionaries,
  ProductCategory,
  PartnerCategory,
  GlobalNodeTemplate,
  BOM,
  PrintTemplate,
  MaterialPanelSettings,
  MaterialFormSettings,
  OutsourceFormSettings,
  ReworkFormSettings,
  PsiRecord,
  Partner,
  Worker,
  Equipment,
} from '../types';
import {
  DEFAULT_MATERIAL_PANEL_SETTINGS,
  DEFAULT_MATERIAL_FORM_SETTINGS,
  DEFAULT_OUTSOURCE_FORM_SETTINGS,
  DEFAULT_REWORK_FORM_SETTINGS,
} from '../types';
import { normalizePartnersFromApi } from '../utils/partnerNormalize';
import { currentOperatorDisplayName } from '../utils/currentOperatorDisplayName';
import { broadcastPrintTemplatesSaved, subscribePrintTemplatesChanged } from '../utils/printTemplatesCrossTab';

import {
  normalizeDecimals,
  DEFAULT_PLAN_FORM_SETTINGS,
  DEFAULT_ORDER_FORM_SETTINGS,
  DEFAULT_PURCHASE_ORDER_FORM_SETTINGS,
  DEFAULT_SALES_ORDER_FORM_SETTINGS,
  DEFAULT_PURCHASE_BILL_FORM_SETTINGS,
  DEFAULT_SALES_BILL_FORM_SETTINGS,
  DEFAULT_RECEIPT_FORM_SETTINGS,
  DEFAULT_PAYMENT_FORM_SETTINGS,
  normalizePlanFormSettings,
  normalizeOrderFormSettings,
  normalizePurchaseOrderFormSettings,
  normalizeSalesOrderFormSettings,
  normalizePurchaseBillFormSettings,
  normalizeSalesBillFormSettings,
  normalizeReceiptFormSettings,
  normalizePaymentFormSettings,
  normalizeMaterialFormSettings,
  normalizeOutsourceFormSettings,
  normalizeReworkFormSettings,
} from './formSettingsDefaults';
import {
  mergeById,
  executeAppDataLoadCore,
  executeAppDataDeferredLoad,
} from './appDataLoadCore';


const EMPTY_DICTIONARIES: AppDictionaries = { colors: [], sizes: [], units: [] };

// ── Context type ──

export interface AppDataContextValue {
  dataLoading: boolean;
  products: Product[];
  orders: ProductionOrder[];
  plans: PlanOrder[];
  psiRecords: PsiRecord[];
  financeRecords: FinanceRecord[];
  prodRecords: ProductionOpRecord[];
  categories: ProductCategory[];
  partnerCategories: PartnerCategory[];
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  boms: BOM[];
  partners: Partner[];
  workers: Worker[];
  equipment: Equipment[];
  warehouses: Warehouse[];
  financeCategories: FinanceCategory[];
  financeAccountTypes: FinanceAccountType[];
  planFormSettings: PlanFormSettings;
  orderFormSettings: OrderFormSettings;
  purchaseOrderFormSettings: PurchaseOrderFormSettings;
  salesOrderFormSettings: SalesOrderFormSettings;
  purchaseBillFormSettings: PurchaseBillFormSettings;
  salesBillFormSettings: SalesBillFormSettings;
  receiptFormSettings: ReceiptFormSettings;
  paymentFormSettings: PaymentFormSettings;
  /** 租户级打印模板列表 */
  printTemplates: PrintTemplate[];
  productionLinkMode: ProductionLinkMode;
  processSequenceMode: ProcessSequenceMode;
  allowExceedMaxReportQty: boolean;
  productMilestoneProgresses: ProductMilestoneProgress[];
  // Config handlers
  onUpdateProductionLinkMode: (mode: ProductionLinkMode) => Promise<void>;
  onUpdateProcessSequenceMode: (mode: ProcessSequenceMode) => Promise<void>;
  onUpdateAllowExceedMaxReportQty: (v: boolean) => Promise<void>;
  onUpdatePlanFormSettings: (v: PlanFormSettings) => Promise<void>;
  onUpdateOrderFormSettings: (v: OrderFormSettings) => Promise<void>;
  onUpdatePurchaseOrderFormSettings: (v: PurchaseOrderFormSettings) => Promise<void>;
  onUpdateSalesOrderFormSettings: (v: SalesOrderFormSettings) => Promise<void>;
  onUpdatePurchaseBillFormSettings: (v: PurchaseBillFormSettings) => Promise<void>;
  onUpdateSalesBillFormSettings: (v: SalesBillFormSettings) => Promise<void>;
  onUpdateReceiptFormSettings: (v: ReceiptFormSettings) => Promise<void>;
  onUpdatePaymentFormSettings: (v: PaymentFormSettings) => Promise<void>;
  onUpdatePrintTemplates: (v: PrintTemplate[]) => Promise<void>;
  materialPanelSettings: MaterialPanelSettings;
  materialFormSettings: MaterialFormSettings;
  outsourceFormSettings: OutsourceFormSettings;
  reworkFormSettings: ReworkFormSettings;
  onUpdateMaterialPanelSettings: (v: MaterialPanelSettings) => Promise<void>;
  onUpdateMaterialFormSettings: (v: MaterialFormSettings) => Promise<void>;
  onUpdateOutsourceFormSettings: (v: OutsourceFormSettings) => Promise<void>;
  onUpdateReworkFormSettings: (v: ReworkFormSettings) => Promise<void>;
  // Product / BOM
  /** 成功返回 true，失败已 toast 并返回 false */
  /** 成功返回归一化后的产品实体，失败返回 null（已 toast） */
  onUpdateProduct: (p: Product) => Promise<Product | null>;
  /** 成功返回 true，失败已 toast 并返回 false */
  onDeleteProduct: (id: string) => Promise<boolean>;
  /** 成功返回 true，失败已 toast 并返回 false */
  onUpdateBOM: (b: BOM) => Promise<boolean>;
  // Plans
  onCreatePlan: (p: PlanOrder) => Promise<void>;
  onUpdatePlan: (id: string, updates: Partial<PlanOrder>) => Promise<void>;
  onSplitPlan: (planId: string, newPlans: PlanOrder[]) => Promise<void>;
  onDeletePlan: (id: string) => Promise<void>;
  onConvertToOrder: (id: string) => Promise<void>;
  onCreateSubPlan: (data: { productId: string; quantity: number; planId: string; bomNodeId?: string }) => Promise<void>;
  onCreateSubPlans: (data: { planId: string; items: Array<{ productId: string; quantity: number; bomNodeId?: string; parentProductId?: string; parentNodeId?: string }> }) => Promise<void>;
  // Orders / reports
  onReportSubmit: (oId: string, mId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => Promise<void>;
  onReportSubmitProduct: (productId: string, milestoneTemplateId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => Promise<void>;
  onUpdateReport: (data: { orderId: string; milestoneId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneId?: string; customData?: Record<string, unknown> }) => Promise<void>;
  onDeleteReport: (data: { orderId: string; milestoneId: string; reportId: string }) => Promise<void>;
  onUpdateReportProduct: (data: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string; customData?: Record<string, unknown> }) => Promise<void>;
  onDeleteReportProduct: (data: { progressId: string; reportId: string }) => Promise<void>;
  onUpdateOrder: (orderId: string, updates: Partial<ProductionOrder>) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
  // Production records
  onAddProdRecord: (record: ProductionOpRecord) => Promise<void>;
  onAddProdRecordBatch: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateProdRecord: (r: ProductionOpRecord) => Promise<void>;
  onDeleteProdRecord: (id: string) => Promise<void>;
  // PSI records
  onAddPSIRecord: (record: any) => Promise<void>;
  onAddPSIRecordBatch: (records: any[]) => Promise<void>;
  onReplacePSIRecords: (type: string, docNumber: string, newRecords: any[]) => Promise<void>;
  onDeletePSIRecords: (type: string, docNumber: string) => Promise<void>;
  // Finance records
  onAddFinanceRecord: (r: FinanceRecord) => Promise<void>;
  onUpdateFinanceRecord: (r: FinanceRecord) => Promise<void>;
  onDeleteFinanceRecord: (id: string) => Promise<void>;
  // Refresh helpers (for child pages that manage their own CRUD)
  refreshDictionaries: () => Promise<void>;
  refreshWorkers: () => Promise<void>;
  refreshEquipment: () => Promise<void>;
  refreshPartners: () => Promise<void>;
  refreshPartnerCategories: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  refreshGlobalNodes: () => Promise<void>;
  refreshWarehouses: () => Promise<void>;
  refreshFinanceCategories: () => Promise<void>;
  refreshFinanceAccountTypes: () => Promise<void>;
  refreshProducts: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshProdRecords: () => Promise<void>;
  refreshPMP: () => Promise<void>;
  /** 从服务端重新拉取打印模板（多标签页保存后另一页可即时同步） */
  refreshPrintTemplates: () => Promise<void>;
  /** 按需加载重数据（orders/plans/prodRecords/psiRecords/financeRecords），首次调用触发加载，后续调用无操作 */
  ensureDeferredLoaded: () => Promise<void>;
}

export type AppDataState = Pick<AppDataContextValue,
  'dataLoading' | 'products' | 'orders' | 'plans' | 'psiRecords' | 'financeRecords' | 'prodRecords' |
  'categories' | 'partnerCategories' | 'dictionaries' | 'globalNodes' | 'boms' |
  'partners' | 'workers' | 'equipment' | 'warehouses' |
  'financeCategories' | 'financeAccountTypes' |
  'planFormSettings' | 'orderFormSettings' | 'purchaseOrderFormSettings' | 'salesOrderFormSettings' | 'purchaseBillFormSettings' | 'salesBillFormSettings' | 'receiptFormSettings' | 'paymentFormSettings' | 'materialPanelSettings' | 'materialFormSettings' | 'outsourceFormSettings' | 'reworkFormSettings' |
  'printTemplates' |
  'productionLinkMode' | 'processSequenceMode' | 'allowExceedMaxReportQty' | 'productMilestoneProgresses'
>;

export type AppDataActions = Omit<AppDataContextValue, keyof AppDataState>;

// ── Domain sub-context types ──

export interface MasterDataState {
  categories: ProductCategory[];
  partnerCategories: PartnerCategory[];
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  partners: Partner[];
  workers: Worker[];
  equipment: Equipment[];
  warehouses: Warehouse[];
  products: Product[];
  boms: BOM[];
}

export interface ConfigState {
  productionLinkMode: ProductionLinkMode;
  processSequenceMode: ProcessSequenceMode;
  allowExceedMaxReportQty: boolean;
  planFormSettings: PlanFormSettings;
  orderFormSettings: OrderFormSettings;
  purchaseOrderFormSettings: PurchaseOrderFormSettings;
  salesOrderFormSettings: SalesOrderFormSettings;
  purchaseBillFormSettings: PurchaseBillFormSettings;
  salesBillFormSettings: SalesBillFormSettings;
  receiptFormSettings: ReceiptFormSettings;
  paymentFormSettings: PaymentFormSettings;
  materialPanelSettings: MaterialPanelSettings;
  materialFormSettings: MaterialFormSettings;
  outsourceFormSettings: OutsourceFormSettings;
  reworkFormSettings: ReworkFormSettings;
  printTemplates: PrintTemplate[];
}

export interface OrdersState {
  orders: ProductionOrder[];
  plans: PlanOrder[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  prodRecords: ProductionOpRecord[];
}

export interface PsiState {
  psiRecords: PsiRecord[];
}

export interface FinanceState {
  financeRecords: FinanceRecord[];
  financeCategories: FinanceCategory[];
  financeAccountTypes: FinanceAccountType[];
}

// ── Domain sub-contexts ──

const LoadingCtx = createContext<boolean>(true);
const MasterDataCtx = createContext<MasterDataState | null>(null);
const ConfigCtx = createContext<ConfigState | null>(null);
const OrdersCtx = createContext<OrdersState | null>(null);
const PsiCtx = createContext<PsiState | null>(null);
const FinanceCtx = createContext<FinanceState | null>(null);
const ActionsCtx = createContext<AppDataActions | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, tenantCtx } = useAuth();

  // ── State ──
  const [dataLoading, setDataLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [plans, setPlans] = useState<PlanOrder[]>([]);
  const [psiRecords, setPsiRecords] = useState<PsiRecord[]>([]);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);
  const [prodRecords, setProdRecords] = useState<ProductionOpRecord[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [partnerCategories, setPartnerCategories] = useState<PartnerCategory[]>([]);
  const [dictionaries, setDictionaries] = useState<AppDictionaries>(EMPTY_DICTIONARIES);
  const [globalNodes, setGlobalNodes] = useState<GlobalNodeTemplate[]>([]);
  const [boms, setBoms] = useState<BOM[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [financeCategories, setFinanceCategories] = useState<FinanceCategory[]>([]);
  const [financeAccountTypes, setFinanceAccountTypes] = useState<FinanceAccountType[]>([]);
  const [planFormSettings, setPlanFormSettings] = useState<PlanFormSettings>(DEFAULT_PLAN_FORM_SETTINGS);
  const [orderFormSettings, setOrderFormSettings] = useState<OrderFormSettings>(DEFAULT_ORDER_FORM_SETTINGS);
  const [purchaseOrderFormSettings, setPurchaseOrderFormSettings] = useState<PurchaseOrderFormSettings>(DEFAULT_PURCHASE_ORDER_FORM_SETTINGS);
  const [salesOrderFormSettings, setSalesOrderFormSettings] = useState<SalesOrderFormSettings>(DEFAULT_SALES_ORDER_FORM_SETTINGS);
  const [purchaseBillFormSettings, setPurchaseBillFormSettings] = useState<PurchaseBillFormSettings>(DEFAULT_PURCHASE_BILL_FORM_SETTINGS);
  const [salesBillFormSettings, setSalesBillFormSettings] = useState<SalesBillFormSettings>(DEFAULT_SALES_BILL_FORM_SETTINGS);
  const [receiptFormSettings, setReceiptFormSettings] = useState<ReceiptFormSettings>(DEFAULT_RECEIPT_FORM_SETTINGS);
  const [paymentFormSettings, setPaymentFormSettings] = useState<PaymentFormSettings>(DEFAULT_PAYMENT_FORM_SETTINGS);
  const [materialPanelSettings, setMaterialPanelSettings] = useState<MaterialPanelSettings>(DEFAULT_MATERIAL_PANEL_SETTINGS);
  const [materialFormSettings, setMaterialFormSettings] = useState<MaterialFormSettings>(DEFAULT_MATERIAL_FORM_SETTINGS);
  const [outsourceFormSettings, setOutsourceFormSettings] = useState<OutsourceFormSettings>(DEFAULT_OUTSOURCE_FORM_SETTINGS);
  const [reworkFormSettings, setReworkFormSettings] = useState<ReworkFormSettings>(DEFAULT_REWORK_FORM_SETTINGS);
  const [printTemplates, setPrintTemplates] = useState<PrintTemplate[]>([]);
  /** 用于跨标签广播时忽略本标签发出的消息，避免重复请求 */
  const printTemplatesCrossTabIdRef = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pt-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  );
  const [productionLinkMode, setProductionLinkMode] = useState<ProductionLinkMode>('order');
  const [processSequenceMode, setProcessSequenceMode] = useState<ProcessSequenceMode>('free');
  const [allowExceedMaxReportQty, setAllowExceedMaxReportQty] = useState<boolean>(true);
  const [productMilestoneProgresses, setProductMilestoneProgresses] = useState<ProductMilestoneProgress[]>([]);

  const activeTenantId = tenantCtx?.tenantId;

  // ── Initial data loading (core data only — heavy data loaded on demand) ──
  // 依赖当前企业 ID：切换公司后必须清空并重新拉取，避免与进销存等数据错位（表现为「未知产品」等）
  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;

    setDataLoading(true);
    setProducts([]);
    setOrders([]);
    setPlans([]);
    setPsiRecords([]);
    setFinanceRecords([]);
    setProdRecords([]);
    setCategories([]);
    setPartnerCategories([]);
    setDictionaries(EMPTY_DICTIONARIES);
    setGlobalNodes([]);
    setBoms([]);
    setPartners([]);
    setWorkers([]);
    setEquipment([]);
    setWarehouses([]);
    setFinanceCategories([]);
    setFinanceAccountTypes([]);
    setPlanFormSettings(DEFAULT_PLAN_FORM_SETTINGS);
    setOrderFormSettings(DEFAULT_ORDER_FORM_SETTINGS);
    setPurchaseOrderFormSettings(DEFAULT_PURCHASE_ORDER_FORM_SETTINGS);
    setSalesOrderFormSettings(DEFAULT_SALES_ORDER_FORM_SETTINGS);
    setPurchaseBillFormSettings(DEFAULT_PURCHASE_BILL_FORM_SETTINGS);
    setSalesBillFormSettings(DEFAULT_SALES_BILL_FORM_SETTINGS);
    setReceiptFormSettings(DEFAULT_RECEIPT_FORM_SETTINGS);
    setPaymentFormSettings(DEFAULT_PAYMENT_FORM_SETTINGS);
    setMaterialPanelSettings(DEFAULT_MATERIAL_PANEL_SETTINGS);
    setMaterialFormSettings(DEFAULT_MATERIAL_FORM_SETTINGS);
    setOutsourceFormSettings(DEFAULT_OUTSOURCE_FORM_SETTINGS);
    setReworkFormSettings(DEFAULT_REWORK_FORM_SETTINGS);
    setPrintTemplates([]);
    setProductMilestoneProgresses([]);

    (async () => {
      try {
        await executeAppDataLoadCore(activeTenantId, () => cancelled, {
          setDataLoading,
          setProductionLinkMode,
          setProcessSequenceMode,
          setAllowExceedMaxReportQty,
          setPlanFormSettings,
          setOrderFormSettings,
          setPurchaseOrderFormSettings,
          setSalesOrderFormSettings,
          setPurchaseBillFormSettings,
          setSalesBillFormSettings,
          setReceiptFormSettings,
          setPaymentFormSettings,
          setMaterialPanelSettings,
          setMaterialFormSettings,
          setOutsourceFormSettings,
          setReworkFormSettings,
          setPrintTemplates,
          setCategories,
          setPartnerCategories,
          setGlobalNodes,
          setWarehouses,
          setFinanceCategories,
          setFinanceAccountTypes,
          setPartners,
          setDictionaries,
          setProducts,
          setBoms,
          setWorkers,
          setEquipment,
        });
      } catch (err) {
        console.error('数据加载失败', err);
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  // ── Incremental sync timestamps ──
  const lastFetchTs = useRef<Record<string, string>>({});
  const markFetched = (key: string) => { lastFetchTs.current[key] = new Date().toISOString(); };

  // ── Lazy load for heavy data (orders/plans/prodRecords/psiRecords/financeRecords) ──
  const deferredLoadState = useRef<'idle' | 'loading' | 'done'>('idle');

  useEffect(() => {
    deferredLoadState.current = 'idle';
    lastFetchTs.current = {};
  }, [activeTenantId]);

  const ensureDeferredLoaded = useCallback(async () => {
    if (deferredLoadState.current !== 'idle') return;
    deferredLoadState.current = 'loading';

    try {
      await executeAppDataDeferredLoad(lastFetchTs, {
        setPlans,
        setOrders,
        setProductMilestoneProgresses,
        setProdRecords,
        setPsiRecords,
        setFinanceRecords,
      });
    } catch (err) {
      console.error('延后数据加载失败', err);
    } finally {
      deferredLoadState.current = 'done';
    }
  }, []);

  // ── Refresh helpers (with incremental sync support) ──
  const refreshPlans = useCallback(async () => { setPlans(normalizeDecimals(await api.plans.list() as PlanOrder[])); markFetched('plans'); }, []);
  const refreshOrders = useCallback(async () => {
    const ts = lastFetchTs.current['orders'];
    const data = normalizeDecimals(await api.orders.list(ts ? { updatedAfter: ts } : undefined) as ProductionOrder[]);
    setOrders(prev => ts ? mergeById(prev, data) : data);
    markFetched('orders');
  }, []);
  const refreshProducts = useCallback(async () => { setProducts(normalizeDecimals(await api.products.list() as Product[])); markFetched('products'); }, []);
  const refreshBoms = useCallback(async () => setBoms(normalizeDecimals(await api.boms.list() as BOM[])), []);
  /** 生产记录列表接口始终返回全量；mergeById 无法剔除服务端已删行，会导致编辑协作回传等删旧建新后界面仍显示旧数量 */
  const refreshProdRecords = useCallback(async () => {
    const data = normalizeDecimals(await api.production.list() as ProductionOpRecord[]);
    setProdRecords(data);
    markFetched('prodRecords');
  }, []);
  /** 进销存列表接口当前始终返回全量；mergeById 无法剔除服务端已删行，替换单据（删旧建新）后若再 merge 会残留旧行，列表合计与编辑首行数量会不一致 */
  const refreshPsiRecords = useCallback(async () => {
    const data = normalizeDecimals(await api.psi.list() as any[]);
    setPsiRecords(data);
    markFetched('psiRecords');
  }, []);
  const refreshFinanceRecords = useCallback(async () => {
    const ts = lastFetchTs.current['financeRecords'];
    const data = normalizeDecimals(await api.finance.list(ts ? { updatedAfter: ts } : undefined) as FinanceRecord[]);
    setFinanceRecords(prev => ts ? mergeById(prev, data) : data);
    markFetched('financeRecords');
  }, []);
  const refreshPMP = useCallback(async () => setProductMilestoneProgresses(normalizeDecimals(await api.orders.listProductProgress() as ProductMilestoneProgress[])), []);
  const refreshCategories = useCallback(async () => setCategories(await api.settings.categories.list() as ProductCategory[]), []);
  const refreshPartnerCategories = useCallback(async () => setPartnerCategories(await api.settings.partnerCategories.list() as PartnerCategory[]), []);
  const refreshGlobalNodes = useCallback(async () => setGlobalNodes(await api.settings.nodes.list() as GlobalNodeTemplate[]), []);
  const refreshWarehouses = useCallback(async () => setWarehouses(await api.settings.warehouses.list() as Warehouse[]), []);
  const refreshFinanceCategories = useCallback(async () => setFinanceCategories(await api.settings.financeCategories.list() as FinanceCategory[]), []);
  const refreshFinanceAccountTypes = useCallback(async () => setFinanceAccountTypes(await api.settings.financeAccountTypes.list() as FinanceAccountType[]), []);
  const refreshPartners = useCallback(async () => setPartners(normalizePartnersFromApi(await api.partners.list() as any[]) as any[]), []);
  const refreshWorkers = useCallback(async () => setWorkers(await api.tenants.getReportableMembers(tenantCtx!.tenantId) as any[]), [tenantCtx?.tenantId]);
  const refreshEquipment = useCallback(async () => setEquipment(await api.equipment.list() as any[]), []);
  const refreshDictionaries = useCallback(async () => setDictionaries(await api.dictionaries.list() as AppDictionaries), []);
  const refreshPrintTemplates = useCallback(async () => {
    try {
      const cfg = (await api.settings.getConfig()) as Record<string, unknown>;
      setPrintTemplates(Array.isArray(cfg.printTemplates) ? (cfg.printTemplates as PrintTemplate[]) : []);
    } catch (err: any) {
      toast.error(err?.message || '打印模版刷新失败');
    }
  }, []);

  useEffect(() => {
    return subscribePrintTemplatesChanged(fromTabId => {
      if (fromTabId === printTemplatesCrossTabIdRef.current) return;
      void refreshPrintTemplates();
    });
  }, [refreshPrintTemplates]);

  // ── Config update handlers ──
  const onUpdateProductionLinkMode = useCallback(async (mode: ProductionLinkMode) => { await api.settings.updateConfig('productionLinkMode', mode); setProductionLinkMode(mode); }, []);
  const onUpdateProcessSequenceMode = useCallback(async (mode: ProcessSequenceMode) => { await api.settings.updateConfig('processSequenceMode', mode); setProcessSequenceMode(mode); }, []);
  const onUpdateAllowExceedMaxReportQty = useCallback(async (value: boolean) => { await api.settings.updateConfig('allowExceedMaxReportQty', value); setAllowExceedMaxReportQty(value); }, []);
  /**
   * 统一的 *FormSettings 保存 handler：
   * normalize → api.settings.updateConfig(key, next) → setter(next)。
   *
   * 9 套 FormSettings 保存路径完全一致；抽 factory 避免重复。
   * 不使用 useCallback：函数每渲染生成一次是可以接受的（调用方 Modal 不做 memo 级优化），
   * 且原 useCallback 的 deps=[] 已假定 setter 与 normalize 稳定（setter 来自 useState，稳定；
   * normalize 是模块级函数，稳定）；identity 不稳定的唯一成本是 Modal 重渲染一次——相比代码重复收益更高。
   *
   * 错误处理契约：
   * - api.settings.updateConfig 失败时（services/api.ts:182-185 在非 2xx 时 throw），
   *   不调用 setter，避免前端 state 与后端不一致；错误原样向上抛给调用方
   *   （BusinessFormConfigModal.handleSave 接住后弹 toast）。
   */
  const makeFormSettingsSaver = <T,>(
    key: string,
    normalize: (v: T) => T,
    setter: React.Dispatch<React.SetStateAction<T>>,
  ) => async (v: T) => {
    const next = normalize(v);
    await api.settings.updateConfig(key, next);
    setter(next);
  };
  const onUpdatePlanFormSettings = useCallback(
    makeFormSettingsSaver('planFormSettings', normalizePlanFormSettings, setPlanFormSettings),
    [],
  );
  const onUpdateOrderFormSettings = useCallback(
    makeFormSettingsSaver('orderFormSettings', normalizeOrderFormSettings, setOrderFormSettings),
    [],
  );
  const onUpdatePurchaseOrderFormSettings = useCallback(
    makeFormSettingsSaver('purchaseOrderFormSettings', normalizePurchaseOrderFormSettings, setPurchaseOrderFormSettings),
    [],
  );
  const onUpdateSalesOrderFormSettings = useCallback(
    makeFormSettingsSaver('salesOrderFormSettings', normalizeSalesOrderFormSettings, setSalesOrderFormSettings),
    [],
  );
  const onUpdatePurchaseBillFormSettings = useCallback(
    makeFormSettingsSaver('purchaseBillFormSettings', normalizePurchaseBillFormSettings, setPurchaseBillFormSettings),
    [],
  );
  const onUpdateSalesBillFormSettings = useCallback(
    makeFormSettingsSaver('salesBillFormSettings', normalizeSalesBillFormSettings, setSalesBillFormSettings),
    [],
  );
  const onUpdateReceiptFormSettings = useCallback(
    makeFormSettingsSaver('receiptFormSettings', normalizeReceiptFormSettings, setReceiptFormSettings),
    [],
  );
  const onUpdatePaymentFormSettings = useCallback(
    makeFormSettingsSaver('paymentFormSettings', normalizePaymentFormSettings, setPaymentFormSettings),
    [],
  );
  const onUpdateMaterialFormSettings = useCallback(
    makeFormSettingsSaver('materialFormSettings', normalizeMaterialFormSettings, setMaterialFormSettings),
    [],
  );
  const onUpdateOutsourceFormSettings = useCallback(
    makeFormSettingsSaver('outsourceFormSettings', normalizeOutsourceFormSettings, setOutsourceFormSettings),
    [],
  );
  const onUpdateReworkFormSettings = useCallback(
    makeFormSettingsSaver('reworkFormSettings', normalizeReworkFormSettings, setReworkFormSettings),
    [],
  );
  // MaterialPanelSettings 无 normalize；保留 inline 形式
  const onUpdateMaterialPanelSettings = useCallback(async (v: MaterialPanelSettings) => {
    await api.settings.updateConfig('materialPanelSettings', v);
    setMaterialPanelSettings(v);
  }, []);
  const onUpdatePrintTemplates = useCallback(async (v: PrintTemplate[]) => {
    await api.settings.updateConfig('printTemplates', v);
    setPrintTemplates(v);
    broadcastPrintTemplatesSaved(printTemplatesCrossTabIdRef.current);
  }, []);

  // ── Helpers: normalize a single record ──
  const norm1 = <T,>(item: T): T => normalizeDecimals([item])[0];

  // ── Product / BOM handlers ──
  const onUpdateProduct = useCallback(async (p: Product): Promise<Product | null> => {
    try {
      const exists = products.some(px => px.id === p.id);
      const saved = (exists ? await api.products.update(p.id, p) : await api.products.create(p)) as Product;
      const normalized = norm1(saved);
      setProducts(prev => exists ? prev.map(px => px.id === p.id ? normalized : px) : [...prev, normalized]);
      // 工序变更会触发后端回填工单 milestones / 状态；后台刷新，不阻塞调用方
      void Promise.allSettled([refreshOrders(), refreshPMP()]);
      return normalized;
    } catch (err: any) {
      toast.error(err.message || '操作失败');
      return null;
    }
  }, [products, refreshOrders, refreshPMP]);

  const onDeleteProduct = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.products.delete(id);
      setProducts(prev => prev.filter(px => px.id !== id));
      void Promise.allSettled([refreshBoms(), refreshOrders(), refreshPMP()]);
      toast.success('已删除产品');
      return true;
    } catch (err: any) {
      toast.error(err.message || '删除失败');
      return false;
    }
  }, [refreshBoms, refreshOrders, refreshPMP]);

  const onUpdateBOM = useCallback(async (b: BOM): Promise<boolean> => {
    try {
      const exists = boms.some(bx => bx.id === b.id);
      const saved = (exists ? await api.boms.update(b.id, b) : await api.boms.create(b)) as BOM;
      const normalized = norm1(saved);
      setBoms(prev => exists ? prev.map(bx => bx.id === b.id ? normalized : bx) : [...prev, normalized]);
      return true;
    } catch (err: any) {
      toast.error(err.message || '操作失败');
      return false;
    }
  }, [boms]);

  // ── Plan handlers ──
  const onCreatePlan = useCallback(async (p: PlanOrder) => {
    try {
      const created = await api.plans.create(p) as PlanOrder;
      setPlans(prev => [...prev, norm1(created)]);
    } catch (err: any) { toast.error(err.message || '创建计划失败'); }
  }, []);

  const onUpdatePlan = useCallback(async (id: string, updates: Partial<PlanOrder>) => {
    try {
      const updated = await api.plans.update(id, updates) as PlanOrder;
      setPlans(prev => prev.map(p => p.id === id ? norm1(updated) : p));
    } catch (err: any) { toast.error(err.message || '更新计划失败'); }
  }, []);

  const onSplitPlan = useCallback(async (planId: string, newPlans: PlanOrder[]) => {
    try {
      await api.plans.split(planId, { newPlans: newPlans.map(p => ({ items: p.items })) });
      await refreshPlans();
    } catch (err: any) { toast.error(err.message || '拆分失败'); }
  }, [refreshPlans]);

  const onDeletePlan = useCallback(async (id: string) => {
    try { await api.plans.delete(id); setPlans(prev => prev.filter(p => p.id !== id)); }
    catch (err: any) { toast.error(err.message || '删除计划失败'); }
  }, []);

  const onConvertToOrder = useCallback(async (id: string) => {
    try { await api.plans.convert(id); await Promise.allSettled([refreshPlans(), refreshOrders()]); }
    catch (err: any) { toast.error(err.message || '下达工单失败'); }
  }, [refreshPlans, refreshOrders]);

  const onCreateSubPlan = useCallback(async ({ productId, quantity, planId, bomNodeId }: { productId: string; quantity: number; planId: string; bomNodeId?: string }) => {
    try { await api.plans.createSubPlans(planId, [{ productId, bomNodeId, items: [{ quantity }] }]); await refreshPlans(); }
    catch (err: any) { toast.error(err.message || '创建子计划失败'); }
  }, [refreshPlans]);

  const onCreateSubPlans = useCallback(async ({ planId, items }: { planId: string; items: Array<{ productId: string; quantity: number; bomNodeId?: string; parentProductId?: string; parentNodeId?: string }> }) => {
    try {
      const subPlans = items.map(i => ({ productId: i.productId, bomNodeId: i.bomNodeId, items: [{ quantity: i.quantity }] }));
      await api.plans.createSubPlans(planId, subPlans);
      await refreshPlans();
    } catch (err: any) { toast.error(err.message || '创建子计划失败'); }
  }, [refreshPlans]);

  // ── Order / report handlers ──
  const onReportSubmit = useCallback(async (oId: string, mId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => {
    try {
      const operatorName = workerId ? (workers.find((w: any) => w.id === workerId)?.name ?? '未知') : currentOperatorDisplayName(currentUser);
      const order = orders.find(o => o.id === oId);
      const rate = products.find(p => p.id === order?.productId)?.nodeRates?.[order?.milestones.find(m => m.id === mId)?.templateId ?? ''];
      await api.orders.createReport(oId, mId, {
        quantity: qty, operator: operatorName, defectiveQuantity: defectiveQty || 0,
        variantId: vId, workerId, equipmentId, reportBatchId, reportNo,
        customData: data ?? {}, rate: rate != null ? rate : undefined,
        weight,
      });
      const updated = await api.orders.get(oId) as ProductionOrder;
      setOrders(prev => prev.map(o => o.id === oId ? norm1(updated) : o));
      void refreshProdRecords();
    } catch (err: any) { toast.error(err.message || '报工失败'); }
  }, [workers, currentUser, orders, products, refreshProdRecords]);

  const onReportSubmitProduct = useCallback(async (productId: string, milestoneTemplateId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => {
    try {
      const operatorName = workerId ? (workers.find((w: any) => w.id === workerId)?.name ?? '未知') : currentOperatorDisplayName(currentUser);
      const rate = products.find(p => p.id === productId)?.nodeRates?.[milestoneTemplateId];
      await api.orders.createProductReport({
        productId, milestoneTemplateId, quantity: qty, operator: operatorName,
        defectiveQuantity: defectiveQty || 0, variantId: vId, workerId, equipmentId,
        reportBatchId, reportNo, customData: data ?? {}, rate: rate != null ? rate : undefined,
        weight,
      });
      await refreshPMP();
      void refreshProdRecords();
    } catch (err: any) { toast.error(err.message || '报工失败'); }
  }, [workers, currentUser, products, refreshPMP, refreshProdRecords]);

  const onUpdateReport = useCallback(async ({ orderId, milestoneId, reportId, quantity, defectiveQuantity, timestamp, operator, newMilestoneId, customData }: { orderId: string; milestoneId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneId?: string; customData?: Record<string, unknown> }) => {
    try {
      const targetMilestoneId = newMilestoneId || milestoneId;
      const finalCustomData = customData ?? {};
      const payload = { quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator, customData: finalCustomData };
      if (targetMilestoneId !== milestoneId) {
        await api.orders.deleteReport(orderId, milestoneId, reportId);
        await api.orders.createReport(orderId, targetMilestoneId, payload);
      } else {
        await api.orders.updateReport(orderId, milestoneId, reportId, payload);
      }
      const updated = await api.orders.get(orderId) as ProductionOrder;
      setOrders(prev => prev.map(o => o.id === orderId ? norm1(updated) : o));
    } catch (err: any) { toast.error(err.message || '更新报工失败'); }
  }, []);

  const onDeleteReport = useCallback(async ({ orderId, milestoneId, reportId }: { orderId: string; milestoneId: string; reportId: string }) => {
    try {
      await api.orders.deleteReport(orderId, milestoneId, reportId);
      const updated = await api.orders.get(orderId) as ProductionOrder;
      setOrders(prev => prev.map(o => o.id === orderId ? norm1(updated) : o));
    } catch (err: any) { toast.error(err.message || '删除报工失败'); }
  }, []);

  const onUpdateReportProduct = useCallback(async ({ progressId, reportId, quantity, defectiveQuantity, timestamp, operator, newMilestoneTemplateId, customData }: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string; customData?: Record<string, unknown> }) => {
    try {
      const finalCustomData = customData ?? {};
      const payload = { quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator, customData: finalCustomData };
      if (newMilestoneTemplateId) {
        const srcProgress = productMilestoneProgresses.find(p => p.id === progressId);
        if (!srcProgress) { toast.error('找不到源进度记录'); return; }
        await api.orders.deleteProductReport(reportId);
        await api.orders.createProductReport({
          productId: srcProgress.productId, variantId: srcProgress.variantId,
          milestoneTemplateId: newMilestoneTemplateId,
          ...payload,
        });
      } else {
        await api.orders.updateProductReport(reportId, payload);
      }
      await refreshPMP();
    } catch (err: any) { toast.error(err.message || '更新报工失败'); }
  }, [productMilestoneProgresses, refreshPMP]);

  const onDeleteReportProduct = useCallback(async ({ progressId, reportId }: { progressId: string; reportId: string }) => {
    try { await api.orders.deleteProductReport(reportId); await refreshPMP(); }
    catch (err: any) { toast.error(err.message || '删除报工失败'); }
  }, [refreshPMP]);

  const onUpdateOrder = useCallback(async (orderId: string, updates: Partial<ProductionOrder>) => {
    try {
      const updated = await api.orders.update(orderId, updates) as ProductionOrder;
      setOrders(prev => prev.map(o => o.id === orderId ? norm1(updated) : o));
    } catch (err: any) { toast.error(err.message || '更新工单失败'); }
  }, []);

  const onDeleteOrder = useCallback(async (orderId: string) => {
    try { await api.orders.delete(orderId); setOrders(prev => prev.filter(o => o.id !== orderId)); }
    catch (err: any) { toast.error(err.message || '删除工单失败'); }
  }, []);

  // ── Production record handlers ──
  const onAddProdRecord = useCallback(async (record: ProductionOpRecord) => {
    try {
      const created = await api.production.create(record) as ProductionOpRecord;
      setProdRecords(prev => [...prev, norm1(created)]);
      void Promise.allSettled([refreshOrders(), refreshPMP()]);
    } catch (err: any) { toast.error(err.message || '添加记录失败'); }
  }, [refreshOrders, refreshPMP]);

  const onAddProdRecordBatch = useCallback(async (records: ProductionOpRecord[]) => {
    try {
      const created: ProductionOpRecord[] = [];
      for (const record of records) created.push(await api.production.create(record) as ProductionOpRecord);
      setProdRecords(prev => [...prev, ...normalizeDecimals(created)]);
      void Promise.allSettled([refreshOrders(), refreshPMP()]);
    } catch (err: any) { toast.error(err.message || '批量添加记录失败'); }
  }, [refreshOrders, refreshPMP]);

  const onUpdateProdRecord = useCallback(async (r: ProductionOpRecord) => {
    try {
      const updated = await api.production.update(r.id, r) as ProductionOpRecord;
      setProdRecords(prev => prev.map(x => x.id === r.id ? norm1(updated) : x));
    } catch (err: any) { toast.error(err.message || '更新记录失败'); }
  }, []);

  const onDeleteProdRecord = useCallback(async (id: string) => {
    try { await api.production.delete(id); setProdRecords(prev => prev.filter(x => x.id !== id)); }
    catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, []);

  // ── PSI record handlers ──
  const onAddPSIRecord = useCallback(async (record: any) => {
    try {
      const created = await api.psi.create(record);
      setPsiRecords(prev => [...prev, ...normalizeDecimals([created])]);
    } catch (err: any) {
      toast.error(err.message || '添加记录失败');
      throw err;
    }
  }, []);

  const onAddPSIRecordBatch = useCallback(async (records: any[]) => {
    try {
      await api.psi.createBatch(records);
      await refreshPsiRecords();
    } catch (err: any) {
      toast.error(err.message || '批量添加记录失败');
      throw err;
    }
  }, [refreshPsiRecords]);

  const onReplacePSIRecords = useCallback(async (type: string, docNumber: string, newRecords: any[]) => {
    try {
      const deleteIds = psiRecords.filter(r => r.type === type && r.docNumber === docNumber).map(r => r.id);
      await api.psi.replace(deleteIds, newRecords);
      await refreshPsiRecords();
    } catch (err: any) { toast.error(err.message || '替换记录失败'); }
  }, [psiRecords, refreshPsiRecords]);

  const onDeletePSIRecords = useCallback(async (type: string, docNumber: string) => {
    try {
      const ids = psiRecords.filter(r => r.type === type && r.docNumber === docNumber).map(r => r.id);
      if (ids.length) await api.psi.deleteBatch(ids);
      const idSet = new Set(ids);
      setPsiRecords(prev => prev.filter(r => !idSet.has(r.id)));
    } catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, [psiRecords]);

  // ── Finance record handlers ──
  const onAddFinanceRecord = useCallback(async (r: FinanceRecord) => {
    try {
      const created = await api.finance.create(r) as FinanceRecord;
      setFinanceRecords(prev => [...prev, norm1(created)]);
    } catch (err: any) { toast.error(err.message || '添加记录失败'); }
  }, []);

  const onUpdateFinanceRecord = useCallback(async (r: FinanceRecord) => {
    try {
      const updated = await api.finance.update(r.id, r) as FinanceRecord;
      setFinanceRecords(prev => prev.map(x => x.id === r.id ? norm1(updated) : x));
    } catch (err: any) { toast.error(err.message || '更新记录失败'); }
  }, []);

  const onDeleteFinanceRecord = useCallback(async (id: string) => {
    try { await api.finance.delete(id); setFinanceRecords(prev => prev.filter(x => x.id !== id)); }
    catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, []);

  // ── Domain-specific memoized values ──

  const masterDataValue: MasterDataState = useMemo(() => ({
    categories, partnerCategories, dictionaries, globalNodes,
    partners, workers, equipment, warehouses, products, boms,
  }), [categories, partnerCategories, dictionaries, globalNodes, partners, workers, equipment, warehouses, products, boms]);

  const configValue: ConfigState = useMemo(() => ({
    productionLinkMode, processSequenceMode, allowExceedMaxReportQty,
    planFormSettings, orderFormSettings, purchaseOrderFormSettings, salesOrderFormSettings, purchaseBillFormSettings, salesBillFormSettings,
    receiptFormSettings, paymentFormSettings,
    materialPanelSettings, materialFormSettings, outsourceFormSettings, reworkFormSettings, printTemplates,
  }), [productionLinkMode, processSequenceMode, allowExceedMaxReportQty, planFormSettings, orderFormSettings, purchaseOrderFormSettings, salesOrderFormSettings, purchaseBillFormSettings, salesBillFormSettings, receiptFormSettings, paymentFormSettings, materialPanelSettings, materialFormSettings, outsourceFormSettings, reworkFormSettings, printTemplates]);

  const ordersValue: OrdersState = useMemo(() => ({
    orders, plans, productMilestoneProgresses, prodRecords,
  }), [orders, plans, productMilestoneProgresses, prodRecords]);

  const psiValue: PsiState = useMemo(() => ({ psiRecords }), [psiRecords]);

  const financeValue: FinanceState = useMemo(() => ({
    financeRecords, financeCategories, financeAccountTypes,
  }), [financeRecords, financeCategories, financeAccountTypes]);

  const actionsValue: AppDataActions = useMemo(() => ({
    onUpdateProductionLinkMode, onUpdateProcessSequenceMode, onUpdateAllowExceedMaxReportQty,
    onUpdatePlanFormSettings, onUpdateOrderFormSettings,
    onUpdatePurchaseOrderFormSettings, onUpdateSalesOrderFormSettings,
    onUpdatePurchaseBillFormSettings, onUpdateSalesBillFormSettings,
    onUpdateReceiptFormSettings, onUpdatePaymentFormSettings,
    onUpdateMaterialPanelSettings, onUpdateMaterialFormSettings, onUpdateOutsourceFormSettings, onUpdateReworkFormSettings, onUpdatePrintTemplates,
    onUpdateProduct, onDeleteProduct, onUpdateBOM,
    onCreatePlan, onUpdatePlan, onSplitPlan, onDeletePlan, onConvertToOrder,
    onCreateSubPlan, onCreateSubPlans,
    onReportSubmit, onReportSubmitProduct,
    onUpdateReport, onDeleteReport, onUpdateReportProduct, onDeleteReportProduct,
    onUpdateOrder, onDeleteOrder,
    onAddProdRecord, onAddProdRecordBatch, onUpdateProdRecord, onDeleteProdRecord,
    onAddPSIRecord, onAddPSIRecordBatch, onReplacePSIRecords, onDeletePSIRecords,
    onAddFinanceRecord, onUpdateFinanceRecord, onDeleteFinanceRecord,
    refreshDictionaries, refreshWorkers, refreshEquipment, refreshPartners,
    refreshPartnerCategories, refreshCategories, refreshGlobalNodes, refreshWarehouses,
    refreshFinanceCategories, refreshFinanceAccountTypes,
    refreshProducts, refreshOrders, refreshProdRecords, refreshPMP,
    refreshPrintTemplates,
    ensureDeferredLoaded,
  }), [
    onUpdateProductionLinkMode, onUpdateProcessSequenceMode, onUpdateAllowExceedMaxReportQty,
    onUpdatePlanFormSettings, onUpdateOrderFormSettings,
    onUpdatePurchaseOrderFormSettings, onUpdateSalesOrderFormSettings,
    onUpdatePurchaseBillFormSettings, onUpdateSalesBillFormSettings,
    onUpdateReceiptFormSettings, onUpdatePaymentFormSettings,
    onUpdateMaterialPanelSettings, onUpdateMaterialFormSettings, onUpdateOutsourceFormSettings, onUpdateReworkFormSettings, onUpdatePrintTemplates,
    onUpdateProduct, onDeleteProduct, onUpdateBOM,
    onCreatePlan, onUpdatePlan, onSplitPlan, onDeletePlan, onConvertToOrder,
    onCreateSubPlan, onCreateSubPlans,
    onReportSubmit, onReportSubmitProduct,
    onUpdateReport, onDeleteReport, onUpdateReportProduct, onDeleteReportProduct,
    onUpdateOrder, onDeleteOrder,
    onAddProdRecord, onAddProdRecordBatch, onUpdateProdRecord, onDeleteProdRecord,
    onAddPSIRecord, onAddPSIRecordBatch, onReplacePSIRecords, onDeletePSIRecords,
    onAddFinanceRecord, onUpdateFinanceRecord, onDeleteFinanceRecord,
    refreshDictionaries, refreshWorkers, refreshEquipment, refreshPartners,
    refreshPartnerCategories, refreshCategories, refreshGlobalNodes, refreshWarehouses,
    refreshFinanceCategories, refreshFinanceAccountTypes,
    refreshProducts, refreshOrders, refreshProdRecords, refreshPMP,
    refreshPrintTemplates,
    ensureDeferredLoaded,
  ]);

  return (
    <LoadingCtx.Provider value={dataLoading}>
    <MasterDataCtx.Provider value={masterDataValue}>
    <ConfigCtx.Provider value={configValue}>
    <OrdersCtx.Provider value={ordersValue}>
    <PsiCtx.Provider value={psiValue}>
    <FinanceCtx.Provider value={financeValue}>
    <ActionsCtx.Provider value={actionsValue}>
      {children}
    </ActionsCtx.Provider>
    </FinanceCtx.Provider>
    </PsiCtx.Provider>
    </OrdersCtx.Provider>
    </ConfigCtx.Provider>
    </MasterDataCtx.Provider>
    </LoadingCtx.Provider>
  );
}


export {
  DEFAULT_PLAN_FORM_SETTINGS,
  DEFAULT_ORDER_FORM_SETTINGS,
  DEFAULT_PURCHASE_ORDER_FORM_SETTINGS,
  DEFAULT_SALES_ORDER_FORM_SETTINGS,
  DEFAULT_PURCHASE_BILL_FORM_SETTINGS,
  DEFAULT_SALES_BILL_FORM_SETTINGS,
  DEFAULT_RECEIPT_FORM_SETTINGS,
  DEFAULT_PAYMENT_FORM_SETTINGS,
  normalizePlanFormSettings,
  normalizeOrderFormSettings,
  normalizePurchaseOrderFormSettings,
  normalizeSalesOrderFormSettings,
  normalizePurchaseBillFormSettings,
  normalizeSalesBillFormSettings,
  normalizeReceiptFormSettings,
  normalizePaymentFormSettings,
  normalizeMaterialFormSettings,
  normalizeOutsourceFormSettings,
  normalizeReworkFormSettings,
} from './formSettingsDefaults';

// ── Domain-specific hooks (fine-grained subscriptions) ──

export function useDataLoading(): boolean {
  return useContext(LoadingCtx);
}

export function useMasterData(): MasterDataState {
  const ctx = useContext(MasterDataCtx);
  if (!ctx) throw new Error('useMasterData must be used within AppDataProvider');
  return ctx;
}

export function useConfigData(): ConfigState {
  const ctx = useContext(ConfigCtx);
  if (!ctx) throw new Error('useConfigData must be used within AppDataProvider');
  return ctx;
}

export function useOrdersData(): OrdersState {
  const ctx = useContext(OrdersCtx);
  if (!ctx) throw new Error('useOrdersData must be used within AppDataProvider');
  return ctx;
}

export function usePsiData(): PsiState {
  const ctx = useContext(PsiCtx);
  if (!ctx) throw new Error('usePsiData must be used within AppDataProvider');
  return ctx;
}

export function useFinanceData(): FinanceState {
  const ctx = useContext(FinanceCtx);
  if (!ctx) throw new Error('useFinanceData must be used within AppDataProvider');
  return ctx;
}

export function useAppActions(): AppDataActions {
  const ctx = useContext(ActionsCtx);
  if (!ctx) throw new Error('useAppActions must be used within AppDataProvider');
  return ctx;
}

/** 无 Provider 时返回 null，避免在独立渲染/测试环境下崩溃。 */
export function useAppActionsOptional(): AppDataActions | null {
  return useContext(ActionsCtx);
}

// ── Backward-compatible aggregate hooks ──

export function useAppData(): AppDataContextValue {
  const loading = useDataLoading();
  const master = useMasterData();
  const config = useConfigData();
  const orders = useOrdersData();
  const psi = usePsiData();
  const finance = useFinanceData();
  const actions = useAppActions();
  return useMemo(() => ({
    dataLoading: loading,
    ...master, ...config, ...orders, ...psi, ...finance, ...actions,
  }), [loading, master, config, orders, psi, finance, actions]);
}

export function useAppDataState(): AppDataState {
  const loading = useDataLoading();
  const master = useMasterData();
  const config = useConfigData();
  const orders = useOrdersData();
  const psi = usePsiData();
  const finance = useFinanceData();
  return useMemo(() => ({
    dataLoading: loading,
    ...master, ...config, ...orders, ...psi, ...finance,
  }), [loading, master, config, orders, psi, finance]);
}
