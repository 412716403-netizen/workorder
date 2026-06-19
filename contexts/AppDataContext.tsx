import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
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
  Partner,
  Worker,
  Equipment,
  OrderDispatchStatus,
  DispatchCompletionPending,
} from '../types';
import { useConfirm } from './ConfirmContext';
import {
  buildOrderDispatchCompletionConfirmMessage,
  ORDER_DISPATCH_STATUS_CONFIRM_TITLE,
} from '../utils/orderDispatchStatusConfirm';
import {
  DEFAULT_MATERIAL_PANEL_SETTINGS,
  DEFAULT_MATERIAL_FORM_SETTINGS,
  DEFAULT_OUTSOURCE_FORM_SETTINGS,
  DEFAULT_REWORK_FORM_SETTINGS,
} from '../types';
import { normalizePartnersFromApi } from '../utils/partnerNormalize';
import {
  normalizeFinanceCategoriesFromApi,
  normalizeGlobalNodesFromApi,
  normalizePartnerCategoriesFromApi,
  normalizeProductCategoriesFromApi,
} from '../utils/reportCustomDocField';
import { currentOperatorDisplayName } from '../utils/currentOperatorDisplayName';
import { broadcastPrintTemplatesSaved, subscribePrintTemplatesChanged } from '../utils/printTemplatesCrossTab';
import { mergePrintTemplatesForTenantConfig } from '../shared/systemPrintTemplates';

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
  normalizeMaterialPanelSettings,
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
  allowExceedMaxOutsourceReceiveQty: boolean;
  weightTolerancePercent: number;
  productMilestoneProgresses: ProductMilestoneProgress[];
  // Config handlers
  onUpdateAllowExceedMaxReportQty: (v: boolean) => Promise<void>;
  onUpdateAllowExceedMaxOutsourceReceiveQty: (v: boolean) => Promise<void>;
  onUpdateWeightTolerancePercent: (v: number) => Promise<void>;
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
  onDeletePlan: (id: string) => Promise<void>;
  onConvertToOrder: (id: string) => Promise<void>;
  onCreateSubPlan: (data: { productId: string; quantity: number; planId: string; bomNodeId?: string }) => Promise<void>;
  onCreateSubPlans: (data: { planId: string; items: Array<{ productId: string; quantity: number; bomNodeId?: string; parentProductId?: string; parentNodeId?: string }> }) => Promise<void>;
  // Orders / reports
  onReportSubmit: (oId: string, mId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => Promise<void>;
  onReportSubmitProduct: (productId: string, milestoneTemplateId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => Promise<void>;
  onUpdateReport: (data: { orderId: string; milestoneId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneId?: string; customData?: Record<string, unknown>; weight?: number | null }) => Promise<void>;
  onDeleteReport: (data: { orderId: string; milestoneId: string; reportId: string }) => Promise<void>;
  onUpdateReportProduct: (data: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string; customData?: Record<string, unknown>; weight?: number | null }) => Promise<void>;
  onDeleteReportProduct: (data: { progressId: string; reportId: string }) => Promise<void>;
  onUpdateOrder: (orderId: string, updates: Partial<ProductionOrder>) => Promise<void>;
  /** 关联工单模式：手动切换工单派发完成状态（持久化 `dispatchStatusManual=true`，自动逻辑不再覆盖） */
  onUpdateOrderDispatchStatus: (orderId: string, status: OrderDispatchStatus) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
  // Production records
  onAddProdRecord: (record: ProductionOpRecord) => Promise<ProductionOpRecord | null>;
  onAddProdRecordBatch: (records: ProductionOpRecord[]) => Promise<ProductionOpRecord[]>;
  onUpdateProdRecord: (r: ProductionOpRecord) => Promise<void>;
  onDeleteProdRecord: (id: string) => Promise<void>;
  /** 批量删除生产记录：全部 API 完成后再 invalidate 一次，避免并行单删触发多次 refetch 竞态 */
  onDeleteProdRecordBatch: (ids: string[]) => Promise<void>;
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
  refreshPMP: () => Promise<void>;
  /** 从服务端重新拉取打印模板（多标签页保存后另一页可即时同步） */
  refreshPrintTemplates: () => Promise<void>;
  /** 按需加载重数据（orders/plans 等）；财务/PSI/生产流水由各业务页调用 refresh* 拉取，不再在首包全量加载 */
  ensureDeferredLoaded: () => Promise<void>;
}

