import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  PurchaseBillFormSettings,
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
} from '../types';

// ── Decimal normalizer ──

const DECIMAL_KEYS = new Set([
  'quantity', 'purchasePrice', 'salesPrice', 'amount', 'actualQuantity',
  'systemQuantity', 'diffQuantity', 'unitPrice', 'taxRate', 'taxAmount',
  'totalAmount', 'completedQuantity', 'defectiveQuantity', 'weight', 'rate',
  'allocatedQuantity', 'shippedQuantity',
]);

function normalizeDecimals<T>(arr: T[]): T[] {
  return arr.map(item => {
    const copy = { ...item } as any;
    for (const k of DECIMAL_KEYS) {
      if (k in copy && copy[k] != null && typeof copy[k] === 'string') copy[k] = Number(copy[k]) || 0;
    }
    if (Array.isArray(copy.items)) {
      copy.items = copy.items.map((sub: any) => {
        const s = { ...sub };
        for (const k of DECIMAL_KEYS) { if (k in s && s[k] != null && typeof s[k] === 'string') s[k] = Number(s[k]) || 0; }
        return s;
      });
    }
    if (Array.isArray(copy.milestones)) {
      copy.milestones = copy.milestones.map((ms: any) => {
        const m = { ...ms };
        for (const k of DECIMAL_KEYS) { if (k in m && m[k] != null && typeof m[k] === 'string') m[k] = Number(m[k]) || 0; }
        if (Array.isArray(m.reports)) {
          m.reports = m.reports.map((r: any) => {
            const rc = { ...r };
            for (const k2 of DECIMAL_KEYS) { if (k2 in rc && rc[k2] != null && typeof rc[k2] === 'string') rc[k2] = Number(rc[k2]) || 0; }
            return rc;
          });
          const reportsSum = m.reports.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
          if (m.completedQuantity !== reportsSum) m.completedQuantity = reportsSum;
        }
        return m;
      });
    }
    return copy as T;
  });
}

// ── Default form settings ──

const DEFAULT_PLAN_FORM_SETTINGS: PlanFormSettings = {
  standardFields: [
    { id: 'planNumber', label: '计划单号', showInList: true, showInCreate: false, showInDetail: true },
    { id: 'customer', label: '客户', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'dueDate', label: '交期', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'createdAt', label: '添加日期', showInList: true, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
};

const DEFAULT_ORDER_FORM_SETTINGS: OrderFormSettings = {
  standardFields: [
    { id: 'orderNumber', label: '工单号', showInList: true, showInCreate: false, showInDetail: true },
    { id: 'customer', label: '客户', showInList: false, showInCreate: true, showInDetail: true },
    { id: 'dueDate', label: '交期', showInList: false, showInCreate: true, showInDetail: true },
    { id: 'startDate', label: '开始日期', showInList: false, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
};

const DEFAULT_PURCHASE_ORDER_FORM_SETTINGS: PurchaseOrderFormSettings = {
  standardFields: [
    { id: 'docNumber', label: '单据编号', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'partner', label: '供应商', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'dueDate', label: '期望到货日期', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'createdAt', label: '添加日期', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'note', label: '单据备注', showInList: false, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
};

const DEFAULT_PURCHASE_BILL_FORM_SETTINGS: PurchaseBillFormSettings = {
  standardFields: [
    { id: 'docNumber', label: '单据编号', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'partner', label: '供应商', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'warehouse', label: '入库仓库', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'createdAt', label: '添加日期', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'note', label: '单据备注', showInList: true, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
};

const EMPTY_DICTIONARIES: AppDictionaries = { colors: [], sizes: [], units: [] };

// ── Context type ──

export interface AppDataContextValue {
  dataLoading: boolean;
  products: Product[];
  orders: ProductionOrder[];
  plans: PlanOrder[];
  psiRecords: any[];
  financeRecords: FinanceRecord[];
  prodRecords: ProductionOpRecord[];
  categories: ProductCategory[];
  partnerCategories: PartnerCategory[];
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  boms: BOM[];
  partners: any[];
  workers: any[];
  equipment: any[];
  warehouses: Warehouse[];
  financeCategories: FinanceCategory[];
  financeAccountTypes: FinanceAccountType[];
  planFormSettings: PlanFormSettings;
  orderFormSettings: OrderFormSettings;
  purchaseOrderFormSettings: PurchaseOrderFormSettings;
  purchaseBillFormSettings: PurchaseBillFormSettings;
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
  onUpdatePurchaseBillFormSettings: (v: PurchaseBillFormSettings) => Promise<void>;
  // Product / BOM
  /** 成功返回 true，失败已 toast 并返回 false */
  onUpdateProduct: (p: Product) => Promise<boolean>;
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
  onReportSubmit: (oId: string, mId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string) => Promise<void>;
  onReportSubmitProduct: (productId: string, milestoneTemplateId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string) => Promise<void>;
  onUpdateReport: (data: { orderId: string; milestoneId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneId?: string }) => Promise<void>;
  onDeleteReport: (data: { orderId: string; milestoneId: string; reportId: string }) => Promise<void>;
  onUpdateReportProduct: (data: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string }) => Promise<void>;
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
}

const AppDataCtx = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, tenantCtx } = useAuth();

  // ── State ──
  const [dataLoading, setDataLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [plans, setPlans] = useState<PlanOrder[]>([]);
  const [psiRecords, setPsiRecords] = useState<any[]>([]);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);
  const [prodRecords, setProdRecords] = useState<ProductionOpRecord[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [partnerCategories, setPartnerCategories] = useState<PartnerCategory[]>([]);
  const [dictionaries, setDictionaries] = useState<AppDictionaries>(EMPTY_DICTIONARIES);
  const [globalNodes, setGlobalNodes] = useState<GlobalNodeTemplate[]>([]);
  const [boms, setBoms] = useState<BOM[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [financeCategories, setFinanceCategories] = useState<FinanceCategory[]>([]);
  const [financeAccountTypes, setFinanceAccountTypes] = useState<FinanceAccountType[]>([]);
  const [planFormSettings, setPlanFormSettings] = useState<PlanFormSettings>(DEFAULT_PLAN_FORM_SETTINGS);
  const [orderFormSettings, setOrderFormSettings] = useState<OrderFormSettings>(DEFAULT_ORDER_FORM_SETTINGS);
  const [purchaseOrderFormSettings, setPurchaseOrderFormSettings] = useState<PurchaseOrderFormSettings>(DEFAULT_PURCHASE_ORDER_FORM_SETTINGS);
  const [purchaseBillFormSettings, setPurchaseBillFormSettings] = useState<PurchaseBillFormSettings>(DEFAULT_PURCHASE_BILL_FORM_SETTINGS);
  const [productionLinkMode, setProductionLinkMode] = useState<ProductionLinkMode>('order');
  const [processSequenceMode, setProcessSequenceMode] = useState<ProcessSequenceMode>('free');
  const [allowExceedMaxReportQty, setAllowExceedMaxReportQty] = useState<boolean>(true);
  const [productMilestoneProgresses, setProductMilestoneProgresses] = useState<ProductMilestoneProgress[]>([]);

  // ── Initial data loading ──
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      try {
        const results = await Promise.allSettled([
          api.settings.getConfig(),                               // 0
          api.settings.categories.list(),                         // 1
          api.settings.partnerCategories.list(),                  // 2
          api.settings.nodes.list(),                              // 3
          api.settings.warehouses.list(),                         // 4
          api.settings.financeCategories.list(),                  // 5
          api.settings.financeAccountTypes.list(),                // 6
          api.partners.list(),                                    // 7
          api.tenants.getReportableMembers(tenantCtx!.tenantId),  // 8
          api.equipment.list(),                                   // 9
          api.dictionaries.list(),                                // 10
          api.products.list(),                                    // 11
          api.boms.list(),                                        // 12
          api.plans.list(),                                       // 13
          api.orders.list(),                                      // 14
          api.production.list(),                                  // 15
          api.psi.list(),                                         // 16
          api.finance.list(),                                     // 17
          api.orders.listProductProgress(),                       // 18
        ]);
        if (cancelled) return;
        const v = (i: number) => results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<unknown>).value : undefined;
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length) console.warn(`数据加载: ${failed.length}/${results.length} 个请求失败`, failed.map(r => (r as PromiseRejectedResult).reason?.message));
        if (results[11]?.status === 'rejected') {
          const msg = (results[11] as PromiseRejectedResult).reason?.message || '未知错误';
          const isForbidden =
            /无权|403|Forbidden/i.test(msg) || msg.includes('请先选择或创建企业');
          if (isForbidden) {
            toast.error(
              `产品列表加载失败：${msg}。请在「成员管理」中为当前账号勾选「基础信息 → 产品档案」的查看权限（basic:products:view），或由企业管理员调整角色。`,
            );
          } else {
            const migrateHint =
              /数据库|route_report|migration|P20|column|schema|Prisma/i.test(msg)
                ? ' 若为数据库升级后首次使用，请在服务器执行 prisma migrate deploy 并重启后端。'
                : '';
            toast.error(`产品列表加载失败：${msg}。${migrateHint}`.trim());
          }
        }

        const cfg = (v(0) || {}) as Record<string, unknown>;
        setProductionLinkMode((cfg.productionLinkMode as ProductionLinkMode) ?? 'order');
        setProcessSequenceMode((cfg.processSequenceMode as ProcessSequenceMode) ?? 'free');
        setAllowExceedMaxReportQty(cfg.allowExceedMaxReportQty !== false);
        setPlanFormSettings((cfg.planFormSettings as PlanFormSettings) ?? DEFAULT_PLAN_FORM_SETTINGS);
        setOrderFormSettings((cfg.orderFormSettings as OrderFormSettings) ?? DEFAULT_ORDER_FORM_SETTINGS);
        setPurchaseOrderFormSettings((cfg.purchaseOrderFormSettings as PurchaseOrderFormSettings) ?? DEFAULT_PURCHASE_ORDER_FORM_SETTINGS);
        setPurchaseBillFormSettings((cfg.purchaseBillFormSettings as PurchaseBillFormSettings) ?? DEFAULT_PURCHASE_BILL_FORM_SETTINGS);
        if (v(1))  setCategories(v(1) as ProductCategory[]);
        if (v(2))  setPartnerCategories(v(2) as PartnerCategory[]);
        if (v(3))  setGlobalNodes(v(3) as GlobalNodeTemplate[]);
        if (v(4))  setWarehouses(v(4) as Warehouse[]);
        if (v(5))  setFinanceCategories(v(5) as FinanceCategory[]);
        if (v(6))  setFinanceAccountTypes(v(6) as FinanceAccountType[]);
        if (v(7))  setPartners(v(7) as any[]);
        if (v(8))  setWorkers(v(8) as any[]);
        if (v(9))  setEquipment(v(9) as any[]);
        if (v(10)) setDictionaries(v(10) as AppDictionaries);
        if (v(11)) setProducts(normalizeDecimals(v(11) as Product[]));
        if (v(12)) setBoms(normalizeDecimals(v(12) as BOM[]));
        if (v(13)) setPlans(normalizeDecimals(v(13) as PlanOrder[]));
        if (v(14)) setOrders(normalizeDecimals(v(14) as ProductionOrder[]));
        if (v(15)) setProdRecords(normalizeDecimals(v(15) as ProductionOpRecord[]));
        if (v(16)) setPsiRecords(normalizeDecimals(v(16) as any[]));
        if (v(17)) setFinanceRecords(normalizeDecimals(v(17) as FinanceRecord[]));
        if (v(18)) setProductMilestoneProgresses(normalizeDecimals(v(18) as ProductMilestoneProgress[]));
      } catch (err) {
        console.error('数据加载失败', err);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }
    loadAll();
    return () => { cancelled = true; };
  }, []);

  // ── Refresh helpers ──
  const refreshPlans = useCallback(async () => setPlans(normalizeDecimals(await api.plans.list() as PlanOrder[])), []);
  const refreshOrders = useCallback(async () => setOrders(normalizeDecimals(await api.orders.list() as ProductionOrder[])), []);
  const refreshProducts = useCallback(async () => setProducts(normalizeDecimals(await api.products.list() as Product[])), []);
  const refreshBoms = useCallback(async () => setBoms(normalizeDecimals(await api.boms.list() as BOM[])), []);
  const refreshProdRecords = useCallback(async () => setProdRecords(normalizeDecimals(await api.production.list() as ProductionOpRecord[])), []);
  const refreshPsiRecords = useCallback(async () => setPsiRecords(normalizeDecimals(await api.psi.list() as any[])), []);
  const refreshFinanceRecords = useCallback(async () => setFinanceRecords(normalizeDecimals(await api.finance.list() as FinanceRecord[])), []);
  const refreshPMP = useCallback(async () => setProductMilestoneProgresses(normalizeDecimals(await api.orders.listProductProgress() as ProductMilestoneProgress[])), []);
  const refreshCategories = useCallback(async () => setCategories(await api.settings.categories.list() as ProductCategory[]), []);
  const refreshPartnerCategories = useCallback(async () => setPartnerCategories(await api.settings.partnerCategories.list() as PartnerCategory[]), []);
  const refreshGlobalNodes = useCallback(async () => setGlobalNodes(await api.settings.nodes.list() as GlobalNodeTemplate[]), []);
  const refreshWarehouses = useCallback(async () => setWarehouses(await api.settings.warehouses.list() as Warehouse[]), []);
  const refreshFinanceCategories = useCallback(async () => setFinanceCategories(await api.settings.financeCategories.list() as FinanceCategory[]), []);
  const refreshFinanceAccountTypes = useCallback(async () => setFinanceAccountTypes(await api.settings.financeAccountTypes.list() as FinanceAccountType[]), []);
  const refreshPartners = useCallback(async () => setPartners(await api.partners.list() as any[]), []);
  const refreshWorkers = useCallback(async () => setWorkers(await api.tenants.getReportableMembers(tenantCtx!.tenantId) as any[]), [tenantCtx?.tenantId]);
  const refreshEquipment = useCallback(async () => setEquipment(await api.equipment.list() as any[]), []);
  const refreshDictionaries = useCallback(async () => setDictionaries(await api.dictionaries.list() as AppDictionaries), []);

  // ── Config update handlers ──
  const onUpdateProductionLinkMode = useCallback(async (mode: ProductionLinkMode) => { await api.settings.updateConfig('productionLinkMode', mode); setProductionLinkMode(mode); }, []);
  const onUpdateProcessSequenceMode = useCallback(async (mode: ProcessSequenceMode) => { await api.settings.updateConfig('processSequenceMode', mode); setProcessSequenceMode(mode); }, []);
  const onUpdateAllowExceedMaxReportQty = useCallback(async (value: boolean) => { await api.settings.updateConfig('allowExceedMaxReportQty', value); setAllowExceedMaxReportQty(value); }, []);
  const onUpdatePlanFormSettings = useCallback(async (v: PlanFormSettings) => { await api.settings.updateConfig('planFormSettings', v); setPlanFormSettings(v); }, []);
  const onUpdateOrderFormSettings = useCallback(async (v: OrderFormSettings) => { await api.settings.updateConfig('orderFormSettings', v); setOrderFormSettings(v); }, []);
  const onUpdatePurchaseOrderFormSettings = useCallback(async (v: PurchaseOrderFormSettings) => { await api.settings.updateConfig('purchaseOrderFormSettings', v); setPurchaseOrderFormSettings(v); }, []);
  const onUpdatePurchaseBillFormSettings = useCallback(async (v: PurchaseBillFormSettings) => { await api.settings.updateConfig('purchaseBillFormSettings', v); setPurchaseBillFormSettings(v); }, []);

  // ── Product / BOM handlers ──
  const onUpdateProduct = useCallback(async (p: Product): Promise<boolean> => {
    try {
      const exists = products.some(px => px.id === p.id);
      if (exists) { await api.products.update(p.id, p); } else { await api.products.create(p); }
      // 工序变更会触发后端回填工单 milestones / 状态；工单中心与关联产品进度须同步刷新
      await Promise.allSettled([refreshProducts(), refreshOrders(), refreshPMP()]);
      return true;
    } catch (err: any) {
      toast.error(err.message || '操作失败');
      return false;
    }
  }, [products, refreshProducts, refreshOrders, refreshPMP]);

  const onDeleteProduct = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.products.delete(id);
      await Promise.allSettled([refreshProducts(), refreshBoms(), refreshOrders(), refreshPMP()]);
      toast.success('已删除产品');
      return true;
    } catch (err: any) {
      toast.error(err.message || '删除失败');
      return false;
    }
  }, [refreshProducts, refreshBoms, refreshOrders, refreshPMP]);

  const onUpdateBOM = useCallback(async (b: BOM): Promise<boolean> => {
    try {
      const exists = boms.some(bx => bx.id === b.id);
      if (exists) { await api.boms.update(b.id, b); } else { await api.boms.create(b); }
      await refreshBoms();
      return true;
    } catch (err: any) {
      toast.error(err.message || '操作失败');
      return false;
    }
  }, [boms, refreshBoms]);

  // ── Plan handlers ──
  const onCreatePlan = useCallback(async (p: PlanOrder) => {
    try { await api.plans.create(p); await refreshPlans(); }
    catch (err: any) { toast.error(err.message || '创建计划失败'); }
  }, [refreshPlans]);

  const onUpdatePlan = useCallback(async (id: string, updates: Partial<PlanOrder>) => {
    try { await api.plans.update(id, updates); await refreshPlans(); }
    catch (err: any) { toast.error(err.message || '更新计划失败'); }
  }, [refreshPlans]);

  const onSplitPlan = useCallback(async (planId: string, newPlans: PlanOrder[]) => {
    try {
      await api.plans.split(planId, { newPlans: newPlans.map(p => ({ items: p.items })) });
      await refreshPlans();
    } catch (err: any) { toast.error(err.message || '拆分失败'); }
  }, [refreshPlans]);

  const onDeletePlan = useCallback(async (id: string) => {
    try { await api.plans.delete(id); await refreshPlans(); }
    catch (err: any) { toast.error(err.message || '删除计划失败'); }
  }, [refreshPlans]);

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
  const onReportSubmit = useCallback(async (oId: string, mId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string) => {
    try {
      const operatorName = workerId ? (workers.find((w: any) => w.id === workerId)?.name ?? '未知') : ((currentUser as any)?.displayName || (currentUser as any)?.username || '操作员');
      const order = orders.find(o => o.id === oId);
      const rate = products.find(p => p.id === order?.productId)?.nodeRates?.[order?.milestones.find(m => m.id === mId)?.templateId ?? ''];
      await api.orders.createReport(oId, mId, {
        quantity: qty, operator: operatorName, defectiveQuantity: defectiveQty || 0,
        variantId: vId, workerId, equipmentId, reportBatchId, reportNo,
        customData: data ?? {}, rate: rate != null ? rate : undefined,
      });
      await refreshOrders();
    } catch (err: any) { toast.error(err.message || '报工失败'); }
  }, [workers, currentUser, orders, products, refreshOrders]);

  const onReportSubmitProduct = useCallback(async (productId: string, milestoneTemplateId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string) => {
    try {
      const operatorName = workerId ? (workers.find((w: any) => w.id === workerId)?.name ?? '未知') : ((currentUser as any)?.displayName || (currentUser as any)?.username || '操作员');
      const rate = products.find(p => p.id === productId)?.nodeRates?.[milestoneTemplateId];
      await api.orders.createProductReport({
        productId, milestoneTemplateId, quantity: qty, operator: operatorName,
        defectiveQuantity: defectiveQty || 0, variantId: vId, workerId, equipmentId,
        reportBatchId, reportNo, customData: data ?? {}, rate: rate != null ? rate : undefined,
      });
      await refreshPMP();
    } catch (err: any) { toast.error(err.message || '报工失败'); }
  }, [workers, currentUser, products, refreshPMP]);

  const onUpdateReport = useCallback(async ({ orderId, milestoneId, reportId, quantity, defectiveQuantity, timestamp, operator, newMilestoneId }: { orderId: string; milestoneId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneId?: string }) => {
    try {
      const targetMilestoneId = newMilestoneId || milestoneId;
      if (targetMilestoneId !== milestoneId) {
        await api.orders.deleteReport(orderId, milestoneId, reportId);
        await api.orders.createReport(orderId, targetMilestoneId, { quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator });
      } else {
        await api.orders.updateReport(orderId, milestoneId, reportId, { quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator });
      }
      await refreshOrders();
    } catch (err: any) { toast.error(err.message || '更新报工失败'); }
  }, [refreshOrders]);

  const onDeleteReport = useCallback(async ({ orderId, milestoneId, reportId }: { orderId: string; milestoneId: string; reportId: string }) => {
    try { await api.orders.deleteReport(orderId, milestoneId, reportId); await refreshOrders(); }
    catch (err: any) { toast.error(err.message || '删除报工失败'); }
  }, [refreshOrders]);

  const onUpdateReportProduct = useCallback(async ({ progressId, reportId, quantity, defectiveQuantity, timestamp, operator, newMilestoneTemplateId }: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string }) => {
    try {
      if (newMilestoneTemplateId) {
        const srcProgress = productMilestoneProgresses.find(p => p.id === progressId);
        if (!srcProgress) return;
        await api.orders.deleteProductReport(reportId);
        await api.orders.createProductReport({
          productId: srcProgress.productId, variantId: srcProgress.variantId,
          milestoneTemplateId: newMilestoneTemplateId,
          quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator,
        });
      } else {
        await api.orders.updateProductReport(reportId, { quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator });
      }
      await refreshPMP();
    } catch (err: any) { toast.error(err.message || '更新报工失败'); }
  }, [productMilestoneProgresses, refreshPMP]);

  const onDeleteReportProduct = useCallback(async ({ progressId, reportId }: { progressId: string; reportId: string }) => {
    try { await api.orders.deleteProductReport(reportId); await refreshPMP(); }
    catch (err: any) { toast.error(err.message || '删除报工失败'); }
  }, [refreshPMP]);

  const onUpdateOrder = useCallback(async (orderId: string, updates: Partial<ProductionOrder>) => {
    try { await api.orders.update(orderId, updates); await refreshOrders(); }
    catch (err: any) { toast.error(err.message || '更新工单失败'); }
  }, [refreshOrders]);

  const onDeleteOrder = useCallback(async (orderId: string) => {
    try { await api.orders.delete(orderId); await refreshOrders(); }
    catch (err: any) { toast.error(err.message || '删除工单失败'); }
  }, [refreshOrders]);

  // ── Production record handlers ──
  const onAddProdRecord = useCallback(async (record: ProductionOpRecord) => {
    try { await api.production.create(record); await Promise.allSettled([refreshProdRecords(), refreshOrders(), refreshPMP()]); }
    catch (err: any) { toast.error(err.message || '添加记录失败'); }
  }, [refreshProdRecords, refreshOrders, refreshPMP]);

  const onAddProdRecordBatch = useCallback(async (records: ProductionOpRecord[]) => {
    try {
      for (const record of records) await api.production.create(record);
      await Promise.allSettled([refreshProdRecords(), refreshOrders(), refreshPMP()]);
    } catch (err: any) { toast.error(err.message || '批量添加记录失败'); }
  }, [refreshProdRecords, refreshOrders, refreshPMP]);

  const onUpdateProdRecord = useCallback(async (r: ProductionOpRecord) => {
    try { await api.production.update(r.id, r); await refreshProdRecords(); }
    catch (err: any) { toast.error(err.message || '更新记录失败'); }
  }, [refreshProdRecords]);

  const onDeleteProdRecord = useCallback(async (id: string) => {
    try { await api.production.delete(id); await refreshProdRecords(); }
    catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, [refreshProdRecords]);

  // ── PSI record handlers ──
  const onAddPSIRecord = useCallback(async (record: any) => {
    try { await api.psi.create(record); await refreshPsiRecords(); }
    catch (err: any) { toast.error(err.message || '添加记录失败'); }
  }, [refreshPsiRecords]);

  const onAddPSIRecordBatch = useCallback(async (records: any[]) => {
    try { await api.psi.createBatch(records); await refreshPsiRecords(); }
    catch (err: any) { toast.error(err.message || '批量添加记录失败'); }
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
      await refreshPsiRecords();
    } catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, [psiRecords, refreshPsiRecords]);

  // ── Finance record handlers ──
  const onAddFinanceRecord = useCallback(async (r: FinanceRecord) => {
    try { await api.finance.create(r); await refreshFinanceRecords(); }
    catch (err: any) { toast.error(err.message || '添加记录失败'); }
  }, [refreshFinanceRecords]);

  const onUpdateFinanceRecord = useCallback(async (r: FinanceRecord) => {
    try { await api.finance.update(r.id, r); await refreshFinanceRecords(); }
    catch (err: any) { toast.error(err.message || '更新记录失败'); }
  }, [refreshFinanceRecords]);

  const onDeleteFinanceRecord = useCallback(async (id: string) => {
    try { await api.finance.delete(id); await refreshFinanceRecords(); }
    catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, [refreshFinanceRecords]);

  const value: AppDataContextValue = {
    dataLoading,
    products, orders, plans, psiRecords, financeRecords, prodRecords,
    categories, partnerCategories, dictionaries, globalNodes, boms,
    partners, workers, equipment, warehouses,
    financeCategories, financeAccountTypes,
    planFormSettings, orderFormSettings, purchaseOrderFormSettings, purchaseBillFormSettings,
    productionLinkMode, processSequenceMode, allowExceedMaxReportQty,
    productMilestoneProgresses,
    onUpdateProductionLinkMode, onUpdateProcessSequenceMode, onUpdateAllowExceedMaxReportQty,
    onUpdatePlanFormSettings, onUpdateOrderFormSettings,
    onUpdatePurchaseOrderFormSettings, onUpdatePurchaseBillFormSettings,
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
  };

  return <AppDataCtx.Provider value={value}>{children}</AppDataCtx.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataCtx);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