export type AppDataState = Pick<AppDataContextValue,
  'dataLoading' | 'products' | 'orders' | 'plans' |
  'categories' | 'partnerCategories' | 'dictionaries' | 'globalNodes' | 'boms' |
  'partners' | 'workers' | 'equipment' | 'warehouses' |
  'financeCategories' | 'financeAccountTypes' |
  'planFormSettings' | 'orderFormSettings' | 'purchaseOrderFormSettings' | 'salesOrderFormSettings' | 'purchaseBillFormSettings' | 'salesBillFormSettings' | 'receiptFormSettings' | 'paymentFormSettings' | 'materialPanelSettings' | 'materialFormSettings' | 'outsourceFormSettings' | 'reworkFormSettings' |
  'printTemplates' |
  'productionLinkMode' | 'processSequenceMode' | 'allowExceedMaxReportQty' | 'allowExceedMaxOutsourceReceiveQty' | 'weightTolerancePercent' | 'productMilestoneProgresses'
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
  allowExceedMaxOutsourceReceiveQty: boolean;
  weightTolerancePercent: number;
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
}

/**
 * Phase 3.D follow-up：`psiRecords` 已从全局 context 中删除。
 * 各模块按需 `react-query` 窄拉，详见 `docs/10-capacity-and-scaling.md`。
 * 该接口保留为占位，避免历史调用方 `usePsiData()` 直接编译失败；后续清理后可删除整个 hook。
 */
export interface PsiState {
  /** @deprecated context 已不再维护 psi 全量；调用方应改用 `useQuery + api.psi.*` 按 filter 窄拉 */
  _empty?: never;
}

export interface FinanceState {
  /** 保留 financeCategories / financeAccountTypes 是因为它们是字典数据，量级远小于流水记录 */
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
  const confirm = useConfirm();
  const qc = useQueryClient();
  /**
   * Phase 3.D follow-up + Phase 3.E：context 不再持有 prodRecords / psiRecords / financeRecords 全量数组；
   * 全局写入动作完成后通过 invalidate 触发 react-query 自动重拉，替代旧的 setProdRecords/setPsiRecords 等。
   *
   * 涉及的 prod 相关 queryKey 前缀（用 predicate 批量匹配，新增 queryKey 不易漏）：
   * - orderCenterProdNarrow / prodMgmtOpsView.records
   * - collabInbox.prodRecords
   * - warehousePanel.prodStockRecords（WarehousePanel；旧版误写为 psiOps.warehouseStockProd 已修复）
   * - stockPanel.* / outsourcePanel.* / reworkPanel.*（Phase 3.E 各 panel 自取的 query 前缀）
   * - flow.stock / flow.stockIn / flow.outsource / flow.reworkReport / flow.defect / flow.warehouse.prod / flow.reportHistory（Phase 3.E 流水弹窗）
   * - finance-detail prod 子分支
   */
  /**
   * Phase 3.E follow-up：从「硬编码 matchSet 枚举」改成「prefix 匹配」。
   *
   * 旧版：每新增一个消费生产流水的 react-query 都得回来注册 queryKey 前缀，
   * 否则写入后该 query 不会被 invalidate（如 `recon-prod` 系列就漏注册过）。
   *
   * 新策略：匹配以下 prefix 之一的 queryKey[0]：
   * - `orderCenterProdNarrow` / `prodMgmtOpsView.` / `collabInbox.prod`
   * - `warehousePanel.prod` / `stockPanel.` / `outsourcePanel.` / `reworkPanel.`
   * - `flow.stock` / `flow.stockIn` / `flow.outsource` / `flow.reworkReport`
   *   / `flow.defect` / `flow.warehouse.prod` / `flow.reportHistory`
   * - `materialIssueStockProd` / `materialIssueTodayStockOut`
   * - `pendingStockPanel.stockIn`
   * - `recon` 下生产相关分支：queryKey 为 `['recon','prod', ...]`
   * 以及 finance-detail 的 prod 子分支。
   *
   * 这样后续新增 panel 只要 queryKey 落到上述 prefix 之内即可自动被失效，
   * 不再依赖手动注册。
   */
  const invalidateAllProdRecords = useCallback(() => {
    const PROD_KEY_PREFIXES = [
      'orderCenterProdNarrow',
      'prodMgmtOpsView.',
      'collabInbox.prod',
      'warehousePanel.prod',
      'stockPanel.',
      'outsourcePanel.',
      'reworkPanel.',
      'flow.stock',
      'flow.outsource',
      'flow.reworkReport',
      'flow.defect',
      'flow.warehouse.prod',
      'flow.reportHistory',
      'materialIssueStockProd',
      'materialIssueTodayStockOut',
      'orderDetailMaterialStats',
      'pendingStockPanel.stockIn',
    ];
    qc.invalidateQueries({
      predicate: (q) => {
        const k = Array.isArray(q.queryKey) ? q.queryKey[0] : undefined;
        if (typeof k !== 'string') return false;
        // recon-prod：['recon','prod',...] 是 useFinanceReconciliation 的生产对账分支
        if (k === 'recon' && Array.isArray(q.queryKey) && q.queryKey[1] === 'prod') return true;
        return PROD_KEY_PREFIXES.some((p) => k === p || k.startsWith(`${p}`));
      },
    });
    qc.invalidateQueries({ queryKey: ['finance-detail', 'prod'] });
  }, [qc]);
  const invalidateAllPsiRecords = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['psiOpsRecords'] });
    qc.invalidateQueries({ queryKey: ['planRelatedPsi'] });
    qc.invalidateQueries({ queryKey: ['finance-detail', 'psi'] });
    qc.invalidateQueries({
      predicate: (q) => {
        const k = Array.isArray(q.queryKey) ? q.queryKey[0] : undefined;
        if (typeof k !== 'string') return false;
        // WarehouseFlowModal 内部四并发 PSI 类型 query 前缀
        if (k.startsWith('flow.warehouse.psi.')) return true;
        // recon 下 PSI 对账分支：['recon','psi',...]
        if (k === 'recon' && Array.isArray(q.queryKey) && q.queryKey[1] === 'psi') return true;
        return false;
      },
    });
  }, [qc]);
  const invalidateAllFinanceRecords = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['finance', 'list'] });
    qc.invalidateQueries({ queryKey: ['finance', 'today-count'] });
    qc.invalidateQueries({ queryKey: ['useFinanceReconciliation'] });
    // recon 下 finance 对账分支：['recon','finance',...]
    qc.invalidateQueries({
      predicate: (q) => {
        const k = Array.isArray(q.queryKey) ? q.queryKey[0] : undefined;
        return k === 'recon' && Array.isArray(q.queryKey) && q.queryKey[1] === 'finance';
      },
    });
  }, [qc]);

  // ── State ──
  const [dataLoading, setDataLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [plans, setPlans] = useState<PlanOrder[]>([]);
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
  // 工序顺序设置已下线：全局恒「按工序顺序生产」，工序级 allowOutOfSequence 控制例外。
  const [processSequenceMode] = useState<ProcessSequenceMode>('sequential');
  const [allowExceedMaxReportQty, setAllowExceedMaxReportQty] = useState<boolean>(false);
  const [allowExceedMaxOutsourceReceiveQty, setAllowExceedMaxOutsourceReceiveQty] = useState<boolean>(false);
  const [weightTolerancePercent, setWeightTolerancePercent] = useState<number>(5);
  const [productMilestoneProgresses, setProductMilestoneProgresses] = useState<ProductMilestoneProgress[]>([]);

  const activeTenantId = tenantCtx?.tenantId;

  // ── Initial data loading (core data only — heavy data loaded on demand) ──
  // App.tsx 通过 `key={`${userId}_${tenantCtx.tenantId}`}` 重建整个 Provider 子树，
  // 切换租户时所有 useState 自动回到初始值，故无需在此手动 setX([]) reset。
  useEffect(() => {
    if (!activeTenantId) {
      setDataLoading(false);
      return;
    }
    let cancelled = false;

    setDataLoading(true);

    (async () => {
      try {
        await executeAppDataLoadCore(activeTenantId, () => cancelled, {
          setDataLoading,
          setProductionLinkMode,
          setAllowExceedMaxReportQty,
          setAllowExceedMaxOutsourceReceiveQty,
          setWeightTolerancePercent,
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
      } finally {
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
      });
    } catch (err) {
      console.error('延后数据加载失败', err);
    } finally {
      deferredLoadState.current = 'done';
    }
  }, []);

  // ── Refresh helpers (with incremental sync support) ──
  const refreshPlans = useCallback(async () => { setPlans(normalizeDecimals(await api.plans.list())); markFetched('plans'); }, []);
  const refreshOrders = useCallback(async () => {
    const ts = lastFetchTs.current['orders'];
    const data = normalizeDecimals(await api.orders.list(ts ? { updatedAfter: ts } : undefined));
    setOrders(prev => ts ? mergeById(prev, data) : data);
    markFetched('orders');
  }, []);
  const refreshProducts = useCallback(async () => {
    const [prods, bomList] = await Promise.all([
      api.products.list() as Promise<Product[]>,
      api.boms.list() as Promise<BOM[]>,
    ]);
    setProducts(normalizeDecimals(prods));
    setBoms(normalizeDecimals(bomList));
    markFetched('products');
  }, []);
  const refreshBoms = useCallback(async () => setBoms(normalizeDecimals(await api.boms.list() as BOM[])), []);
  /**
   * Phase 3.D follow-up：`refreshProdRecords / refreshPsiRecords / refreshFinanceRecords`
   * 三个全量 refresh 已删除。新代码请：
   * - 工单中心 / 物料 / 外协 / 返工 → `useQuery + api.production.listPage` 按 orderIds/productIds/types 窄拉
   * - PSI 业务页 → `usePsiOpsRecordsList` / `api.psi.listPaginated`
   * - 财务列表 / 对账 → FinanceOpsView 内部 react-query；销售单打印走 `api.finance.partnerReceivable`
   */
  const refreshPMP = useCallback(async () => setProductMilestoneProgresses(normalizeDecimals(await api.orders.listProductProgress())), []);
  const refreshCategories = useCallback(
    async () => setCategories(normalizeProductCategoriesFromApi(await api.settings.categories.list() as ProductCategory[])),
    [],
  );
  const refreshPartnerCategories = useCallback(
    async () =>
      setPartnerCategories(normalizePartnerCategoriesFromApi(await api.settings.partnerCategories.list() as PartnerCategory[])),
    [],
  );
  const refreshGlobalNodes = useCallback(
    async () => setGlobalNodes(normalizeGlobalNodesFromApi(await api.settings.nodes.list() as GlobalNodeTemplate[])),
    [],
  );
  const refreshWarehouses = useCallback(async () => setWarehouses(await api.settings.warehouses.list() as Warehouse[]), []);
  const refreshFinanceCategories = useCallback(
    async () =>
      setFinanceCategories(normalizeFinanceCategoriesFromApi(await api.settings.financeCategories.list() as FinanceCategory[])),
    [],
  );
  const refreshFinanceAccountTypes = useCallback(async () => setFinanceAccountTypes(await api.settings.financeAccountTypes.list() as FinanceAccountType[]), []);
  const refreshPartners = useCallback(async () => setPartners(normalizePartnersFromApi(await api.partners.list() as any[]) as any[]), []);
  const refreshWorkers = useCallback(async () => setWorkers(await api.tenants.getReportableMembers(tenantCtx!.tenantId) as any[]), [tenantCtx?.tenantId]);
  const refreshEquipment = useCallback(async () => setEquipment(await api.equipment.list() as any[]), []);
  const refreshDictionaries = useCallback(async () => setDictionaries(await api.dictionaries.list() as AppDictionaries), []);
  const refreshPrintTemplates = useCallback(async () => {
    try {
      const cfg = (await api.settings.getConfig()) as Record<string, unknown>;
      setPrintTemplates(
        mergePrintTemplatesForTenantConfig(Array.isArray(cfg.printTemplates) ? cfg.printTemplates : []) as PrintTemplate[],
      );
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
  const onUpdateAllowExceedMaxReportQty = useCallback(async (value: boolean) => { await api.settings.updateConfig('allowExceedMaxReportQty', value); setAllowExceedMaxReportQty(value); }, []);
  const onUpdateAllowExceedMaxOutsourceReceiveQty = useCallback(async (value: boolean) => { await api.settings.updateConfig('allowExceedMaxOutsourceReceiveQty', value); setAllowExceedMaxOutsourceReceiveQty(value); }, []);
  const onUpdateWeightTolerancePercent = useCallback(async (value: number) => {
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    await api.settings.updateConfig('weightTolerancePercent', n);
    setWeightTolerancePercent(n);
  }, []);
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
  // MaterialPanelSettings 归一化后写入
  const onUpdateMaterialPanelSettings = useCallback(async (v: MaterialPanelSettings) => {
    const next = normalizeMaterialPanelSettings(v);
    await api.settings.updateConfig('materialPanelSettings', next);
    setMaterialPanelSettings(next);
  }, []);
  const onUpdatePrintTemplates = useCallback(async (v: PrintTemplate[]) => {
    await api.settings.updateConfig('printTemplates', v);
    try {
      const cfg = (await api.settings.getConfig()) as Record<string, unknown>;
      setPrintTemplates(
        mergePrintTemplatesForTenantConfig(Array.isArray(cfg.printTemplates) ? cfg.printTemplates : []) as PrintTemplate[],
      );
    } catch {
      setPrintTemplates(mergePrintTemplatesForTenantConfig(v) as PrintTemplate[]);
    }
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
      const created = await api.plans.create(p);
      setPlans(prev => [...prev, norm1(created)]);
    } catch (err: any) { toast.error(err.message || '创建计划失败'); }
  }, []);

  const onUpdatePlan = useCallback(async (id: string, updates: Partial<PlanOrder>) => {
    try {
      const updated = await api.plans.update(id, updates);
      setPlans(prev => prev.map(p => p.id === id ? norm1(updated) : p));
    } catch (err: any) { toast.error(err.message || '更新计划失败'); }
  }, []);

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
  // Phase 3.D follow-up：报工成功后不再 `refreshProdRecords()` 全表刷新；
  //   `OrderListView` / `ProductionMgmtOpsView` 在挂载时按当前 tab 的 type 集合 react-query 窄拉，
  //   `react-query` 的 mutate / refetchOnFocus 由各组件自行接管。
  const onReportSubmit = useCallback(async (oId: string, mId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => {
    try {
      const operatorName = workerId ? (workers.find((w: any) => w.id === workerId)?.name ?? '未知') : currentOperatorDisplayName(currentUser);
      const order = orders.find(o => o.id === oId);
      const rate = products.find(p => p.id === order?.productId)?.nodeRates?.[order?.milestones.find(m => m.id === mId)?.templateId ?? ''];
      const raw = data ?? {};
      const { virtualBatchId, itemCodeId, ...customData } = raw as Record<string, unknown>;
      await api.orders.createReport(oId, mId, {
        quantity: qty, operator: operatorName, defectiveQuantity: defectiveQty || 0,
        variantId: vId, workerId, equipmentId, reportBatchId, reportNo,
        customData, rate: rate != null ? rate : undefined,
        weight,
        virtualBatchId: typeof virtualBatchId === 'string' ? virtualBatchId : undefined,
        itemCodeId: typeof itemCodeId === 'string' ? itemCodeId : undefined,
      });
      const updated = await api.orders.get(oId);
      setOrders(prev => prev.map(o => o.id === oId ? norm1(updated) : o));
      invalidateAllProdRecords();
    } catch (err: any) { toast.error(err.message || '报工失败'); }
  }, [workers, currentUser, orders, products, invalidateAllProdRecords]);

  const onReportSubmitProduct = useCallback(async (productId: string, milestoneTemplateId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => {
    try {
      const operatorName = workerId ? (workers.find((w: any) => w.id === workerId)?.name ?? '未知') : currentOperatorDisplayName(currentUser);
      const rate = products.find(p => p.id === productId)?.nodeRates?.[milestoneTemplateId];
      const raw = data ?? {};
      const { virtualBatchId, itemCodeId, ...customData } = raw as Record<string, unknown>;
      await api.orders.createProductReport({
        productId, milestoneTemplateId, quantity: qty, operator: operatorName,
        defectiveQuantity: defectiveQty || 0, variantId: vId, workerId, equipmentId,
        reportBatchId, reportNo, customData, rate: rate != null ? rate : undefined,
        weight,
        virtualBatchId: typeof virtualBatchId === 'string' ? virtualBatchId : undefined,
        itemCodeId: typeof itemCodeId === 'string' ? itemCodeId : undefined,
      });
      await refreshPMP();
      invalidateAllProdRecords();
    } catch (err: any) { toast.error(err.message || '报工失败'); }
  }, [workers, currentUser, products, refreshPMP, invalidateAllProdRecords]);

  const onUpdateReport = useCallback(async ({ orderId, milestoneId, reportId, quantity, defectiveQuantity, timestamp, operator, newMilestoneId, customData, weight }: { orderId: string; milestoneId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneId?: string; customData?: Record<string, unknown>; weight?: number | null }) => {
    try {
      const targetMilestoneId = newMilestoneId || milestoneId;
      const finalCustomData = customData ?? {};
      const payload: Record<string, unknown> = { quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator, customData: finalCustomData };
      if (weight !== undefined) payload.weight = weight;
      if (targetMilestoneId !== milestoneId) {
        await api.orders.deleteReport(orderId, milestoneId, reportId);
        await api.orders.createReport(orderId, targetMilestoneId, payload);
      } else {
        await api.orders.updateReport(orderId, milestoneId, reportId, payload);
      }
      const updated = await api.orders.get(orderId);
      setOrders(prev => prev.map(o => o.id === orderId ? norm1(updated) : o));
      invalidateAllProdRecords();
    } catch (err: any) { toast.error(err.message || '更新报工失败'); }
  }, [invalidateAllProdRecords]);

  const onDeleteReport = useCallback(async ({ orderId, milestoneId, reportId }: { orderId: string; milestoneId: string; reportId: string }) => {
    try {
      await api.orders.deleteReport(orderId, milestoneId, reportId);
      const updated = await api.orders.get(orderId);
      setOrders(prev => prev.map(o => o.id === orderId ? norm1(updated) : o));
      invalidateAllProdRecords();
    } catch (err: any) { toast.error(err.message || '删除报工失败'); }
  }, [invalidateAllProdRecords]);

  const onUpdateReportProduct = useCallback(async ({ progressId, reportId, quantity, defectiveQuantity, timestamp, operator, newMilestoneTemplateId, customData, weight }: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string; customData?: Record<string, unknown>; weight?: number | null }) => {
    try {
      const finalCustomData = customData ?? {};
      const payload: Record<string, unknown> = { quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator, customData: finalCustomData };
      if (weight !== undefined) payload.weight = weight;
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
      invalidateAllProdRecords();
    } catch (err: any) { toast.error(err.message || '更新报工失败'); }
  }, [productMilestoneProgresses, refreshPMP, invalidateAllProdRecords]);

  const onDeleteReportProduct = useCallback(async ({ progressId, reportId }: { progressId: string; reportId: string }) => {
    try {
      await api.orders.deleteProductReport(reportId);
      await refreshPMP();
      invalidateAllProdRecords();
    } catch (err: any) { toast.error(err.message || '删除报工失败'); }
  }, [refreshPMP, invalidateAllProdRecords]);

  const onUpdateOrder = useCallback(async (orderId: string, updates: Partial<ProductionOrder>) => {
    try {
      const updated = await api.orders.update(orderId, updates);
      setOrders(prev => prev.map(o => o.id === orderId ? norm1(updated) : o));
    } catch (err: any) { toast.error(err.message || '更新工单失败'); }
  }, []);

  /**
   * 关联工单模式：手动切换工单派发完成状态徽章。
   * 后端会一并把 `dispatchStatusManual` 置为 true，自动入库逻辑不再覆盖该工单。
   */
  const onUpdateOrderDispatchStatus = useCallback(
    async (orderId: string, status: OrderDispatchStatus) => {
      try {
        const updated = await api.orders.updateDispatchStatus(orderId, status);
        setOrders(prev => prev.map(o => o.id === orderId ? norm1(updated) : o));
        // 计划单 derivedStatus 由关联工单 dispatchStatus 聚合，切换后需重拉计划列表
        await refreshPlans();
      } catch (err: any) {
        toast.error(err.message || '切换工单状态失败');
      }
    },
    [refreshPlans],
  );

  /** 入库累计达标后弹出确认，用户同意再标为「已完成」。 */
  const promptDispatchCompletion = useCallback(
    async (pending: DispatchCompletionPending[]) => {
      if (pending.length === 0) return;
      for (const p of pending) {
        const ok = await confirm({
          title: ORDER_DISPATCH_STATUS_CONFIRM_TITLE,
          message: buildOrderDispatchCompletionConfirmMessage(p.orderNumber),
          confirmText: '确认切换',
          cancelText: '取消',
        });
        if (ok) {
          await onUpdateOrderDispatchStatus(p.orderId, OrderDispatchStatus.COMPLETED);
        }
      }
    },
    [confirm, onUpdateOrderDispatchStatus],
  );

  const onDeleteOrder = useCallback(async (orderId: string) => {
    try {
      await api.orders.delete(orderId);
      setOrders(prev => prev.filter(o => o.id !== orderId));
      await refreshPlans();
    } catch (err: any) { toast.error(err.message || '删除工单失败'); }
  }, [refreshPlans]);

  // ── Production record handlers ──
  /**
   * Phase 3.D follow-up：context 已不再维护 `prodRecords` 全量数组；
   * 写入后通过 `react-query` invalidate 让消费方自己重拉。
   */
  const onAddProdRecord = useCallback(async (record: ProductionOpRecord): Promise<ProductionOpRecord | null> => {
    try {
      const result = await api.production.create(record);
      const created = norm1(result.record as ProductionOpRecord);
      invalidateAllProdRecords();
      void Promise.allSettled([refreshOrders(), refreshPMP()]);
      await promptDispatchCompletion(result.dispatchCompletionPending ?? []);
      return created;
    } catch (err: any) {
      toast.error(err.message || '添加记录失败');
      return null;
    }
  }, [refreshOrders, refreshPMP, invalidateAllProdRecords, promptDispatchCompletion]);

  const onAddProdRecordBatch = useCallback(async (records: ProductionOpRecord[]): Promise<ProductionOpRecord[]> => {
    try {
      /**
       * 改走后端批量端点：同 type 且全部缺省 docNo 时由服务端共享分配一个 docNo，
       * 替代旧版"前端基于 stale 缓存自算 + 客户端塞 docNo + 逐条 create"——后者
       * 在两次批量入库间隔很短时会让两张单串成同一个 RK 编号。
       *
       * Phase 3.E follow-up：返回后端创建后的记录数组（含服务端分配的 docNo），
       * 让 view 层（StockMaterialPanel 等）可以在弹窗里展示真实单号，
       * 而不需要再各自维护一份客户端 docNo 生成逻辑。
       */
      const result = await api.production.createBatch(records);
      const created = (result.records ?? []).map(r => norm1(r as ProductionOpRecord));
      invalidateAllProdRecords();
      void Promise.allSettled([refreshOrders(), refreshPMP()]);
      await promptDispatchCompletion(result.dispatchCompletionPending ?? []);
      return created;
    } catch (err: any) {
      toast.error(err.message || '批量添加记录失败');
      return [];
    }
  }, [refreshOrders, refreshPMP, invalidateAllProdRecords, promptDispatchCompletion]);

  const onUpdateProdRecord = useCallback(async (r: ProductionOpRecord) => {
    try {
      const result = await api.production.update(r.id, r);
      invalidateAllProdRecords();
      const touchesStockIn = r.type === 'STOCK_IN';
      if (touchesStockIn) {
        void Promise.allSettled([refreshOrders(), refreshPMP()]);
        await promptDispatchCompletion(result.dispatchCompletionPending ?? []);
      }
    } catch (err: any) { toast.error(err.message || '更新记录失败'); }
  }, [invalidateAllProdRecords, refreshOrders, refreshPMP, promptDispatchCompletion]);

  const onDeleteProdRecord = useCallback(async (id: string) => {
    try {
      await api.production.delete(id);
      invalidateAllProdRecords();
      // 外协收回等删除时后端会回写工单里程碑 / 产品进度报工，需与 onAddProdRecord 一样刷新订单与 PMP
      void Promise.allSettled([refreshOrders(), refreshPMP()]);
    } catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, [refreshOrders, refreshPMP, invalidateAllProdRecords]);

  const onDeleteProdRecordBatch = useCallback(async (ids: string[]) => {
    const uniqueIds = [...new Set(ids.map(id => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) return;
    try {
      await Promise.all(uniqueIds.map(id => api.production.delete(id)));
      invalidateAllProdRecords();
      void Promise.allSettled([refreshOrders(), refreshPMP()]);
    } catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, [refreshOrders, refreshPMP, invalidateAllProdRecords]);

  // ── PSI record handlers ──
  // Phase 3.D follow-up：不再维护 context 的 psiRecords 全量；调用方应在写入后用
  // `queryClient.invalidateQueries({ queryKey: ['psi.*'] })` 触发自身 react-query 重拉。
  const onAddPSIRecord = useCallback(async (record: any) => {
    try {
      await api.psi.create(record);
      invalidateAllPsiRecords();
    } catch (err: any) {
      toast.error(err.message || '添加记录失败');
      throw err;
    }
  }, [invalidateAllPsiRecords]);

  const onAddPSIRecordBatch = useCallback(async (records: any[]) => {
    try {
      await api.psi.createBatch(records);
      invalidateAllPsiRecords();
    } catch (err: any) {
      toast.error(err.message || '批量添加记录失败');
      throw err;
    }
  }, [invalidateAllPsiRecords]);

  const onReplacePSIRecords = useCallback(async (type: string, docNumber: string, newRecords: any[]) => {
    try {
      // 旧实现先在前端遍历 psiRecords 拿 id 列表再 replace；现改为按 type+docNumber 拉一次窄查询
      const list = await api.psi.list({ type, docNumber });
      const deleteIds = (Array.isArray(list) ? list : []).map(r => r.id).filter(Boolean);
      await api.psi.replace(deleteIds, newRecords);
      invalidateAllPsiRecords();
    } catch (err: any) { toast.error(err.message || '替换记录失败'); }
  }, [invalidateAllPsiRecords]);

  const onDeletePSIRecords = useCallback(async (type: string, docNumber: string) => {
    try {
      const list = await api.psi.list({ type, docNumber });
      const ids = (Array.isArray(list) ? list : []).map(r => r.id).filter(Boolean);
      if (ids.length) await api.psi.deleteBatch(ids);
      invalidateAllPsiRecords();
    } catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, [invalidateAllPsiRecords]);

  // ── Finance record handlers ──
  // Phase 3.D follow-up：同样不再维护 context.financeRecords；FinanceOpsView 内部 react-query 列表会在 mutation 后自行 invalidate。
  const onAddFinanceRecord = useCallback(async (r: FinanceRecord) => {
    try {
      await api.finance.create(r);
      invalidateAllFinanceRecords();
    } catch (err: any) { toast.error(err.message || '添加记录失败'); }
  }, [invalidateAllFinanceRecords]);

  const onUpdateFinanceRecord = useCallback(async (r: FinanceRecord) => {
    try {
      await api.finance.update(r.id, r);
      invalidateAllFinanceRecords();
    } catch (err: any) { toast.error(err.message || '更新记录失败'); }
  }, [invalidateAllFinanceRecords]);

  const onDeleteFinanceRecord = useCallback(async (id: string) => {
    try {
      await api.finance.delete(id);
      invalidateAllFinanceRecords();
    } catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, [invalidateAllFinanceRecords]);

  // ── Domain-specific memoized values ──

  const masterDataValue: MasterDataState = useMemo(() => ({
    categories, partnerCategories, dictionaries, globalNodes,
    partners, workers, equipment, warehouses, products, boms,
  }), [categories, partnerCategories, dictionaries, globalNodes, partners, workers, equipment, warehouses, products, boms]);

  const configValue: ConfigState = useMemo(() => ({
    productionLinkMode, processSequenceMode, allowExceedMaxReportQty, allowExceedMaxOutsourceReceiveQty, weightTolerancePercent,
    planFormSettings, orderFormSettings, purchaseOrderFormSettings, salesOrderFormSettings, purchaseBillFormSettings, salesBillFormSettings,
    receiptFormSettings, paymentFormSettings,
    materialPanelSettings, materialFormSettings, outsourceFormSettings, reworkFormSettings, printTemplates,
  }), [productionLinkMode, processSequenceMode, allowExceedMaxReportQty, allowExceedMaxOutsourceReceiveQty, weightTolerancePercent, planFormSettings, orderFormSettings, purchaseOrderFormSettings, salesOrderFormSettings, purchaseBillFormSettings, salesBillFormSettings, receiptFormSettings, paymentFormSettings, materialPanelSettings, materialFormSettings, outsourceFormSettings, reworkFormSettings, printTemplates]);

  const ordersValue: OrdersState = useMemo(() => ({
    orders, plans, productMilestoneProgresses,
  }), [orders, plans, productMilestoneProgresses]);

  const psiValue: PsiState = useMemo(() => ({}), []);

  const financeValue: FinanceState = useMemo(() => ({
    financeCategories, financeAccountTypes,
  }), [financeCategories, financeAccountTypes]);

  const actionsValue: AppDataActions = useMemo(() => ({
    onUpdateAllowExceedMaxReportQty, onUpdateAllowExceedMaxOutsourceReceiveQty, onUpdateWeightTolerancePercent,
    onUpdatePlanFormSettings, onUpdateOrderFormSettings,
    onUpdatePurchaseOrderFormSettings, onUpdateSalesOrderFormSettings,
    onUpdatePurchaseBillFormSettings, onUpdateSalesBillFormSettings,
    onUpdateReceiptFormSettings, onUpdatePaymentFormSettings,
    onUpdateMaterialPanelSettings, onUpdateMaterialFormSettings, onUpdateOutsourceFormSettings, onUpdateReworkFormSettings, onUpdatePrintTemplates,
    onUpdateProduct, onDeleteProduct, onUpdateBOM,
    onCreatePlan, onUpdatePlan, onDeletePlan, onConvertToOrder,
    onCreateSubPlan, onCreateSubPlans,
    onReportSubmit, onReportSubmitProduct,
    onUpdateReport, onDeleteReport, onUpdateReportProduct, onDeleteReportProduct,
    onUpdateOrder, onUpdateOrderDispatchStatus, onDeleteOrder,
    onAddProdRecord, onAddProdRecordBatch, onUpdateProdRecord, onDeleteProdRecord, onDeleteProdRecordBatch,
    onAddPSIRecord, onAddPSIRecordBatch, onReplacePSIRecords, onDeletePSIRecords,
    onAddFinanceRecord, onUpdateFinanceRecord, onDeleteFinanceRecord,
    refreshDictionaries, refreshWorkers, refreshEquipment, refreshPartners,
    refreshPartnerCategories, refreshCategories, refreshGlobalNodes, refreshWarehouses,
    refreshFinanceCategories, refreshFinanceAccountTypes,
    refreshProducts, refreshOrders, refreshPMP,
    refreshPrintTemplates,
    ensureDeferredLoaded,
  }), [
    onUpdateAllowExceedMaxReportQty, onUpdateAllowExceedMaxOutsourceReceiveQty, onUpdateWeightTolerancePercent,
    onUpdatePlanFormSettings, onUpdateOrderFormSettings,
    onUpdatePurchaseOrderFormSettings, onUpdateSalesOrderFormSettings,
    onUpdatePurchaseBillFormSettings, onUpdateSalesBillFormSettings,
    onUpdateReceiptFormSettings, onUpdatePaymentFormSettings,
    onUpdateMaterialPanelSettings, onUpdateMaterialFormSettings, onUpdateOutsourceFormSettings, onUpdateReworkFormSettings, onUpdatePrintTemplates,
    onUpdateProduct, onDeleteProduct, onUpdateBOM,
    onCreatePlan, onUpdatePlan, onDeletePlan, onConvertToOrder,
    onCreateSubPlan, onCreateSubPlans,
    onReportSubmit, onReportSubmitProduct,
    onUpdateReport, onDeleteReport, onUpdateReportProduct, onDeleteReportProduct,
    onUpdateOrder, onUpdateOrderDispatchStatus, onDeleteOrder,
    onAddProdRecord, onAddProdRecordBatch, onUpdateProdRecord, onDeleteProdRecord, onDeleteProdRecordBatch,
    onAddPSIRecord, onAddPSIRecordBatch, onReplacePSIRecords, onDeletePSIRecords,
    onAddFinanceRecord, onUpdateFinanceRecord, onDeleteFinanceRecord,
    refreshDictionaries, refreshWorkers, refreshEquipment, refreshPartners,
    refreshPartnerCategories, refreshCategories, refreshGlobalNodes, refreshWarehouses,
    refreshFinanceCategories, refreshFinanceAccountTypes,
    refreshProducts, refreshOrders, refreshPMP,
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
  normalizeMaterialPanelSettings,
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
